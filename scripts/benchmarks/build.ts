/**
 * Build survey-weighted benchmark distributions from NHANES microdata.
 *
 *   npm run benchmarks:fetch   # download official files from CDC into data/raw/nhanes/
 *   npm run benchmarks:build   # verify files, compute weighted ECDFs, write the registry bundle
 *
 * Output: src/data/benchmarks/nhanes.generated.json (validated against the registry schema).
 * An optional data/raw/nhanes/PROVENANCE.json ({"notes": "..."}) is copied into the bundle so the
 * retrieval path stays auditable.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { BenchmarkBundleSchema, type BenchmarkDistribution, type BenchmarkSource } from "../../src/lib/percentile/registry-schema";
import { compactEcdf, kishEffectiveN, weightedMean, weightedQuantile, type WeightedSample } from "../../src/lib/percentile/weighted";
import { AGE_BANDS, NHANES_FILES, NHANES_SPECS, SOURCE_META, officialUrls, type NhanesSpec } from "./nhanes-config";
import { parseXpt, type XptDataset } from "./xpt";

const RAW = path.resolve("data/raw/nhanes");
const OUT = path.resolve("src/data/benchmarks/nhanes.generated.json");
const TODAY = new Date().toISOString().slice(0, 10);

interface LoadedFile {
  ds: XptDataset;
  sha256: string;
}

function load(name: string): LoadedFile {
  const p = path.join(RAW, `${name}.XPT`);
  if (!existsSync(p)) throw new Error(`Missing ${p}. Run "npm run benchmarks:fetch" first.`);
  const buf = readFileSync(p);
  const ds = parseXpt(new Uint8Array(buf));
  const expected = NHANES_FILES.find((f) => f.name === name)?.expectedRecords;
  if (expected !== undefined && ds.rows.length !== expected) {
    throw new Error(`${name}: ${ds.rows.length} records, CDC documentation lists ${expected}. Refusing to build from a modified file.`);
  }
  return { ds, sha256: createHash("sha256").update(buf).digest("hex") };
}

const SEX_GROUPS = [
  { sex: "male" as const, code: 1 },
  { sex: "female" as const, code: 2 },
  { sex: "all" as const, code: null },
];

function buildSpec(spec: NhanesSpec, files: Map<string, LoadedFile>): BenchmarkDistribution[] {
  const demo = files.get(spec.demoFile)!.ds;
  const data = files.get(spec.dataFile)!.ds;
  const demoBySeqn = new Map(demo.rows.map((r) => [r.SEQN as number, r]));
  const out: BenchmarkDistribution[] = [];
  for (const [ageMin, ageMax] of AGE_BANDS) {
    for (const g of SEX_GROUPS) {
      const samples: WeightedSample[] = [];
      for (const r of data.rows) {
        const d = demoBySeqn.get(r.SEQN as number);
        if (!d) continue;
        const age = d.RIDAGEYR as number | null;
        if (age === null || age < ageMin || age > ageMax) continue;
        if (g.code !== null && d.RIAGENDR !== g.code) continue;
        if (spec.excludePregnant && d.RIDEXPRG === 1) continue;
        const v = r[spec.variable] as number | null;
        const w = d[spec.weightVar] as number | null;
        if (v === null || w === null || !(w > 0)) continue;
        if (v < spec.validRange[0] || v > spec.validRange[1]) continue;
        samples.push({ value: v, weight: w });
      }
      if (samples.length < 50) {
        console.warn(`  skip ${spec.metricId} ${g.sex} ${ageMin}-${ageMax}: only ${samples.length} observations`);
        continue;
      }
      const ecdf = compactEcdf(samples, spec.decimals);
      const nEff = kishEffectiveN(samples.map((s) => s.weight));
      const q = (p: number) => weightedQuantile(ecdf, p);
      const sexLabel = g.sex === "all" ? "all sexes" : g.sex === "male" ? "men" : "women";
      out.push({
        kind: "weighted_ecdf",
        id: `${spec.sourceId}_${spec.metricId}_${g.sex}_${ageMin}_${ageMax}`,
        sourceId: spec.sourceId,
        metricId: spec.metricId,
        ageMin,
        ageMax,
        sex: g.sex,
        units: spec.units,
        evidence: "verified",
        nUnweighted: samples.length,
        nEffective: Math.round(nEff * 10) / 10,
        population: `U.S. ${sexLabel} aged ${ageMin}–${ageMax}, NHANES ${spec.sourceId.slice(7).replace("_", "–")}`,
        variable: `${spec.dataFile}.${spec.variable}: ${spec.variableLabel}`,
        notes: spec.notes,
        data: {
          values: ecdf.values,
          shares: ecdf.shares,
          weightedMean: Math.round(weightedMean(ecdf) * 100) / 100,
          quantiles: { p5: q(0.05), p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95) },
        },
      });
    }
  }
  return out;
}

function main() {
  const provenancePath = path.join(RAW, "PROVENANCE.json");
  const provenance = existsSync(provenancePath) ? (JSON.parse(readFileSync(provenancePath, "utf8")) as { notes?: string }) : {};
  const files = new Map<string, LoadedFile>();
  for (const f of NHANES_FILES) {
    const loaded = load(f.name);
    files.set(f.name, loaded);
    console.log(`✓ ${f.name}: ${loaded.ds.rows.length} records (created ${loaded.ds.created}) sha256=${loaded.sha256.slice(0, 12)}…`);
  }
  const distributions = NHANES_SPECS.flatMap((s) => buildSpec(s, files));
  const sources: BenchmarkSource[] = Object.values(SOURCE_META).map((m) => ({
    id: m.id,
    name: m.name,
    publisher: "CDC / National Center for Health Statistics",
    url: m.url,
    publicationYear: m.publicationYear,
    population: m.population,
    sampleSize: null,
    statisticalMethod: m.statisticalMethod,
    quality: "high",
    lastVerified: TODAY,
    limitations: [
      "A single 2-year cycle: each age/sex group holds only a few hundred participants, so the extreme tails are imprecise.",
      "The intervals use the Kish effective sample size and ignore NHANES clustering and stratification, so true design-based intervals are wider.",
      `Data were collected in ${m.id.slice(7).replace("_", "–")} and population values may have shifted since.`,
      "Comparisons are with U.S. adults of your age band, not with athletes or students specifically.",
    ],
    license: "Public domain (U.S. federal government data). NCHS data-use restrictions apply: the data may not be used to identify any individual.",
    retrieval: {
      files: m.files.map((name) => {
        const f = NHANES_FILES.find((x) => x.name === name)!;
        const loaded = files.get(name)!;
        return { name, officialUrl: officialUrls(f)[0], sha256: loaded.sha256, records: loaded.ds.rows.length };
      }),
      notes: provenance.notes ?? "Downloaded from cdc.gov by scripts/benchmarks/fetch.ts.",
    },
  }));
  const bundle = BenchmarkBundleSchema.parse({
    generatedAt: new Date().toISOString(),
    generator: "scripts/benchmarks/build.ts",
    sources,
    distributions,
  });
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(bundle) + "\n");
  for (const d of distributions) {
    if (d.kind !== "weighted_ecdf") continue;
    console.log(`  ${d.id.padEnd(48)} n=${String(d.nUnweighted).padStart(4)} nEff=${String(d.nEffective).padStart(6)} median=${d.data.quantiles.p50}`);
  }
  console.log(`Wrote ${distributions.length} distributions to ${path.relative(process.cwd(), OUT)}`);
}

main();
