import { managedConfigSchema } from './schema';
import type { ManagedConfig } from '../types/config';

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  altCostEstimate: number;
  computeUnitsEstimate: number;
}

const ALT_COST_PER_POOL = 5;
const COMPUTE_UNITS_PER_POOL = 1000;

export function validateManagedConfig(managed: ManagedConfig): ValidationReport {
  const parsed = managedConfigSchema.safeParse(managed);
  const errors: string[] = [];
  if (!parsed.success) {
    errors.push(
      ...parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
    );
  }

  const mintCount = managed.routing.mint_config_list.length;
  const pools = managed.routing.mint_config_list.reduce((acc, mint) => {
    return (
      acc +
      (mint.raydiumPools?.length ?? 0) +
      (mint.meteoraDlmmPools?.length ?? 0) +
      (mint.pumpfunPools?.length ?? 0)
    );
  }, 0);

  const altCostEstimate = pools * ALT_COST_PER_POOL;
  const computeUnitsEstimate = pools * COMPUTE_UNITS_PER_POOL;

  if (mintCount > 100) {
    errors.push('Управляемый блок содержит более 100 mint. Сократите список.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: pools > 50 ? ['Количество пулов велико, убедитесь в лимитах compute.'] : [],
    altCostEstimate,
    computeUnitsEstimate,
  };
}
