import { diffLines } from 'diff';
import { stringify } from '@iarna/toml';
import type { ManagedConfig } from '../types/config';

export function diffManagedConfigs(current: ManagedConfig, next: ManagedConfig): string {
  const currentToml = stringify(current);
  const nextToml = stringify(next);
  const patches = diffLines(currentToml, nextToml);
  if (!patches.length) {
    return 'No changes';
  }
  return patches
    .map((part) => {
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      return part.value
        .split('\n')
        .filter(Boolean)
        .map((line) => `${prefix}${line}`)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');
}
