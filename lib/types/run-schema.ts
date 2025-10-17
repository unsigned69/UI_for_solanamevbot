import { z } from 'zod';

export const runPayloadSchema = z.object({
  dryRun: z.boolean().default(false),
  altOps: z
    .object({
      create: z.boolean().optional(),
      extend: z.boolean().optional(),
      deactivate: z.boolean().optional(),
      close: z.boolean().optional(),
    })
    .partial()
    .default({}),
  altAddress: z.string().optional(),
  accountsSource: z.enum(['auto', 'manual']).optional(),
  accountsManual: z.array(z.string()).optional(),
  extraFlags: z.string().optional(),
});

export type RunPayloadInput = z.infer<typeof runPayloadSchema>;
