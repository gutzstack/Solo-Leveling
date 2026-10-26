import { RANKS, type Direction, type Rank } from "./types";

/**
 * Percentile → Hunter Rank.
 *   E  : [0, 20)    D : [20, 40)   C : [40, 60)   B : [60, 80)
 *   A  : [80, 95)   S : [95, 99)   S+: [99, 100]
 * Lower bounds are inclusive, so exactly 20.0 is D and exactly 99.0 is S+.
 */
export const RANK_LOWER_BOUNDS: Record<Rank, number> = {
  E: 0,
  D: 20,
  C: 40,
  B: 60,
  A: 80,
  S: 95,
  "S+": 99,
};

export function rankFromPercentile(percentile: number): Rank {
  if (!Number.isFinite(percentile)) throw new Error("percentile must be a finite number");
  const p = Math.min(100, Math.max(0, percentile));
  if (p >= 99) return "S+";
  if (p >= 95) return "S";
  if (p >= 80) return "A";
  if (p >= 60) return "B";
  if (p >= 40) return "C";
  if (p >= 20) return "D";
  return "E";
}

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function compareRanks(a: Rank, b: Rank): number {
  return rankIndex(a) - rankIndex(b);
}

/** Score edges matching the rank bands; used by game-defined (PERSONAL) standards. */
const BAND_EDGES = [0, 20, 40, 60, 80, 95, 99, 100];

/**
 * Game-defined standard → 0..100 score on the same scale as the percentile bands.
 * `thresholds` are the values needed to reach D, C, B, A, S, S+ (6 numbers), ascending for
 * higher-is-better and descending for lower-is-better metrics.
 *
 * The result is NOT a population percentile. It positions a value between game thresholds so it can
 * share the rank bands.
 */
export function standardScore(value: number, thresholds: readonly number[], direction: Direction): number {
  if (thresholds.length !== 6) throw new Error("standards need exactly 6 thresholds (D..S+)");
  if (direction !== "higher" && direction !== "lower") {
    throw new Error("standards only apply to higher/lower metrics");
  }
  // Work in a space where larger is always better.
  const sign = direction === "lower" ? -1 : 1;
  const v = sign * value;
  const t = thresholds.map((x) => sign * x);
  for (let i = 1; i < t.length; i++) {
    if (!(t[i] > t[i - 1])) throw new Error("thresholds must be strictly monotonic in the better direction");
  }
  // Extrapolated floor (score 0) and ceiling (score 100).
  const floor = t[0] - (t[1] - t[0]);
  const ceiling = t[5] + (t[5] - t[4]);
  const knots = [floor, ...t, ceiling];
  if (v <= knots[0]) return 0;
  if (v >= knots[knots.length - 1]) return 100;
  for (let i = 0; i < knots.length - 1; i++) {
    if (v >= knots[i] && v < knots[i + 1]) {
      const frac = (v - knots[i]) / (knots[i + 1] - knots[i]);
      return BAND_EDGES[i] + frac * (BAND_EDGES[i + 1] - BAND_EDGES[i]);
    }
  }
  return 100;
}

/** Score for metrics with an evidence-based optimal range (e.g. 7–9 h sleep). */
export function optimalRangeScore(value: number, min: number, max: number, penaltyPerUnit: number): number {
  if (value >= min && value <= max) return 100;
  const dist = value < min ? min - value : value - max;
  return Math.max(0, 100 - dist * penaltyPerUnit);
}

/** Next rank's percentile threshold, or null at S+. */
export function nextRankThreshold(rank: Rank): { rank: Rank; percentile: number } | null {
  const i = rankIndex(rank);
  if (i >= RANKS.length - 1) return null;
  const next = RANKS[i + 1];
  return { rank: next, percentile: RANK_LOWER_BOUNDS[next] };
}
