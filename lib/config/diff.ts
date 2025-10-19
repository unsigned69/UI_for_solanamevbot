import { diffLines, type DiffPart } from 'diff';
import { stringify } from '@iarna/toml';
import type { ManagedConfig } from '../types/config';

export function diffManagedConfigs(current: ManagedConfig, next: ManagedConfig): string {
  const currentToml = stringify(current as unknown as Record<string, any>);
  const nextToml = stringify(next as unknown as Record<string, any>);
  const patches = diffLines(currentToml, nextToml);
  if (!patches.length) {
    return 'No changes';
  }
  return patches
    .map((part: DiffPart) => {
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      return part.value
        .split('\n')
        .filter(Boolean)
        .map((line: string) => `${prefix}${line}`)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');
}
