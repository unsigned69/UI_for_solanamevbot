import path from 'path';
import bs58 from 'bs58';
import type { RunPayload } from '../types/run';
import type { RunPayloadInput } from '../types/run-schema';
import { ALT_FLAG_MAP } from './cli-flags';
import { ensureLockFreshnessSync, isConfigLockActiveSync, ConfigLockActiveError } from '../config/toml-managed-block';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_MANUAL_ACCOUNTS = 64;
const EXTRA_FLAG_MAX_COUNT = 16;
const EXTRA_FLAG_MAX_LENGTH = 64;
const EXTRA_FLAG_TOTAL_LENGTH = 256;
const EXTRA_FLAG_PATTERN = /^--[a-z0-9]+(?:-[a-z0-9]+)*(?:=[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

function sanitizeBase58Address(value: string, context: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${context} не может быть пустым`);
  }
  if (!BASE58_REGEX.test(trimmed)) {
    throw new Error(`${context} должен быть валидным Solana base58 адресом`);
  }
  try {
    bs58.decode(trimmed);
  } catch (error) {
    throw new Error(`${context} содержит некорректный base58: ${(error as Error).message}`);
  }
  return trimmed;
}

function toFlagList(input: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input;
  }
  return input
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function sanitizeExtraFlagsInput(input?: string | string[] | null): string[] {
  if (!input) {
    return [];
  }
  const values = toFlagList(input);
  const sanitized: string[] = [];
  if (values.length > EXTRA_FLAG_MAX_COUNT) {
    throw new Error(`Максимум ${EXTRA_FLAG_MAX_COUNT} дополнительных флагов`);
  }
  let totalLength = 0;
  for (const raw of values) {
    if (!EXTRA_FLAG_PATTERN.test(raw)) {
      throw new Error(`Флаг "${raw}" имеет некорректный формат`);
    }
    if (raw.length > EXTRA_FLAG_MAX_LENGTH) {
      throw new Error(`Флаг "${raw}" превышает максимальную длину ${EXTRA_FLAG_MAX_LENGTH}`);
    }
    totalLength += raw.length;
    sanitized.push(raw);
  }
  if (totalLength > EXTRA_FLAG_TOTAL_LENGTH) {
    throw new Error(`Суммарная длина флагов превышает ${EXTRA_FLAG_TOTAL_LENGTH} символов`);
  }
  return sanitized;
}

function sanitizeManualAccounts(input?: string[] | null): string[] | undefined {
  if (!input || input.length === 0) {
    return undefined;
  }
  const unique: string[] = [];
  for (const raw of input) {
    if (!raw) {
      continue;
    }
    const sanitized = sanitizeBase58Address(raw, 'Manual account');
    if (!unique.includes(sanitized)) {
      unique.push(sanitized);
    }
  }
  if (unique.length === 0) {
    return undefined;
  }
  if (unique.length > MAX_MANUAL_ACCOUNTS) {
    throw new Error(`Максимум ${MAX_MANUAL_ACCOUNTS} manual accounts`);
  }
  return unique;
}

function sanitizeAltOps(
  input: RunPayloadInput['altOps'],
  dryRun: boolean,
): RunPayload['altOps'] {
  if (dryRun) {
    return {};
  }
  const sanitized: RunPayload['altOps'] = {};
  const allowedKeys = Object.keys(ALT_FLAG_MAP) as Array<keyof RunPayload['altOps']>;
  for (const key of allowedKeys) {
    if (input?.[key]) {
      sanitized[key] = true;
    }
  }
  return sanitized;
}

export function prepareRunPayload(input: RunPayloadInput): RunPayload {
  const dryRun = Boolean(input.dryRun);
  const accountsSource = input.accountsSource ?? 'auto';
  const accountsManual = sanitizeManualAccounts(input.accountsManual);
  if (accountsSource === 'manual' && !accountsManual?.length) {
    throw new Error('Укажите хотя бы один manual account или переключитесь в режим auto.');
  }

  const extraFlags = sanitizeExtraFlagsInput(input.extraFlags);
  const altAddress = input.altAddress ? sanitizeBase58Address(input.altAddress, 'ALT address') : undefined;

  return {
    dryRun,
    altOps: sanitizeAltOps(input.altOps, dryRun),
    altAddress,
    accountsSource,
    accountsManual,
    extraFlags,
  };
}

export function sanitizeDefaultExtraFlags(raw: string): string[] {
  if (!raw) {
    return [];
  }
  return sanitizeExtraFlagsInput(raw);
}

export function describeCommandArgsForPreview(args: string[], configPath: string): string[] {
  const previewArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--config') {
      previewArgs.push(arg);
      if (index + 1 < args.length) {
        previewArgs.push('***');
        index += 1;
      }
      continue;
    }
    previewArgs.push(arg === configPath ? '***' : arg);
  }
  return previewArgs;
}

export function ensureConfigLockNotPresent(lockPath: string) {
  ensureLockFreshnessSync(lockPath);
  if (isConfigLockActiveSync(lockPath)) {
    throw new ConfigLockActiveError(
      `Конфиг находится в процессе обновления (lock: ${path.basename(lockPath)}). Повторите запуск позже.`,
    );
  }
}
