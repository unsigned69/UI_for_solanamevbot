import type { DexId, Candidate, DexSourceError, FetchCandidatesResult } from '../types/dex';
import type { FetchFilters } from '../types/filter-schema';
import { describeRetryError } from '../net/retry';
import { MockDexAdapter } from './mock-dex';
import { resolveParserRpcEndpoint } from './env';

const parserRpcEndpoint = resolveParserRpcEndpoint();

const adapters: Record<DexId, MockDexAdapter> = {
  pumpfun: new MockDexAdapter('pumpfun', parserRpcEndpoint),
  raydium: new MockDexAdapter('raydium', parserRpcEndpoint),
  meteora: new MockDexAdapter('meteora', parserRpcEndpoint),
};

function normaliseDexList(requested: DexId[]): DexId[] {
  const knownDexes = new Set(Object.keys(adapters) as DexId[]);
  if (!requested.length) {
    return Array.from(knownDexes);
  }
  return Array.from(new Set(requested.filter((dex) => knownDexes.has(dex))));
}

function buildDexError(dex: DexId, error: unknown): DexSourceError {
  const { status, message } = describeRetryError(error);
  const safeMessage = message?.slice(0, 200) ?? 'Неизвестная ошибка источника';
  return {
    dex,
    status,
    message: safeMessage,
  };
}

export async function fetchCandidatesAcrossDexes(
  filters: FetchFilters,
  baseTokens: string[],
  anchorTokens: string[],
): Promise<FetchCandidatesResult> {
  const enabledDexes = normaliseDexList(filters.dexes);
  const attemptedDexes = enabledDexes.length ? enabledDexes : (Object.keys(adapters) as DexId[]);
  const targetAdapters = attemptedDexes.map((dex) => adapters[dex]);

  const settled = await Promise.allSettled(
    targetAdapters.map((adapter) => adapter.buildCandidates(filters, baseTokens, anchorTokens)),
  );

  const aggregate: Candidate[] = [];
  const errorsByDex = new Map<DexId, DexSourceError>();
  const successfulDexes: DexId[] = [];

  settled.forEach((result, index) => {
    const dex = targetAdapters[index].id;
    if (result.status === 'fulfilled') {
      aggregate.push(...result.value);
      successfulDexes.push(dex);
    } else {
      if (!errorsByDex.has(dex)) {
        errorsByDex.set(dex, buildDexError(dex, result.reason));
      }
    }
  });

  return {
    candidates: aggregate,
    errorsByDex: Array.from(errorsByDex.values()),
    successfulDexes,
    attemptedDexes: targetAdapters.map((adapter) => adapter.id),
  };
}
