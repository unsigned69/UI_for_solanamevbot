interface BaseAnchorPanelProps {
  baseTokens: string[];
  anchorTokens: string[];
  error?: string | null;
  missing?: boolean;
}

export function BaseAnchorPanel({ baseTokens, anchorTokens, error, missing }: BaseAnchorPanelProps) {
  const bannerMessage = error || (missing ? 'Base/Anchor токены не найдены в конфиге.' : null);
  return (
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
            {anchorTokens.length
              ? anchorTokens.map((mint) => <li key={mint}>{mint}</li>)
              : <li className="text-slate-500">—</li>}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Редактируйте значения вручную в файле конфига, затем обновите страницу.</p>
      {bannerMessage && (
        <div className="mt-4 rounded border border-red-500/60 bg-red-900/20 p-3 text-sm text-red-200">
          {bannerMessage}
        </div>
      )}
    </section>
  );
}
