import type { Candidate, DexId, PoolSnapshot } from '../types/dex';
import type { FetchFilters } from '../types/filter-schema';

export interface DexAdapter {
  readonly id: DexId;
  fetchPools(input: { filters: FetchFilters }): Promise<PoolSnapshot[]>;
  enrich?(pools: PoolSnapshot[]): Promise<PoolSnapshot[]>;
  buildCandidates(filters: FetchFilters): Promise<Candidate[]>;
}

export interface FetchContext {
  filters: FetchFilters;
  rpcEndpoint?: string | null;
}
