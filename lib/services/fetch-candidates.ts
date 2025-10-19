import { readBaseAnchorTokens } from '../config/base-anchor-reader';
import { fetchCandidatesAcrossDexes } from '../adapters/registry';
import type {
  FetchCandidatesFailurePayload,
  FetchCandidatesResponsePayload,
  FetchCandidatesSuccessPayload,
} from '../types/api/fetch-candidates';
import type { FetchFilters } from '../types/filter-schema';
import type { Candidate } from '../types/dex';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function resolvePage(filters: FetchFilters): number {
  const raw = filters.page;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  return DEFAULT_PAGE;
}

function resolvePageSize(filters: FetchFilters): number {
  const raw = filters.pageSize;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return Math.min(raw, MAX_PAGE_SIZE);
  }
  return DEFAULT_PAGE_SIZE;
}

function sortCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.slice().sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.vol1h !== a.vol1h) {
      return b.vol1h - a.vol1h;
    }
    return a.mint.localeCompare(b.mint);
  });
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const unique: Candidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.mint)) {
      continue;
    }
    seen.add(candidate.mint);
    unique.push(candidate);
  }
  return unique;
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
  const sorted = sortCandidates(candidates);
  const unique = dedupeCandidates(sorted);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paged = unique.slice(start, end);

  return {
    candidates: paged,
    total: unique.length,
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
