import { randomUUID } from 'crypto';
import { retry } from '../net/retry';
import type { DexAdapter, FetchContext } from './dex-adapter';
import type { PoolSnapshot, Candidate, DexId } from '../types/dex';
import type { FetchFilters } from '../types/filter-schema';
import { describeParserRpcEndpoint } from './env';
import { WSOL_MINT, STABLE_MINT_BY_MODE } from '../types/stable-mode';

const MOCK_NON_STABLE_MINTS = [
  'ToKenMint1111111111111111111111111111111111',
  'ToKenMint2222222222222222222222222222222222',
  'ToKenMint3333333333333333333333333333333333',
];

function buildMockPool({
  dex,
  poolType,
  mint,
  index,
}: {
  dex: DexId;
  poolType: PoolSnapshot['poolType'];
  mint: string;
  index: number;
}): PoolSnapshot {
  const reversed = index % 2 === 0;
  const mintA = reversed ? WSOL_MINT : mint;
  const mintB = reversed ? mint : WSOL_MINT;
  return {
    dex,
    poolId: `${dex}-${mint}-${index}-${randomUUID().slice(0, 6)}`,
    mintA,
    mintB,
    poolType,
    tvlUsd: 100_000 + index * 5_000,
    reserves: {
      base: 500 + index * 120,
      quote: 1_000 + index * 240,
      baseMint: mintA,
      quoteMint: mintB,
    },
    volume5m: 5_000 + index * 400,
    volume1h: 10_000 + index * 850,
    volume24h: 50_000 + index * 1_900,
    ageMinutes: 30 * (index + 1),
    price: 1 + index * 0.05,
  };
}

function makeMockPools(dex: DexId, context: FetchContext): PoolSnapshot[] {
  const poolType = context.filters.poolTypes[0] ?? 'CPMM';
  const pools: PoolSnapshot[] = [];

  MOCK_NON_STABLE_MINTS.forEach((mint, index) => {
    pools.push(buildMockPool({ dex, poolType, mint, index }));
  });

  Object.values(STABLE_MINT_BY_MODE).forEach((stableMint, index) => {
    pools.push(
      buildMockPool({
        dex,
        poolType,
        mint: stableMint,
        index: index + MOCK_NON_STABLE_MINTS.length,
      }),
    );
  });

  return pools;
}

function buildCandidates(pools: PoolSnapshot[]): Candidate[] {
  const map = new Map<string, Candidate>();

  pools.forEach((pool) => {
    const tokenMint = pool.mintA === WSOL_MINT ? pool.mintB : pool.mintA;
    if (tokenMint === WSOL_MINT) {
      return;
    }

    const existing = map.get(tokenMint);
    if (existing) {
      existing.pools.push({
        dex: pool.dex,
        poolId: pool.poolId,
        poolType: pool.poolType,
      });
      existing.tvlUsd += pool.tvlUsd ?? 0;
      existing.vol5m += pool.volume5m ?? 0;
      existing.vol1h += pool.volume1h ?? 0;
      existing.vol24h += pool.volume24h ?? 0;
      existing.volatility = Math.max(existing.volatility, Math.random() * 0.1);
      existing.estSlippagePct = Math.max(existing.estSlippagePct, Math.random());
      existing.altCost = Math.min(existing.altCost, 1 + Math.random() * 10);
      existing.score += Math.random() * 10;
      return;
    }

    map.set(tokenMint, {
      mint: tokenMint,
      pools: [
        {
          dex: pool.dex,
          poolId: pool.poolId,
          poolType: pool.poolType,
        },
      ],
      tvlUsd: pool.tvlUsd ?? 0,
      vol5m: pool.volume5m ?? 0,
      vol1h: pool.volume1h ?? 0,
      vol24h: pool.volume24h ?? 0,
      volatility: Math.random() * 0.1,
      estSlippagePct: Math.random(),
      altCost: 1 + Math.random() * 10,
      score: Math.random() * 100,
    });
  });

  return Array.from(map.values());
}

export class MockDexAdapter implements DexAdapter {
  public readonly id: DexId;

  constructor(
    dexId: DexId,
    private readonly rpcEndpoint: string | null,
  ) {
    this.id = dexId;
  }

  async fetchPools(input: { filters: FetchFilters }): Promise<PoolSnapshot[]> {
    const context: FetchContext = {
      filters: input.filters,
      rpcEndpoint: this.rpcEndpoint,
    };
    return retry(async () => makeMockPools(this.id, context));
  }

  async enrich(pools: PoolSnapshot[]): Promise<PoolSnapshot[]> {
    return pools;
  }

  async buildCandidates(filters: FetchFilters): Promise<Candidate[]> {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(`[mock-dex:${this.id}] using parser RPC: ${describeParserRpcEndpoint(this.rpcEndpoint)}`);
    }
    const pools = await this.fetchPools({ filters });
    const enriched = await this.enrich(pools);
    return buildCandidates(enriched);
  }
}
