import { ACTIVITY_BY_TYPE, qualifiesForXp } from "../domain/activities";
import { addDays, currentStreak, daysBetween, longestStreak, type ISODate } from "../domain/dates";
import { METRIC_BY_ID } from "../domain/metrics";
import type { ActivityRow, GameData, MetricEntryRow } from "./rows";

export const STUDY_TYPES = ["study", "practice_exam", "quiz"];
export const TRAINING_TYPES = ["workout", "run", "cycle", "swim", "mobility"];
export const CARDIO_TYPES = ["run", "cycle", "swim"];

export interface PersonalRecordEvent {
  metricId: string;
  entryId: string;
  recordedOn: ISODate;
  value: number;
  previousBest: number;
}

export interface Stats {
  activeDays: Set<ISODate>;
  currentStreak: number;
  longestStreak: number;
  comebacks: number;
  counts: Record<string, number>;
  personalRecords: PersonalRecordEvent[];
}

export function isQualifying(a: Pick<ActivityRow, "type" | "duration_min" | "quantity">): boolean {
  const def = ACTIVITY_BY_TYPE[a.type];
  return def ? qualifiesForXp(def, a).qualifies : false;
}

export function sortEntries<T extends Pick<MetricEntryRow, "recorded_on" | "created_at">>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (a.recorded_on === b.recorded_on ? a.created_at.localeCompare(b.created_at) : a.recorded_on.localeCompare(b.recorded_on)));
}

/** Replays entries chronologically to find every personal record (beyond prMinDelta). */
export function findPersonalRecords(entries: readonly MetricEntryRow[]): PersonalRecordEvent[] {
  const byMetric = new Map<string, MetricEntryRow[]>();
  for (const e of entries) {
    const list = byMetric.get(e.metric_id) ?? [];
    list.push(e);
    byMetric.set(e.metric_id, list);
  }
  const out: PersonalRecordEvent[] = [];
  for (const [metricId, list] of byMetric) {
    const def = METRIC_BY_ID[metricId];
    if (!def || def.input !== "manual" || (def.direction !== "higher" && def.direction !== "lower")) continue;
    let best: number | null = null;
    for (const e of sortEntries(list)) {
      if (best !== null && e.context !== "historical") {
        const delta = def.direction === "higher" ? e.value - best : best - e.value;
        if (delta > 0 && delta >= (def.prMinDelta ?? 0)) {
          out.push({ metricId, entryId: e.id, recordedOn: e.recorded_on, value: e.value, previousBest: best });
        }
      }
      if (best === null || (def.direction === "higher" ? e.value > best : e.value < best)) best = e.value;
    }
  }
  return out;
}

export function computeStats(data: GameData): Stats {
  const c: Record<string, number> = {};
  const inc = (k: string, by = 1) => {
    c[k] = (c[k] ?? 0) + by;
  };
  const activeDays = new Set<ISODate>();
  const flashcardDays = new Set<ISODate>();

  for (const a of data.activities) {
    const qualifies = isQualifying(a);
    const mins = a.duration_min ?? 0;
    const qty = a.quantity ?? 0;
    inc(`activity_${a.type}_logs`);
    if (!qualifies) continue;
    activeDays.add(a.occurred_on);
    inc(`activity_${a.type}`);
    inc(`activity_${a.type}_minutes`, mins);
    inc(`activity_${a.type}_quantity`, qty);
    if (STUDY_TYPES.includes(a.type)) inc("study_minutes_total", mins);
    if (a.type === "flashcards") flashcardDays.add(a.occurred_on);
    if (CARDIO_TYPES.includes(a.type)) inc("cardio_total");
    if (TRAINING_TYPES.includes(a.type)) inc("training_total");
  }
  c.study_hours_total = (c.study_minutes_total ?? 0) / 60;
  c.flashcards_total = c.activity_flashcards_quantity ?? 0;
  c.flashcard_days = flashcardDays.size;
  c.run_km_total = c.activity_run_quantity ?? 0;
  c.workouts_total = c.activity_workout ?? 0;
  c.runs_total = c.activity_run ?? 0;
  c.clinical_practice_total = (c.activity_quiz ?? 0) + (c.activity_practice_exam ?? 0);
  c.volunteering_hours_total = (c.activity_volunteering_minutes ?? 0) / 60;

  // Dungeons
  for (const s of data.sessions) {
    if (s.status !== "cleared") continue;
    inc("dungeons_cleared");
    if (s.dungeon_code === "boss_exam") inc("boss_cleared");
    if (s.pause_count === 0 && s.dungeon_code === "deep_focus") inc("uninterrupted_clears");
  }

  // Quests
  const questById = new Map(data.quests.map((q) => [q.id, q]));
  const perfectDayCandidates = new Map<ISODate, { total: number; done: number }>();
  for (const q of data.quests) {
    if (q.status === "failed") inc("quests_failed");
    if (q.kind === "daily" && q.status !== "offered" && q.status !== "exempt") {
      const d = perfectDayCandidates.get(q.period_start) ?? { total: 0, done: 0 };
      d.total += 1;
      if (q.status === "completed") d.done += 1;
      perfectDayCandidates.set(q.period_start, d);
    }
    if (q.kind === "custom") inc("custom_quests_created");
  }
  for (const qc of data.questCompletions) {
    const q = questById.get(qc.quest_id);
    if (!q) continue;
    if (qc.chapter > 0) {
      inc("main_chapters");
      continue;
    }
    inc("quests_completed");
    inc(`quests_${q.kind}_completed`);
    if (q.kind === "main") inc("main_quests_completed");
    if (q.template_code === "daily_regimen") inc("regimen_days");
    if (q.kind === "emergency" && q.deadline && Date.parse(qc.completed_at) <= Date.parse(q.deadline)) inc("emergency_on_time");
  }
  c.perfect_days = [...perfectDayCandidates.values()].filter((d) => d.total > 0 && d.done === d.total).length;

  // Records & tracking breadth
  const prs = findPersonalRecords(data.entries);
  c.prs_total = prs.length;
  c.strength_prs = prs.filter((p) => METRIC_BY_ID[p.metricId]?.attribute === "STR").length;
  c.metrics_tracked = new Set(data.entries.map((e) => e.metric_id)).size;
  c.sleep_in_range_nights = data.entries.filter((e) => e.metric_id === "sleep_duration" && e.value >= 7 && e.value <= 9).length;
  c.custom_metrics_created = data.customMetrics.length;
  for (const t of data.trials) {
    if (t.status !== "completed") continue;
    inc("trials_completed");
    inc(`trials_${t.kind}`);
  }
  c.question_bank = data.questionCount;
  c.skills_unlocked = data.skillUnlocks.length;
  c.login_streak = data.settings.login_streak;
  c.onboarded = data.profile.onboarded_at ? 1 : 0;

  // Comebacks: a gap of ≥ 3 days followed by activity.
  const days = [...activeDays].sort();
  let comebacks = 0;
  for (let i = 1; i < days.length; i++) if (daysBetween(days[i - 1], days[i]) >= 4) comebacks += 1;

  return {
    activeDays,
    currentStreak: currentStreak(activeDays, data.today),
    longestStreak: longestStreak(activeDays),
    comebacks,
    counts: c,
    personalRecords: prs,
  };
}

/** Activities that qualified, within [from, to] inclusive. */
export function activitiesBetween(data: GameData, from: ISODate, to: ISODate, types?: readonly string[]): ActivityRow[] {
  return data.activities.filter((a) => a.occurred_on >= from && a.occurred_on <= to && (!types || types.includes(a.type)) && isQualifying(a));
}

export function lastNDays(today: ISODate, n: number): { from: ISODate; to: ISODate } {
  return { from: addDays(today, -(n - 1)), to: today };
}
