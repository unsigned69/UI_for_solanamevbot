import { readBaseAnchorTokens } from '../config/base-anchor-reader';
import { fetchCandidatesAcrossDexes } from '../adapters/registry';
import type {
  FetchCandidatesFailurePayload,
  FetchCandidatesResponsePayload,
  FetchCandidatesSuccessPayload,
} from '../types/api/fetch-candidates';
import type { FetchFilters } from '../types/filter-schema';

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 20;

function resolvePage(filters: FetchFilters): number {
  return typeof filters.page === 'number' && filters.page >= 0 ? filters.page : DEFAULT_PAGE;
}

function resolvePageSize(filters: FetchFilters): number {
  if (typeof filters.pageSize === 'number' && filters.pageSize > 0) {
    return filters.pageSize;
  }
  return DEFAULT_PAGE_SIZE;
}

function buildSuccessPayload(
  filters: FetchFilters,
  baseTokens: string[],
  anchorTokens: string[],
  candidates: FetchCandidatesSuccessPayload['candidates'],
  errorsByDex: FetchCandidatesSuccessPayload['errorsByDex'],
  timestamp: number,
): FetchCandidatesSuccessPayload {
  const page = resolvePage(filters);
  const pageSize = resolvePageSize(filters);
  const start = page * pageSize;
  const end = start + pageSize;
  const paged = candidates.slice(start, end);

  return {
    candidates: paged,
    total: candidates.length,
    page,
    pageSize,
    fetchedAt: new Date(timestamp).toISOString(),
    baseTokens,
    anchorTokens,
    errorsByDex,
    updatedAt: timestamp,
  };
}

function buildFailurePayload(
  errorsByDex: FetchCandidatesFailurePayload['errorsByDex'],
  timestamp: number,
): FetchCandidatesFailurePayload {
  return {
    errorsByDex,
    updatedAt: timestamp,
  };
}

interface CandidateSnapshot {
  status: 200 | 503;
  payload: FetchCandidatesResponsePayload;
}

export async function fetchCandidateSnapshot(filters: FetchFilters): Promise<CandidateSnapshot> {
  const { baseTokens, anchorTokens } = await readBaseAnchorTokens();
  const { candidates, errorsByDex, successfulDexes } = await fetchCandidatesAcrossDexes(
    filters,
    baseTokens,
    anchorTokens,
  );
  const timestamp = Date.now();

  if (successfulDexes.length === 0) {
    return {
      status: 503,
      payload: buildFailurePayload(errorsByDex, timestamp),
    };
  }

  return {
    status: 200,
    payload: buildSuccessPayload(filters, baseTokens, anchorTokens, candidates, errorsByDex, timestamp),
  };
}
