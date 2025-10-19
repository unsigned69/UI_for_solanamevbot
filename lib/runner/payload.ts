import path from 'path';
import bs58 from 'bs58';
import type { RunPayload } from '../types/run';
import type { RunPayloadInput } from '../types/run-schema';
import { ALT_FLAG_MAP } from './cli-flags';
import { ensureLockFreshnessSync, isConfigLockActiveSync } from '../config/toml-managed-block';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SHELL_META_CHARS = /[;&|`$<>]/;
const MAX_MANUAL_ACCOUNTS = 16;
const MAX_MANUAL_ACCOUNTS_TOTAL_LENGTH = 1024;
const EXTRA_FLAG_MAX_COUNT = 16;
const EXTRA_FLAG_MAX_LENGTH = 64;
const EXTRA_FLAG_TOTAL_LENGTH = 512;
const EXTRA_FLAG_ALLOWLIST: RegExp[] = [
  /^--[a-z0-9][a-z0-9-]*$/i,
  /^--[a-z0-9][a-z0-9-]*=\d+$/i,
  /^--[a-z0-9][a-z0-9-]*=[A-Za-z0-9._:\/-]+$/i,
];

function sanitizeBase58Address(value: string, context: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${context} не может быть пустым`);
  }
  if (!BASE58_REGEX.test(trimmed)) {
    throw new Error(`${context} должен быть валидным Solana base58 адресом`);
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

export function sanitizeExtraFlagsInput(input?: string | string[] | null): string[] {
  if (!input) {
    return [];
  }
  const values = toFlagList(input);
  const sanitized: string[] = [];
  for (const raw of values) {
    if (SHELL_META_CHARS.test(raw)) {
      throw new Error(`Флаг "${raw}" содержит запрещённые символы`);
    }
    if (!EXTRA_FLAG_PATTERN.test(raw)) {
      throw new Error(`Флаг "${raw}" имеет некорректный формат`);
    }
    sanitized.push(raw);
  }
  return sanitized;
}

function sanitizeManualAccounts(input?: string[] | null): string[] | undefined {
  if (!input || input.length === 0) {
    return undefined;
  }
  const unique = new Set<string>();
  for (const raw of input) {
    if (!raw) {
      continue;
    }
    const sanitized = sanitizeBase58Address(raw, 'Manual account');
    unique.add(sanitized);
  }
  if (unique.size === 0) {
    return undefined;
  }
  return Array.from(unique);
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
  try {
    const stats = fs.statSync(lockPath);
    if (stats.isFile()) {
      throw new Error(
        `Конфиг находится в процессе обновления (lock: ${path.basename(lockPath)}). Повторите запуск позже.`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
}
