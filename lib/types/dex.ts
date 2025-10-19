export type DexId = 'pumpfun' | 'raydium' | 'meteora';
export type PoolType = 'CPMM' | 'CLMM' | 'DLMM';

export interface DexSourceError {
  dex: DexId;
  status?: number;
  message: string;
}

export interface FetchFilters {
  dexes: DexId[];
  minTVL?: number;
  minVol5m?: number;
  minVol1h?: number;
  minVol24h?: number;
  minPoolAgeMinutes?: number;
  maxSlippagePct?: number;
  budget?: number;
  poolTypes: PoolType[];
  blacklistMints?: string[];
  newerThanMinutesExclude?: number;
  excludeFrozen?: boolean;
  maxAltCost?: number;
  page?: number;
  pageSize?: number;
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
  pools: Array<Pick<PoolSnapshot, 'dex' | 'poolId' | 'poolType'>>;
  tvlUsd: number;
  vol5m: number;
  vol1h: number;
  vol24h: number;
  volatility: number;
  estSlippagePct: number;
  altCost: number;
  score: number;
  errors?: string[];
}

export interface FetchCandidatesResult {
  candidates: Candidate[];
  errorsByDex: DexSourceError[];
  successfulDexes: DexId[];
  attemptedDexes: DexId[];
}
