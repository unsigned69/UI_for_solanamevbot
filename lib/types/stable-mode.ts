export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export const STABLE_MODE_VALUES = ['USDC', 'USD1', 'NONE'] as const;

export type StableMode = (typeof STABLE_MODE_VALUES)[number];
export type ActiveStableMode = Exclude<StableMode, 'NONE'>;

export const STABLE_MINT_BY_MODE: Record<ActiveStableMode, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qZzEwG7NDT8f9n9whscWUG5t9',
  USD1: 'yUSD1iVx5cgmRREB81pJW8byQTaY3HwsPzeMLCm26Ne',
};

export function isStableMode(value: unknown): value is StableMode {
  return typeof value === 'string' && STABLE_MODE_VALUES.includes(value as StableMode);
}

export function normaliseStableMode(value: unknown): StableMode {
  if (typeof value !== 'string') {
    return 'NONE';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 'NONE';
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'USDC' || upper === 'USD1') {
    return upper;
  }
  if (upper === 'NONE') {
    return 'NONE';
  }
  return 'NONE';
}

export function getStableMint(mode: StableMode): string | null {
  if (mode === 'NONE') {
    return null;
  }
  return STABLE_MINT_BY_MODE[mode];
}

export function isActiveStableMode(mode: StableMode): mode is ActiveStableMode {
  return mode !== 'NONE';
}
