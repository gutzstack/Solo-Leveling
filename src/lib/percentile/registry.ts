import nhanes from "@/data/benchmarks/nhanes.generated.json";
import published from "@/data/benchmarks/published-quantiles.json";
import { BenchmarkBundleSchema, type BenchmarkDistribution, type BenchmarkSource } from "./registry-schema";

/**
 * The benchmark registry: every population distribution the app can compare against.
 *  - nhanes.generated.json   computed from NHANES microdata by scripts/benchmarks/build.ts
 *  - published-quantiles.json hand-curated published percentile tables (each with a citation)
 * Both are schema-validated at load time; an invalid bundle stops the server rather than
 * producing a silently wrong percentile.
 */
function load() {
  const bundles = [nhanes, published].map((b) => BenchmarkBundleSchema.parse(b));
  const sources = bundles.flatMap((b) => b.sources);
  const distributions = bundles.flatMap((b) => b.distributions);
  const sourceIds = new Set(sources.map((s) => s.id));
  for (const d of distributions) {
    if (!sourceIds.has(d.sourceId)) throw new Error(`benchmark ${d.id} references unknown source ${d.sourceId}`);
  }
  const ids = new Set<string>();
  for (const d of distributions) {
    if (ids.has(d.id)) throw new Error(`duplicate benchmark id ${d.id}`);
    ids.add(d.id);
  }
  return { sources, distributions };
}

const registry = load();

export const BENCHMARK_SOURCES: BenchmarkSource[] = registry.sources;
export const BENCHMARK_DISTRIBUTIONS: BenchmarkDistribution[] = registry.distributions;
export const SOURCE_BY_ID: Record<string, BenchmarkSource> = Object.fromEntries(registry.sources.map((s) => [s.id, s]));
export const DISTRIBUTION_BY_ID: Record<string, BenchmarkDistribution> = Object.fromEntries(registry.distributions.map((d) => [d.id, d]));
export const BENCHMARKED_METRICS = new Set(registry.distributions.map((d) => d.metricId));
