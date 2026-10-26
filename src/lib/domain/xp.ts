import { z } from "zod";
import { ACTIVITY_BY_TYPE, qualifiesForXp, type ActivityDef } from "./activities";
import { daysBetween, type ISODate } from "./dates";
import type { MetricDef } from "./metrics";
import type { AttributeCode, EntryContext } from "./types";

export const XpConfigSchema = z.object({
  levelBase: z.number().min(10).max(10_000).default(100),
  levelExponent: z.number().min(1).max(3).default(1.35),
  attributeBase: z.number().min(10).max(10_000).default(60),
  attributeExponent: z.number().min(1).max(3).default(1.3),
  metricLog: z.number().int().min(0).max(100).default(5),
  metricLogDailyCap: z.number().int().min(0).max(50).default(10),
  personalRecord: z.number().int().min(0).max(1000).default(200),
  prCooldownDays: z.number().int().min(0).max(90).default(7),
  dailyQuest: z.number().int().min(0).max(500).default(25),
  dailyAllComplete: z.number().int().min(0).max(500).default(75),
  weeklyQuest: z.number().int().min(0).max(1000).default(150),
  mainChapter: z.number().int().min(0).max(2000).default(500),
  emergencyQuest: z.number().int().min(0).max(500).default(60),
  customQuestMax: z.number().int().min(0).max(300).default(100),
  activityOverrides: z.record(z.string(), z.number().int().min(0).max(500)).default({}),
});
export type XpConfig = z.infer<typeof XpConfigSchema>;

export const DEFAULT_XP_CONFIG: XpConfig = XpConfigSchema.parse({});

export function resolveXpConfig(raw: unknown): XpConfig {
  const parsed = XpConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_XP_CONFIG;
}

/** XP required to advance from `level` to `level + 1`: round(base × level^exponent). */
export function xpToNextLevel(level: number, base = DEFAULT_XP_CONFIG.levelBase, exponent = DEFAULT_XP_CONFIG.levelExponent): number {
  if (level < 1) throw new Error("level starts at 1");
  return Math.round(base * Math.pow(level, exponent));
}

export interface LevelProgress {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number; // 0..1
}

export const MAX_LEVEL = 999;

export function levelFromXp(totalXp: number, base = DEFAULT_XP_CONFIG.levelBase, exponent = DEFAULT_XP_CONFIG.levelExponent): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  while (level < MAX_LEVEL) {
    const need = xpToNextLevel(level, base, exponent);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }
  const xpForNext = xpToNextLevel(level, base, exponent);
  return { level, totalXp: xp, xpIntoLevel: remaining, xpForNext, progress: Math.min(1, remaining / xpForNext) };
}

/** Total XP needed to reach `level` from zero. */
export function totalXpForLevel(level: number, base = DEFAULT_XP_CONFIG.levelBase, exponent = DEFAULT_XP_CONFIG.levelExponent): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpToNextLevel(l, base, exponent);
  return sum;
}

// ─────────────────────────────── Ledger ───────────────────────────────

export type XpKind = "effort" | "performance" | "quest" | "achievement" | "skill" | "dungeon" | "milestone" | "reversal" | "penalty";

export interface XpTransactionRow {
  id: string;
  amount: number;
  kind: XpKind;
  attribute_code: AttributeCode | null;
  source_type: string;
  source_id: string | null;
  reason: string;
  reverses_id: string | null;
  idempotency_key: string;
  awarded_on: ISODate;
  created_at: string;
}

export interface XpTotals {
  total: number;
  effort: number;
  performance: number;
  byAttribute: Record<string, number>;
}

/** Sums the ledger. Reversals subtract from the bucket of the transaction they reverse. */
export function sumLedger(rows: readonly XpTransactionRow[]): XpTotals {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const totals: XpTotals = { total: 0, effort: 0, performance: 0, byAttribute: {} };
  for (const r of rows) {
    const origin = r.kind === "reversal" && r.reverses_id ? byId.get(r.reverses_id) : r;
    totals.total += r.amount;
    const kind = origin?.kind ?? r.kind;
    if (kind === "performance") totals.performance += r.amount;
    else totals.effort += r.amount;
    const attr = origin?.attribute_code ?? r.attribute_code;
    if (attr) totals.byAttribute[attr] = (totals.byAttribute[attr] ?? 0) + r.amount;
  }
  // Penalties can't push XP below zero.
  totals.total = Math.max(0, totals.total);
  totals.effort = Math.max(0, totals.effort);
  for (const k of Object.keys(totals.byAttribute)) totals.byAttribute[k] = Math.max(0, totals.byAttribute[k]);
  return totals;
}

// ─────────────────────────────── Activity XP ───────────────────────────────

export interface ActivityLike {
  id?: string;
  type: string;
  duration_min: number | null;
  quantity: number | null;
  occurred_on: ISODate;
  created_at?: string;
}

export interface XpDecision {
  amount: number;
  reason: string;
}

export function activityXp(def: ActivityDef, cfg: XpConfig): number {
  return cfg.activityOverrides[def.type] ?? def.xp;
}

/**
 * Decide the effort XP for a new activity log.
 * `awardedTodaySameType` = number of earlier logs of this type on the same day that already earned XP.
 */
export function planActivityXp(log: ActivityLike, awardedTodaySameType: number, cfg: XpConfig): XpDecision {
  const def = ACTIVITY_BY_TYPE[log.type];
  if (!def) return { amount: 0, reason: "Unknown activity type." };
  const q = qualifiesForXp(def, log);
  if (!q.qualifies) return { amount: 0, reason: q.reason ?? "Does not meet the completion bar." };
  if (awardedTodaySameType >= def.dailyCap) {
    return { amount: 0, reason: `Daily XP cap reached for ${def.name.toLowerCase()} (${def.dailyCap}/day). Still recorded for your stats.` };
  }
  const base = activityXp(def, cfg);
  return { amount: base, reason: `${def.name} completed` };
}

/**
 * Duplicate detection: same type, same day, near-identical duration and quantity, created within
 * 15 minutes of an existing log. Double-submits are caught first by idempotency keys; this catches
 * the same session entered twice by hand.
 */
export function findLikelyDuplicate<T extends ActivityLike>(candidate: ActivityLike, existing: readonly T[], now: Date): T | null {
  for (const e of existing) {
    if (e.type !== candidate.type || e.occurred_on !== candidate.occurred_on) continue;
    const dDur = Math.abs((e.duration_min ?? 0) - (candidate.duration_min ?? 0));
    const dQty = Math.abs((e.quantity ?? 0) - (candidate.quantity ?? 0));
    const created = e.created_at ? Date.parse(e.created_at) : NaN;
    const recent = Number.isFinite(created) ? now.getTime() - created < 15 * 60_000 : true;
    if (dDur <= 1 && dQty <= 0.01 && recent) return e;
  }
  return null;
}

// ─────────────────────────────── Metric logging & personal records ───────────────────────────────

export interface MetricEntryLike {
  id: string;
  metric_id: string;
  value: number;
  recorded_on: ISODate;
  context: EntryContext;
  created_at: string;
}

export function bestValue(def: Pick<MetricDef, "direction">, entries: readonly { value: number }[]): number | null {
  if (!entries.length) return null;
  if (def.direction === "lower") return Math.min(...entries.map((e) => e.value));
  if (def.direction === "higher") return Math.max(...entries.map((e) => e.value));
  return null;
}

export interface PrDecision {
  isRecord: boolean;
  isBaseline: boolean;
  previousBest: number | null;
  amount: number;
  reason: string;
}

/**
 * Personal-record rule (performance XP):
 *  - only higher/lower metrics, only current/test entries (historical PBs never award PR XP);
 *  - there must be an earlier entry to beat (first entry = baseline, no PR XP);
 *  - improvement must be at least `prMinDelta`;
 *  - at most one PR award per metric per `prCooldownDays`.
 */
export function evaluatePersonalRecord(
  def: MetricDef,
  entry: Pick<MetricEntryLike, "value" | "context" | "recorded_on">,
  prior: readonly Pick<MetricEntryLike, "value">[],
  lastPrAwardOn: ISODate | null,
  today: ISODate,
  cfg: XpConfig,
): PrDecision {
  const none = (reason: string, isBaseline = false, previousBest: number | null = null): PrDecision => ({ isRecord: false, isBaseline, previousBest, amount: 0, reason });
  if (def.direction !== "higher" && def.direction !== "lower") return none("Metric has no better/worse direction.");
  if (def.input !== "manual") return none("Derived metric.");
  if (entry.context === "historical") return none("Historical entries are recorded as past bests and do not award PR XP.");
  if (daysBetween(entry.recorded_on, today) > def.currentWindowDays) return none("Entry is outside the current window.");
  const prevBest = bestValue(def, prior);
  if (prevBest === null) return none("Baseline established.", true);
  const delta = def.direction === "higher" ? entry.value - prevBest : prevBest - entry.value;
  const minDelta = def.prMinDelta ?? 0;
  if (delta <= 0 || delta < minDelta) return none("Not a new personal best.", false, prevBest);
  if (lastPrAwardOn && daysBetween(lastPrAwardOn, today) < cfg.prCooldownDays) {
    return { isRecord: true, isBaseline: false, previousBest: prevBest, amount: 0, reason: `New personal record! PR XP for this metric is limited to once every ${cfg.prCooldownDays} days.` };
  }
  return { isRecord: true, isBaseline: false, previousBest: prevBest, amount: cfg.personalRecord, reason: "New personal record" };
}

export function planMetricLogXp(context: EntryContext, loggedTodayWithXp: number, cfg: XpConfig): XpDecision {
  if (context === "historical") return { amount: 0, reason: "Historical record saved (no XP for past entries)." };
  if (loggedTodayWithXp >= cfg.metricLogDailyCap) return { amount: 0, reason: "Daily measurement-XP cap reached." };
  return { amount: cfg.metricLog, reason: "Measurement logged" };
}
