export function calculateSpreadPercent(prices: number[]): number | null {
  const filtered = prices.filter((value) => Number.isFinite(value) && value > 0);
  if (filtered.length < 2) {
    return null;
  }

  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  if (min <= 0 || max <= 0) {
    return null;
  }

  const mid = (min + max) / 2;
  if (mid === 0) {
    return null;
  }

  return ((max - min) / mid) * 100;
}

export function calculateCrossDexSpread(bestA?: number | null, bestB?: number | null): number | null {
  if (!isFiniteNumber(bestA) || !isFiniteNumber(bestB) || !bestA || !bestB) {
    return null;
  }

  const mid = (bestA + bestB) / 2;
  if (mid === 0) {
    return null;
  }

  const diff = Math.abs(bestA - bestB);
  return (diff / mid) * 100;
}

export function sumNumbers(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((acc, value) => acc + value, 0);
}

export function maxNumber(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }

  return Math.max(...filtered);
}

export function minNumber(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }

  return Math.min(...filtered);
}

export function average(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((acc, value) => acc + value, 0) / filtered.length;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
