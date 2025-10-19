#!/usr/bin/env ts-node
import fs from 'fs/promises';
import type { ManagedConfig } from '../lib/types/config';
import type { Candidate, DexSourceError } from '../lib/types/dex';
import { fetchFiltersSchema } from '../lib/types/filter-schema';
import { fetchCandidatesAcrossDexes } from '../lib/adapters/registry';
import { validateManagedConfig } from '../lib/config/validate';
import { managedConfigSchema } from '../lib/config/schema';
import { readManagedConfig, writeManagedConfig, buildManagedDiff } from '../lib/config/toml-managed-block';
import { resolveStableMode } from '../lib/config/stable-mode';

interface CliOptions {
  filters?: string;
  writeConfig: boolean;
  dryValidate: boolean;
  managed?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { writeConfig: false, dryValidate: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--filters') {
      options.filters = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--filters=')) {
      options.filters = arg.slice('--filters='.length);
      continue;
    }
    if (arg === '--write-config') {
      options.writeConfig = true;
      continue;
    }
    if (arg === '--dry-validate') {
      options.dryValidate = true;
      continue;
    }
    if (arg === '--managed') {
      options.managed = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--managed=')) {
      options.managed = arg.slice('--managed='.length);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    console.warn(`Неизвестный аргумент: ${arg}`);
  }
  return options;
}

function printUsage() {
  console.log(`Использование: ts-node scripts/parser-cli.ts --filters '<json>' [--dry-validate] [--write-config] [--managed '<json|@path>']

Примеры:
  ts-node scripts/parser-cli.ts --filters '{"dexes":["pumpfun"],"poolTypes":["CPMM"]}'
  ts-node scripts/parser-cli.ts --filters '{"dexes":[],"poolTypes":["CLMM"]}' --dry-validate
  ts-node scripts/parser-cli.ts --filters '{"dexes":["raydium"],"poolTypes":["DLMM"]}' --write-config --managed '@/tmp/managed.json'
`);
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Не удалось распарсить JSON для ${label}: ${(error as Error).message}`);
  }
}

let cachedStdin: string | null = null;
async function readStdinOnce(): Promise<string> {
  if (cachedStdin !== null) {
    return cachedStdin;
  }
  if (process.stdin.isTTY) {
    cachedStdin = '';
    return cachedStdin;
  }
  cachedStdin = await new Promise<string>((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(data));
  });
  return cachedStdin;
}

async function loadManagedPayload(options: CliOptions): Promise<ManagedConfig | null> {
  if (options.managed) {
    const raw = options.managed.startsWith('@')
      ? await fs.readFile(options.managed.slice(1), 'utf8')
      : options.managed;
    const parsed = parseJson<unknown>(raw, '--managed');
    return managedConfigSchema.parse(parsed);
  }

  const stdinPayload = (await readStdinOnce()).trim();
  if (stdinPayload) {
    const parsed = parseJson<unknown>(stdinPayload, 'STDIN');
    return managedConfigSchema.parse(parsed);
  }

  if (options.writeConfig) {
    throw new Error('Для --write-config необходимо передать JSON управляемого блока через STDIN или --managed.');
  }

  return null;
}

function printDexErrors(errors: DexSourceError[]) {
  if (!errors.length) {
    return;
  }
  console.warn('Ошибки источников DEX:');
  errors.forEach((error) => {
    const status = error.status ? ` (status ${error.status})` : '';
    console.warn(`  - ${error.dex}${status}: ${error.message}`);
  });
}

function printCandidates(candidates: Candidate[]) {
  if (candidates.length === 0) {
    console.log('Кандидаты не найдены под заданные фильтры.');
    return;
  }

  const table = candidates.map((candidate) => ({
    mint: candidate.mint,
    score: candidate.score.toFixed(2),
    altCost: candidate.altCost.toFixed(2),
    slippagePct: candidate.estSlippagePct.toFixed(2),
    tvlUsd: candidate.tvlUsd.toFixed(0),
    pools: candidate.pools.map((pool) => `${pool.dex}:${pool.poolType}`).join(', '),
  }));
  console.table(table);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.filters) {
    printUsage();
    process.exit(1);
  }

  const filtersPayload = parseJson<unknown>(options.filters, '--filters');
  const filters = fetchFiltersSchema.parse(filtersPayload);

  try {
    const { mode: stableMode, stableMint } = await resolveStableMode();
    const result = await fetchCandidatesAcrossDexes(filters);

    console.log('Stable mode:', stableMode, stableMint ? `(mint ${stableMint})` : '(disabled)');
    printDexErrors(result.errorsByDex);
    if (result.successfulDexes.length === 0) {
      console.error('Все источники вернули ошибку — кандидаты недоступны.');
      process.exit(2);
    }
    printCandidates(result.candidates);

    const managedPayload = await loadManagedPayload(options);

    if (options.dryValidate) {
      const targetManaged = managedPayload ?? (await readManagedConfig()).managed;
      const report = validateManagedConfig(targetManaged);
      console.log('Dry-валидация управляемого блока:', report);
      if (!report.ok) {
        console.error('Dry-валидация завершилась с ошибками.');
      }
    }

    if (options.writeConfig) {
      if (!managedPayload) {
        throw new Error('Не удалось получить данные управляемого блока для записи.');
      }
      const report = validateManagedConfig(managedPayload);
      if (!report.ok) {
        console.error('Dry-валидация провалилась:', report.errors);
        process.exit(1);
      }
      const previous = await readManagedConfig();
      const diff = buildManagedDiff(previous.managed, managedPayload);
      if (diff === 'No changes') {
        console.log('изменений нет');
        return;
      }
      const result = await writeManagedConfig(managedPayload);
      console.log('Управляемый блок записан.');
      if (result.backupPath) {
        console.log(`Бэкап: ${result.backupPath}`);
      }
      console.log('Diff:');
      console.log(diff);
    }
  } catch (error) {
    console.error('Ошибка:', (error as Error).message);
    process.exit(1);
  }
}

main();
