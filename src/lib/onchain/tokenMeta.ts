import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { getCached, setCached } from '../utils/cache';
import type { FetchPoolOptions } from '../types';

const FALLBACK_INFO: Record<string, { decimals: number; mintAuthority: string | null; freezeAuthority: string | null; hasTransferFee: boolean }> = {
  So11111111111111111111111111111111111111112: {
    decimals: 9,
    mintAuthority: null,
    freezeAuthority: null,
    hasTransferFee: false,
  },
  DezXAZ8z7P5AGL4HnM9Df1t3ZL2uxJm2zG93P7xi5zs: {
    decimals: 5,
    mintAuthority: null,
    freezeAuthority: null,
    hasTransferFee: false,
  },
  Scam111111111111111111111111111111111111111: {
    decimals: 9,
    mintAuthority: '6niNz1ScAmMintAuth1111111111111111111111',
    freezeAuthority: '6niNz1ScAmMintAuth1111111111111111111111',
    hasTransferFee: true,
  },
};

const CACHE_KEY_PREFIX = 'mint-info:';
const DEFAULT_TTL_MS = 10 * 60 * 1000;

let connection: Connection | null = null;
let currentEndpoint: string | null = null;

function getConnectionInstance(): Connection | null {
  const endpoint = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  if (!endpoint) {
    return null;
  }

  if (!connection || currentEndpoint !== endpoint) {
    connection = new Connection(endpoint, 'confirmed');
    currentEndpoint = endpoint;
  }

  return connection;
}

async function fetchFromRpc(mintPk: string, signal?: AbortSignal): Promise<{
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  hasTransferFee: boolean;
} | null> {
  try {
    const conn = getConnectionInstance();
    if (!conn) {
      return null;
    }

    const publicKey = new PublicKey(mintPk);
    const accountInfo = await conn.getAccountInfo(publicKey, 'confirmed');
    if (!accountInfo) {
      return null;
    }

    const owner = accountInfo.owner;
    const mint = unpackMint(publicKey, accountInfo, owner);
    const mintAuthority = mint.mintAuthority ? mint.mintAuthority.toBase58() : null;
    const freezeAuthority = mint.freezeAuthority ? mint.freezeAuthority.toBase58() : null;
    const hasTransferFee = owner.equals(TOKEN_2022_PROGRAM_ID);

    return {
      decimals: mint.decimals,
      mintAuthority,
      freezeAuthority,
      hasTransferFee,
    };
  } catch (error) {
    console.warn(`Failed to fetch mint info for ${mintPk}:`, error);
    return null;
  } finally {
    if (signal?.aborted) {
      signal.throwIfAborted();
    }
  }
}

export async function getMintInfo(
  mintPk: string,
  opts: FetchPoolOptions = {},
): Promise<{
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  hasTransferFee: boolean;
}> {
  const cacheKey = `${CACHE_KEY_PREFIX}${mintPk}`;
  const cached = getCached<{
    decimals: number;
    mintAuthority: string | null;
    freezeAuthority: string | null;
    hasTransferFee: boolean;
  }>(cacheKey);

  if (cached) {
    return cached;
  }

  const ttl = opts.cacheTtlMs ?? DEFAULT_TTL_MS;
  const fromRpc = await fetchFromRpc(mintPk, opts.signal);
  const fallback = FALLBACK_INFO[mintPk];
  const value = fromRpc ?? fallback ?? {
    decimals: 9,
    mintAuthority: null,
    freezeAuthority: null,
    hasTransferFee: false,
  };

  setCached(cacheKey, value, ttl);
  return value;
}
