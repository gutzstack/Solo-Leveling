import { rankFromPercentile } from "../domain/ranks";
import type { Direction, Rank, Sex } from "../domain/types";
import type { BenchmarkDistribution } from "./registry-schema";
import { ecdfShares, wilsonInterval } from "./weighted";

export const UNAVAILABLE_MESSAGE = "Population percentile unavailable — tracking personal progression.";

export interface PercentileResult {
  distributionId: string;
  /** Point estimate, 0..100, or null when only a range is defensible (binned data). */
  percentile: number | null;
  /** Uncertainty band (CI for microdata; interval for binned data; null if not quantifiable). */
  low: number | null;
  high: number | null;
  /** Set when the value falls outside a published quantile table. */
  bound: "below" | "above" | null;
  evidence: "verified" | "estimated";
  /** neutral/optimal metrics get a descriptive position, never a rank */
  descriptive: boolean;
  rank: Rank | null;
  method: string;
}

/**
 * Percentile = share of the comparison population whose performance the value matches or exceeds.
 *  - higher-is-better: P(X ≤ v)
 *  - lower-is-better (times, resting HR): P(X ≥ v)
 *  - neutral/optimal (descriptive): mid-rank position P(X < v) + ½·P(X = v)
 * Ties count as "matched" for performance metrics, the same convention as the source ECDF.
 */
export function computePercentile(dist: BenchmarkDistribution, value: number, direction: Direction): PercentileResult {
  if (!Number.isFinite(value)) throw new Error("value must be finite");
  const descriptive = direction === "neutral" || direction === "optimal";

  if (dist.kind === "weighted_ecdf") {
    const { below, equal, above } = ecdfShares(dist.data, value);
    const p = descriptive ? below + equal / 2 : direction === "higher" ? below + equal : above + equal;
    const [lo, hi] = wilsonInterval(p, dist.nEffective);
    const percentile = clamp(p * 100);
    return {
      distributionId: dist.id,
      percentile,
      low: clamp(lo * 100),
      high: clamp(hi * 100),
      bound: null,
      evidence: "verified",
      descriptive,
      rank: descriptive ? null : rankFromPercentile(percentile),
      method: descriptive
        ? "Survey-weighted empirical CDF (mid-rank position). 95% Wilson interval using Kish effective n; ignores clustering, so the true interval is somewhat wider."
        : `Survey-weighted empirical CDF: weight share of the population with ${direction === "higher" ? "a value ≤ yours" : "a value ≥ yours (lower is better)"}. 95% Wilson interval using Kish effective n; ignores clustering, so the true interval is somewhat wider.`,
    };
  }

  if (dist.kind === "quantiles") {
    const pts = dist.data.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    let cdf: number; // P(X ≤ v) in percent
    let bound: "below" | "above" | null = null;
    if (value < first.value) {
      cdf = first.p;
      bound = "below";
    } else if (value > last.value) {
      cdf = last.p;
      bound = "above";
    } else {
      cdf = last.p;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (value >= a.value && value <= b.value) {
          cdf = b.value === a.value ? (a.p + b.p) / 2 : a.p + ((value - a.value) / (b.value - a.value)) * (b.p - a.p);
          break;
        }
      }
    }
    const raw = descriptive || direction === "higher" ? cdf : 100 - cdf;
    // Translate the bound into the "better than" direction for the UI.
    let uiBound = bound;
    if (bound && !descriptive && direction === "lower") uiBound = bound === "below" ? "above" : "below";
    const percentile = clamp(raw);
    return {
      distributionId: dist.id,
      percentile,
      low: null,
      high: null,
      bound: uiBound,
      evidence: "estimated",
      descriptive,
      rank: descriptive ? null : rankFromPercentile(percentile),
      method:
        "Linear interpolation between published percentiles (assumes the distribution is smooth between them)." +
        (bound ? " Your value lies outside the published range, so only a bound is reported." : ""),
    };
  }

  // binned
  let cumBefore = 0;
  let found: { lo: number; hi: number } | null = null;
  for (const b of dist.data.bins) {
    const loOk = b.lo === null || value >= b.lo;
    const hiOk = b.hi === null || value < b.hi;
    if (loOk && hiOk) {
      found = { lo: cumBefore, hi: cumBefore + b.share };
      break;
    }
    cumBefore += b.share;
  }
  if (!found) found = { lo: cumBefore, hi: 1 };
  const range = descriptive || direction === "higher" ? found : { lo: 1 - found.hi, hi: 1 - found.lo };
  const low = clamp(range.lo * 100);
  const high = clamp(range.hi * 100);
  return {
    distributionId: dist.id,
    percentile: null,
    low,
    high,
    bound: null,
    evidence: "estimated",
    descriptive,
    // Conservative: rank from the lower end of the interval.
    rank: descriptive ? null : rankFromPercentile(low),
    method: "Published category shares. The percentile lies somewhere in this interval and no point estimate is claimed. The rank uses the conservative lower end.",
  };
}

function clamp(p: number): number {
  return Math.min(100, Math.max(0, Math.round(p * 10) / 10));
}

export interface ComparisonPerson {
  age: number | null;
  sex: Sex | null;
}

/**
 * Distributions that apply to this person, best match first: sex-matched before "all", then
 * narrower age bands. Returns [] when the age is unknown or outside every band; that's the
 * "unavailable" case.
 */
export function applicableDistributions(
  all: readonly BenchmarkDistribution[],
  metricId: string,
  person: ComparisonPerson,
  preference: "sex_matched" | "all" = "sex_matched",
): BenchmarkDistribution[] {
  if (person.age === null) return [];
  const age = person.age;
  const matches = all.filter(
    (d) => d.metricId === metricId && age >= d.ageMin && age <= d.ageMax && (d.sex === "all" || (person.sex !== null && d.sex === person.sex)),
  );
  const sexScore = (d: BenchmarkDistribution) => {
    if (preference === "all") return d.sex === "all" ? 0 : 1;
    return d.sex === "all" ? 1 : 0;
  };
  return matches.sort((a, b) => sexScore(a) - sexScore(b) || a.ageMax - a.ageMin - (b.ageMax - b.ageMin));
}
