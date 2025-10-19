import fs from 'fs/promises';
import path from 'path';
import { parse, stringify } from '@iarna/toml';
import { managedConfigSchema } from './schema';
import type { ManagedConfig } from '../types/config';

export const MANAGED_START_MARKER = '# >>> SMB-UI MANAGED START';
export const MANAGED_WARNING_LINE = '# (не редактируйте вручную)';
export const MANAGED_END_MARKER = '# <<< SMB-UI MANAGED END';
export const CONFIG_LOCK_BASENAME = '.smb-ui-config.lock';

function resolveConfigPath(): string {
  const configPath = process.env.BOT_CONFIG_PATH;
  if (!configPath) {
    throw new Error('BOT_CONFIG_PATH не задан в окружении');
  }
  return path.resolve(configPath);
}

export function getConfigLockPath(): string {
  const configPath = resolveConfigPath();
  const dir = path.dirname(configPath);
  return path.join(dir, CONFIG_LOCK_BASENAME);
}

async function ensureFileExists(filePath: string) {
  try {
    await fs.access(filePath);
  } catch (error) {
    throw new Error(`Файл конфига не найден по пути ${filePath}`);
  }
}

async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(lockPath, 'wx');
    await handle.writeFile(`locked-by=${process.pid}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Конфиг обновляется другим процессом. Повторите попытку позже.');
    }
    throw error;
  }
  return async () => {
    if (handle) {
      await handle.close();
    }
    await fs.unlink(lockPath).catch(() => undefined);
  };
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
  return fs.readFile(configPath, 'utf8');
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

export async function readManagedConfig(): Promise<{ managed: ManagedConfig; raw: string }>
{
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
  await fs.writeFile(backupPath, raw, 'utf8');
  return backupPath;
}

async function writeAtomically(filePath: string, contents: string) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.smb-ui.tmp-${process.pid}-${Date.now()}`);
  await fs.writeFile(tempPath, contents, 'utf8');
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export interface WriteManagedOptions {
  skipBackup?: boolean;
}

export interface WriteManagedResult {
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
    const raw = await fs.readFile(configPath, 'utf8');
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
