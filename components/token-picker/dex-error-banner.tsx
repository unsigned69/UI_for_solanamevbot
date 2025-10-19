import type { DexSourceError } from '../../lib/types/dex';

interface DexErrorBannerProps {
  errors: DexSourceError[];
  allSourcesFailed: boolean;
}

export function DexErrorBanner({ errors, allSourcesFailed }: DexErrorBannerProps) {
  if (!errors.length) {
    return null;
  }

  if (allSourcesFailed) {
    return (
      <div className="rounded border border-red-500/60 bg-red-900/20 p-4 text-sm text-red-200">
        <p className="font-semibold uppercase tracking-wide">Все источники недоступны</p>
        <ul className="mt-3 space-y-1 text-xs uppercase text-red-100">
          {errors.map((dexError, index) => (
            <li key={`${dexError.dex}-${index}`} className="normal-case">
              <span className="font-semibold capitalize text-red-200">{dexError.dex}</span>
              {typeof dexError.status === 'number' && <span> · {dexError.status}</span>}
              <span className="block text-red-100">{dexError.message}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded border border-amber-500/40 bg-amber-900/20 p-3 text-xs text-amber-100">
      <p className="font-semibold uppercase tracking-wide text-amber-200">Часть источников ответила ошибкой</p>
      <ul className="mt-2 space-y-1">
        {errors.map((dexError, index) => (
          <li key={`${dexError.dex}-${index}`} className="flex flex-wrap gap-1 text-amber-100">
            <span className="font-semibold capitalize text-amber-200">{dexError.dex}</span>
            {typeof dexError.status === 'number' && <span>({dexError.status})</span>}
            <span className="normal-case">— {dexError.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
