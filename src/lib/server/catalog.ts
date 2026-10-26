import { createHash } from "node:crypto";
import { ACHIEVEMENTS } from "../domain/achievements";
import { ATTRIBUTES } from "../domain/attributes";
import { DUNGEONS } from "../domain/dungeons";
import { METRICS } from "../domain/metrics";
import { SKILLS } from "../domain/skills";
import { TITLES } from "../domain/titles";
import { BENCHMARK_DISTRIBUTIONS, BENCHMARK_SOURCES } from "../percentile/registry";
import type { DataClient, Row } from "./db/types";

/**
 * Reference catalogs live in code (the source of truth) and are mirrored into the database so
 * foreign keys hold. Sync runs once per process and only rewrites when the catalog hash changes.
 */
export function catalogRows() {
  return {
    attributes: ATTRIBUTES.map((a, i) => ({ code: a.code, name: a.name, description: a.description, sort_order: i })),
    metrics: METRICS.map((m) => ({
      id: m.id,
      user_id: null,
      attribute_code: m.attribute,
      name: m.name,
      unit_kind: m.unit,
      direction: m.direction,
      description: m.description,
      input: m.input,
      is_custom: false,
      config: { standards: m.standards ?? null, optimal: m.optimal ?? null, currentWindowDays: m.currentWindowDays },
    })),
    benchmark_sources: BENCHMARK_SOURCES.map((s) => ({
      id: s.id,
      name: s.name,
      publisher: s.publisher,
      url: s.url,
      publication_year: s.publicationYear,
      population: s.population,
      sample_size: s.sampleSize,
      statistical_method: s.statisticalMethod,
      quality: s.quality,
      last_verified: s.lastVerified,
      limitations: s.limitations,
      license: s.license,
      retrieval: s.retrieval,
    })),
    benchmark_distributions: BENCHMARK_DISTRIBUTIONS.map((d) => ({
      id: d.id,
      source_id: d.sourceId,
      metric_id: d.metricId,
      age_min: d.ageMin,
      age_max: d.ageMax,
      sex: d.sex,
      units: d.units,
      kind: d.kind,
      evidence: d.evidence,
      n_unweighted: d.nUnweighted,
      n_effective: d.nEffective,
      data: d.data,
      notes: `${d.population}. ${d.variable}. ${d.notes}`,
    })),
    dungeons: DUNGEONS.map((d) => ({ code: d.code, name: d.name, kind: d.kind, difficulty: d.difficulty, default_minutes: d.defaultMinutes, config: { subtitle: d.subtitle, activity: d.activity, modes: d.modes } })),
    skills: SKILLS.map((s) => ({ code: s.code, tree: s.tree, name: s.name, tier: s.tier, requires: s.requires, config: { requirement: s.requirement, xp: s.xp } })),
    titles: TITLES.map((t) => ({ code: t.code, name: t.name, description: t.description, rarity: t.rarity })),
    achievements: ACHIEVEMENTS.map((a) => ({ code: a.code, name: a.name, description: a.description, rarity: a.rarity, category: a.category, icon: a.icon, xp_reward: a.xp, title_code: a.title ?? null, config: { stat: a.stat, threshold: a.threshold } })),
  };
}

export function catalogHash(): string {
  return createHash("sha256").update(JSON.stringify(catalogRows())).digest("hex");
}

const synced = new WeakSet<object>();

export async function ensureCatalogs(svc: DataClient, cacheKey: object): Promise<void> {
  if (synced.has(cacheKey)) return;
  const hash = catalogHash();
  const meta = await svc.select<{ value: string }>("system_meta", { eq: { key: "catalog_hash" } });
  if (meta[0]?.value !== hash) {
    const rows = catalogRows();
    await svc.upsert("attributes", rows.attributes, ["code"]);
    await svc.upsert("metrics", rows.metrics, ["id"]);
    await svc.upsert("benchmark_sources", rows.benchmark_sources, ["id"]);
    await svc.upsert("benchmark_distributions", rows.benchmark_distributions as Row[], ["id"]);
    await svc.upsert("dungeons", rows.dungeons, ["code"]);
    // Skills reference their prerequisite, so insert tier by tier.
    for (let tier = 1; tier <= 5; tier++) await svc.upsert("skills", rows.skills.filter((s) => s.tier === tier), ["code"]);
    await svc.upsert("titles", rows.titles, ["code"]);
    await svc.upsert("achievements", rows.achievements, ["code"]);
    await svc.upsert("system_meta", { key: "catalog_hash", value: hash, updated_at: new Date().toISOString() }, ["key"]);
  }
  synced.add(cacheKey);
}
