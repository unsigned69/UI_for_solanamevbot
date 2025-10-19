import { setTimeout as sleep } from 'timers/promises';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_MAX_DELAY_MS = 3_000;
const DEFAULT_JITTER_RATIO = 0.2;

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
]);

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const maybeNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
  const direct = maybeNumber((error as { status?: unknown }).status);
  if (typeof direct === 'number') {
    return direct;
  }
  const response = (error as { response?: { status?: unknown } }).response;
  if (response) {
    const nested = maybeNumber(response.status);
    if (typeof nested === 'number') {
      return nested;
    }
  }
  return undefined;
}

export function isRetryableHttpStatus(status?: number): boolean {
  if (typeof status !== 'number') {
    return false;
  }
  if (status === 429) {
    return true;
  }
  if (status >= 500 && status < 600) {
    return true;
  }
  return false;
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) {
    return true;
  }
  const cause = (error as { cause?: unknown }).cause as NodeJS.ErrnoException | undefined;
  if (cause && typeof cause.code === 'string' && NETWORK_ERROR_CODES.has(cause.code)) {
    return true;
  }
  const name = (error as Error).name;
  if (name === 'FetchError' || name === 'AxiosError') {
    return true;
  }
  return false;
}

function defaultShouldRetry(error: unknown): boolean {
  const status = extractStatus(error);
  if (isRetryableHttpStatus(status)) {
    return true;
  }
  if (status && status >= 400 && status < 500) {
    return false;
  }
  return isNetworkError(error);
}

function computeDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number, jitterRatio: number): number {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  if (jitterRatio <= 0) {
    return exponential;
  }
  const jitter = 1 + (Math.random() * 2 - 1) * Math.min(jitterRatio, 0.95);
  return Math.max(0, Math.round(exponential * jitter));
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt >= attempts || !shouldRetry(error)) {
        throw error;
      }
      const delayMs = computeDelayMs(attempt, baseDelayMs, maxDelayMs, jitterRatio);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}

export function describeRetryError(error: unknown): { status?: number; message: string } {
  if (error instanceof Error) {
    return { status: extractStatus(error), message: error.message };
  }
  return { message: 'Неизвестная ошибка источника' };
}
