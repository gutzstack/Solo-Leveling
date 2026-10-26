import { describe, expect, it } from "vitest";
import { applicableDistributions, computePercentile, UNAVAILABLE_MESSAGE } from "@/lib/percentile/engine";
import { BENCHMARK_DISTRIBUTIONS, BENCHMARKED_METRICS } from "@/lib/percentile/registry";
import { BenchmarkDistributionSchema, type BenchmarkDistribution } from "@/lib/percentile/registry-schema";
import { compactEcdf, kishEffectiveN, weightedQuantile, wilsonInterval } from "@/lib/percentile/weighted";

/** Toy survey sample: values 1..10, weight 1 each, except value 10 which has weight 10. */
function toyEcdf(): Extract<BenchmarkDistribution, { kind: "weighted_ecdf" }> {
  const samples = [...Array.from({ length: 9 }, (_, i) => ({ value: i + 1, weight: 1 })), { value: 10, weight: 10 }];
  const e = compactEcdf(samples, 0);
  return {
    kind: "weighted_ecdf",
    id: "toy",
    sourceId: "toy",
    metricId: "toy",
    ageMin: 20,
    ageMax: 24,
    sex: "all",
    units: "u",
    evidence: "verified",
    nUnweighted: 10,
    nEffective: kishEffectiveN(samples.map((s) => s.weight)),
    population: "toy",
    variable: "toy",
    notes: "",
    data: { ...e, weightedMean: 0, quantiles: {} },
  };
}

describe("weighted empirical percentiles", () => {
  it("uses survey weights, not raw counts", () => {
    const d = toyEcdf();
    // total weight 19: P(X ≤ 9) = 9/19
    expect(computePercentile(d, 9, "higher").percentile).toBeCloseTo((9 / 19) * 100, 1);
    expect(weightedQuantile(d.data, 0.5)).toBe(10);
  });

  it("higher-is-better: share matched or exceeded = P(X ≤ v), ties count as matched", () => {
    const d = toyEcdf();
    expect(computePercentile(d, 0.5, "higher").percentile).toBe(0);
    expect(computePercentile(d, 1, "higher").percentile).toBeCloseTo((1 / 19) * 100, 1);
    expect(computePercentile(d, 10, "higher").percentile).toBe(100);
    expect(computePercentile(d, 50, "higher").percentile).toBe(100);
  });

  it("lower-is-better: share matched or exceeded = P(X ≥ v)", () => {
    const d = toyEcdf();
    expect(computePercentile(d, 1, "lower").percentile).toBe(100);
    expect(computePercentile(d, 10, "lower").percentile).toBeCloseTo((10 / 19) * 100, 1);
    expect(computePercentile(d, 11, "lower").percentile).toBe(0);
    // A faster time (smaller) never ranks below a slower one
    expect(computePercentile(d, 3, "lower").percentile!).toBeGreaterThan(computePercentile(d, 7, "lower").percentile!);
  });

  it("descriptive (neutral/optimal) metrics use mid-rank position and never get a rank", () => {
    const d = toyEcdf();
    const r = computePercentile(d, 5, "neutral");
    expect(r.descriptive).toBe(true);
    expect(r.rank).toBeNull();
    expect(r.percentile).toBeCloseTo(((4 + 0.5) / 19) * 100, 1);
  });

  it("reports a Wilson interval that contains the estimate", () => {
    const r = computePercentile(toyEcdf(), 5, "higher");
    expect(r.low!).toBeLessThanOrEqual(r.percentile!);
    expect(r.high!).toBeGreaterThanOrEqual(r.percentile!);
    const [lo, hi] = wilsonInterval(0, 50);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0);
  });
});

describe("published-quantile and binned distributions", () => {
  const quant = BenchmarkDistributionSchema.parse({
    kind: "quantiles",
    id: "q",
    sourceId: "s",
    metricId: "m",
    ageMin: 20,
    ageMax: 29,
    sex: "all",
    units: "s",
    evidence: "estimated",
    nUnweighted: null,
    nEffective: null,
    population: "p",
    variable: "v",
    notes: "",
    data: { citation: "Example table 1, test fixture only", points: [{ p: 10, value: 100 }, { p: 25, value: 120 }, { p: 50, value: 150 }, { p: 75, value: 180 }, { p: 90, value: 200 }] },
  });

  it("interpolates between published percentiles and labels the result ESTIMATED", () => {
    const r = computePercentile(quant, 135, "higher");
    expect(r.evidence).toBe("estimated");
    expect(r.percentile).toBeCloseTo(37.5, 1);
    expect(computePercentile(quant, 135, "lower").percentile).toBeCloseTo(62.5, 1);
  });

  it("reports only a bound outside the published range", () => {
    expect(computePercentile(quant, 50, "higher")).toMatchObject({ percentile: 10, bound: "below" });
    expect(computePercentile(quant, 500, "higher")).toMatchObject({ percentile: 90, bound: "above" });
    // For lower-is-better, a very small time is "above" the top bound
    expect(computePercentile(quant, 50, "lower")).toMatchObject({ percentile: 90, bound: "above" });
  });

  it("rejects a median-only table (no exact percentile from a median alone)", () => {
    const res = BenchmarkDistributionSchema.safeParse({ ...quant, data: { citation: "median only", points: [{ p: 50, value: 150 }] } });
    expect(res.success).toBe(false);
  });

  it("rejects tables that don't span the 10th–90th percentile", () => {
    const res = BenchmarkDistributionSchema.safeParse({ ...quant, data: { citation: "narrow table", points: [30, 40, 50, 60, 70].map((p) => ({ p, value: p })) } });
    expect(res.success).toBe(false);
  });

  it("binned shares give an interval, not a point, and rank conservatively", () => {
    const b = BenchmarkDistributionSchema.parse({
      kind: "binned",
      id: "b",
      sourceId: "s",
      metricId: "m",
      ageMin: 18,
      ageMax: 24,
      sex: "all",
      units: "gpa",
      evidence: "estimated",
      nUnweighted: null,
      nEffective: null,
      population: "p",
      variable: "v",
      notes: "",
      data: { citation: "Test fixture table (not real data)", bins: [{ lo: null, hi: 2, share: 0.1 }, { lo: 2, hi: 3, share: 0.3 }, { lo: 3, hi: 3.5, share: 0.3 }, { lo: 3.5, hi: null, share: 0.3 }] },
    });
    const r = computePercentile(b, 3.68, "higher");
    expect(r.percentile).toBeNull();
    expect(r.low).toBe(70);
    expect(r.high).toBe(100);
    expect(r.rank).toBe("B");
  });
});

describe("registry and missing benchmark data", () => {
  it("every bundled distribution validates and references NHANES microdata", () => {
    expect(BENCHMARK_DISTRIBUTIONS.length).toBeGreaterThan(0);
    for (const d of BENCHMARK_DISTRIBUTIONS) {
      expect(BenchmarkDistributionSchema.safeParse(d).success).toBe(true);
      expect(d.kind).toBe("weighted_ecdf");
      expect(d.nUnweighted).toBeGreaterThanOrEqual(50);
    }
  });

  it("returns no distribution for metrics without data or outside the age band", () => {
    expect(applicableDistributions(BENCHMARK_DISTRIBUTIONS, "run_5k", { age: 21, sex: "male" })).toEqual([]);
    expect(applicableDistributions(BENCHMARK_DISTRIBUTIONS, "resting_hr", { age: 40, sex: "male" })).toEqual([]);
    expect(applicableDistributions(BENCHMARK_DISTRIBUTIONS, "resting_hr", { age: null, sex: "male" })).toEqual([]);
    expect(BENCHMARKED_METRICS.has("bench_press_1rm")).toBe(false);
    expect(UNAVAILABLE_MESSAGE).toBe("Population percentile unavailable — tracking personal progression.");
  });

  it("prefers sex-matched groups, falls back to all adults when sex is unknown", () => {
    const m = applicableDistributions(BENCHMARK_DISTRIBUTIONS, "resting_hr", { age: 21, sex: "male" });
    expect(m[0].sex).toBe("male");
    expect(m.map((d) => d.sex)).toContain("all");
    const n = applicableDistributions(BENCHMARK_DISTRIBUTIONS, "resting_hr", { age: 21, sex: null });
    expect(n.every((d) => d.sex === "all")).toBe(true);
    const pref = applicableDistributions(BENCHMARK_DISTRIBUTIONS, "resting_hr", { age: 21, sex: "male" }, "all");
    expect(pref[0].sex).toBe("all");
  });

  it("NHANES sanity: a 72 bpm resting pulse is near the median for men 20–24", () => {
    const d = applicableDistributions(BENCHMARK_DISTRIBUTIONS, "resting_hr", { age: 22, sex: "male" })[0];
    const r = computePercentile(d, 72, "lower");
    expect(r.percentile!).toBeGreaterThan(40);
    expect(r.percentile!).toBeLessThan(65);
  });
});
