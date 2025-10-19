import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { uiLogger } from './logger';
import { redactValue } from './redact';
import { installGlobalErrorHooks } from './bootstrap-errors';

const REQUEST_CONTEXT_SYMBOL = Symbol.for('smb-ui.log.request-context');

type Handler<TContext> = (request: Request, context: TContext) => Promise<Response> | Response;

interface WithLoggingOptions {
  routeId: string;
}

export interface ApiRequestLogContext {
  reqId: string;
  routeId: string;
  clientIp?: string;
  userAgent?: string;
}

function assignRequestContext(request: Request, context: ApiRequestLogContext): void {
  const target = request as unknown as Record<string | symbol, unknown>;
  target[REQUEST_CONTEXT_SYMBOL] = context;
}

export function getRequestLogContext(request: Request): ApiRequestLogContext | undefined {
  const target = request as unknown as Record<string | symbol, unknown>;
  const context = target[REQUEST_CONTEXT_SYMBOL];
  if (context && typeof context === 'object') {
    return context as ApiRequestLogContext;
  }
  return undefined;
}

function getHeaderCaseInsensitive(headers: Headers, key: string): string | null {
  return headers.get(key) ?? headers.get(key.toLowerCase()) ?? headers.get(key.toUpperCase());
}

function extractClientIp(request: Request): string | undefined {
  const forwarded = getHeaderCaseInsensitive(request.headers, 'x-forwarded-for');
  if (forwarded) {
    const [first] = forwarded.split(',');
    if (first) {
      return first.trim();
    }
  }
  const realIp = getHeaderCaseInsensitive(request.headers, 'x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return undefined;
}

function parseQuery(searchParams: URLSearchParams): Record<string, unknown> | undefined {
  if (Array.from(searchParams.keys()).length === 0) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const key of searchParams.keys()) {
    const values = searchParams.getAll(key);
    if (values.length === 1) {
      result[key] = values[0];
    } else if (values.length > 1) {
      result[key] = values;
    }
  }
  return result;
}

function sanitizeMessage(message: unknown): string {
  if (typeof message === 'string') {
    const redacted = redactValue(message);
    return typeof redacted === 'string' ? redacted : String(redacted);
  }
  if (message instanceof Error) {
    return sanitizeMessage(message.message);
  }
  return sanitizeMessage(String(message));
}

function sanitizeStack(stack: unknown): string | undefined {
  if (typeof stack !== 'string') {
    return undefined;
  }
  const redacted = redactValue(stack);
  return typeof redacted === 'string' ? redacted : String(redacted);
}

function buildErrorMeta(error: unknown, reqId: string, routeId: string, durationMs: number) {
  const meta: Record<string, unknown> = {
    reqId,
    route: routeId,
    status: 500,
    duration_ms: durationMs,
  };
  const stack = sanitizeStack((error as Error)?.stack);
  if (stack) {
    meta.stack = stack;
  }
  return meta;
}

async function extractResponseDetails(response: Response): Promise<{
  bytes?: number;
  summary?: Record<string, unknown>;
}> {
  try {
    const clone = response.clone();
    const buffer = await clone.arrayBuffer();
    const bytes = buffer.byteLength;
    const contentType = clone.headers.get('content-type') ?? '';
    let summary: Record<string, unknown> | undefined;
    if (contentType.includes('application/json')) {
      const text = new TextDecoder().decode(buffer);
      try {
        const data = JSON.parse(text);
        summary = buildJsonSummary(data);
      } catch (error) {
        summary = undefined;
      }
    }
    return { bytes, summary };
  } catch (error) {
    return {};
  }
}

function buildJsonSummary(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  const payload = data as Record<string, unknown>;
  if (Array.isArray(payload.errorsByDex)) {
    result.errorsByDex_count = payload.errorsByDex.length;
    const statusSummary: Record<string, unknown> = {};
    for (const entry of payload.errorsByDex) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const item = entry as Record<string, unknown>;
      const dex = item.dex;
      if (typeof dex !== 'string') {
        continue;
      }
      const status = item.status;
      if (typeof status === 'number') {
        statusSummary[dex] = status;
      } else if (status != null) {
        statusSummary[dex] = status;
      } else {
        statusSummary[dex] = null;
      }
    }
    if (Object.keys(statusSummary).length > 0) {
      result.errorsByDex_status = statusSummary;
    }
  }
  if (Array.isArray(payload.candidates)) {
    result.candidates_count = payload.candidates.length;
  }
  if (typeof payload.total === 'number') {
    result.total = payload.total;
  }
  if (typeof payload.ok === 'boolean') {
    result.ok = payload.ok;
  }
  if (typeof payload.status === 'string') {
    result.payload_status = payload.status;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function withApiLogging<TContext>(
  handler: Handler<TContext>,
  options: WithLoggingOptions,
): Handler<TContext> {
  return async (request: Request, context: TContext) => {
    installGlobalErrorHooks();

    const reqId = request.headers.get('x-request-id') ?? randomUUID();
    const startedAt = Date.now();
    const url = new URL(request.url);
    const clientIp = extractClientIp(request);
    const userAgent = getHeaderCaseInsensitive(request.headers, 'user-agent') ?? undefined;
    assignRequestContext(request, {
      reqId,
      routeId: options.routeId,
      clientIp,
      userAgent,
    });

    const query = parseQuery(url.searchParams);
    const contentLengthRaw = getHeaderCaseInsensitive(request.headers, 'content-length');
    const contentLength = contentLengthRaw ? Number(contentLengthRaw) || contentLengthRaw : undefined;

    uiLogger.info(
      'access_request',
      redactValue({
        reqId,
        method: request.method,
        url: url.toString(),
        route: options.routeId,
        ip: clientIp,
        ua: userAgent,
        content_length: contentLength,
        query,
      }) as Record<string, unknown>,
      { channel: 'server' },
    );

    try {
      const response = await handler(request, context);
      const durationMs = Date.now() - startedAt;
      if (response) {
        try {
          response.headers.set('X-Request-Id', reqId);
        } catch (error) {
          // read-only headers: ignore
        }
      }
      const { bytes, summary } = response ? await extractResponseDetails(response) : {};
      const meta: Record<string, unknown> = {
        reqId,
        route: options.routeId,
        status: response?.status ?? 200,
        duration_ms: durationMs,
        method: request.method,
      };
      if (typeof bytes === 'number' && Number.isFinite(bytes)) {
        meta.response_bytes = bytes;
      }
      if (summary) {
        Object.assign(meta, summary);
      }
      uiLogger.info('access_response', redactValue(meta) as Record<string, unknown>, { channel: 'server' });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = sanitizeMessage(error instanceof Error ? error.message : error);
      uiLogger.error('access_error', message, buildErrorMeta(error, reqId, options.routeId, durationMs), {
        channel: 'server',
      });
      const payload = { ok: false, message: 'internal error' };
      const errorResponse = NextResponse.json(payload, { status: 500 });
      try {
        errorResponse.headers.set('X-Request-Id', reqId);
      } catch (responseError) {
        // ignore header assignment errors
      }
      const responseBytes = Buffer.byteLength(JSON.stringify(payload));
      const meta: Record<string, unknown> = {
        reqId,
        route: options.routeId,
        status: 500,
        duration_ms: durationMs,
        method: request.method,
        response_bytes: responseBytes,
        ok: false,
      };
      uiLogger.info('access_response', redactValue(meta) as Record<string, unknown>, { channel: 'server' });
      return errorResponse;
    }
  };
}
