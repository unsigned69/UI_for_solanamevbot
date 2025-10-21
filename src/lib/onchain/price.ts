interface PriceResult {
  price: number | null;
  confidence: 'high' | 'low';
}

async function fetchFromJupiter(identifiers: string[], signal?: AbortSignal): Promise<Record<string, number> | null> {
  const uniqueIds = Array.from(
    new Set(
      identifiers
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );

  if (uniqueIds.length === 0) {
    return null;
  }

  try {
    const baseUrl = process.env.JUPITER_PRICE_URL || 'https://price.jup.ag/v6/price?ids=';
    const url = `${baseUrl}${encodeURIComponent(uniqueIds.join(','))}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'solana-tokens-dashboard/1.0',
        Accept: 'application/json',
      },
      cache: 'no-store',
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

    const prices: Record<string, number> = {};
    for (const id of uniqueIds) {
      const candidateKeys = [id, id.toUpperCase(), id.toLowerCase()];
      let entry: unknown;
      for (const key of candidateKeys) {
        if (entry) {
          break;
        }
        if (typeof key === 'string' && key in (data as Record<string, unknown>)) {
          entry = (data as Record<string, unknown>)[key];
        }
      }

      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const entryRecord = entry as Record<string, unknown>;
      const priceValue =
        typeof entryRecord.price === 'number'
          ? entryRecord.price
          : typeof entryRecord.uiPrice === 'number'
            ? entryRecord.uiPrice
            : null;

      if (typeof priceValue === 'number' && Number.isFinite(priceValue)) {
        prices[id] = priceValue;
      }
    }

    return Object.keys(prices).length > 0 ? prices : null;
  } catch (error) {
    console.warn('Failed to fetch price data from Jupiter:', error);
    return null;
  }
}

export async function getUsdPrice(
  mintPk: string,
  opts?: { signal?: AbortSignal; identifiers?: string[] },
): Promise<PriceResult> {
  const identifiers = Array.from(
    new Set([mintPk, ...(opts?.identifiers ?? [])].filter((value) => typeof value === 'string' && value.trim().length > 0)),
  );

  const result = await fetchFromJupiter(identifiers, opts?.signal);
  if (result) {
    for (const id of identifiers) {
      const price = result[id];
      if (typeof price === 'number') {
        return { price, confidence: 'high' };
      }
    }
  }

  return { price: null, confidence: 'low' };
}
