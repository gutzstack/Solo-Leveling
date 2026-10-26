import { ATTRIBUTES } from "../domain/attributes";
import { METRIC_BY_ID } from "../domain/metrics";
import { rankFromPercentile } from "../domain/ranks";
import type { AttributeCode, Rank } from "../domain/types";
import { levelFromXp, type LevelProgress, type XpConfig } from "../domain/xp";
import type { MetricState } from "./metric-state";

export const MIN_METRICS_FOR_ATTRIBUTE_RANK = 2;
export const MIN_ATTRIBUTES_FOR_HUNTER_RANK = 3;

export interface AttributeSummary {
  code: AttributeCode;
  name: string;
  tracked: boolean;
  level: LevelProgress;
  xp: number;
  score: number | null;
  rank: Rank | null;
  scoredMetrics: number;
  totalMetrics: number;
  loggedMetrics: number;
  evidenceMix: { verified: number; estimated: number; personal: number };
  /** ± uncertainty in score points from population CIs; null when nothing is quantifiable */
  uncertainty: number | null;
  strongest: { id: string; name: string; score: number; rank: Rank } | null;
  weakest: { id: string; name: string; score: number; rank: Rank } | null;
  explanation: string;
}

export interface HunterSummary {
  score: number | null;
  rank: Rank | null;
  provisional: boolean;
  rankedAttributes: number;
  weights: Record<AttributeCode, number>;
  breakdown: { code: AttributeCode; score: number; weight: number; contribution: number }[];
  uncertainty: number | null;
  explanation: string;
}

export const DEFAULT_HUNTER_WEIGHTS: Record<AttributeCode, number> = { STR: 1, END: 1, PHY: 1, INT: 1, DIS: 1, WLT: 1, CHA: 1, WIS: 1 };

export function summarizeAttributes(metrics: MetricState[], xpByAttribute: Record<string, number>, tracked: AttributeCode[], cfg: XpConfig): AttributeSummary[] {
  return ATTRIBUTES.map((a) => {
    const ms = metrics.filter((m) => m.attribute === a.code);
    const scored = ms.filter((m) => !m.excludeFromScore && m.score !== null && m.rank !== null);
    const xp = Math.max(0, Math.round(xpByAttribute[a.code] ?? 0));
    const mix = { verified: 0, estimated: 0, personal: 0 };
    for (const m of scored) if (m.evidence) mix[m.evidence] += 1;
    const w = (m: MetricState) => METRIC_BY_ID[m.id]?.scoreWeight ?? 1;
    const wsum = scored.reduce((s, m) => s + w(m), 0);
    const score = scored.length >= MIN_METRICS_FOR_ATTRIBUTE_RANK && wsum > 0 ? scored.reduce((s, m) => s + (m.score as number) * w(m), 0) / wsum : null;
    const halfWidths = scored.filter((m) => m.scoreBasis === "population" && m.primary?.low !== null && m.primary?.high !== null).map((m) => (w(m) * ((m.primary!.high as number) - (m.primary!.low as number))) / 2);
    // Weighted mean of independent scores: SE = sqrt(Σ(w·h)²) / Σw.
    const uncertainty = halfWidths.length && score !== null ? Math.sqrt(halfWidths.reduce((s, h) => s + h * h, 0)) / wsum : null;
    const sorted = [...scored].sort((x, y) => (y.score as number) - (x.score as number));
    const pick = (m: MetricState | undefined) => (m ? { id: m.id, name: m.name, score: m.score as number, rank: m.rank as Rank } : null);
    return {
      code: a.code,
      name: a.name,
      tracked: tracked.includes(a.code),
      level: levelFromXp(xp, cfg.attributeBase, cfg.attributeExponent),
      xp,
      score: score === null ? null : Math.round(score * 10) / 10,
      rank: score === null ? null : rankFromPercentile(score),
      scoredMetrics: scored.length,
      totalMetrics: ms.length,
      loggedMetrics: ms.filter((m) => m.current !== null).length,
      evidenceMix: mix,
      uncertainty: uncertainty === null ? null : Math.round(uncertainty * 10) / 10,
      strongest: pick(sorted[0]),
      weakest: sorted.length > 1 ? pick(sorted[sorted.length - 1]) : null,
      explanation:
        score === null
          ? `Unranked: needs at least ${MIN_METRICS_FOR_ATTRIBUTE_RANK} ranked metrics (has ${scored.length}).`
          : `Game-defined aggregate: ${scored.some((m) => w(m) !== 1) ? "weighted " : ""}mean of ${scored.length} metric scores (${mix.verified} verified, ${mix.estimated} estimated, ${mix.personal} game-standard). Not a population percentile.`,
    };
  });
}

export function hunterRank(attributes: AttributeSummary[], rawWeights: Partial<Record<AttributeCode, number>>): HunterSummary {
  const weights = { ...DEFAULT_HUNTER_WEIGHTS };
  for (const [k, v] of Object.entries(rawWeights ?? {})) {
    if (k in weights && typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10) weights[k as AttributeCode] = v;
  }
  const ranked = attributes.filter((a) => a.tracked && a.score !== null && weights[a.code] > 0);
  const wsum = ranked.reduce((s, a) => s + weights[a.code], 0);
  if (!ranked.length || wsum === 0) {
    return { score: null, rank: null, provisional: true, rankedAttributes: 0, weights, breakdown: [], uncertainty: null, explanation: "Hunter Rank appears once attributes have enough ranked metrics." };
  }
  const score = ranked.reduce((s, a) => s + (a.score as number) * weights[a.code], 0) / wsum;
  const breakdown = ranked.map((a) => ({ code: a.code, score: a.score as number, weight: weights[a.code], contribution: Math.round((((a.score as number) * weights[a.code]) / wsum) * 10) / 10 }));
  const unc = ranked.filter((a) => a.uncertainty !== null);
  const uncertainty = unc.length ? Math.round((Math.sqrt(unc.reduce((s, a) => s + (weights[a.code] * (a.uncertainty as number)) ** 2, 0)) / wsum) * 10) / 10 : null;
  const provisional = ranked.length < MIN_ATTRIBUTES_FOR_HUNTER_RANK;
  return {
    score: Math.round(score * 10) / 10,
    rank: rankFromPercentile(score),
    provisional,
    rankedAttributes: ranked.length,
    weights,
    breakdown,
    uncertainty,
    explanation:
      "HUNTER RANK is a game-defined score: the weighted average of your ranked attribute scores, placed on the E–S+ bands. It mixes population percentiles and game standards, so it is NOT a population percentile." +
      (provisional ? ` Provisional until ${MIN_ATTRIBUTES_FOR_HUNTER_RANK} attributes are ranked.` : ""),
  };
}
