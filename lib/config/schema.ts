import { z } from 'zod';

export const managedMintConfigSchema = z.object({
  mint: z.string().min(32, 'Mint адрес обязателен'),
  raydiumPools: z.array(z.string()).optional(),
  meteoraDlmmPools: z.array(z.string()).optional(),
  pumpfunPools: z.array(z.string()).optional(),
  processDelayMs: z.number().int().nonnegative().optional(),
  minProcessDelayMs: z.number().int().nonnegative().optional(),
  maxProcessDelayMs: z.number().int().nonnegative().optional(),
});

export const managedConfigSchema = z.object({
  routing: z.object({
    mint_config_list: z.array(managedMintConfigSchema),
  }),
});

