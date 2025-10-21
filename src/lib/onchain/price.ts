import { getCached, setCached } from '../utils/cache';

interface PriceResult {
  price: number | null;
  confidence: 'high' | 'low';
}

const CACHE_KEY_PREFIX = 'price:';
const DEFAULT_TTL_MS = 60 * 1000;

const FALLBACK_PRICES: Record<string, PriceResult> = {
  So11111111111111111111111111111111111111112: { price: 148.5, confidence: 'low' },
  DezXAZ8z7P5AGL4HnM9Df1t3ZL2uxJm2zG93P7xi5zs: { price: 0.000022, confidence: 'low' },
  Scam111111111111111111111111111111111111111: { price: 0.41, confidence: 'low' },
};

const MINT_TO_SYMBOL: Record<string, string> = {
  So11111111111111111111111111111111111111112: 'SOL',
  DezXAZ8z7P5AGL4HnM9Df1t3ZL2uxJm2zG93P7xi5zs: 'BONK',
  Scam111111111111111111111111111111111111111: 'SCAM',
};

async function fetchFromJupiter(mint: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const baseUrl = process.env.JUPITER_PRICE_URL || 'https://price.jup.ag/v6/price?ids=';
    const identifier = MINT_TO_SYMBOL[mint] ?? mint;
    const url = `${baseUrl}${encodeURIComponent(identifier)}`;
    const response = await fetch(url, {
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

    const data = (payload as { data?: unknown }).data;
    if (!data || typeof data !== 'object') {
      return null;
    }

    const entry = (data as Record<string, unknown>)[identifier];
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const price =
      typeof (entry as Record<string, unknown>).price === 'number'
        ? ((entry as Record<string, unknown>).price as number)
        : typeof (entry as Record<string, unknown>).uiPrice === 'number'
          ? ((entry as Record<string, unknown>).uiPrice as number)
          : null;

    return price ?? null;
  } catch (error) {
    console.warn(`Failed to fetch price from Jupiter for ${mint}:`, error);
    return null;
  }
}

export async function getUsdPrice(mintPk: string, opts?: { signal?: AbortSignal; cacheTtlMs?: number }): Promise<PriceResult> {
  const cacheKey = `${CACHE_KEY_PREFIX}${mintPk}`;
  const cached = getCached<PriceResult>(cacheKey);
  if (cached) {
    return cached;
  }

  const ttl = opts?.cacheTtlMs ?? DEFAULT_TTL_MS;
  const fromJupiter = await fetchFromJupiter(mintPk, opts?.signal);
  const fallback = FALLBACK_PRICES[mintPk] ?? { price: null, confidence: 'low' };
  const value: PriceResult = fromJupiter
    ? { price: fromJupiter, confidence: 'high' }
    : fallback;
  setCached(cacheKey, value, ttl);
  return value;
}
