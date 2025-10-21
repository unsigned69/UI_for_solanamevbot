import { NextResponse, type NextRequest } from 'next/server';
import { fetchRaydiumPools } from '@/lib/pools/raydium';
import { fetchMeteoraDlmmPools } from '@/lib/pools/meteora';
import { parseQueryToFilter } from '@/lib/filters/schema';
import { applyFilters } from '@/lib/filters/apply';
import { groupPoolsByMint } from '@/lib/utils/group';
import { calculateCrossDexSpread, calculateSpreadPercent, maxNumber, minNumber, sumNumbers } from '@/lib/utils/math';
import { estimateImpactPctCpmm, estimateImpactPctDlmm } from '@/lib/onchain/impact';
import { getMintInfo } from '@/lib/onchain/tokenMeta';
import { getUsdPrice } from '@/lib/onchain/price';
import type { TokenRow, UnifiedPool } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 0;

const SYMBOL_FALLBACKS: Record<string, string> = {
  So11111111111111111111111111111111111111112: 'SOL',
  DezXAZ8z7P5AGL4HnM9Df1t3ZL2uxJm2zG93P7xi5zs: 'BONK',
  Scam111111111111111111111111111111111111111: 'SCAM',
};

function selectDexPools(pools: UnifiedPool[], params: ReturnType<typeof parseQueryToFilter>): UnifiedPool[] {
  return pools.filter((pool) => {
    if (pool.dex === 'RAYDIUM_AMM') {
      return params.dexRaydiumAmm;
    }
    if (pool.dex === 'RAYDIUM_CPMM') {
      return params.dexRaydiumCpmm;
    }
    if (pool.dex === 'METEORA_DLMM') {
      return params.dexMeteoraDlmm;
    }
    return false;
  });
}

function collectPrices(pools: UnifiedPool[]): number[] {
  const prices: number[] = [];
  for (const pool of pools) {
    if (typeof pool.bestBidPriceUsd === 'number') {
      prices.push(pool.bestBidPriceUsd);
    }
    if (typeof pool.bestAskPriceUsd === 'number') {
      prices.push(pool.bestAskPriceUsd);
    }
    if (typeof pool.priceUsd === 'number') {
      prices.push(pool.priceUsd);
    }
  }
  return prices;
}

async function buildTokenRows(allPools: UnifiedPool[], params: ReturnType<typeof parseQueryToFilter>): Promise<TokenRow[]> {
  const grouped = groupPoolsByMint(allPools);
  const rows: TokenRow[] = [];

  for (const [mint, pools] of grouped.entries()) {
    const raydiumPools = pools.filter((pool) => pool.dex === 'RAYDIUM_AMM' || pool.dex === 'RAYDIUM_CPMM');
    const meteoraPools = pools.filter((pool) => pool.dex === 'METEORA_DLMM');

    if (raydiumPools.length === 0 && meteoraPools.length === 0) {
      continue;
    }

    const [{ decimals, mintAuthority, freezeAuthority, hasTransferFee }, priceResult] = await Promise.all([
      getMintInfo(mint),
      getUsdPrice(mint),
    ]);

    const symbolFromPools = pools.find((pool) => pool.baseSymbol)?.baseSymbol;
    const symbol = symbolFromPools ?? SYMBOL_FALLBACKS[mint] ?? mint.slice(0, 4);

    const raydiumSpread = calculateSpreadPercent(collectPrices(raydiumPools));
    const meteoraSpread = calculateSpreadPercent(collectPrices(meteoraPools));

    const bestRaydiumPrice = minNumber(
      raydiumPools.map((pool) => pool.bestAskPriceUsd ?? pool.priceUsd ?? null),
    );
    const bestMeteoraPrice = minNumber(
      meteoraPools.map((pool) => pool.bestAskPriceUsd ?? pool.priceUsd ?? null),
    );
    const crossDexSpread = calculateCrossDexSpread(bestRaydiumPrice ?? undefined, bestMeteoraPrice ?? undefined);

    const aggregatedTvl = sumNumbers(pools.map((pool) => pool.tvlUsd ?? null));
    const aggregatedVolume = sumNumbers(pools.map((pool) => pool.volume24hUsd ?? null));
    const maxFee = maxNumber(pools.map((pool) => pool.feeBps ?? null));

    const rawCreatedAt = minNumber(pools.map((pool) => pool.createdAt ?? null));
    const createdAt = rawCreatedAt && rawCreatedAt < 10_000_000_000 ? rawCreatedAt * 1000 : rawCreatedAt;
    const tokenAgeDays =
      createdAt && createdAt > 0
        ? (Date.now() - createdAt) / (1000 * 60 * 60 * 24)
        : null;

    const impactValues: number[] = [];
    for (const pool of pools) {
      if (pool.type === 'DLMM' && pool.dlmmBins) {
        const impact = estimateImpactPctDlmm({ bins: pool.dlmmBins, tradeUsd: params.impactUsd });
        if (Number.isFinite(impact)) {
          impactValues.push(impact);
        }
      } else if (pool.reserves && typeof priceResult.price === 'number') {
        const impact = estimateImpactPctCpmm({
          baseReserve: pool.reserves.base,
          quoteReserve: pool.reserves.quote,
          tradeUsd: params.impactUsd,
          priceUsd: priceResult.price,
          feeBps: pool.feeBps,
        });
        if (Number.isFinite(impact)) {
          impactValues.push(impact);
        }
      }
    }

    const impactPctAt100 = impactValues.length ? Math.min(...impactValues) : null;

    rows.push({
      mint,
      symbol,
      priceUsd: priceResult.price,
      priceConfidence: priceResult.confidence,
      spreadRaydiumPct: raydiumSpread,
      spreadMeteoraPct: meteoraSpread,
      raydiumPools: Array.from(new Set(raydiumPools.map((pool) => pool.type))).sort(),
      meteoraPools: meteoraPools.length,
      crossDexSpreadPct: crossDexSpread,
      tvlUsd: aggregatedTvl,
      volume24hUsd: aggregatedVolume,
      decimals: decimals ?? null,
      mintAuthority,
      freezeAuthority,
      hasTransferFee,
      impactPctAt100,
      tokenAgeDays,
      maxPoolFeeBps: maxFee,
    });
  }

  return rows.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));
}

export async function GET(request: NextRequest) {
  const params = parseQueryToFilter(request.nextUrl.searchParams);

  const [raydium, meteora] = await Promise.all([
    fetchRaydiumPools({ signal: request.signal }),
    fetchMeteoraDlmmPools({ signal: request.signal }),
  ]);

  const selectedPools = selectDexPools([...raydium, ...meteora], params);
  const rows = await buildTokenRows(selectedPools, params);
  const filtered = applyFilters(rows, params);

  return NextResponse.json({
    params,
    count: filtered.length,
    items: filtered,
  });
}
