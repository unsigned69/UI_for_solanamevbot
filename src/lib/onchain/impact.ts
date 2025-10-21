import type { DlmmBinLevel } from '../types';

interface CpmmImpactArgs {
  baseReserve: number;
  quoteReserve: number;
  tradeUsd: number;
  priceUsd: number;
  feeBps?: number | null;
}

interface DlmmImpactArgs {
  bins: DlmmBinLevel[];
  tradeUsd: number;
}

export function estimateImpactPctCpmm({
  baseReserve,
  quoteReserve,
  tradeUsd,
  priceUsd,
  feeBps,
}: CpmmImpactArgs): number {
  if (!isFinite(baseReserve) || !isFinite(quoteReserve) || !isFinite(tradeUsd) || !isFinite(priceUsd)) {
    return Number.POSITIVE_INFINITY;
  }

  if (baseReserve <= 0 || quoteReserve <= 0 || tradeUsd <= 0 || priceUsd <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const feeRate = Math.max(0, (feeBps ?? 0) / 10_000);
  const effectiveQuoteIn = tradeUsd * (1 - feeRate);
  const k = baseReserve * quoteReserve;
  const newQuote = quoteReserve + effectiveQuoteIn;
  const newBase = k / newQuote;
  const baseOut = baseReserve - newBase;

  if (baseOut <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const effectivePrice = tradeUsd / baseOut;
  const impact = ((effectivePrice - priceUsd) / priceUsd) * 100;
  return impact < 0 ? 0 : impact;
}

export function estimateImpactPctDlmm({ bins, tradeUsd }: DlmmImpactArgs): number {
  if (!Array.isArray(bins) || bins.length === 0 || !isFinite(tradeUsd) || tradeUsd <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const sorted = [...bins].sort((a, b) => a.priceUsd - b.priceUsd);
  const bestPrice = sorted[0]?.priceUsd;
  if (!bestPrice || bestPrice <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  let remainingUsd = tradeUsd;
  let acquiredBase = 0;
  let spentUsd = 0;

  for (const bin of sorted) {
    if (!isFinite(bin.priceUsd) || !isFinite(bin.baseLiquidity) || bin.priceUsd <= 0 || bin.baseLiquidity <= 0) {
      continue;
    }

    const availableUsd = bin.baseLiquidity * bin.priceUsd;
    if (availableUsd >= remainingUsd) {
      const baseFromBin = remainingUsd / bin.priceUsd;
      acquiredBase += baseFromBin;
      spentUsd += remainingUsd;
      remainingUsd = 0;
      break;
    }

    acquiredBase += bin.baseLiquidity;
    spentUsd += availableUsd;
    remainingUsd -= availableUsd;
  }

  if (remainingUsd > 0 || acquiredBase <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const effectivePrice = spentUsd / acquiredBase;
  const impact = ((effectivePrice - bestPrice) / bestPrice) * 100;
  return impact < 0 ? 0 : impact;
}
