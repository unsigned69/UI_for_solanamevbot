'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candidate, DexSourceError } from '../../lib/types/dex';
import type { FetchFilters } from '../../lib/types/filter-schema';
import type {
  FetchCandidatesResponsePayload,
  FetchCandidatesSuccessPayload,
} from '../../lib/types/api/fetch-candidates';
import type { StableMode } from '../../lib/types/stable-mode';
import { normaliseStableMode } from '../../lib/types/stable-mode';
import { FiltersPanel, type FiltersChangeHandler } from './filter-panel';
import { CandidatesTable } from './candidates-table';
import { DexErrorBanner } from './dex-error-banner';

const defaultFilters: FetchFilters = {
  dexes: ['pumpfun', 'raydium', 'meteora'],
  poolTypes: ['CPMM', 'CLMM', 'DLMM'],
  page: 1,
  pageSize: 50,
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
  const map = new Map<string, DexSourceError>();
  value.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const candidate = item as { dex?: unknown; status?: unknown; message?: unknown };
    if (typeof candidate.dex !== 'string' || typeof candidate.message !== 'string') {
      return;
    }
    if (map.has(candidate.dex)) {
      return;
    }
    const status = typeof candidate.status === 'number' ? candidate.status : undefined;
    map.set(candidate.dex, {
      dex: candidate.dex as DexSourceError['dex'],
      status,
      message: candidate.message,
    });
  });
  return Array.from(map.values());
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
  const [stableMode, setStableMode] = useState<StableMode>('NONE');
  const [stableMint, setStableMint] = useState<string | null>(null);

  const fetchStableMode = useCallback(async () => {
    const res = await fetch('/api/config/read');
    const data = await res.json();
    const mode = normaliseStableMode(data.stableMode);
    setStableMode(mode);
    setStableMint(typeof data.stableMint === 'string' ? data.stableMint : null);
  }, []);

  useEffect(() => {
    fetchStableMode();
  }, [fetchStableMode]);

  const handleInputChange = useCallback<FiltersChangeHandler>((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const requestCandidates = useCallback(async (): Promise<FetchCandidatesResponsePayload | null> => {
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
          stableMode: normaliseStableMode(data.stableMode),
          stableMint: typeof data.stableMint === 'string' ? data.stableMint : undefined,
        } satisfies FetchCandidatesResponsePayload;
        setStableMode(normaliseStableMode(data.stableMode));
        setStableMint(typeof data.stableMint === 'string' ? data.stableMint : null);
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
        page: typeof data.page === 'number' ? data.page : filters.page ?? defaultFilters.page,
        pageSize:
          typeof data.pageSize === 'number' ? data.pageSize : filters.pageSize ?? defaultFilters.pageSize,
        fetchedAt:
          typeof data.fetchedAt === 'string' ? data.fetchedAt : new Date(updatedAt).toISOString(),
        baseTokens: [],
        anchorTokens: [],
        errorsByDex,
        updatedAt,
        stableMode: normaliseStableMode(data.stableMode),
        stableMint: typeof data.stableMint === 'string' ? data.stableMint : undefined,
      };
      setLastResponse(success);
      setStableMode(success.stableMode ?? 'NONE');
      setStableMint(success.stableMint ?? null);
      return success;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

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
  const stableModeLabel = stableMode;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">Подбор токенов</h1>
        <p className="text-sm text-slate-400">
          Данные загружаются только по кнопке «Обновить данные». SOL используется как маршрутная монета, стейбл-режим выбирается
          вне UI.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
        <p className="text-sm text-slate-300">
          Маршрут: <span className="font-semibold text-emerald-200">TOKEN ↔ SOL</span>
        </p>
        <p className="text-sm text-slate-400">
          Стейбл-режим: <span className="font-semibold text-emerald-200">{stableModeLabel}</span>{' '}
          <span className="text-xs text-slate-500">(read-only)</span>
          {stableModeLabel !== 'NONE' && stableMint && (
            <span className="ml-2 font-mono text-[10px] text-slate-500">{stableMint}</span>
          )}
        </p>
      </div>

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
                disabled={isLoading}
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
            allSourcesFailed={allSourcesFailed}
            onRefresh={fetchData}
          />
        </section>
      </div>
    </div>
  );
}
