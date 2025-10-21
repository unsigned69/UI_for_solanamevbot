import type { UnifiedPool } from '../types';

export function groupPoolsByMint(pools: UnifiedPool[]): Map<string, UnifiedPool[]> {
  return pools.reduce<Map<string, UnifiedPool[]>>((acc, pool) => {
    const list = acc.get(pool.baseMint);
    if (list) {
      list.push(pool);
    } else {
      acc.set(pool.baseMint, [pool]);
    }
    return acc;
  }, new Map());
}
