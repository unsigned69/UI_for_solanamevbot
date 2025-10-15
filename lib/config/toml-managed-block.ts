import fs from 'fs/promises';
import path from 'path';
import { parse, stringify } from '@iarna/toml';
import { managedConfigSchema } from './schema';
import type { ManagedConfig } from '../types/config';

export const MANAGED_START_MARKER = '# >>> SMB-UI MANAGED START';
export const MANAGED_WARNING_LINE = '# (не редактируйте вручную)';
export const MANAGED_END_MARKER = '# <<< SMB-UI MANAGED END';

function resolveConfigPath(): string {
  const configPath = process.env.BOT_CONFIG_PATH;
  if (!configPath) {
    throw new Error('BOT_CONFIG_PATH не задан в окружении');
  }
  return path.resolve(configPath);
}

async function ensureFileExists(filePath: string) {
  try {
    await fs.access(filePath);
  } catch (error) {
    throw new Error(`Файл конфига не найден по пути ${filePath}`);
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
  const tomlBody = stringify(managed).trim();
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

export interface WriteManagedOptions {
  skipBackup?: boolean;
}

export async function writeManagedConfig(managed: ManagedConfig, options: WriteManagedOptions = {}) {
  const configPath = resolveConfigPath();
  await ensureFileExists(configPath);
  const raw = await fs.readFile(configPath, 'utf8');
  const nextRaw = applyManagedBlock(raw, managed);
  if (!options.skipBackup) {
    await createBackup(configPath, raw);
  }
  await fs.writeFile(configPath, nextRaw, 'utf8');
  return nextRaw;
}

export function buildManagedDiff(current: ManagedConfig, next: ManagedConfig): string {
  const currentToml = stringify(current).trim();
  const nextToml = stringify(next).trim();
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
