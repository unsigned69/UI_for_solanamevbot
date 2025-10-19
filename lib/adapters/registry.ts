import type { DexId, Candidate, DexSourceError, FetchCandidatesResult } from '../types/dex';
import type { FetchFilters } from '../types/filter-schema';
import { describeRetryError } from '../net/retry';
import type { DexAdapter } from './dex-adapter';
import { MockDexAdapter } from './mock-dex';
import { resolveParserRpcEndpoint } from './env';

const parserRpcEndpoint = resolveParserRpcEndpoint();

function buildAdapterRegistry(): Map<DexId, DexAdapter> {
  const registry = new Map<DexId, DexAdapter>();
  const enableMockAdapters = process.env.NODE_ENV !== 'production' && process.env.USE_MOCK_ADAPTERS === '1';
  if (enableMockAdapters) {
    [
      new MockDexAdapter('pumpfun', parserRpcEndpoint),
      new MockDexAdapter('raydium', parserRpcEndpoint),
      new MockDexAdapter('meteora', parserRpcEndpoint),
    ].forEach((adapter) => {
      registry.set(adapter.id, adapter);
    });
  }
  return registry;
}

const adapterRegistry = buildAdapterRegistry();

function getAvailableDexes(): DexId[] {
  return Array.from(adapterRegistry.keys());
}

function normaliseDexList(requested: DexId[]): DexId[] {
  const knownDexes = new Set(getAvailableDexes());
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

export interface AdapterSettledMeta {
  dex: DexId;
  ok: boolean;
  durationMs: number;
  count?: number;
  error?: unknown;
}

interface FetchAcrossDexesOptions {
  onAdapterSettled?: (meta: AdapterSettledMeta) => void;
}

function resolveAdapters(dexes: DexId[]): DexAdapter[] {
  return dexes
    .map((dex) => adapterRegistry.get(dex))
    .filter((adapter): adapter is DexAdapter => Boolean(adapter));
}

export async function fetchCandidatesAcrossDexes(
  filters: FetchFilters,
  options: FetchAcrossDexesOptions = {},
): Promise<FetchCandidatesResult> {
  const enabledDexes = normaliseDexList(filters.dexes);
  const availableDexes = getAvailableDexes();
  const attemptedDexes = enabledDexes.length ? enabledDexes : availableDexes;
  const targetAdapters = resolveAdapters(attemptedDexes);

  if (targetAdapters.length === 0) {
    return {
      candidates: [],
      errorsByDex: [],
      successfulDexes: [],
      attemptedDexes: [],
    };
  }

  const settled = await Promise.allSettled(
    targetAdapters.map(async (adapter) => {
      const startedAt = Date.now();
      try {
        const candidates = await adapter.buildCandidates(filters);
        const durationMs = Date.now() - startedAt;
        options.onAdapterSettled?.({
          dex: adapter.id,
          ok: true,
          durationMs,
          count: candidates.length,
        });
        return { adapter, candidates, durationMs };
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        options.onAdapterSettled?.({
          dex: adapter.id,
          ok: false,
          durationMs,
          error,
        });
        throw { adapter, error, durationMs };
      }
    }),
  );

  const aggregate: Candidate[] = [];
  const errorsByDex = new Map<DexId, DexSourceError>();
  const successfulDexes: DexId[] = [];

  settled.forEach((result, index) => {
    const adapter = targetAdapters[index];
    const dex = adapter.id;
    if (result.status === 'fulfilled') {
      aggregate.push(...result.value.candidates);
      successfulDexes.push(dex);
    } else {
      const reason = result.reason as { adapter: DexAdapter; error: unknown } | unknown;
      const errorPayload =
        reason && typeof reason === 'object' && 'error' in reason ? (reason as { error: unknown }).error : reason;
      if (!errorsByDex.has(dex)) {
        errorsByDex.set(dex, buildDexError(dex, errorPayload));
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
