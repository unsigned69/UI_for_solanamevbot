import type { Candidate, DexSourceError } from '../dex';
import type { StableMode } from '../stable-mode';

export interface FetchCandidatesSuccessPayload {
  candidates: Candidate[];
  total: number;
  page: number;
  pageSize: number;
  fetchedAt: string;
  baseTokens: string[];
  anchorTokens: string[];
  errorsByDex: DexSourceError[];
  updatedAt: number;
  stableMode?: StableMode;
  stableMint?: string;
}

export interface FetchCandidatesFailurePayload {
  errorsByDex: DexSourceError[];
  updatedAt: number;
  stableMode?: StableMode;
  stableMint?: string;
}

export type FetchCandidatesResponsePayload =
  | FetchCandidatesSuccessPayload
  | FetchCandidatesFailurePayload;
