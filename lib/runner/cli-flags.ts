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

export function buildCommandPreview(baseCommand: string, args: string[]): string {
  return [baseCommand, ...args].join(' ');
}
