import { z } from 'zod';
import type { FilterParams } from '../types';

const booleanParam = z
  .preprocess((value) => {
    if (typeof value === 'string') {
      const normalised = value.trim().toLowerCase();
      if (normalised === '1' || normalised === 'true') {
        return true;
      }
      if (normalised === '0' || normalised === 'false') {
        return false;
      }
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return value;
  }, z.boolean());

function numberParam(defaultValue: number, options?: { min?: number; max?: number }) {
  let schema = z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    return undefined;
  }, z.number());

  if (typeof options?.min === 'number') {
    schema = schema.refine((val) => val >= options.min!, {
      message: `Value must be ≥ ${options.min}`,
    });
  }

  if (typeof options?.max === 'number') {
    schema = schema.refine((val) => val <= options.max!, {
      message: `Value must be ≤ ${options.max}`,
    });
  }

  return schema.default(defaultValue);
}

const schema = z.object({
  dexRaydiumAmm: booleanParam.default(true),
  dexRaydiumCpmm: booleanParam.default(true),
  dexMeteoraDlmm: booleanParam.default(true),
  mintAuthNull: booleanParam.default(true),
  freezeNull: booleanParam.default(true),
  noTransferFee: booleanParam.default(true),
  tvlMinUsd: numberParam(20_000, { min: 0 }),
  vMinUsd: numberParam(75, { min: 0 }),
  ageTokenDaysMin: numberParam(2, { min: 0 }),
  decimalsMin: numberParam(0, { min: 0 }),
  decimalsMax: numberParam(9, { min: 0 }),
  poolFeeBpsMax: numberParam(80, { min: 0 }),
  impactUsd: numberParam(100, { min: 0 }),
  impactPctMax: numberParam(0.8, { min: 0 }),
  limit: numberParam(200, { min: 1, max: 500 }),
});

export const DEFAULT_FILTERS: FilterParams = schema.parse({});

type QueryLike = URLSearchParams | Record<string, string | string[] | undefined> | ReadonlyMap<string, string>;

function isIterableSearchParams(value: unknown): value is URLSearchParams | ReadonlyMap<string, string> {
  return Boolean(value) && typeof (value as { entries?: unknown }).entries === 'function';
}

export function parseQueryToFilter(query: QueryLike): FilterParams {
  const entries: Record<string, unknown> = {};

  if (isIterableSearchParams(query)) {
    for (const [key, value] of query.entries()) {
      entries[key] = value;
    }
  } else {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        entries[key] = value[0];
      } else if (value !== undefined) {
        entries[key] = value;
      }
    }
  }

  const parsed = schema.safeParse(entries);
  if (!parsed.success) {
    return DEFAULT_FILTERS;
  }

  return parsed.data;
}
