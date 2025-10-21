import type { FetchPoolOptions, UnifiedPool } from '../types';

const METEORA_API_URL = 'https://dlmm-api.meteora.ag/pools';

type MeteoraApiEntry = Record<string, unknown>;

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

function parseBins(entry: MeteoraApiEntry) {
  if (!Array.isArray(entry.bins)) {
    return undefined;
  }

  const bins = (entry.bins as Array<Record<string, unknown>>)
    .map((bin) => {
      const priceUsd = parseNumber(bin.price ?? bin.priceUsd);
      const baseLiquidity = parseNumber(bin.baseLiquidity ?? bin.baseReserve ?? bin.liquidityBase);
      if (typeof priceUsd === 'number' && typeof baseLiquidity === 'number' && baseLiquidity > 0) {
        return { priceUsd, baseLiquidity };
      }
      return null;
    })
    .filter((value): value is { priceUsd: number; baseLiquidity: number } => value !== null);

  return bins.length ? bins : undefined;
}

function normalisePool(entry: MeteoraApiEntry): UnifiedPool | null {
  const baseMint = parseString(entry.baseMint);
  const quoteMint = parseString(entry.quoteMint);
  if (!baseMint || !quoteMint) {
    return null;
  }

  return {
    id: parseString(entry.id) ?? `${baseMint}:${quoteMint}`,
    dex: 'METEORA_DLMM',
    type: 'DLMM',
    baseMint,
    quoteMint,
    baseSymbol: parseString(entry.baseSymbol) ?? parseString(entry.base) ?? undefined,
    quoteSymbol: parseString(entry.quoteSymbol) ?? parseString(entry.quote) ?? undefined,
    priceUsd: parseNumber(entry.priceUsd ?? entry.price),
    bestBidPriceUsd: parseNumber(entry.bestBidUsd ?? entry.bestBid),
    bestAskPriceUsd: parseNumber(entry.bestAskUsd ?? entry.bestAsk),
    tvlUsd: parseNumber(entry.tvlUsd ?? entry.tvl ?? entry.totalValueLocked),
    volume24hUsd: parseNumber(entry.volume24hUsd ?? entry.volume24h ?? entry.volume_24h_usd),
    feeBps: parseNumber(entry.feeBps ?? entry.fee_bps ?? entry.fee),
    createdAt: parseTimestamp(entry.createdAt ?? entry.openTime ?? entry.openTimestamp ?? entry.openedAt),
    dlmmBins: parseBins(entry),
  };
}

async function fetchFromApi(signal?: AbortSignal): Promise<UnifiedPool[]> {
  try {
    const response = await fetch(METEORA_API_URL, {
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
      ? ((payload as { data?: unknown }).data as MeteoraApiEntry[])
      : Array.isArray(payload)
        ? (payload as MeteoraApiEntry[])
        : [];

    const pools: UnifiedPool[] = [];
    for (const entry of dataArray) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const normalised = normalisePool(entry as MeteoraApiEntry);
      if (normalised) {
        pools.push(normalised);
      }
    }

    return pools;
  } catch (error) {
    console.warn('Failed to fetch Meteora pools from API:', error);
    return [];
  }
}

export async function fetchMeteoraDlmmPools(opts: FetchPoolOptions = {}): Promise<UnifiedPool[]> {
  return fetchFromApi(opts.signal);
}
