import fs from 'fs/promises';
import path from 'path';
import { parse } from '@iarna/toml';

/** Этот модуль вызывается и парсером, и экраном Конфига. Он НЕ зависит от runner. */

export const BASE_TOKENS_PATH: string[] = ['routing', 'baseTokens'];
export const ANCHOR_TOKENS_PATH: string[] = ['routing', 'anchorTokens'];

export interface BaseAnchorResult {
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
  const filePath = getEnvConfigPath();
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = parse(raw) as Record<string, unknown>;

  const baseTokens = extractArray(parsed, BASE_TOKENS_PATH) ?? [];
  const anchorTokens = extractArray(parsed, ANCHOR_TOKENS_PATH) ?? [];

  if (baseTokens.length === 0 || anchorTokens.length === 0) {
    throw new Error('Base/Anchor токены не найдены в конфиге. Задайте их вручную.');
  }

  return { baseTokens, anchorTokens };
}
