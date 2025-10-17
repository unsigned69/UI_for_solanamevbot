'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candidate } from '../../lib/types/dex';
import type { FetchFiltersInput } from '../../lib/types/filter-schema';

interface FetchResponse {
  candidates: Candidate[];
  total: number;
  page: number;
  pageSize: number;
  fetchedAt: string;
  baseTokens: string[];
  anchorTokens: string[];
  error?: string;
}

const defaultFilters: FetchFiltersInput = {
  dexes: ['pumpfun', 'raydium', 'meteora'],
  poolTypes: ['CPMM', 'CLMM', 'DLMM'],
  page: 0,
  pageSize: 20,
};

export default function TokenPickerClient() {
  const [filters, setFilters] = useState<FetchFiltersInput>(defaultFilters);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<FetchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseTokens, setBaseTokens] = useState<string[]>([]);
  const [anchorTokens, setAnchorTokens] = useState<string[]>([]);
  const [baseAnchorError, setBaseAnchorError] = useState<string | null>(null);

  const fetchBaseAnchor = useCallback(async () => {
    const res = await fetch('/api/config/read');
    const data = await res.json();
    if (data.baseAnchorError) {
      setBaseAnchorError(data.baseAnchorError);
    } else {
      setBaseAnchorError(null);
    }
    setBaseTokens(data.baseTokens ?? []);
    setAnchorTokens(data.anchorTokens ?? []);
  }, []);

  useEffect(() => {
    fetchBaseAnchor();
  }, [fetchBaseAnchor]);

  const canUpdate = baseTokens.length > 0 && anchorTokens.length > 0 && !baseAnchorError;

  const handleInputChange = (key: keyof FetchFiltersInput, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const requestCandidates = useCallback(async (): Promise<FetchResponse | null> => {
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
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Не удалось получить кандидатов');
      }
      setLastResponse(data);
      setBaseTokens(data.baseTokens ?? []);
      setAnchorTokens(data.anchorTokens ?? []);
      return data;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [filters, canUpdate]);

  const fetchData = useCallback(async () => {
    const data = await requestCandidates();
    if (data) {
      setCandidates(data.candidates ?? []);
    }
  }, [requestCandidates]);

  const refreshSingle = async (mint: string) => {
    const data = await requestCandidates();
    if (data?.candidates) {
      setCandidates(data.candidates);
    }
  };

  const dexFilterOptions = ['pumpfun', 'raydium', 'meteora'] as const;
  const poolTypeOptions = ['CPMM', 'CLMM', 'DLMM'] as const;

  const timestampLabel = useMemo(() => {
    if (!lastResponse?.fetchedAt) return '—';
    return new Date(lastResponse.fetchedAt).toLocaleString();
  }, [lastResponse]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">Подбор токенов</h1>
        <p className="text-sm text-slate-400">
          Данные загружаются только по кнопке «Обновить данные». Base/Anchor токены читаются из конфига и недоступны для
          редактирования здесь.
        </p>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-emerald-200">Base / Anchor из конфига</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-400">Base tokens</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-200">
              {baseTokens.length ? baseTokens.map((mint) => <li key={mint}>{mint}</li>) : <li className="text-slate-500">—</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-400">Anchor tokens</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-200">
              {anchorTokens.length ? anchorTokens.map((mint) => <li key={mint}>{mint}</li>) : <li className="text-slate-500">—</li>}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Редактируйте значения вручную в файле конфига, затем обновите страницу.</p>
        {baseAnchorError && (
          <div className="mt-4 rounded border border-red-500/60 bg-red-900/20 p-3 text-sm text-red-200">
            Base/Anchor токены не найдены в конфиге. Задайте их вручную и обновите страницу.
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-lg font-semibold text-emerald-200">Фильтры</h3>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-slate-200">DEX</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {dexFilterOptions.map((dex) => {
                  const checked = filters.dexes?.includes(dex) ?? false;
                  return (
                    <label key={dex} className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = new Set(filters.dexes ?? []);
                          if (event.target.checked) {
                            next.add(dex);
                          } else {
                            next.delete(dex);
                          }
                          handleInputChange('dexes', Array.from(next));
                        }}
                      />
                      <span className="capitalize">{dex}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="font-medium text-slate-200">Тип пула</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {poolTypeOptions.map((type) => {
                  const checked = filters.poolTypes?.includes(type) ?? false;
                  return (
                    <label key={type} className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = new Set(filters.poolTypes ?? []);
                          if (event.target.checked) {
                            next.add(type);
                          } else {
                            next.delete(type);
                          }
                          handleInputChange('poolTypes', Array.from(next));
                        }}
                      />
                      <span>{type}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase text-slate-400">Мин. TVL</span>
                <input
                  className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                  type="number"
                  value={filters.minTVL ?? ''}
                  onChange={(e) => handleInputChange('minTVL', e.target.value ? Number(e.target.value) : undefined)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase text-slate-400">Мин. объём 5м</span>
                <input
                  className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                  type="number"
                  value={filters.minVol5m ?? ''}
                  onChange={(e) => handleInputChange('minVol5m', e.target.value ? Number(e.target.value) : undefined)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase text-slate-400">Мин. объём 1ч</span>
                <input
                  className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                  type="number"
                  value={filters.minVol1h ?? ''}
                  onChange={(e) => handleInputChange('minVol1h', e.target.value ? Number(e.target.value) : undefined)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase text-slate-400">Мин. объём 24ч</span>
                <input
                  className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                  type="number"
                  value={filters.minVol24h ?? ''}
                  onChange={(e) => handleInputChange('minVol24h', e.target.value ? Number(e.target.value) : undefined)}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-400">Мин. возраст пула (мин)</span>
              <input
                className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                type="number"
                value={filters.minPoolAgeMinutes ?? ''}
                onChange={(e) =>
                  handleInputChange('minPoolAgeMinutes', e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-400">Бюджет (anchor denom)</span>
              <input
                className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                type="number"
                value={filters.budget ?? ''}
                onChange={(e) => handleInputChange('budget', e.target.value ? Number(e.target.value) : undefined)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-400">Макс. slippage %</span>
              <input
                className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                type="number"
                value={filters.maxSlippagePct ?? ''}
                onChange={(e) => handleInputChange('maxSlippagePct', e.target.value ? Number(e.target.value) : undefined)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-400">Max ALT cost</span>
              <input
                className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                type="number"
                value={filters.maxAltCost ?? ''}
                onChange={(e) => handleInputChange('maxAltCost', e.target.value ? Number(e.target.value) : undefined)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-400">Blacklist mints (через запятую)</span>
              <input
                className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                type="text"
                value={filters.blacklistMints?.join(',') ?? ''}
                onChange={(e) =>
                  handleInputChange(
                    'blacklistMints',
                    e.target.value
                      ? e.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean)
                      : undefined,
                  )
                }
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-400">Исключить пула моложе (мин)</span>
              <input
                className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                type="number"
                value={filters.newerThanMinutesExclude ?? ''}
                onChange={(e) =>
                  handleInputChange('newerThanMinutesExclude', e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.excludeFrozen ?? false}
                onChange={(e) => handleInputChange('excludeFrozen', e.target.checked)}
              />
              Исключить замороженные пулы
            </label>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Последний снимок: {timestampLabel}</p>
            </div>
            <div className="flex flex-col items-start gap-2 text-left sm:flex-row sm:items-center sm:gap-3">
              {error && <p className="text-sm text-red-300">{error}</p>}
              <button
                className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700"
                onClick={fetchData}
                disabled={!canUpdate || isLoading}
              >
                {isLoading ? 'Загрузка…' : 'Обновить данные'}
              </button>
              <p className="text-xs text-slate-500">Парсер работает независимо от процесса бота. Запуск бота не обязателен.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Mint</th>
                  <th className="px-3 py-2">DEX / Тип</th>
                  <th className="px-3 py-2">TVL</th>
                  <th className="px-3 py-2">Объём 5м/1ч/24ч</th>
                  <th className="px-3 py-2">Волатильность</th>
                  <th className="px-3 py-2">Slippage %</th>
                  <th className="px-3 py-2">ALT cost</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                      {canUpdate ? 'Нажмите «Обновить данные», чтобы получить кандидатов.' : 'Укажите base/anchor токены в конфиге.'}
                    </td>
                  </tr>
                )}
                {candidates.map((candidate) => (
                  <tr key={candidate.mint} className="border-t border-slate-800/60">
                    <td className="px-3 py-2 font-mono text-xs text-emerald-200">{candidate.mint}</td>
                    <td className="px-3 py-2 text-xs text-slate-200">
                      {candidate.pools.map((pool) => (
                        <div key={pool.poolId}>
                          <span className="font-semibold capitalize">{pool.dex}</span> • {pool.poolType}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2">${candidate.tvlUsd.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {candidate.vol5m.toLocaleString()} / {candidate.vol1h.toLocaleString()} / {candidate.vol24h.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{candidate.volatility.toFixed(4)}</td>
                    <td className="px-3 py-2">{candidate.estSlippagePct.toFixed(2)}%</td>
                    <td className="px-3 py-2">{candidate.altCost.toFixed(2)}</td>
                    <td className="px-3 py-2">{candidate.score.toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded border border-slate-700 px-2 py-1" onClick={() => alert('Dry-run маршрута для ' + candidate.mint)}>
                          Dry-run
                        </button>
                        <button className="rounded border border-emerald-500 px-2 py-1 text-emerald-300" onClick={() => alert('Добавить в конфиг ' + candidate.mint)}>
                          В конфиг
                        </button>
                        <button className="rounded border border-slate-700 px-2 py-1" onClick={() => alert('Watchlist ' + candidate.mint)}>
                          Watchlist
                        </button>
                        <button className="rounded border border-slate-700 px-2 py-1" onClick={() => refreshSingle(candidate.mint)}>
                          ↻
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
