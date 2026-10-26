import { ageOn, daysBetween, type ISODate } from "../domain/dates";
import { METRICS, type MetricDef } from "../domain/metrics";
import { optimalRangeScore, rankFromPercentile, standardScore } from "../domain/ranks";
import type { Evidence, Rank, UnitKind } from "../domain/types";
import { bestValue } from "../domain/xp";
import { applicableDistributions, computePercentile, UNAVAILABLE_MESSAGE, type PercentileResult } from "../percentile/engine";
import { BENCHMARK_DISTRIBUTIONS, SOURCE_BY_ID } from "../percentile/registry";
import { computeDerived } from "./derived";
import { sortEntries, type Stats } from "./stats";
import type { CustomMetricRow, GameData, MetricEntryRow } from "./rows";

export interface PercentileView extends PercentileResult {
  comparisonGroup: string;
  sourceName: string;
  sourceUrl: string;
  sourceYear: number;
  quality: "high" | "moderate" | "low";
  limitations: string[];
  nUnweighted: number | null;
  nEffective: number | null;
  variable: string;
  notes: string;
  median: number | null;
}

export interface MetricState {
  id: string;
  name: string;
  attribute: MetricDef["attribute"];
  unit: UnitKind;
  direction: MetricDef["direction"];
  description: string;
  input: "manual" | "derived";
  isCustom: boolean;
  current: { value: number; recordedOn: ISODate | null; entryId: string | null; context: string | null } | null;
  personalBest: { value: number; recordedOn: ISODate; context: string } | null;
  /** true when the only record is historical (old PB) and no current measurement exists */
  historicalOnly: boolean;
  history: { date: ISODate; value: number; context: string; id: string }[];
  derivedNote: string | null;
  percentiles: PercentileView[];
  primary: PercentileView | null;
  evidence: Evidence | null;
  rank: Rank | null;
  /** 0–100 score used for game aggregation (percentile, standard score, or goal attainment) */
  score: number | null;
  scoreBasis: "population" | "standard" | "goal" | null;
  rankExplanation: string;
  populationMessage: string | null;
  standardsNote: string | null;
  excludeFromScore: boolean;
}

export function customMetricDef(row: CustomMetricRow): MetricDef {
  return {
    id: row.id,
    name: row.name,
    attribute: row.attribute_code,
    unit: (row.unit_kind as UnitKind) ?? "count",
    direction: row.direction,
    description: row.description,
    input: "manual",
    currentWindowDays: 365,
    prMinDelta: row.direction === "neutral" ? undefined : 0,
  };
}

export function playerAge(data: GameData): number | null {
  if (data.profile.date_of_birth) return ageOn(data.profile.date_of_birth, data.today);
  return data.profile.age_years ?? null;
}

/** "Current" for performance metrics = best non-historical entry inside the window; otherwise the latest. */
export function currentEntry(def: MetricDef, entries: readonly MetricEntryRow[], today: ISODate): MetricEntryRow | null {
  const inWindow = entries.filter((e) => e.context !== "historical" && daysBetween(e.recorded_on, today) <= def.currentWindowDays && e.recorded_on <= today);
  if (!inWindow.length) return null;
  const useBest = def.prMinDelta !== undefined && (def.direction === "higher" || def.direction === "lower");
  if (useBest) {
    const best = bestValue(def, inWindow);
    // latest of the entries equal to the best value
    const matches = sortEntries(inWindow.filter((e) => e.value === best));
    return matches[matches.length - 1];
  }
  const sorted = sortEntries(inWindow);
  return sorted[sorted.length - 1];
}

export interface MetricExtras {
  academicSkills: number;
  financialArcProgress: number | null;
  mainObjectives30d: number;
}

export function computeMetricStates(data: GameData, stats: Stats, extras: MetricExtras): MetricState[] {
  const defs: MetricDef[] = [...METRICS, ...data.customMetrics.map(customMetricDef)];
  const byMetric = new Map<string, MetricEntryRow[]>();
  for (const e of data.entries) {
    const list = byMetric.get(e.metric_id) ?? [];
    list.push(e);
    byMetric.set(e.metric_id, list);
  }
  const manualCurrent = new Map<string, MetricEntryRow | null>();
  for (const def of defs) if (def.input === "manual") manualCurrent.set(def.id, currentEntry(def, byMetric.get(def.id) ?? [], data.today));

  // Derived metrics may depend on manual ones and on other derived ones (e.g. emergency fund).
  const derivedValues = new Map<string, { value: number | null; note: string }>();
  const lookup = (id: string) => {
    const m = manualCurrent.get(id);
    if (m) return { value: m.value, recorded_on: m.recorded_on };
    const d = derivedValues.get(id);
    return d && d.value !== null ? { value: d.value, recorded_on: data.today } : null;
  };
  for (const def of defs) if (def.input === "derived") derivedValues.set(def.id, computeDerived(def, data, stats, lookup, extras));

  const age = playerAge(data);
  const person = { age, sex: data.profile.sex };
  const bodyWeight = manualCurrent.get("body_weight")?.value ?? data.profile.weight_kg ?? null;

  return defs.map((def) => {
    const entries = sortEntries(byMetric.get(def.id) ?? []);
    let current: MetricState["current"] = null;
    let derivedNote: string | null = null;
    if (def.input === "manual") {
      const c = manualCurrent.get(def.id);
      if (c) current = { value: c.value, recordedOn: c.recorded_on, entryId: c.id, context: c.context };
    } else {
      const d = derivedValues.get(def.id)!;
      derivedNote = d.note;
      // A zero from a counter the player hasn't had time to fill is "no data", not an E rank:
      // zeros only count once the account is older than the metric's window (capped at 60 days).
      const ageDays = data.profile.onboarded_at ? daysBetween(data.profile.onboarded_at.slice(0, 10), data.today) : 0;
      const zeroTooEarly = d.value === 0 && ageDays < Math.min(def.currentWindowDays, 60);
      if (d.value !== null && Number.isFinite(d.value) && !zeroTooEarly) current = { value: d.value, recordedOn: data.today, entryId: null, context: "derived" };
      else if (zeroTooEarly) derivedNote = `${d.note} Nothing logged yet; ranked once you've had ${Math.min(def.currentWindowDays, 60)} days to build it.`;
    }
    const pbVal = bestValue(def, entries);
    const pbEntry = pbVal === null ? null : entries.filter((e) => e.value === pbVal)[0];
    const personalBest = pbEntry ? { value: pbEntry.value, recordedOn: pbEntry.recorded_on, context: pbEntry.context } : null;
    const historicalOnly = !current && entries.length > 0 && entries.every((e) => e.context === "historical");

    // Population percentiles
    const dists = applicableDistributions(BENCHMARK_DISTRIBUTIONS, def.id, person, data.settings.comparison_preference);
    const percentiles: PercentileView[] = current
      ? dists.map((d) => {
          const r = computePercentile(d, current!.value, def.direction);
          const src = SOURCE_BY_ID[d.sourceId];
          return {
            ...r,
            comparisonGroup: d.population,
            sourceName: src.name,
            sourceUrl: src.url,
            sourceYear: src.publicationYear,
            quality: src.quality,
            limitations: src.limitations,
            nUnweighted: d.nUnweighted,
            nEffective: d.nEffective,
            variable: d.variable,
            notes: d.notes,
            median: d.kind === "weighted_ecdf" ? (d.data.quantiles.p50 ?? null) : null,
          };
        })
      : [];
    const primary = percentiles[0] ?? null;

    let evidence: Evidence | null = null;
    let rank: Rank | null = null;
    let score: number | null = null;
    let scoreBasis: MetricState["scoreBasis"] = null;
    let rankExplanation = "";
    const hasPopulationRank = primary !== null && !primary.descriptive && primary.rank !== null;

    if (!current) {
      rankExplanation = historicalOnly ? "Only a historical best is recorded. Log a current test to rank this metric." : "No current measurement.";
    } else if (hasPopulationRank) {
      evidence = primary.evidence;
      rank = primary.rank;
      score = primary.percentile ?? primary.low;
      scoreBasis = "population";
      rankExplanation = `${primary.evidence === "verified" ? "Verified" : "Estimated"} population percentile vs. ${primary.comparisonGroup}.`;
    } else if (def.optimal) {
      score = optimalRangeScore(current.value, def.optimal.min, def.optimal.max, def.optimal.penaltyPerUnit);
      rank = rankFromPercentile(score);
      evidence = "personal";
      scoreBasis = "goal";
      rankExplanation = `Goal attainment for the evidence-based ${def.optimal.min}–${def.optimal.max} range (100 inside the range). Not a population percentile.`;
    } else if (def.standards && (def.direction === "higher" || def.direction === "lower")) {
      let v: number | null = current.value;
      if (def.standards.basis === "bodyweight_ratio") v = bodyWeight ? current.value / bodyWeight : null;
      if (v !== null) {
        score = standardScore(v, def.standards.thresholds, def.direction);
        rank = rankFromPercentile(score);
        evidence = "personal";
        scoreBasis = "standard";
        rankExplanation = def.standards.basis === "bodyweight_ratio" ? `${(Math.round(v * 100) / 100).toFixed(2)}× body weight against game-defined standards.` : "Ranked against game-defined standards.";
      } else {
        rankExplanation = "Needs a body weight to compare against bodyweight-ratio standards.";
      }
    } else {
      rankExplanation = "Tracking personal progression (no rank for this metric).";
    }

    return {
      id: def.id,
      name: def.name,
      attribute: def.attribute,
      unit: def.unit,
      direction: def.direction,
      description: def.description,
      input: def.input,
      isCustom: def.id.startsWith("custom_"),
      current,
      personalBest,
      historicalOnly,
      history: entries.map((e) => ({ date: e.recorded_on, value: e.value, context: e.context, id: e.id })),
      derivedNote,
      percentiles,
      primary,
      evidence,
      rank,
      score: score === null ? null : Math.round(score * 10) / 10,
      scoreBasis,
      rankExplanation,
      populationMessage: percentiles.length ? null : UNAVAILABLE_MESSAGE,
      standardsNote: def.standards?.note ?? null,
      excludeFromScore: Boolean(def.excludeFromScore) || def.direction === "neutral",
    };
  });
}
