import type { FetchPoolOptions, UnifiedPool } from '../types';
import { getCached, setCached } from '../utils/cache';

const CACHE_KEY = 'meteora:pools';
const DEFAULT_TTL_MS = 5 * 60 * 1000;

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BONK_MINT = 'DezXAZ8z7P5AGL4HnM9Df1t3ZL2uxJm2zG93P7xi5zs';
const SCAM_MINT = 'Scam111111111111111111111111111111111111111';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2q8B6CcneEBK8U9GweN7otMfL6';

const SAMPLE_METEORA_POOLS: UnifiedPool[] = [
  {
    id: 'meteora-sol-usdc-dlmm',
    dex: 'METEORA_DLMM',
    type: 'DLMM',
    baseMint: SOL_MINT,
    quoteMint: USDC_MINT,
    baseSymbol: 'SOL',
    quoteSymbol: 'USDC',
    priceUsd: 148.6,
    bestBidPriceUsd: 148.4,
    bestAskPriceUsd: 148.8,
    tvlUsd: 480_000,
    volume24hUsd: 260_000,
    feeBps: 45,
    createdAt: Date.now() - 200 * 24 * 60 * 60 * 1000,
    dlmmBins: [
      { priceUsd: 148.2, baseLiquidity: 110 },
      { priceUsd: 148.5, baseLiquidity: 130 },
      { priceUsd: 148.9, baseLiquidity: 90 },
    ],
  },
  {
    id: 'meteora-bonk-usdc-dlmm',
    dex: 'METEORA_DLMM',
    type: 'DLMM',
    baseMint: BONK_MINT,
    quoteMint: USDC_MINT,
    baseSymbol: 'BONK',
    quoteSymbol: 'USDC',
    priceUsd: 0.0000221,
    bestBidPriceUsd: 0.0000219,
    bestAskPriceUsd: 0.0000224,
    tvlUsd: 142_000,
    volume24hUsd: 58_000,
    feeBps: 55,
    createdAt: Date.now() - 150 * 24 * 60 * 60 * 1000,
    dlmmBins: [
      { priceUsd: 0.0000219, baseLiquidity: 2_200_000_000 },
      { priceUsd: 0.0000222, baseLiquidity: 1_700_000_000 },
      { priceUsd: 0.0000225, baseLiquidity: 1_400_000_000 },
    ],
  },
  {
    id: 'meteora-scam-usdc-dlmm',
    dex: 'METEORA_DLMM',
    type: 'DLMM',
    baseMint: SCAM_MINT,
    quoteMint: USDC_MINT,
    baseSymbol: 'SCAM',
    quoteSymbol: 'USDC',
    priceUsd: 0.38,
    bestBidPriceUsd: 0.37,
    bestAskPriceUsd: 0.39,
    tvlUsd: 14_000,
    volume24hUsd: 3_200,
    feeBps: 95,
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    dlmmBins: [
      { priceUsd: 0.37, baseLiquidity: 8_000 },
      { priceUsd: 0.39, baseLiquidity: 6_500 },
    ],
  },
];

async function fetchFromApi(signal?: AbortSignal): Promise<UnifiedPool[] | null> {
  try {
    const response = await fetch('https://dlmm-api.meteora.ag/pools', {
      headers: {
        'User-Agent': 'solana-tokens-dashboard/1.0',
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const dataArray = Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data?: unknown }).data as Record<string, unknown>[])
      : Array.isArray(payload)
        ? (payload as Record<string, unknown>[])
        : null;

    if (!dataArray) {
      return null;
    }

    const pools: UnifiedPool[] = [];
    for (const entry of dataArray.slice(0, 200)) {
      const baseMint = typeof entry.baseMint === 'string' ? entry.baseMint : undefined;
      const quoteMint = typeof entry.quoteMint === 'string' ? entry.quoteMint : undefined;
      if (!baseMint || !quoteMint) {
        continue;
      }

      const bins = Array.isArray(entry.bins)
        ? (entry.bins as Array<Record<string, unknown>>)
            .map((bin) => {
              const priceUsd = typeof bin.price === 'number' ? bin.price : undefined;
              const liquidity = typeof bin.baseLiquidity === 'number' ? bin.baseLiquidity : undefined;
              if (priceUsd && liquidity && liquidity > 0) {
                return { priceUsd, baseLiquidity: liquidity };
              }
              return null;
            })
            .filter((value): value is { priceUsd: number; baseLiquidity: number } => value !== null)
        : undefined;

      pools.push({
        id: typeof entry.id === 'string' ? entry.id : `${baseMint}:${quoteMint}`,
        dex: 'METEORA_DLMM',
        type: 'DLMM',
        baseMint,
        quoteMint,
        baseSymbol: typeof entry.baseSymbol === 'string' ? entry.baseSymbol : undefined,
        quoteSymbol: typeof entry.quoteSymbol === 'string' ? entry.quoteSymbol : undefined,
        priceUsd: typeof entry.price === 'number' ? entry.price : undefined,
        bestBidPriceUsd: typeof entry.bestBid === 'number' ? entry.bestBid : undefined,
        bestAskPriceUsd: typeof entry.bestAsk === 'number' ? entry.bestAsk : undefined,
        tvlUsd: typeof entry.tvl === 'number' ? entry.tvl : undefined,
        volume24hUsd: typeof entry.volume24hUsd === 'number' ? entry.volume24hUsd : undefined,
        feeBps: typeof entry.feeBps === 'number' ? entry.feeBps : undefined,
        createdAt:
          typeof entry.createdAt === 'number'
            ? entry.createdAt
            : typeof entry.openTime === 'number'
              ? entry.openTime
              : undefined,
        dlmmBins: bins,
      });
    }

    return pools.length ? pools : null;
  } catch (error) {
    console.warn('Failed to fetch Meteora pools from API:', error);
    return null;
  }
}

export async function fetchMeteoraDlmmPools(opts: FetchPoolOptions = {}): Promise<UnifiedPool[]> {
  const cached = getCached<UnifiedPool[]>(CACHE_KEY);
  if (cached) {
    return cached;
  }

  const ttl = opts.cacheTtlMs ?? DEFAULT_TTL_MS;
  const apiData = await fetchFromApi(opts.signal);
  const pools = apiData && apiData.length > 0 ? apiData : SAMPLE_METEORA_POOLS;
  setCached(CACHE_KEY, pools, ttl);
  return pools;
}

export const METEORA_SAMPLE_MINTS = {
  SOL_MINT,
  BONK_MINT,
  SCAM_MINT,
};
