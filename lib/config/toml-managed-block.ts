import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { parse, stringify } from '@iarna/toml';
import { managedConfigSchema } from './schema';
import type { ManagedConfig } from '../types/config';

const MANAGED_START_MARKER = '# >>> SMB-UI MANAGED START';
const MANAGED_WARNING_LINE = '# (не редактируйте вручную)';
const MANAGED_END_MARKER = '# <<< SMB-UI MANAGED END';
const CONFIG_LOCK_BASENAME = '.smb-ui-config.lock';

const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000; // 10 минут
const LOCK_TTL_ENV_KEY = 'SMB_UI_CONFIG_LOCK_TTL_MS';

function resolveConfigPath(): string {
  const configPath = process.env.BOT_CONFIG_PATH;
  if (!configPath) {
    throw new Error('BOT_CONFIG_PATH не задан в окружении');
  }
  return path.resolve(configPath);
}

function resolveConfigLockTtlMs(): number {
  const raw = process.env[LOCK_TTL_ENV_KEY];
  if (raw === undefined || raw === '') {
    return DEFAULT_LOCK_TTL_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${LOCK_TTL_ENV_KEY} должно быть неотрицательным числом миллисекунд`);
  }
  return parsed;
}

export function getConfigLockPath(): string {
  const configPath = resolveConfigPath();
  const dir = path.dirname(configPath);
  return path.join(dir, CONFIG_LOCK_BASENAME);
}

async function ensureFileExists(filePath: string) {
  try {
    await fsPromises.access(filePath);
  } catch (error) {
    throw new Error(`Файл конфига не найден по пути ${filePath}`);
  }
}

function isLockStaleFromStats(stats: fs.Stats, ttlMs: number): boolean {
  if (ttlMs <= 0) {
    return false;
  }
  const ageMs = Date.now() - stats.mtimeMs;
  return ageMs > ttlMs;
}

async function removeStaleLock(lockPath: string, ttlMs: number): Promise<boolean> {
  if (ttlMs <= 0) {
    return false;
  }
  try {
    const stats = await fsPromises.stat(lockPath);
    if (!stats.isFile()) {
      return false;
    }
    if (!isLockStaleFromStats(stats, ttlMs)) {
      return false;
    }
    await fsPromises.unlink(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function removeStaleLockSync(lockPath: string, ttlMs: number): boolean {
  if (ttlMs <= 0) {
    return false;
  }
  try {
    const stats = fs.statSync(lockPath);
    if (!stats.isFile()) {
      return false;
    }
    if (!isLockStaleFromStats(stats, ttlMs)) {
      return false;
    }
    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export function isConfigLockActiveSync(lockPath: string): boolean {
  const ttlMs = resolveConfigLockTtlMs();
  try {
    const stats = fs.statSync(lockPath);
    if (!stats.isFile()) {
      return false;
    }
    if (isLockStaleFromStats(stats, ttlMs)) {
      fs.unlinkSync(lockPath);
      return false;
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  const ttlMs = resolveConfigLockTtlMs();
  while (true) {
    let handle: fsPromises.FileHandle | null = null;
    try {
      handle = await fsPromises.open(lockPath, 'wx');
      await handle.writeFile(`locked-by=${process.pid}\n`);
      return async () => {
        if (handle) {
          await handle.close();
        }
        await fsPromises.unlink(lockPath).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const removed = await removeStaleLock(lockPath, ttlMs);
        if (removed) {
          continue;
        }
        throw new Error('Конфиг обновляется другим процессом. Повторите попытку позже.');
      }
      throw error;
    }
  }
}

async function withConfigLock<T>(configPath: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = path.join(path.dirname(configPath), CONFIG_LOCK_BASENAME);
  const release = await acquireLock(lockPath);
  try {
    return await fn();
  } finally {
    await release();
  }
}

export async function readRawConfig(): Promise<string> {
  const configPath = resolveConfigPath();
  await ensureFileExists(configPath);
  return fsPromises.readFile(configPath, 'utf8');
}

function extractManagedBlock(raw: string): string | null {
  const startIndex = raw.indexOf(MANAGED_START_MARKER);
  const endIndex = raw.indexOf(MANAGED_END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return null;
  }
  const blockStart = raw.indexOf('\n', startIndex);
  const blockEnd = raw.lastIndexOf('\n', endIndex);
  return raw.slice(blockStart + 1, blockEnd);
}

function buildManagedSection(managed: ManagedConfig): string {
  const tomlBody = stringify(managed as unknown as Record<string, any>).trim();
  return [
    MANAGED_START_MARKER,
    MANAGED_WARNING_LINE,
    tomlBody,
    MANAGED_END_MARKER,
  ]
    .filter(Boolean)
    .join('\n')
    .concat('\n');
}

export async function readManagedConfig(): Promise<{ managed: ManagedConfig; raw: string }> {
  const raw = await readRawConfig();
  const block = extractManagedBlock(raw);
  if (!block) {
    const empty: ManagedConfig = { routing: { mint_config_list: [] } };
    return { managed: empty, raw };
  }

  const parsed = parse(block) as Record<string, unknown>;
  const managed = managedConfigSchema.parse(parsed) as ManagedConfig;
  return { managed, raw };
}

function applyManagedBlock(raw: string, managed: ManagedConfig): string {
  const section = buildManagedSection(managed);
  const startIndex = raw.indexOf(MANAGED_START_MARKER);
  const endIndex = raw.indexOf(MANAGED_END_MARKER);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    const separator = raw.endsWith('\n') ? '' : '\n';
    return raw + separator + section;
  }

  const before = raw.slice(0, startIndex);
  const after = raw.slice(raw.indexOf('\n', endIndex) + 1);
  return before + section + after;
}

async function createBackup(filePath: string, raw: string) {
  const dir = path.dirname(filePath);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const backupPath = path.join(dir, `config.toml.bak-${stamp}`);
  await fsPromises.writeFile(backupPath, raw, 'utf8');
  return backupPath;
}

async function writeAtomically(filePath: string, contents: string) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.smb-ui.tmp-${process.pid}-${Date.now()}`);
  await fsPromises.writeFile(tempPath, contents, 'utf8');
  try {
    await fsPromises.rename(tempPath, filePath);
  } catch (error) {
    await fsPromises.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

interface WriteManagedOptions {
  skipBackup?: boolean;
}

interface WriteManagedResult {
  raw: string;
  backupPath?: string;
}

export async function writeManagedConfig(
  managed: ManagedConfig,
  options: WriteManagedOptions = {},
): Promise<WriteManagedResult> {
  const configPath = resolveConfigPath();
  await ensureFileExists(configPath);
  return withConfigLock(configPath, async () => {
    const raw = await fsPromises.readFile(configPath, 'utf8');
    const nextRaw = applyManagedBlock(raw, managed);
    let backupPath: string | undefined;
    if (!options.skipBackup) {
      backupPath = await createBackup(configPath, raw);
    }
    await writeAtomically(configPath, nextRaw);
    return { raw: nextRaw, backupPath };
  });
}

export function buildManagedDiff(current: ManagedConfig, next: ManagedConfig): string {
  const currentToml = stringify(current as unknown as Record<string, any>).trim();
  const nextToml = stringify(next as unknown as Record<string, any>).trim();
  if (currentToml === nextToml) {
    return 'No changes';
  }
  return [
    '--- current',
    '+++ next',
    currentToml,
    nextToml,
  ].join('\n');
}

export function ensureLockFreshnessSync(lockPath: string) {
  const ttlMs = resolveConfigLockTtlMs();
  removeStaleLockSync(lockPath, ttlMs);
}
