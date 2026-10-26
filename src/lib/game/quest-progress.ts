import { localDate, type ISODate } from "../domain/dates";
import { activitiesBetween, type Stats } from "./stats";
import type { GameData, ObjectiveRow, QuestRow } from "./rows";

export interface ObjectiveProgress {
  value: number;
  target: number;
  fraction: number;
  done: boolean;
  /** formatted hint, e.g. "45 / 90 min" */
  display: string;
}

export type CurrentValue = (metricId: string) => number | null;

function window(quest: QuestRow): { from: ISODate; to: ISODate } {
  if (quest.kind === "main") return { from: "1900-01-01", to: "9999-12-31" };
  return { from: quest.period_start, to: quest.period_end ?? "9999-12-31" };
}

export function objectiveProgress(obj: ObjectiveRow, quest: QuestRow, data: GameData, stats: Stats, current: CurrentValue): ObjectiveProgress {
  const { from, to } = window(quest);
  const t = obj.tracker;
  const target = obj.target;
  const acceptedAt = quest.kind === "emergency" ? (quest.config?.baseline as { acceptedAt?: number } | undefined)?.acceptedAt : undefined;
  const deadlineMs = quest.deadline ? Date.parse(quest.deadline) : Infinity;
  const inEmergencyWindow = (iso: string) => {
    const ms = Date.parse(iso);
    return (acceptedAt === undefined || ms >= acceptedAt) && ms <= deadlineMs;
  };
  const acts = (types: string[]) => activitiesBetween(data, from, to, types).filter((a) => quest.kind !== "emergency" || inEmergencyWindow(a.occurred_at));
  let value = 0;
  let unit = "";
  switch (t.type) {
    // `beyond` (Penalty Zone) counts only what is done on top of that day's regular daily target.
    case "activity_minutes":
      value = Math.max(0, acts(t.activities).reduce((a, x) => a + (x.duration_min ?? 0), 0) - (t.beyond ?? 0));
      unit = "min";
      break;
    case "activity_count":
      value = Math.max(0, acts(t.activities).length - (t.beyond ?? 0));
      break;
    case "activity_quantity":
      value = Math.max(0, acts(t.activities).reduce((a, x) => a + (x.quantity ?? 0), 0) - (t.beyond ?? 0));
      break;
    case "metric_logged":
      value = data.entries.filter((e) => e.metric_id === t.metric && (quest.kind === "main" || (e.context !== "historical" && e.recorded_on >= from && e.recorded_on <= to))).length;
      break;
    case "sleep_in_range":
      value = data.entries.filter((e) => e.metric_id === "sleep_duration" && e.recorded_on >= from && e.recorded_on <= to && e.value >= t.min && e.value <= t.max).length;
      break;
    case "metric_reach": {
      const v = current(t.metric);
      const reached = v !== null && (t.direction === "higher" ? v >= t.target : v <= t.target);
      const fraction = v === null ? 0 : reached ? 1 : t.direction === "higher" ? Math.max(0, Math.min(0.99, v / t.target)) : Math.max(0, Math.min(0.99, t.target / v));
      return { value: reached ? 1 : 0, target: 1, fraction: obj.completed_at ? 1 : fraction, done: Boolean(obj.completed_at) || reached, display: v === null ? "No current value" : reached ? "Reached" : "In progress" };
    }
    case "metric_gain":
      value = current(t.metric) ?? 0;
      break;
    case "dungeon_clears":
      value = data.sessions.filter((s) => {
        if (s.status !== "cleared" || !s.ended_at) return false;
        if (t.kinds && !t.kinds.includes(s.dungeon_code)) return false;
        const d = localDate(new Date(s.ended_at), data.profile.timezone);
        return d >= from && d <= to && (quest.kind !== "emergency" || inEmergencyWindow(s.ended_at));
      }).length;
      break;
    case "perfect_days":
      value = perfectDays(data, from, to);
      break;
    case "personal_records":
      value = stats.personalRecords.filter((r) => r.recordedOn >= from && r.recordedOn <= to).length;
      break;
    case "lifetime_stat": {
      const baseline = (quest.config?.baseline as Record<string, number> | undefined)?.[t.stat] ?? 0;
      value = Math.max(0, (stats.counts[t.stat] ?? 0) - baseline);
      break;
    }
    case "manual":
      value = obj.manual_progress;
      break;
  }
  const done = Boolean(obj.completed_at) || value >= target - 1e-9;
  const fraction = done ? 1 : Math.max(0, Math.min(1, target > 0 ? value / target : 0));
  const fmt = (x: number) => (Number.isInteger(x) ? x.toLocaleString("en-US") : (Math.round(x * 10) / 10).toLocaleString("en-US"));
  return { value, target, fraction, done, display: `${fmt(Math.min(value, target))} / ${fmt(target)}${unit ? " " + unit : ""}` };
}

/** Days in [from, to] on which every required daily quest was completed. */
export function perfectDays(data: GameData, from: ISODate, to: ISODate): number {
  const days = new Map<ISODate, boolean>();
  for (const q of data.quests) {
    if (q.kind !== "daily" || q.period_start < from || q.period_start > to || q.status === "offered" || q.status === "exempt") continue;
    days.set(q.period_start, (days.get(q.period_start) ?? true) && q.status === "completed");
  }
  return [...days.values()].filter(Boolean).length;
}

/** Chapter number currently in play for a main quest (1-based), or null when every chapter is complete. */
export function currentChapter(quest: QuestRow, completedChapters: Set<number>): number | null {
  const chapters = quest.config?.chapters ?? [];
  for (const c of chapters) if (!completedChapters.has(c.number)) return c.number;
  return null;
}
