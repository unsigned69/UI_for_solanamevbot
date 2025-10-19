import type { FetchFilters } from '../../lib/types/filter-schema';

const DEX_OPTIONS: FetchFilters['dexes'] = ['pumpfun', 'raydium', 'meteora'];
const POOL_TYPE_OPTIONS: FetchFilters['poolTypes'] = ['CPMM', 'CLMM', 'DLMM'];

export type FiltersChangeHandler = <K extends keyof FetchFilters>(key: K, value: FetchFilters[K]) => void;

interface FiltersPanelProps {
  filters: FetchFilters;
  onChange: FiltersChangeHandler;
}

function toggleSetValue<T extends string>(values: readonly T[] | undefined, value: T, checked: boolean): T[] {
  const next = new Set(values ?? []);
  if (checked) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return Array.from(next);
}

function parseNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function FiltersPanel({ filters, onChange }: FiltersPanelProps) {
  return (
    <aside className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-lg font-semibold text-emerald-200">Фильтры</h3>
      <div className="space-y-3 text-sm">
        <div>
          <p className="font-medium text-slate-200">DEX</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEX_OPTIONS.map((dex) => {
              const checked = filters.dexes?.includes(dex) ?? false;
              return (
                <label key={dex} className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange('dexes', toggleSetValue(filters.dexes, dex, event.target.checked))}
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
            {POOL_TYPE_OPTIONS.map((type) => {
              const checked = filters.poolTypes?.includes(type) ?? false;
              return (
                <label key={type} className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange('poolTypes', toggleSetValue(filters.poolTypes, type, event.target.checked))}
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
              onChange={(e) => onChange('minTVL', parseNumber(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-slate-400">Мин. объём 5м</span>
            <input
              className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
              type="number"
              value={filters.minVol5m ?? ''}
              onChange={(e) => onChange('minVol5m', parseNumber(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-slate-400">Мин. объём 1ч</span>
            <input
              className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
              type="number"
              value={filters.minVol1h ?? ''}
              onChange={(e) => onChange('minVol1h', parseNumber(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-slate-400">Мин. объём 24ч</span>
            <input
              className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
              type="number"
              value={filters.minVol24h ?? ''}
              onChange={(e) => onChange('minVol24h', parseNumber(e.target.value))}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-slate-400">Мин. возраст пула (мин)</span>
          <input
            className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
            type="number"
            value={filters.minPoolAgeMinutes ?? ''}
            onChange={(e) => onChange('minPoolAgeMinutes', parseNumber(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-slate-400">Макс. slippage %</span>
          <input
            className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
            type="number"
            value={filters.maxSlippagePct ?? ''}
            onChange={(e) => onChange('maxSlippagePct', parseNumber(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-slate-400">Макс. ALT cost</span>
          <input
            className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
            type="number"
            value={filters.maxAltCost ?? ''}
            onChange={(e) => onChange('maxAltCost', parseNumber(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-slate-400">Blacklist mints (через запятую)</span>
          <input
            className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
            type="text"
            value={filters.blacklistMints?.join(',') ?? ''}
            onChange={(e) =>
              onChange(
                'blacklistMints',
                e.target.value
                  ? (e.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean) as string[])
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
            onChange={(e) => onChange('newerThanMinutesExclude', parseNumber(e.target.value))}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.excludeFrozen ?? false}
            onChange={(e) => onChange('excludeFrozen', e.target.checked)}
          />
          Исключить замороженные пулы
        </label>
      </div>
    </aside>
  );
}
