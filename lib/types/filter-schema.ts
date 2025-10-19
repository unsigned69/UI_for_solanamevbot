import { z } from 'zod';

export const fetchFiltersSchema = z.object({
  dexes: z.array(z.enum(['pumpfun', 'raydium', 'meteora'])).default([]),
  minTVL: z.number().nonnegative().optional(),
  minVol5m: z.number().nonnegative().optional(),
  minVol1h: z.number().nonnegative().optional(),
  minVol24h: z.number().nonnegative().optional(),
  minPoolAgeMinutes: z.number().nonnegative().optional(),
  maxSlippagePct: z.number().nonnegative().optional(),
  budget: z.number().nonnegative().optional(),
  poolTypes: z.array(z.enum(['CPMM', 'CLMM', 'DLMM'])).default([]),
  blacklistMints: z.array(z.string()).optional(),
  newerThanMinutesExclude: z.number().nonnegative().optional(),
  excludeFrozen: z.boolean().optional(),
  maxAltCost: z.number().nonnegative().optional(),
  page: z.number().int().nonnegative().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

export type FetchFilters = z.infer<typeof fetchFiltersSchema>;
