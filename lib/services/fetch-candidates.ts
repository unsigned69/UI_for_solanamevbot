import { fetchCandidatesAcrossDexes, type AdapterSettledMeta } from '../adapters/registry';
import { resolveStableMode } from '../config/stable-mode';
import { describeRetryError } from '../net/retry';
import { uiLogger } from '../log/logger';
import type {
  FetchCandidatesFailurePayload,
  FetchCandidatesResponsePayload,
  FetchCandidatesSuccessPayload,
} from '../types/api/fetch-candidates';
import type { FetchFilters } from '../types/filter-schema';
import type { Candidate } from '../types/dex';
import { WSOL_MINT, type StableMode } from '../types/stable-mode';

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

function filterPoolsForWsol(pools: Candidate['pools']): Candidate['pools'] {
  return pools.filter((pool) => pool.mintA === WSOL_MINT || pool.mintB === WSOL_MINT);
}

function filterCandidatesForWsol(candidates: Candidate[]): Candidate[] {
  const filtered: Candidate[] = [];
  candidates.forEach((candidate) => {
    const pools = filterPoolsForWsol(candidate.pools);
    if (!pools.length) {
      return;
    }
    filtered.push({ ...candidate, pools });
  });
  return filtered;
}

function filterCandidatesByMaxAltCost(candidates: Candidate[], maxAltCost?: number): Candidate[] {
  if (typeof maxAltCost !== 'number' || Number.isNaN(maxAltCost)) {
    return candidates;
  }
  return candidates.filter((candidate) => candidate.altCost <= maxAltCost);
}

function logAdapterCompletion(meta: AdapterSettledMeta) {
  if (meta.ok) {
    uiLogger.info('adapter_done', {
      dex: meta.dex,
      status: 'ok',
      count: meta.count ?? 0,
      duration_ms: meta.durationMs,
    });
    return;
  }
  const { status, message } = describeRetryError(meta.error);
  uiLogger.warn('adapter_done', message ?? 'Adapter error', {
    dex: meta.dex,
    status: 'error',
    source_status: status,
    duration_ms: meta.durationMs,
  });
}

interface CandidateSnapshot {
  status: 200 | 503;
  payload: FetchCandidatesResponsePayload;
}

const TRI_ELIGIBLE_SCORE_BONUS = 1;

function applyTriEligibility(
  candidates: Candidate[],
  stableMode: StableMode,
  stableMint: string | null,
): Candidate[] {
  if (!stableMint) {
    return candidates.map((candidate) => ({
      ...candidate,
      triEligible: false,
      triStable: null,
    }));
  }

  const stableDexes = new Set<string>();
  candidates.forEach((candidate) => {
    if (candidate.mint === stableMint) {
      candidate.pools.forEach((pool) => stableDexes.add(pool.dex));
    }
  });

  return candidates.map((candidate) => {
    const isStableCandidate = candidate.mint === stableMint;
    const eligible = !isStableCandidate && candidate.pools.some((pool) => stableDexes.has(pool.dex));
    return {
      ...candidate,
      score: eligible ? candidate.score + TRI_ELIGIBLE_SCORE_BONUS : candidate.score,
      triEligible: eligible,
      triStable: stableMode,
    };
  });
}

export async function fetchCandidateSnapshot(filters: FetchFilters): Promise<CandidateSnapshot> {
  const { mode: stableMode, stableMint } = await resolveStableMode();
  const { candidates, errorsByDex, successfulDexes } = await fetchCandidatesAcrossDexes(filters, {
    onAdapterSettled: logAdapterCompletion,
  });
  const wsolCandidates = filterCandidatesForWsol(candidates);
  const costFiltered = filterCandidatesByMaxAltCost(wsolCandidates, filters.maxAltCost);
  const enrichedCandidates = applyTriEligibility(costFiltered, stableMode, stableMint);
  const timestamp = Date.now();

  if (successfulDexes.length === 0) {
    return {
      status: 503,
      payload: buildFailurePayload(errorsByDex, timestamp),
    };
  }

  return {
    status: 200,
    payload: buildSuccessPayload(filters, enrichedCandidates, errorsByDex, timestamp),
  };
}
