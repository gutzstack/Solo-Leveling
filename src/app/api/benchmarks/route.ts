import { NextResponse } from "next/server";
import { BENCHMARK_DISTRIBUTIONS, BENCHMARK_SOURCES } from "@/lib/percentile/registry";

/** Public summary of the benchmark registry (no user data). */
export async function GET() {
  return NextResponse.json({
    sources: BENCHMARK_SOURCES,
    distributions: BENCHMARK_DISTRIBUTIONS.map((d) => ({
      id: d.id,
      sourceId: d.sourceId,
      metricId: d.metricId,
      ageMin: d.ageMin,
      ageMax: d.ageMax,
      sex: d.sex,
      units: d.units,
      kind: d.kind,
      evidence: d.evidence,
      nUnweighted: d.nUnweighted,
      nEffective: d.nEffective,
      population: d.population,
      variable: d.variable,
      notes: d.notes,
      quantiles: d.kind === "weighted_ecdf" ? d.data.quantiles : null,
      weightedMean: d.kind === "weighted_ecdf" ? d.data.weightedMean : null,
    })),
  });
}
