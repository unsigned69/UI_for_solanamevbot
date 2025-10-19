import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { botRunner } from '../../../../lib/runner/process-runner';
import { uiLogger } from '../../../../lib/log/logger';
import { getRequestLogContext, withApiLogging } from '../../../../lib/log/with-api-logging';
import { redactValue } from '../../../../lib/log/redact';

export const runtime = 'nodejs';

const ROUTE_ID = '/api/bot/attach-logs';

function logWsEvent(evt: string, meta: Record<string, unknown>) {
  uiLogger.info(evt, meta, { channel: 'server' });
}

function sanitizeReason(reason: unknown): string | undefined {
  if (typeof reason !== 'string') {
    return undefined;
  }
  const redacted = redactValue(reason);
  return typeof redacted === 'string' ? redacted : String(redacted);
}

async function getHandler(request: Request) {
  if (request.headers.get('upgrade') !== 'websocket') {
    return NextResponse.json({ error: 'Expected websocket upgrade' }, { status: 400 });
  }

  const globalPair = (globalThis as { WebSocketPair?: new () => { 0: WebSocket; 1: WebSocket & { accept?: () => void } } }).WebSocketPair;
  if (!globalPair) {
    return NextResponse.json({ error: 'WebSocketPair не поддерживается в этой среде' }, { status: 500 });
  }
  const pair = new globalPair();
  const client = pair[0];
  const server = pair[1];
  server.accept?.();

  let closed = false;
  let unsubscribe: (() => void) | null = null;

  const logContext = getRequestLogContext(request);
  const reqId = logContext?.reqId ?? randomUUID();
  const clientIp = logContext?.clientIp;
  const userAgent = logContext?.userAgent ?? request.headers.get('user-agent') ?? undefined;

  const baseMeta = {
    reqId,
    route: ROUTE_ID,
    client_ip: clientIp,
    ua: userAgent,
  } satisfies Record<string, unknown>;

  const logStats = (reason: 'attach' | 'detach' | 'state') => {
    logWsEvent('ws_stats', {
      ...baseMeta,
      reason,
      subscribers_count: botRunner.getSubscriberCount(),
      state: botRunner.getStatus().state,
    });
  };

  const cleanup = (event?: { code?: number; reason?: string }) => {
    if (closed) {
      return;
    }
    closed = true;
    unsubscribe?.();
    logWsEvent('ws_detach', {
      ...baseMeta,
      code: event?.code ?? null,
      reason: sanitizeReason(event?.reason),
    });
    logStats('detach');
    try {
      server.close();
    } catch (error) {
      // no-op: socket may already be closed
    }
  };

  const safeSend = (event: unknown) => {
    if (closed) {
      return;
    }
    try {
      server.send(JSON.stringify(event));
    } catch (error) {
      cleanup();
    }
  };

  let lastState = botRunner.getStatus().state;
  unsubscribe = botRunner.subscribe(
    (event) => {
      safeSend(event);
      if (event.type === 'state' && event.state !== lastState) {
        lastState = event.state;
        logStats('state');
      }
    },
    {
      onStop: () => {
        try {
          server.close();
        } catch (error) {
          // socket may already be closed
        }
      },
    },
  );

  logWsEvent('ws_accept', baseMeta);
  logStats('attach');

  server.addEventListener('close', (event: Event) => {
    const closeEvent = event as { code?: number; reason?: string };
    cleanup({ code: closeEvent?.code, reason: closeEvent?.reason });
  });
  server.addEventListener('error', () => {
    cleanup();
  });

  safeSend({ type: 'state', state: botRunner.getStatus().state, status: botRunner.getStatus() });

  const response = new Response(null, { status: 101 });
  (response as any).webSocket = client;
  return response;
}

export const GET = withApiLogging(getHandler, { routeId: ROUTE_ID });
