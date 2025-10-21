import type { FilterParams, TokenRow } from '../types';

export function applyFilters(rows: TokenRow[], params: FilterParams): TokenRow[] {
  return rows
    .filter((row) => {
      if (params.mintAuthNull && row.mintAuthority !== null) {
        return false;
      }

      if (params.freezeNull && row.freezeAuthority !== null) {
        return false;
      }

      if (params.noTransferFee && row.hasTransferFee) {
        return false;
      }

      if ((row.decimals ?? Number.POSITIVE_INFINITY) < params.decimalsMin) {
        return false;
      }

      if ((row.decimals ?? Number.NEGATIVE_INFINITY) > params.decimalsMax) {
        return false;
      }

      const tvl = row.tvlUsd ?? 0;
      if (tvl < params.tvlMinUsd) {
        return false;
      }

      const volume = row.volume24hUsd ?? 0;
      if (volume < params.vMinUsd) {
        return false;
      }

      const age = row.tokenAgeDays ?? 0;
      if (age < params.ageTokenDaysMin) {
        return false;
      }

      const impact = row.impactPctAt100 ?? Number.POSITIVE_INFINITY;
      if (impact > params.impactPctMax) {
        return false;
      }

      const maxFee = row.maxPoolFeeBps ?? Number.POSITIVE_INFINITY;
      if (maxFee > params.poolFeeBpsMax) {
        return false;
      }

      return true;
    })
    .slice(0, params.limit);
}
