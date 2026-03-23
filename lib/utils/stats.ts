/** Calculates the p-th percentile of a pre-sorted array (linear interpolation). */
export function calcPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Formats a number using Italian locale (e.g. 1.234). */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString("it-IT");
}

/** Formats a number as a euro amount (e.g. € 1.234). */
export function fmtEur(n: number): string {
  return `€\u202f${fmt(n)}`;
}
