import { z } from "zod";

/**
 * Benchmark registry schema. Every distribution must point at a documented source. The schema
 * rejects distributions that can't support a defensible percentile, e.g. a lone median.
 */

export const BenchmarkSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(3),
  publisher: z.string().min(2),
  url: z.string().url(),
  publicationYear: z.number().int().min(1950).max(2100),
  population: z.string().min(10),
  sampleSize: z.number().int().positive().nullable(),
  statisticalMethod: z.string().min(10),
  quality: z.enum(["high", "moderate", "low"]),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limitations: z.array(z.string().min(5)).min(1),
  license: z.string().min(3),
  retrieval: z.object({
    files: z.array(z.object({ name: z.string(), officialUrl: z.string().url(), sha256: z.string().regex(/^[0-9a-f]{64}$/), records: z.number().int().positive() })).default([]),
    notes: z.string().default(""),
  }),
});
export type BenchmarkSource = z.infer<typeof BenchmarkSourceSchema>;

const EcdfData = z
  .object({
    values: z.array(z.number()).min(3),
    shares: z.array(z.number().min(0).max(1)),
    weightedMean: z.number(),
    quantiles: z.record(z.string(), z.number()),
  })
  .refine((d) => d.values.length === d.shares.length, "values/shares length mismatch")
  .refine((d) => d.values.every((v, i) => i === 0 || v > d.values[i - 1]), "values must be strictly ascending")
  .refine((d) => Math.abs(d.shares.reduce((a, b) => a + b, 0) - 1) < 1e-6, "shares must sum to 1");

const QuantileData = z
  .object({
    /** published percentiles: p in (0,100), value at that percentile */
    points: z.array(z.object({ p: z.number().gt(0).lt(100), value: z.number() })).min(5, "at least 5 published quantiles are required; a median alone cannot support a percentile"),
    citation: z.string().min(10),
  })
  .refine((d) => d.points.every((pt, i) => i === 0 || (pt.p > d.points[i - 1].p && pt.value >= d.points[i - 1].value)), "points must be ascending in p and non-decreasing in value")
  .refine((d) => d.points[0].p <= 10 && d.points[d.points.length - 1].p >= 90, "published quantiles must span at least the 10th–90th percentile");

const BinnedData = z
  .object({
    bins: z.array(z.object({ lo: z.number().nullable(), hi: z.number().nullable(), share: z.number().min(0).max(1) })).min(3),
    citation: z.string().min(10),
  })
  .refine((d) => Math.abs(d.bins.reduce((a, b) => a + b.share, 0) - 1) < 0.01, "bin shares must sum to 1")
  .refine((d) => d.bins.every((b, i) => i === 0 || b.lo === d.bins[i - 1].hi), "bins must be contiguous");

export const BenchmarkDistributionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("weighted_ecdf"),
    id: z.string().regex(/^[a-z0-9_]+$/),
    sourceId: z.string(),
    metricId: z.string(),
    ageMin: z.number().int(),
    ageMax: z.number().int(),
    sex: z.enum(["male", "female", "all"]),
    units: z.string(),
    evidence: z.literal("verified"),
    nUnweighted: z.number().int().positive(),
    nEffective: z.number().positive(),
    population: z.string(),
    variable: z.string(),
    notes: z.string(),
    data: EcdfData,
  }),
  z.object({
    kind: z.literal("quantiles"),
    id: z.string().regex(/^[a-z0-9_]+$/),
    sourceId: z.string(),
    metricId: z.string(),
    ageMin: z.number().int(),
    ageMax: z.number().int(),
    sex: z.enum(["male", "female", "all"]),
    units: z.string(),
    evidence: z.literal("estimated"),
    nUnweighted: z.number().int().positive().nullable(),
    nEffective: z.number().positive().nullable(),
    population: z.string(),
    variable: z.string(),
    notes: z.string(),
    data: QuantileData,
  }),
  z.object({
    kind: z.literal("binned"),
    id: z.string().regex(/^[a-z0-9_]+$/),
    sourceId: z.string(),
    metricId: z.string(),
    ageMin: z.number().int(),
    ageMax: z.number().int(),
    sex: z.enum(["male", "female", "all"]),
    units: z.string(),
    evidence: z.literal("estimated"),
    nUnweighted: z.number().int().positive().nullable(),
    nEffective: z.number().positive().nullable(),
    population: z.string(),
    variable: z.string(),
    notes: z.string(),
    data: BinnedData,
  }),
]);
export type BenchmarkDistribution = z.infer<typeof BenchmarkDistributionSchema>;

export const BenchmarkBundleSchema = z.object({
  generatedAt: z.string(),
  generator: z.string(),
  sources: z.array(BenchmarkSourceSchema),
  distributions: z.array(BenchmarkDistributionSchema),
});
export type BenchmarkBundle = z.infer<typeof BenchmarkBundleSchema>;
