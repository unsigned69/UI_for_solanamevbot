import { uiLogger } from './logger';
import { redactValue } from './redact';

const INSTALL_SYMBOL = Symbol.for('smb-ui.log.bootstrap-errors.installed');

type ErrorLike = { message?: unknown; stack?: unknown } | null | undefined;

function extractMessage(input: unknown): string {
  if (!input) {
    return 'Unknown error';
  }
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof Error) {
    return input.message || input.name || 'Error';
  }
  if (typeof input === 'object') {
    const candidate = (input as Record<string, unknown>).message;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return String(input);
}

function extractStack(input: ErrorLike): string | undefined {
  if (!input) {
    return undefined;
  }
  if (input instanceof Error) {
    return input.stack ?? undefined;
  }
  if (typeof input === 'object') {
    const candidate = (input as Record<string, unknown>).stack;
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return undefined;
}

function redactStack(stack: string | undefined): string | undefined {
  if (!stack) {
    return undefined;
  }
  const redacted = redactValue(stack);
  return typeof redacted === 'string' ? redacted : String(redacted);
}

function markInstalled(): boolean {
  const globalAny = globalThis as Record<string | symbol, unknown>;
  if (globalAny[INSTALL_SYMBOL]) {
    return false;
  }
  globalAny[INSTALL_SYMBOL] = true;
  return true;
}

export function installGlobalErrorHooks(): void {
  if (!markInstalled()) {
    return;
  }

  process.on('uncaughtException', (error: Error) => {
    const message = extractMessage(error);
    const stack = redactStack(extractStack(error));
    uiLogger.error(
      'server_uncaught_exception',
      message,
      {
        stack,
        isFatal: true,
      },
      { channel: 'server' },
    );
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const message = extractMessage(reason);
    const stack = redactStack(extractStack(reason as ErrorLike));
    const meta: Record<string, unknown> = {
      stack,
      isFatal: false,
    };
    const reasonType = reason === null ? 'null' : typeof reason;
    meta.reasonType = reasonType;
    if (reason && typeof reason === 'object' && !(reason instanceof Error)) {
      const name = (reason as Record<string, unknown>).name;
      if (typeof name === 'string' && name.length > 0) {
        meta.reasonName = name;
      }
    }
    uiLogger.error('server_unhandled_rejection', message, meta, { channel: 'server' });
  });
}
