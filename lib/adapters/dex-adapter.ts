import type { Candidate, DexId, PoolSnapshot } from '../types/dex';
import type { FetchFilters } from '../types/filter-schema';

export interface DexAdapter {
  readonly id: DexId;
  fetchPools(input: {
    filters: FetchFilters;
    baseTokens: string[];
    anchorTokens: string[];
  }): Promise<PoolSnapshot[]>;
  enrich?(pools: PoolSnapshot[]): Promise<PoolSnapshot[]>;
  buildCandidates(filters: FetchFilters, baseTokens: string[], anchorTokens: string[]): Promise<Candidate[]>;
}

export interface FetchContext {
  filters: FetchFilters;
  baseTokens: string[];
  anchorTokens: string[];
  rpcEndpoint?: string | null;
}
