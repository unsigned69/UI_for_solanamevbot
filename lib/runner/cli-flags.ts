import type { RunPayload } from '../types/run';

export const ALT_FLAG_MAP: Record<keyof NonNullable<RunPayload['altOps']>, string> = {
  create: '--create-lookup-table',
  extend: '--extend-lookup-table',
  deactivate: '--deactivate-lookup-table',
  close: '--close-lookup-table',
};

export function buildAltFlags(altOps: RunPayload['altOps'] = {}): string[] {
  return (Object.keys(altOps) as Array<keyof RunPayload['altOps']>)
    .filter((key) => altOps[key])
    .map((key) => ALT_FLAG_MAP[key]);
}

export function buildCommandPreview(payload: RunPayload, baseCommand: string): string {
  const args: string[] = [baseCommand, '--config', '***'];
  if (payload.dryRun) {
    args.push('--dry-run');
  }
  args.push(...buildAltFlags(payload.altOps));
  if (payload.altAddress) {
    args.push('--alt-address', payload.altAddress);
  }
  if (payload.accountsSource === 'manual' && payload.accountsManual?.length) {
    args.push('--accounts', payload.accountsManual.join(','));
  }
  if (payload.extraFlags) {
    args.push(payload.extraFlags);
  }
  return args.join(' ');
}
