/**
 * Parses a metratura string and returns the equivalent square meters.
 * Handles two formats:
 *   - "X mq"      → returns X as a number
 *   - "X vani"    → converts to mq using factor 1 vano = 20 mq
 * Returns null if the string cannot be parsed.
 */
export function parseMq(metratura: string): number | null {
  const lower = metratura.trim().toLowerCase();

  if (lower.includes("mq")) {
    const match = lower.match(/^([\d.]+)\s*mq/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    return isNaN(value) ? null : value;
  }

  if (lower.includes("vani")) {
    const match = lower.match(/^([\d.]+)\s*vani/);
    if (!match) return null;
    const vani = parseFloat(match[1]);
    return isNaN(vani) ? null : Math.round(vani * 20);
  }

  return null;
}

/**
 * Returns true if the metratura string was expressed in vani,
 * meaning the mq value is an estimate (not a real measurement).
 */
export function isStimato(metratura: string): boolean {
  return metratura.trim().toLowerCase().includes("vani");
}

/**
 * Calculates the price per square meter, rounded to the nearest integer.
 */
export function calcolaEuroMq(prezzo: number, mq: number): number {
  return Math.round(prezzo / mq);
}
