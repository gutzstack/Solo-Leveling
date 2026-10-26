/**
 * Survey-weighted empirical distribution utilities. Shared by the benchmark build pipeline
 * (scripts/benchmarks) and the runtime percentile engine so both use identical definitions.
 */

export interface WeightedSample {
  value: number;
  weight: number;
}

export interface CompactEcdf {
  /** distinct observed values, ascending */
  values: number[];
  /** normalized weight share of each distinct value (sums to 1) */
  shares: number[];
}

/** Collapse a weighted sample into distinct values with normalized weight shares. */
export function compactEcdf(samples: readonly WeightedSample[], decimals: number): CompactEcdf {
  const valid = samples.filter((s) => Number.isFinite(s.value) && Number.isFinite(s.weight) && s.weight > 0);
  if (!valid.length) throw new Error("no valid weighted observations");
  const total = valid.reduce((a, s) => a + s.weight, 0);
  const f = 10 ** decimals;
  const map = new Map<number, number>();
  for (const s of valid) {
    const v = Math.round(s.value * f) / f;
    map.set(v, (map.get(v) ?? 0) + s.weight);
  }
  const values = [...map.keys()].sort((a, b) => a - b);
  // Shares are rounded to 1e-6 for storage; renormalize so they still sum to exactly 1.
  const raw = values.map((v) => (map.get(v) ?? 0) / total);
  const rounded = raw.map((s) => Math.round(s * 1e6) / 1e6);
  const sum = rounded.reduce((a, b) => a + b, 0);
  const shares = rounded.map((s) => s / sum);
  return { values, shares };
}

/** Kish effective sample size: (Σw)² / Σw². Accounts for unequal weighting, not clustering. */
export function kishEffectiveN(weights: readonly number[]): number {
  const s = weights.reduce((a, w) => a + w, 0);
  const s2 = weights.reduce((a, w) => a + w * w, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
}

/** Weight share of observations ≤ v, < v, == v, ≥ v. */
export function ecdfShares(ecdf: CompactEcdf, v: number): { below: number; equal: number; above: number } {
  let below = 0;
  let equal = 0;
  for (let i = 0; i < ecdf.values.length; i++) {
    const x = ecdf.values[i];
    if (x < v) below += ecdf.shares[i];
    else if (x === v) equal += ecdf.shares[i];
  }
  const above = Math.max(0, 1 - below - equal);
  return { below, equal, above };
}

/** Weighted quantile (inverse ECDF, lower interpolation at step points). */
export function weightedQuantile(ecdf: CompactEcdf, p: number): number {
  if (p <= 0) return ecdf.values[0];
  if (p >= 1) return ecdf.values[ecdf.values.length - 1];
  let cum = 0;
  for (let i = 0; i < ecdf.values.length; i++) {
    cum += ecdf.shares[i];
    if (cum >= p - 1e-12) return ecdf.values[i];
  }
  return ecdf.values[ecdf.values.length - 1];
}

export function weightedMean(ecdf: CompactEcdf): number {
  return ecdf.values.reduce((a, v, i) => a + v * ecdf.shares[i], 0);
}

/** Wilson score interval for a proportion with effective sample size n. Returns [lo, hi] in 0..1. */
export function wilsonInterval(p: number, n: number, z = 1.959964): [number, number] {
  if (!(n > 0)) return [0, 1];
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
