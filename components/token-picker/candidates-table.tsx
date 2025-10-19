import type { Candidate } from '../../lib/types/dex';

interface CandidatesTableProps {
  candidates: Candidate[];
  allSourcesFailed: boolean;
  onRefresh: () => void;
}

export function CandidatesTable({ candidates, allSourcesFailed, onRefresh }: CandidatesTableProps) {
  return (
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
                {allSourcesFailed
                  ? 'Все источники временно недоступны. Попробуйте обновить позже.'
                  : 'Нажмите «Обновить данные», чтобы получить кандидатов.'}
              </td>
            </tr>
          )}
          {candidates.map((candidate) => (
            <tr key={candidate.mint} className="border-t border-slate-800/60">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-emerald-200">{candidate.mint}</span>
                  {candidate.triEligible && (
                    <span className="rounded-full border border-emerald-400/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                      Tri-arb
                    </span>
                  )}
                </div>
              </td>
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
                  <button className="rounded border border-slate-700 px-2 py-1" onClick={() => alert(`Dry-run маршрута для ${candidate.mint}`)}>
                    Dry-run
                  </button>
                  <button className="rounded border border-emerald-500 px-2 py-1 text-emerald-300" onClick={() => alert(`Добавить в конфиг ${candidate.mint}`)}>
                    В конфиг
                  </button>
                  <button className="rounded border border-slate-700 px-2 py-1" onClick={() => alert(`Watchlist ${candidate.mint}`)}>
                    Watchlist
                  </button>
                  <button className="rounded border border-slate-700 px-2 py-1" onClick={onRefresh}>
                    ↻
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
