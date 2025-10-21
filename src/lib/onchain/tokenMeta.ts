import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import type { FetchPoolOptions } from '../types';

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
  decimals: number | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  hasTransferFee: boolean;
}> {
  const fromRpc = await fetchFromRpc(mintPk, opts.signal);
  if (fromRpc) {
    return fromRpc;
  }

  return {
    decimals: null,
    mintAuthority: null,
    freezeAuthority: null,
    hasTransferFee: false,
  };
}
