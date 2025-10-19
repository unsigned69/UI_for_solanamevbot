import type { StableMode } from './stable-mode';

export type DexId = 'pumpfun' | 'raydium' | 'meteora';
export type PoolType = 'CPMM' | 'CLMM' | 'DLMM';

export interface DexSourceError {
  dex: DexId;
  status?: number;
  message: string;
}

export interface PoolSnapshot {
  dex: DexId;
  poolId: string;
  mintA: string;
  mintB: string;
  poolType: PoolType;
  tvlUsd?: number;
  reserves?: {
    base: number;
    quote: number;
    baseMint: string;
    quoteMint: string;
  };
  volume5m?: number;
  volume1h?: number;
  volume24h?: number;
  ageMinutes?: number;
  price?: number;
}

export interface Candidate {
  mint: string;
  pools: Array<
    Pick<PoolSnapshot, 'dex' | 'poolId' | 'poolType'> &
      Partial<Pick<PoolSnapshot, 'mintA' | 'mintB'>>
  >;
  tvlUsd: number;
  vol5m: number;
  vol1h: number;
  vol24h: number;
  volatility: number;
  estSlippagePct: number;
  altCost: number;
  score: number;
  errors?: string[];
  triEligible?: boolean;
  triStable?: StableMode | null;
}

export interface FetchCandidatesResult {
  candidates: Candidate[];
  errorsByDex: DexSourceError[];
  successfulDexes: DexId[];
  attemptedDexes: DexId[];
}
