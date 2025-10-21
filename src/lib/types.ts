export type Dex = 'RAYDIUM_AMM' | 'RAYDIUM_CPMM' | 'METEORA_DLMM';

export interface PoolPricePoint {
  priceUsd: number;
  side: 'bid' | 'ask';
}

export interface DlmmBinLevel {
  priceUsd: number;
  baseLiquidity: number;
}

export interface UnifiedPool {
  id: string;
  dex: Dex;
  type: 'AMM' | 'CPMM' | 'DLMM';
  baseMint: string;
  quoteMint: string;
  baseSymbol?: string | null;
  quoteSymbol?: string | null;
  priceUsd?: number | null;
  bestBidPriceUsd?: number | null;
  bestAskPriceUsd?: number | null;
  tvlUsd?: number | null;
  volume24hUsd?: number | null;
  feeBps?: number | null;
  createdAt?: number | null;
  reserves?: {
    base: number;
    quote: number;
  } | null;
  dlmmBins?: DlmmBinLevel[];
}

export interface TokenRow {
  mint: string;
  symbol: string;
  priceUsd: number | null;
  priceConfidence: 'high' | 'low';
  spreadRaydiumPct: number | null;
  spreadMeteoraPct: number | null;
  raydiumPools: string[];
  meteoraPools: string[];
  crossDexSpreadPct: number | null;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  decimals: number | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  hasTransferFee: boolean;
  impactPctAt100: number | null;
  tokenAgeDays: number | null;
  maxPoolFeeBps: number | null;
}

export interface FilterParams {
  dexRaydiumAmm: boolean;
  dexRaydiumCpmm: boolean;
  dexMeteoraDlmm: boolean;
  mintAuthNull: boolean;
  freezeNull: boolean;
  noTransferFee: boolean;
  tvlMinUsd: number;
  vMinUsd: number;
  ageTokenDaysMin: number;
  decimalsMin: number;
  decimalsMax: number;
  poolFeeBpsMax: number;
  impactUsd: number;
  impactPctMax: number;
  limit: number;
}

export interface ApiResponse {
  params: FilterParams;
  count: number;
  items: TokenRow[];
}

export interface FetchPoolOptions {
  signal?: AbortSignal;
}
