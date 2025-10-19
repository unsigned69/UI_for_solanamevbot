'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candidate, DexSourceError } from '../../lib/types/dex';
import type { FetchFilters } from '../../lib/types/filter-schema';
import type {
  FetchCandidatesResponsePayload,
  FetchCandidatesSuccessPayload,
} from '../../lib/types/api/fetch-candidates';
import { BaseAnchorPanel } from './base-anchor-panel';
import { FiltersPanel, type FiltersChangeHandler } from './filter-panel';
import { CandidatesTable } from './candidates-table';
import { DexErrorBanner } from './dex-error-banner';

const defaultFilters: FetchFilters = {
  dexes: ['pumpfun', 'raydium', 'meteora'],
  poolTypes: ['CPMM', 'CLMM', 'DLMM'],
  page: 0,
  pageSize: 20,
};

function isSuccessResponse(
  response: FetchCandidatesResponsePayload | null,
): response is FetchCandidatesSuccessPayload {
  return response !== null && 'candidates' in response;
}

function ensureTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function normaliseDexErrors(value: unknown): DexSourceError[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.reduce<DexSourceError[]>((acc, item) => {
    if (!item || typeof item !== 'object') {
      return acc;
    }
    const candidate = item as { dex?: unknown; status?: unknown; message?: unknown };
    if (typeof candidate.dex !== 'string' || typeof candidate.message !== 'string') {
      return acc;
    }
    const status = typeof candidate.status === 'number' ? candidate.status : undefined;
    acc.push({ dex: candidate.dex as DexSourceError['dex'], status, message: candidate.message });
    return acc;
  }, []);
}

function normaliseCandidates(value: unknown): Candidate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as Candidate[];
}

export default function TokenPickerClient() {
  const [filters, setFilters] = useState<FetchFilters>(defaultFilters);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<FetchCandidatesResponsePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseTokens, setBaseTokens] = useState<string[]>([]);
  const [anchorTokens, setAnchorTokens] = useState<string[]>([]);
  const [baseAnchorError, setBaseAnchorError] = useState<string | null>(null);

  const fetchBaseAnchor = useCallback(async () => {
    const res = await fetch('/api/config/read');
    const data = await res.json();
    if (data.baseAnchorError) {
      setBaseAnchorError(String(data.baseAnchorError));
    } else {
      setBaseAnchorError(null);
    }
    setBaseTokens(Array.isArray(data.baseTokens) ? (data.baseTokens as string[]) : []);
    setAnchorTokens(Array.isArray(data.anchorTokens) ? (data.anchorTokens as string[]) : []);
  }, []);

  useEffect(() => {
    fetchBaseAnchor();
  }, [fetchBaseAnchor]);

  const canUpdate = baseTokens.length > 0 && anchorTokens.length > 0 && !baseAnchorError;

  const handleInputChange = useCallback<FiltersChangeHandler>((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const requestCandidates = useCallback(async (): Promise<FetchCandidatesResponsePayload | null> => {
    if (!canUpdate) {
      return null;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/fetch-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      const data = (await response.json()) as Record<string, unknown>;
      const errorsByDex = normaliseDexErrors(data.errorsByDex);
      if (response.status === 503) {
        const failure = {
          errorsByDex,
          updatedAt: ensureTimestamp(data.updatedAt),
        } satisfies FetchCandidatesResponsePayload;
        setLastResponse(failure);
        return failure;
      }
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Не удалось получить кандидатов');
      }
      const updatedAt = ensureTimestamp(data.updatedAt ?? data.fetchedAt);
      const success: FetchCandidatesSuccessPayload = {
        candidates: normaliseCandidates(data.candidates),
        total: typeof data.total === 'number' ? data.total : 0,
        page: typeof data.page === 'number' ? data.page : filters.page ?? 0,
        pageSize: typeof data.pageSize === 'number' ? data.pageSize : filters.pageSize ?? 20,
        fetchedAt:
          typeof data.fetchedAt === 'string' ? data.fetchedAt : new Date(updatedAt).toISOString(),
        baseTokens: Array.isArray(data.baseTokens) ? (data.baseTokens as string[]) : [],
        anchorTokens: Array.isArray(data.anchorTokens) ? (data.anchorTokens as string[]) : [],
        errorsByDex,
        updatedAt,
      };
      setLastResponse(success);
      setBaseTokens(success.baseTokens);
      setAnchorTokens(success.anchorTokens);
      return success;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [filters, canUpdate]);

  const fetchData = useCallback(async () => {
    const data = await requestCandidates();
    if (isSuccessResponse(data)) {
      setCandidates(data.candidates);
    } else if (data) {
      setCandidates([]);
    }
  }, [requestCandidates]);

  const timestampLabel = useMemo(() => {
    const updatedAt = lastResponse?.updatedAt;
    const candidate = updatedAt
      ? new Date(updatedAt)
      : isSuccessResponse(lastResponse)
        ? new Date(lastResponse.fetchedAt)
        : null;
    if (!candidate || Number.isNaN(candidate.getTime())) {
      return '—';
    }
    return candidate.toLocaleString();
  }, [lastResponse]);

  const dexErrors = lastResponse?.errorsByDex ?? [];
  const allSourcesFailed = lastResponse !== null && !isSuccessResponse(lastResponse) && dexErrors.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">Подбор токенов</h1>
        <p className="text-sm text-slate-400">
          Данные загружаются только по кнопке «Обновить данные». Base/Anchor токены читаются из конфига и недоступны для
          редактирования здесь.
        </p>
      </div>

      <BaseAnchorPanel baseTokens={baseTokens} anchorTokens={anchorTokens} error={baseAnchorError} />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <FiltersPanel filters={filters} onChange={handleInputChange} />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-slate-400">Последний снимок: {timestampLabel}</p>
            <div className="flex flex-col items-start gap-2 text-left sm:flex-row sm:items-center sm:gap-3">
              {error && <p className="text-sm text-red-300">{error}</p>}
              <button
                className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700"
                onClick={fetchData}
                disabled={!canUpdate || isLoading}
              >
                {isLoading ? 'Загрузка…' : 'Обновить данные'}
              </button>
              <p className="text-xs text-slate-500">
                Парсер работает независимо от процесса бота. Запуск бота не обязателен.
              </p>
            </div>
          </div>

          <DexErrorBanner errors={dexErrors} allSourcesFailed={allSourcesFailed} />

          <CandidatesTable
            candidates={candidates}
            canUpdate={canUpdate}
            allSourcesFailed={allSourcesFailed}
            onRefresh={fetchData}
          />
        </section>
      </div>
    </div>
  );
}
