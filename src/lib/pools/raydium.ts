import type { FetchPoolOptions, UnifiedPool } from '../types';
import { getCached, setCached } from '../utils/cache';

const CACHE_KEY = 'raydium:pools';
const DEFAULT_TTL_MS = 5 * 60 * 1000;

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BONK_MINT = 'DezXAZ8z7P5AGL4HnM9Df1t3ZL2uxJm2zG93P7xi5zs';
const SCAM_MINT = 'Scam111111111111111111111111111111111111111';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2q8B6CcneEBK8U9GweN7otMfL6';

const SAMPLE_RAYDIUM_POOLS: UnifiedPool[] = [
  {
    id: 'raydium-sol-usdc-amm',
    dex: 'RAYDIUM_AMM',
    type: 'AMM',
    baseMint: SOL_MINT,
    quoteMint: USDC_MINT,
    baseSymbol: 'SOL',
    quoteSymbol: 'USDC',
    priceUsd: 148.35,
    bestBidPriceUsd: 148.2,
    bestAskPriceUsd: 148.5,
    tvlUsd: 520_000,
    volume24hUsd: 410_000,
    feeBps: 25,
    createdAt: Date.now() - 420 * 24 * 60 * 60 * 1000,
    reserves: {
      base: 3_200,
      quote: 474_720,
    },
  },
  {
    id: 'raydium-sol-usdc-cpmm',
    dex: 'RAYDIUM_CPMM',
    type: 'CPMM',
    baseMint: SOL_MINT,
    quoteMint: USDC_MINT,
    baseSymbol: 'SOL',
    quoteSymbol: 'USDC',
    priceUsd: 147.9,
    bestBidPriceUsd: 147.7,
    bestAskPriceUsd: 148.1,
    tvlUsd: 360_000,
    volume24hUsd: 280_000,
    feeBps: 35,
    createdAt: Date.now() - 310 * 24 * 60 * 60 * 1000,
    reserves: {
      base: 2_700,
      quote: 399_330,
    },
  },
  {
    id: 'raydium-bonk-usdc-amm',
    dex: 'RAYDIUM_AMM',
    type: 'AMM',
    baseMint: BONK_MINT,
    quoteMint: USDC_MINT,
    baseSymbol: 'BONK',
    quoteSymbol: 'USDC',
    priceUsd: 0.0000218,
    bestBidPriceUsd: 0.0000216,
    bestAskPriceUsd: 0.000022,
    tvlUsd: 135_000,
    volume24hUsd: 42_000,
    feeBps: 30,
    createdAt: Date.now() - 280 * 24 * 60 * 60 * 1000,
    reserves: {
      base: 6_200_000_000,
      quote: 135_160,
    },
  },
  {
    id: 'raydium-bonk-usdc-cpmm',
    dex: 'RAYDIUM_CPMM',
    type: 'CPMM',
    baseMint: BONK_MINT,
    quoteMint: USDC_MINT,
    baseSymbol: 'BONK',
    quoteSymbol: 'USDC',
    priceUsd: 0.0000224,
    bestBidPriceUsd: 0.0000221,
    bestAskPriceUsd: 0.0000227,
    tvlUsd: 98_000,
    volume24hUsd: 35_000,
    feeBps: 40,
    createdAt: Date.now() - 260 * 24 * 60 * 60 * 1000,
    reserves: {
      base: 4_300_000_000,
      quote: 96_320,
    },
  },
  {
    id: 'raydium-scam-usdc-cpmm',
    dex: 'RAYDIUM_CPMM',
    type: 'CPMM',
    baseMint: SCAM_MINT,
    quoteMint: USDC_MINT,
    baseSymbol: 'SCAM',
    quoteSymbol: 'USDC',
    priceUsd: 0.42,
    bestBidPriceUsd: 0.41,
    bestAskPriceUsd: 0.43,
    tvlUsd: 12_000,
    volume24hUsd: 4_500,
    feeBps: 120,
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    reserves: {
      base: 35_000,
      quote: 14_700,
    },
  },
];

async function fetchFromApi(signal?: AbortSignal): Promise<UnifiedPool[] | null> {
  try {
    const response = await fetch('https://api-v3.raydium.io/pairs', {
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

      const id = typeof entry.id === 'string' ? entry.id : `${baseMint}:${quoteMint}`;
      const type = typeof entry.market === 'string' ? entry.market.toUpperCase() : 'AMM';
      const dex = type.includes('CPMM') ? 'RAYDIUM_CPMM' : 'RAYDIUM_AMM';

      pools.push({
        id,
        dex,
        type: dex === 'RAYDIUM_CPMM' ? 'CPMM' : 'AMM',
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
      });
    }

    return pools.length ? pools : null;
  } catch (error) {
    console.warn('Failed to fetch Raydium pools from API:', error);
    return null;
  }
}

export async function fetchRaydiumPools(opts: FetchPoolOptions = {}): Promise<UnifiedPool[]> {
  const cached = getCached<UnifiedPool[]>(CACHE_KEY);
  if (cached) {
    return cached;
  }

  const ttl = opts.cacheTtlMs ?? DEFAULT_TTL_MS;
  const apiData = await fetchFromApi(opts.signal);
  const pools = apiData && apiData.length > 0 ? apiData : SAMPLE_RAYDIUM_POOLS;
  setCached(CACHE_KEY, pools, ttl);
  return pools;
}

export const RAYDIUM_SAMPLE_MINTS = {
  SOL_MINT,
  BONK_MINT,
  SCAM_MINT,
};
