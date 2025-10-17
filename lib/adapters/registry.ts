import type { DexId, FetchFilters, Candidate } from '../types/dex';
import { MockDexAdapter } from './mock-dex';
import { resolveParserRpcEndpoint } from './env';

const parserRpcEndpoint = resolveParserRpcEndpoint();

const adapters: Record<DexId, MockDexAdapter> = {
  pumpfun: new MockDexAdapter('pumpfun', parserRpcEndpoint),
  raydium: new MockDexAdapter('raydium', parserRpcEndpoint),
  meteora: new MockDexAdapter('meteora', parserRpcEndpoint),
};

export async function fetchCandidatesAcrossDexes(filters: FetchFilters, baseTokens: string[], anchorTokens: string[]): Promise<Candidate[]> {
  const enabledDexes = filters.dexes.length ? filters.dexes : (Object.keys(adapters) as DexId[]);
  const results = await Promise.all(
    enabledDexes.map((dex) => adapters[dex].buildCandidates(filters, baseTokens, anchorTokens)),
  );
  return results.flat();
}
