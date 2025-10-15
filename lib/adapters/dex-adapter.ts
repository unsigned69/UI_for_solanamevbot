import type { Candidate, FetchFilters, PoolSnapshot } from '../types/dex';

export interface DexAdapter {
  fetchPools(input: {
    filters: FetchFilters;
    baseTokens: string[];
    anchorTokens: string[];
  }): Promise<PoolSnapshot[]>;
  enrich?(pools: PoolSnapshot[]): Promise<PoolSnapshot[]>;
}

export interface FetchContext {
  filters: FetchFilters;
  baseTokens: string[];
  anchorTokens: string[];
}

export type CandidateBuilder = (pools: PoolSnapshot[], context: FetchContext) => Candidate[];
