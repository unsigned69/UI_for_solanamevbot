'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_FILTERS, parseQueryToFilter } from '@/lib/filters/schema';
import type { ApiResponse, FilterParams, TokenRow } from '@/lib/types';

type FilterFormState = FilterParams;

const DEX_FIELDS: Array<{ key: keyof FilterFormState; label: string }> = [
  { key: 'dexRaydiumAmm', label: 'Raydium AMM' },
  { key: 'dexRaydiumCpmm', label: 'Raydium CPMM' },
  { key: 'dexMeteoraDlmm', label: 'Meteora DLMM' },
];

const SAFETY_FIELDS: Array<{ key: keyof FilterFormState; label: string }> = [
  { key: 'mintAuthNull', label: 'Mint Authority = null' },
  { key: 'freezeNull', label: 'Freeze Authority = null' },
  { key: 'noTransferFee', label: 'Без Transfer Fee (Token-2022)' },
];

const NUMBER_FIELDS: Array<{
  key: keyof FilterFormState;
  label: string;
  step?: string;
}> = [
  { key: 'tvlMinUsd', label: 'Min TVL (USD)', step: '100' },
  { key: 'vMinUsd', label: 'Min 24h Volume (USD)', step: '10' },
  { key: 'ageTokenDaysMin', label: 'Min Token Age (days)', step: '1' },
  { key: 'decimalsMin', label: 'Decimals min', step: '1' },
  { key: 'decimalsMax', label: 'Decimals max', step: '1' },
  { key: 'poolFeeBpsMax', label: 'Max Pool Fee (bps)', step: '1' },
  { key: 'impactUsd', label: 'Impact size (USD)', step: '10' },
  { key: 'impactPctMax', label: 'Max Impact (%)', step: '0.01' },
];

function filtersToSearchParams(filters: FilterFormState): URLSearchParams {
  const params = new URLSearchParams();
  const entries = Object.entries(filters) as Array<[
    keyof FilterFormState,
    FilterFormState[keyof FilterFormState],
  ]>;

  for (const [key, value] of entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    let encoded: string;
    if (typeof value === 'boolean') {
      encoded = value ? '1' : '0';
    } else if (typeof value === 'number') {
      encoded = Number.isFinite(value) ? String(value) : '';
    } else {
      encoded = String(value);
    }

    params.set(key, encoded);
  }
  return params;
}

function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('en-US', options).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export default function TokensClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchedQueryRef = useRef<string | null>(null);

  const parsedFilters = useMemo(() => parseQueryToFilter(searchParams), [searchParams]);
  const [formState, setFormState] = useState<FilterFormState>(parsedFilters);
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (filters: FilterFormState, queryOverride?: string): Promise<ApiResponse | null> => {
      const params = filtersToSearchParams(filters);
      const query = queryOverride ?? params.toString();

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      lastFetchedQueryRef.current = query;

      try {
        const endpoint = query ? `/api/tokens?${query}` : '/api/tokens';
        const response = await fetch(endpoint, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch tokens (${response.status})`);
        }

        const body = (await response.json()) as ApiResponse;
        setRows(body.items);
        return body;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return null;
        }

        setRows([]);
        setError(err instanceof Error ? err.message : 'Unknown error');
        return null;
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
          abortRef.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    setFormState(parsedFilters);

    const canonicalQuery = filtersToSearchParams(parsedFilters).toString();
    if (lastFetchedQueryRef.current !== canonicalQuery) {
      void fetchData(parsedFilters, canonicalQuery);
    }
  }, [fetchData, parsedFilters]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleCheckboxChange = (key: keyof FilterFormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [key]: event.target.checked }));
  };

  const handleNumberChange = (key: keyof FilterFormState) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [key]: value === '' ? prev[key] : Number(value) }));
  };

  const handleApply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = filtersToSearchParams(formState);
    const query = params.toString();
    await fetchData(formState, query);
    const href = query ? `/tokens?${query}` : '/tokens';
    router.replace(href, { scroll: false });
  };

  const handleReset = async () => {
    const defaults = { ...DEFAULT_FILTERS };
    setFormState(defaults);
    const params = filtersToSearchParams(defaults);
    const query = params.toString();
    await fetchData(defaults, query);
    const href = query ? `/tokens?${query}` : '/tokens';
    router.replace(href, { scroll: false });
  };

  return (
    <main className="tokens-page">
      <h1>Solana Tokens Dashboard</h1>
      <form className="filters" onSubmit={handleApply}>
        <section>
          <h2>DEX visibility</h2>
          {DEX_FIELDS.map((field) => (
            <label key={field.key} className="checkbox">
              <input
                type="checkbox"
                checked={formState[field.key] as boolean}
                onChange={handleCheckboxChange(field.key)}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </section>

        <section>
          <h2>Anti-scam filters</h2>
          {SAFETY_FIELDS.map((field) => (
            <label key={field.key} className="checkbox">
              <input
                type="checkbox"
                checked={formState[field.key] as boolean}
                onChange={handleCheckboxChange(field.key)}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </section>

        <section className="numeric-grid">
          <h2>Bot filters</h2>
          {NUMBER_FIELDS.map((field) => (
            <label key={field.key} className="input">
              <span>{field.label}</span>
              <input
                type="number"
                step={field.step}
                value={String(formState[field.key])}
                onChange={handleNumberChange(field.key)}
              />
            </label>
          ))}
        </section>

        <div className="actions">
          <button type="submit">Apply</button>
          <button type="button" onClick={handleReset} className="secondary">
            Reset defaults
          </button>
        </div>
      </form>

      {loading && <p className="status">Loading tokens…</p>}
      {error && <p className="status error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Price (USD)</th>
                <th>Spread (Raydium)</th>
                <th>Spread (Meteora)</th>
                <th>Raydium Pools</th>
                <th>Meteora Pools</th>
                <th>Cross-DEX Spread</th>
                <th>TVL</th>
                <th>Vol 24h</th>
                <th>Dec</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty">
                    No tokens match the current filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.mint}>
                  <td>
                    <div className="token-cell">
                      <strong>{row.symbol}</strong>
                      <span className="mint">{row.mint}</span>
                    </div>
                  </td>
                  <td>{formatNumber(row.priceUsd, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                  <td>{formatPercent(row.spreadRaydiumPct)}</td>
                  <td>{formatPercent(row.spreadMeteoraPct)}</td>
                  <td>{row.raydiumPools.length ? row.raydiumPools.join(', ') : '—'}</td>
                  <td>{row.meteoraPools.length ? row.meteoraPools.join(', ') : '—'}</td>
                  <td>{formatPercent(row.crossDexSpreadPct)}</td>
                  <td>{formatNumber(row.tvlUsd, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</td>
                  <td>{formatNumber(row.volume24hUsd, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</td>
                  <td>{row.decimals ?? '—'}</td>
                  <td>
                    <div className="flags">
                      {row.freezeAuthority && <span className="badge warning">Freeze</span>}
                      {row.hasTransferFee && <span className="badge warning">Transfer Fee</span>}
                      {!row.freezeAuthority && !row.hasTransferFee && <span className="badge ok">Clean</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
