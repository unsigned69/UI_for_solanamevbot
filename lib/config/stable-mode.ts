import fs from 'fs/promises';
import path from 'path';
import { parse } from '@iarna/toml';
import { getStableMint, normaliseStableMode, type StableMode } from '../types/stable-mode';

const STABLE_MODE_ENV_KEY = 'STABLE_MODE';
const STABLE_MODE_CONFIG_PATH: string[] = ['routing', 'stable_mode'];

function resolveConfigPath(): string {
  const configPath = process.env.BOT_CONFIG_PATH;
  if (!configPath) {
    throw new Error('BOT_CONFIG_PATH не задан в окружении');
  }
  return path.resolve(configPath);
}

function extractValue(obj: any, pathKeys: string[]): unknown {
  let current = obj;
  for (const key of pathKeys) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

async function readStableModeFromConfigFile(): Promise<StableMode> {
  try {
    const configPath = resolveConfigPath();
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = parse(raw) as Record<string, unknown>;
    const candidate = extractValue(parsed, STABLE_MODE_CONFIG_PATH);
    return normaliseStableMode(candidate);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[stable-mode] не удалось прочитать stable_mode из config.toml:', error);
    }
    return 'NONE';
  }
}

function readStableModeFromEnv(): StableMode | null {
  if (!(STABLE_MODE_ENV_KEY in process.env)) {
    return null;
  }
  return normaliseStableMode(process.env[STABLE_MODE_ENV_KEY]);
}

export interface StableModeInfo {
  mode: StableMode;
  stableMint: string | null;
}

export async function resolveStableMode(): Promise<StableModeInfo> {
  const envMode = readStableModeFromEnv();
  const mode = envMode ?? (await readStableModeFromConfigFile());
  return {
    mode,
    stableMint: getStableMint(mode),
  };
}
