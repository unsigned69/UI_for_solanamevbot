import type { FetchPoolOptions, UnifiedPool } from '../types';

const RAYDIUM_API_URL = 'https://api-v3.raydium.io/pairs';

type RaydiumApiEntry = Record<string, unknown>;

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

function parseTimestamp(value: unknown): number | undefined {
  const numeric = parseNumber(value);
  if (typeof numeric === 'number') {
    return numeric;
  }
  return undefined;
}

function extractReserves(entry: RaydiumApiEntry) {
  const liquidity = entry.liquidity;
  const base = parseNumber(
    (liquidity && typeof liquidity === 'object' ? (liquidity as { base?: unknown }).base : undefined) ??
      entry.baseReserve ??
      entry.baseLiquidity ??
      entry.baseAmount ??
      entry.baseQuantity,
  );
  const quote = parseNumber(
    (liquidity && typeof liquidity === 'object' ? (liquidity as { quote?: unknown }).quote : undefined) ??
      entry.quoteReserve ??
      entry.quoteLiquidity ??
      entry.quoteAmount ??
      entry.quoteQuantity,
  );

  if (typeof base === 'number' && typeof quote === 'number') {
    return { base, quote };
  }
  return undefined;
}

function normalisePool(entry: RaydiumApiEntry): UnifiedPool | null {
  const baseMint = parseString(entry.baseMint);
  const quoteMint = parseString(entry.quoteMint);
  if (!baseMint || !quoteMint) {
    return null;
  }

  const id = parseString(entry.id) ?? `${baseMint}:${quoteMint}`;
  const marketRaw = parseString(entry.market) ?? parseString(entry.ammType) ?? parseString(entry.poolType) ?? 'AMM';
  const market = marketRaw.toUpperCase();
  const dex = market.includes('CPMM') ? 'RAYDIUM_CPMM' : 'RAYDIUM_AMM';
  const reserves = extractReserves(entry);

  return {
    id,
    dex,
    type: dex === 'RAYDIUM_CPMM' ? 'CPMM' : 'AMM',
    baseMint,
    quoteMint,
    baseSymbol: parseString(entry.baseSymbol) ?? parseString(entry.baseSymbolName) ?? parseString(entry.base),
    quoteSymbol: parseString(entry.quoteSymbol) ?? parseString(entry.quoteSymbolName) ?? parseString(entry.quote),
    priceUsd: parseNumber(entry.priceUsd ?? entry.price ?? entry.midPrice ?? entry.latestPrice),
    bestBidPriceUsd: parseNumber(entry.bestBidUsd ?? entry.bestBid ?? entry.bid),
    bestAskPriceUsd: parseNumber(entry.bestAskUsd ?? entry.bestAsk ?? entry.ask),
    tvlUsd: parseNumber(entry.tvlUsd ?? entry.tvl ?? entry.liquidityUsd ?? entry.totalValue),
    volume24hUsd: parseNumber(entry.volume24hUsd ?? entry.volume24h ?? entry.volume_24h_usd ?? entry.volume_24h),
    feeBps: parseNumber(entry.feeBps ?? entry.fee_bps ?? entry.fee ?? entry.feeRate),
    createdAt:
      parseTimestamp(entry.createdAt ?? entry.openTime ?? entry.createdTime ?? entry.openTimestamp ?? entry.openedAt) ??
      undefined,
    reserves,
  };
}

async function fetchFromApi(signal?: AbortSignal): Promise<UnifiedPool[]> {
  try {
    const response = await fetch(`${RAYDIUM_API_URL}?limit=500`, {
      headers: {
        'User-Agent': 'solana-tokens-dashboard/1.0',
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal,
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as unknown;
    const dataArray = Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data?: unknown }).data as RaydiumApiEntry[])
      : Array.isArray(payload)
        ? (payload as RaydiumApiEntry[])
        : [];

    const pools: UnifiedPool[] = [];
    for (const entry of dataArray) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const normalised = normalisePool(entry as RaydiumApiEntry);
      if (normalised) {
        pools.push(normalised);
      }
    }

    return pools;
  } catch (error) {
    console.warn('Failed to fetch Raydium pools from API:', error);
    return [];
  }
}

export async function fetchRaydiumPools(opts: FetchPoolOptions = {}): Promise<UnifiedPool[]> {
  return fetchFromApi(opts.signal);
}
