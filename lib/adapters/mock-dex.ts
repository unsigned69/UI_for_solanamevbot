import { randomUUID } from 'crypto';
import { retry } from '../net/retry';
import type { DexAdapter, FetchContext } from './dex-adapter';
import type { FetchFilters, PoolSnapshot, Candidate, DexId } from '../types/dex';
import { describeParserRpcEndpoint } from './env';

function makeMockPools(dex: DexId, context: FetchContext): PoolSnapshot[] {
  return context.baseTokens.slice(0, 2).map((baseMint, index) => ({
    dex,
    poolId: `${dex}-${index}-${randomUUID().slice(0, 6)}`,
    mintA: baseMint,
    mintB: context.anchorTokens[0] ?? 'unknown-anchor',
    poolType: context.filters.poolTypes[0] ?? 'CPMM',
    tvlUsd: 100_000 + index * 10_000,
    reserves: {
      base: 500 + index * 100,
      quote: 1_000 + index * 200,
      baseMint,
      quoteMint: context.anchorTokens[0] ?? 'unknown-anchor',
    },
    volume5m: 5_000 + index * 500,
    volume1h: 10_000 + index * 900,
    volume24h: 50_000 + index * 2_000,
    ageMinutes: 60 * (index + 1),
    price: 1 + index * 0.1,
  }));
}

function buildCandidates(pools: PoolSnapshot[]): Candidate[] {
  return pools.map((pool) => ({
    mint: pool.mintA === pool.mintB ? pool.mintA : pool.mintA,
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
    estSlippagePct: Math.random() * 1,
    altCost: 1 + Math.random() * 10,
    score: Math.random() * 100,
  }));
}

export class MockDexAdapter implements DexAdapter {
  public readonly id: DexId;

  constructor(
    dexId: DexId,
    private readonly rpcEndpoint: string | null,
  ) {
    this.id = dexId;
  }

  async fetchPools(input: { filters: FetchFilters; baseTokens: string[]; anchorTokens: string[] }): Promise<PoolSnapshot[]> {
    const context: FetchContext = {
      filters: input.filters,
      baseTokens: input.baseTokens,
      anchorTokens: input.anchorTokens,
      rpcEndpoint: this.rpcEndpoint,
    };
    return retry(async () => makeMockPools(this.id, context));
  }

  async enrich(pools: PoolSnapshot[]): Promise<PoolSnapshot[]> {
    return pools;
  }

  async buildCandidates(filters: FetchFilters, baseTokens: string[], anchorTokens: string[]): Promise<Candidate[]> {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(`[mock-dex:${this.id}] using parser RPC: ${describeParserRpcEndpoint(this.rpcEndpoint)}`);
    }
    const pools = await this.fetchPools({ filters, baseTokens, anchorTokens });
    const enriched = await this.enrich(pools);
    return buildCandidates(enriched);
  }
}
