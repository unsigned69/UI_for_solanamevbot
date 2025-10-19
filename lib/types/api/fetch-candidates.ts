import type { Candidate, DexSourceError } from '../dex';

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
}

export interface FetchCandidatesFailurePayload {
  errorsByDex: DexSourceError[];
  updatedAt: number;
}

export type FetchCandidatesResponsePayload =
  | FetchCandidatesSuccessPayload
  | FetchCandidatesFailurePayload;
