import { addDays, weekStart, type ISODate } from "../domain/dates";
import { METRIC_BY_ID } from "../domain/metrics";
import { RANKS } from "../domain/types";
import { levelFromXp } from "../domain/xp";
import type { PlayerSnapshot } from "../server/game/snapshot";
import { slopePerDay } from "./derived";
import { STUDY_TYPES } from "./stats";

export type RangeKey = "7d" | "30d" | "90d" | "1y" | "all";
export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "1y", label: "Year", days: 365 },
  { key: "all", label: "All time", days: null },
];

export function rangeStart(s: PlayerSnapshot, key: RangeKey): ISODate {
  const r = RANGES.find((x) => x.key === key)!;
  if (r.days) return addDays(s.today, -(r.days - 1));
  const firsts = [s.profile.onboarded_at?.slice(0, 10), s.activities[0]?.occurred_on, s.xpLedger[0]?.awarded_on].filter(Boolean) as string[];
  return firsts.sort()[0] ?? s.today;
}

function days(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Recorded (not projected) XP and level by day. */
export function levelSeries(s: PlayerSnapshot, from: ISODate) {
  const live = s.xpLedger;
  const perDay = new Map<string, { effort: number; performance: number }>();
  for (const x of live) {
    const d = perDay.get(x.awarded_on) ?? { effort: 0, performance: 0 };
    if (x.kind === "performance") d.performance += x.amount;
    else d.effort += x.amount;
    perDay.set(x.awarded_on, d);
  }
  let total = 0;
  for (const [d, v] of [...perDay.entries()].sort()) if (d < from) total += v.effort + v.performance;
  return days(from, s.today).map((d) => {
    const v = perDay.get(d) ?? { effort: 0, performance: 0 };
    total += v.effort + v.performance;
    return { date: d, effort: v.effort, performance: v.performance, total, level: levelFromXp(total, s.xpConfig.levelBase, s.xpConfig.levelExponent).level };
  });
}

export function weeklySeries(s: PlayerSnapshot, from: ISODate) {
  const weeks: ISODate[] = [];
  for (let w = weekStart(from); w <= s.today; w = addDays(w, 7)) weeks.push(w);
  return weeks.map((w) => {
    const end = addDays(w, 6);
    const inW = (d: string | null | undefined) => Boolean(d) && (d as string) >= w && (d as string) <= end;
    const dailies = s.quests.filter((q) => q.kind === "daily" && inW(q.period_start) && q.status !== "offered");
    const done = dailies.filter((q) => q.status === "completed").length;
    const completions = (k: string[]) => s.quests.filter((q) => k.includes(q.kind) && q.status === "completed" && inW(q.completed_at?.slice(0, 10))).length;
    const studyMin = s.activities.filter((a) => STUDY_TYPES.includes(a.type) && inW(a.occurred_on)).reduce((t, a) => t + (a.duration_min ?? 0), 0);
    return {
      week: w,
      dailyRate: dailies.length ? Math.round((done / dailies.length) * 100) : null,
      daily: completions(["daily"]),
      weekly: completions(["weekly"]),
      story: completions(["main"]),
      other: completions(["emergency", "custom"]),
      studyHours: Math.round((studyMin / 60) * 10) / 10,
    };
  });
}

export function metricSeries(s: PlayerSnapshot, ids: string[], from: ISODate) {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const id of ids) {
    const m = s.metrics.find((x) => x.id === id);
    if (!m) continue;
    for (const h of m.history) {
      if (h.context === "historical" || h.date < from) continue;
      const row = byDate.get(h.date) ?? { date: h.date };
      row[id] = h.value;
      byDate.set(h.date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function rankDistribution(s: PlayerSnapshot) {
  return RANKS.map((r) => {
    const ms = s.metrics.filter((m) => m.rank === r && !m.excludeFromScore);
    return { rank: r, population: ms.filter((m) => m.scoreBasis === "population").length, personal: ms.filter((m) => m.scoreBasis !== "population").length };
  });
}

export function personalRecords(s: PlayerSnapshot) {
  const out: { metricId: string; name: string; date: string; value: number; previous: number; unit: string }[] = [];
  for (const m of s.metrics) {
    if (m.input !== "manual" || (m.direction !== "higher" && m.direction !== "lower")) continue;
    const minDelta = METRIC_BY_ID[m.id]?.prMinDelta ?? 0;
    let best: number | null = null;
    for (const h of m.history) {
      if (best !== null && h.context !== "historical") {
        const delta = m.direction === "higher" ? h.value - best : best - h.value;
        if (delta > 0 && delta >= minDelta) out.push({ metricId: m.id, name: m.name, date: h.date, value: h.value, previous: best, unit: m.unit });
      }
      if (best === null || (m.direction === "higher" ? h.value > best : h.value < best)) best = h.value;
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Least-squares change per 30 days, over recorded entries in range (needs ≥ 2). */
export function improvementVelocity(s: PlayerSnapshot, from: ISODate) {
  return s.metrics
    .filter((m) => m.input === "manual")
    .map((m) => {
      const pts = m.history.filter((h) => h.context !== "historical" && h.date >= from).map((h) => ({ date: h.date, value: h.value }));
      const slope = pts.length >= 2 ? slopePerDay(pts) : null;
      if (slope === null) return null;
      const per30 = slope * 30;
      const improving = m.direction === "higher" ? per30 > 0 : m.direction === "lower" ? per30 < 0 : null;
      return { id: m.id, name: m.name, unit: m.unit, direction: m.direction, entries: pts.length, per30, improving };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.entries - a.entries);
}

export interface RunDay {
  date: ISODate;
  /** total distance run that day, in the player's units; null when no run was logged */
  distance: number | null;
  /** total minutes run */
  minutes: number | null;
  /** minutes per mile/km, from the day's totals */
  pace: number | null;
  /** the regimen's run target that day, in the player's units */
  target: number | null;
  /** least-squares trendline values, between the first and last run (needs 2+ run days) */
  distanceTrend: number | null;
  minutesTrend: number | null;
}

/** Ordinary least squares y = intercept + slope·x; null with fewer than two distinct x. */
export function linearTrend(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

export interface RunTrends {
  /** change per week, in the player's units / minutes */
  distancePerWeek: number | null;
  minutesPerWeek: number | null;
}

export function runTrends(days: RunDay[]): RunTrends {
  const pts = (k: "distance" | "minutes") => days.flatMap((d, i) => (d[k] === null ? [] : [{ x: i, y: d[k] as number }]));
  const d = linearTrend(pts("distance"));
  const m = linearTrend(pts("minutes"));
  return { distancePerWeek: d ? Math.round(d.slope * 7 * 100) / 100 : null, minutesPerWeek: m ? Math.round(m.slope * 7 * 10) / 10 : null };
}

/** Distance and time run per day (summing every run logged that day), with the regimen target. */
export function runSeries(s: PlayerSnapshot, from: ISODate): RunDay[] {
  const per = s.settings.unit_system === "imperial" ? 1.609344 : 1;
  const byDay = new Map<ISODate, { km: number; min: number }>();
  for (const a of s.activities) {
    if (a.type !== "run" || a.occurred_on < from) continue;
    const d = byDay.get(a.occurred_on) ?? { km: 0, min: 0 };
    d.km += a.quantity ?? 0;
    d.min += a.duration_min ?? 0;
    byDay.set(a.occurred_on, d);
  }
  const targets = new Map<ISODate, number>();
  for (const q of s.quests) {
    if (q.template_code !== "daily_regimen" || q.period_start < from) continue;
    const o = q.objectives.find((x) => "activities" in x.tracker && x.tracker.activities.includes("run"));
    if (o) targets.set(q.period_start, o.target);
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const out: RunDay[] = days(from, s.today).map((date) => {
    const d = byDay.get(date);
    const dist = d && d.km > 0 ? d.km / per : null;
    const t = targets.get(date);
    return { date, distance: dist === null ? null : r2(dist), minutes: d && d.min > 0 ? Math.round(d.min) : null, pace: dist && d && d.min > 0 ? r2(d.min / dist) : null, target: t === undefined ? null : r2(t / per), distanceTrend: null, minutesTrend: null };
  });
  // Trendlines span the first to the last run, like a spreadsheet's linear trendline.
  for (const k of ["distance", "minutes"] as const) {
    const pts = out.flatMap((d, i) => (d[k] === null ? [] : [{ x: i, y: d[k] as number }]));
    const fit = linearTrend(pts);
    if (!fit) continue;
    for (let i = pts[0].x; i <= pts[pts.length - 1].x; i++) out[i][k === "distance" ? "distanceTrend" : "minutesTrend"] = r2(Math.max(0, fit.intercept + fit.slope * i));
  }
  return out;
}

/** 7.5 → "7:30" */
export function formatPace(minutes: number): string {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}
