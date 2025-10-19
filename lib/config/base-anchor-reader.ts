import fs from 'fs/promises';
import path from 'path';
import { parse } from '@iarna/toml';

/**
 * Исторический модуль для чтения base/anchor токенов.
 * После перехода на SOL-центричный режим конфиг больше не содержит эти массивы,
 * поэтому функция возвращает пустые значения без ошибок для обратной совместимости.
 */

const BASE_TOKENS_PATH: string[] = ['routing', 'baseTokens'];
const ANCHOR_TOKENS_PATH: string[] = ['routing', 'anchorTokens'];

interface BaseAnchorResult {
  baseTokens: string[];
  anchorTokens: string[];
}

function getEnvConfigPath(): string {
  const configPath = process.env.BOT_CONFIG_PATH;
  if (!configPath) {
    throw new Error('BOT_CONFIG_PATH не задан в окружении');
  }
  return path.resolve(configPath);
}

function extractArray(obj: any, pathKeys: string[]): string[] | undefined {
  let current = obj;
  for (const key of pathKeys) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  if (!Array.isArray(current)) {
    return undefined;
  }
  return current.filter((value) => typeof value === 'string');
}

export async function readBaseAnchorTokens(): Promise<BaseAnchorResult> {
  try {
    const filePath = getEnvConfigPath();
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parse(raw) as Record<string, unknown>;

    const baseTokens = extractArray(parsed, BASE_TOKENS_PATH) ?? [];
    const anchorTokens = extractArray(parsed, ANCHOR_TOKENS_PATH) ?? [];

    return { baseTokens, anchorTokens };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[base-anchor-reader] не удалось прочитать base/anchor токены:', error);
    }
    return { baseTokens: [], anchorTokens: [] };
  }
}
