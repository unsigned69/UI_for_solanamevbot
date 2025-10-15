import type { DexId, FetchFilters, Candidate } from '../types/dex';
import { MockDexAdapter } from './mock-dex';

const adapters: Record<DexId, MockDexAdapter> = {
  pumpfun: new MockDexAdapter('pumpfun'),
  raydium: new MockDexAdapter('raydium'),
  meteora: new MockDexAdapter('meteora'),
};

export async function fetchCandidatesAcrossDexes(filters: FetchFilters, baseTokens: string[], anchorTokens: string[]): Promise<Candidate[]> {
  const enabledDexes = filters.dexes.length ? filters.dexes : (Object.keys(adapters) as DexId[]);
  const results = await Promise.all(
    enabledDexes.map((dex) => adapters[dex].buildCandidates(filters, baseTokens, anchorTokens)),
  );
  return results.flat();
}
