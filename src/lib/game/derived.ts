import { addDays, daysBetween, weekStart, type ISODate } from "../domain/dates";
import { replayRating, START_RATING } from "../domain/trials";
import type { MetricDef } from "../domain/metrics";
import { activitiesBetween, CARDIO_TYPES, lastNDays, STUDY_TYPES, TRAINING_TYPES, type Stats } from "./stats";
import type { GameData, MetricEntryRow } from "./rows";

export interface DerivedValue {
  value: number | null;
  note: string;
}

export type CurrentLookup = (metricId: string) => { value: number; recorded_on: ISODate } | null;

/** Daniels & Gilbert (1979) oxygen-cost / time-to-exhaustion model ("VDOT"). */
export function vdotFromRace(distanceMeters: number, seconds: number): number {
  const t = seconds / 60;
  const v = distanceMeters / t; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pct;
}

export const RACE_DISTANCES: Record<string, number> = {
  mile_time: 1609.344,
  run_5k: 5000,
  run_10k: 10000,
  half_marathon: 21097.5,
};

function stddev(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** Least-squares slope of value against day index; returns units per day. */
export function slopePerDay(points: { date: ISODate; value: number }[]): number | null {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const ys = points.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  return sxy / sxx;
}

function entriesOf(data: GameData, metricId: string, from?: ISODate): MetricEntryRow[] {
  return data.entries
    .filter((e) => e.metric_id === metricId && e.context !== "historical" && (!from || e.recorded_on >= from))
    .sort((a, b) => a.recorded_on.localeCompare(b.recorded_on) || a.created_at.localeCompare(b.created_at));
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

export function computeDerived(def: MetricDef, data: GameData, stats: Stats, current: CurrentLookup, extras: { academicSkills: number; financialArcProgress: number | null; mainObjectives30d: number }): DerivedValue {
  const today = data.today;
  const sumMinutes = (types: string[], days: number) => {
    const { from, to } = lastNDays(today, days);
    return activitiesBetween(data, from, to, types).reduce((a, x) => a + (x.duration_min ?? 0), 0);
  };
  const sumQty = (types: string[], days: number) => {
    const { from, to } = lastNDays(today, days);
    return activitiesBetween(data, from, to, types).reduce((a, x) => a + (x.quantity ?? 0), 0);
  };
  const countIn = (types: string[], days: number) => {
    const { from, to } = lastNDays(today, days);
    return activitiesBetween(data, from, to, types).length;
  };
  const daysWith = (types: string[], days: number) => {
    const { from, to } = lastNDays(today, days);
    return new Set(activitiesBetween(data, from, to, types).map((a) => a.occurred_on)).size;
  };
  const bodyWeight = current("body_weight")?.value ?? data.profile.weight_kg ?? null;

  switch (def.id) {
    case "strength_bw_ratio":
    case "strength_total": {
      const b = current("bench_press_1rm");
      const s = current("squat_1rm");
      const d = current("deadlift_1rm");
      if (!b || !s || !d) return { value: null, note: "Needs current bench, squat and deadlift entries." };
      const total = b.value + s.value + d.value;
      if (def.id === "strength_total") return { value: total, note: "Bench + squat + deadlift (current)." };
      if (!bodyWeight) return { value: null, note: "Needs a body weight." };
      return { value: total / bodyWeight, note: "Big-3 total ÷ body weight." };
    }
    case "weekly_training_volume": {
      const { from, to } = lastNDays(today, 7);
      const logs = activitiesBetween(data, from, to, ["workout"]);
      const withVolume = logs.filter((l) => (l.quantity ?? 0) > 0);
      if (!withVolume.length) return { value: logs.length ? null : 0, note: logs.length ? "Add volume to workout logs to compute." : "No workouts in the last 7 days." };
      return { value: withVolume.reduce((a, l) => a + (l.quantity ?? 0), 0), note: "Sum of logged workout volume (7 d)." };
    }
    case "weekly_mileage":
      return { value: sumQty(["run"], 7), note: "Run distance, last 7 days." };
    case "vdot_estimate": {
      let best: number | null = null;
      let from = "";
      for (const [metric, dist] of Object.entries(RACE_DISTANCES)) {
        const c = current(metric);
        if (!c) continue;
        const v = vdotFromRace(dist, c.value);
        if (best === null || v > best) {
          best = v;
          from = metric;
        }
      }
      return best === null
        ? { value: null, note: "Log a current race time (mile, 5K, 10K or half) to estimate." }
        : { value: Math.round(best * 10) / 10, note: `Daniels–Gilbert VDOT from your current ${from.replace("_", " ")}. Model-based estimate.` };
    }
    case "cardio_sessions_week":
      return { value: countIn(CARDIO_TYPES, 7), note: "Runs, rides and swims, last 7 days." };
    case "lean_mass":
    case "muscle_gain": {
      const bf = entriesOf(data, "body_fat_pct");
      const bw = entriesOf(data, "body_weight");
      if (!bf.length || !(bw.length || data.profile.weight_kg)) return { value: null, note: "Needs body weight and body-fat % entries." };
      const leanAt = (bfEntry: MetricEntryRow) => {
        // pair with the body-weight entry closest in time
        const w = bw.length
          ? bw.reduce((best, e) => (Math.abs(daysBetween(e.recorded_on, bfEntry.recorded_on)) < Math.abs(daysBetween(best.recorded_on, bfEntry.recorded_on)) ? e : best)).value
          : (data.profile.weight_kg as number);
        return w * (1 - bfEntry.value / 100);
      };
      const latest = leanAt(bf[bf.length - 1]);
      if (def.id === "lean_mass") return { value: latest, note: "Body weight × (1 − body-fat %)." };
      if (bf.length < 2) return { value: null, note: "Needs two body-fat entries to measure change." };
      return { value: latest - leanAt(bf[0]), note: `Since ${bf[0].recorded_on}.` };
    }
    case "bmi": {
      const h = current("height")?.value ?? data.profile.height_cm;
      if (!h || !bodyWeight) return { value: null, note: "Needs height and body weight." };
      return { value: bodyWeight / (h / 100) ** 2, note: "Computed from your height and weight." };
    }
    case "bodyweight_trend": {
      const pts = entriesOf(data, "body_weight", addDays(today, -29)).map((e) => ({ date: e.recorded_on, value: e.value }));
      if (pts.length < 3) return { value: null, note: "Needs ≥ 3 weigh-ins in 30 days." };
      const s = slopePerDay(pts);
      return { value: s === null ? null : s * 7, note: "Least-squares slope, per week." };
    }
    case "training_frequency":
      return { value: Math.round((countIn(TRAINING_TYPES, 28) / 4) * 10) / 10, note: "Sessions per week over 4 weeks." };
    case "sleep_consistency": {
      const nights = entriesOf(data, "sleep_duration", addDays(today, -13));
      if (nights.length < 5) return { value: null, note: "Needs ≥ 5 logged nights in 14 days." };
      return { value: stddev(nights.map((n) => n.value)) * 60, note: "SD of nightly sleep (minutes)." };
    }
    case "study_hours_week":
      return { value: sumMinutes(STUDY_TYPES, 7) / 60, note: "Study, quiz and practice-exam time, last 7 days." };
    case "skill_mastery":
      return { value: extras.academicSkills, note: "Academic skill nodes unlocked." };
    case "reading_pages_week":
      return { value: sumQty(["reading"], 7), note: "Pages logged, last 7 days." };
    case "knowledge_rating":
    case "reasoning_rating": {
      const kind = def.id === "knowledge_rating" ? "knowledge" : "reasoning";
      const attempts = data.trials
        .filter((t) => t.kind === kind && t.status === "completed")
        .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""))
        .flatMap((t) => t.results.attempts ?? []);
      if (attempts.length < 10) return { value: null, note: `${attempts.length}/10 items answered. Complete ${kind === "knowledge" ? "Knowledge" : "Reasoning"} Trials to establish a rating.` };
      return { value: replayRating(attempts), note: `Rating from ${attempts.length} answered items (starts at ${START_RATING}).` };
    }
    case "working_memory_span":
    case "processing_speed": {
      const kind = def.id === "working_memory_span" ? "memory" : "speed";
      const since = data.now.getTime() - def.currentWindowDays * 86_400_000;
      const scores = data.trials.filter((t) => t.kind === kind && t.status === "completed" && t.completed_at && Date.parse(t.completed_at) >= since && t.score !== null).map((t) => t.score as number);
      if (!scores.length) return { value: null, note: `Complete a ${kind === "memory" ? "Memory" : "Speed"} Trial to measure this.` };
      return { value: Math.max(...scores), note: `Best of ${scores.length} trial${scores.length === 1 ? "" : "s"} in the last ${def.currentWindowDays} days.` };
    }
    case "educational_milestones":
      return { value: stats.counts.activity_educational_milestone ?? 0, note: "Lifetime." };
    case "academic_improvement": {
      const ex = entriesOf(data, "exam_average", addDays(today, -89));
      if (ex.length < 2) return { value: null, note: "Needs two exam-average entries in 90 days." };
      return { value: ex[ex.length - 1].value - ex[0].value, note: "Percentage-point change in 90 days." };
    }
    case "daily_quest_rate":
    case "habit_adherence":
    case "planned_vs_completed": {
      const from = addDays(today, -13);
      const pool = data.quests.filter((q) => {
        if (q.period_start < from || q.period_start > today || q.status === "offered" || q.status === "abandoned") return false;
        if (def.id === "daily_quest_rate") return q.kind === "daily";
        if (def.id === "habit_adherence") return q.kind === "daily" && q.config?.habit === true;
        return q.kind !== "main";
      });
      // Today's open quests aren't counted as misses yet.
      const settled = pool.filter((q) => q.status === "completed" || q.period_start < today || (q.period_end !== null && q.period_end < today));
      const done = settled.filter((q) => q.status === "completed").length;
      return { value: pct(done, settled.length), note: settled.length ? `${done}/${settled.length} in 14 days.` : "No settled quests yet." };
    }
    case "weekly_quest_rate": {
      const thisWeek = weekStart(today);
      const from = addDays(thisWeek, -28);
      const pool = data.quests.filter((q) => q.kind === "weekly" && q.period_start >= from && q.period_start < thisWeek && q.status !== "offered");
      const done = pool.filter((q) => q.status === "completed").length;
      return { value: pct(done, pool.length), note: pool.length ? `${done}/${pool.length} over the last 4 weeks.` : "No finished weeks yet." };
    }
    case "study_consistency":
      return { value: pct(daysWith(STUDY_TYPES, 14), 14), note: "Study days in the last 14." };
    case "workout_consistency":
      return { value: Math.min(100, pct(daysWith(TRAINING_TYPES, 28), 16) ?? 0), note: "Training days vs. 16-day target (4/week)." };
    case "on_time_rate": {
      const from = addDays(today, -59);
      const pool = data.quests.filter((q) => q.kind === "emergency" && q.deadline && q.period_start >= from && q.status !== "offered" && q.status !== "abandoned" && (q.status !== "active" || Date.parse(q.deadline) < data.now.getTime()));
      const onTime = pool.filter((q) => q.status === "completed" && q.completed_at && q.deadline && Date.parse(q.completed_at) <= Date.parse(q.deadline)).length;
      return { value: pct(onTime, pool.length), note: pool.length ? `${onTime}/${pool.length} deadline quests on time.` : "No deadline quests yet." };
    }
    case "focus_sessions_week": {
      const since = data.now.getTime() - 7 * 86_400_000;
      return { value: data.sessions.filter((s) => s.status === "cleared" && s.ended_at && Date.parse(s.ended_at) >= since).length, note: "Dungeons cleared, last 7 days." };
    }
    case "goal_adherence":
      return { value: extras.mainObjectives30d, note: "Main-story objectives completed in 30 days." };
    case "consistency_streak":
      return { value: stats.currentStreak, note: `Longest: ${stats.longestStreak} days.` };
    case "comeback_rate": {
      const from = addDays(today, -59);
      let missed = 0;
      let returned = 0;
      for (let d = from; d < today; d = addDays(d, 1)) {
        if (!stats.activeDays.has(d)) {
          missed += 1;
          if (stats.activeDays.has(addDays(d, 1))) returned += 1;
        }
      }
      // Only meaningful once the player has history in this window.
      const first = [...stats.activeDays].sort()[0];
      if (!first || first > from) return { value: null, note: "Needs 60 days of history." };
      return { value: missed ? pct(returned, missed) : 100, note: missed ? `${returned}/${missed} missed days were followed by a comeback.` : "No missed days!" };
    }
    case "emergency_fund_months": {
      const liquid = current("liquid_assets")?.value ?? current("savings")?.value;
      const exp = current("monthly_expenses")?.value;
      if (liquid === undefined || !exp) return { value: null, note: "Needs liquid assets (or savings) and monthly expenses." };
      return { value: liquid / exp, note: "Liquid assets ÷ monthly expenses." };
    }
    case "financial_goal_completion":
      return { value: extras.financialArcProgress, note: "Financial Awakening arc progress." };
    case "debt_reduction": {
      const d = entriesOf(data, "debt", addDays(today, -89));
      if (d.length < 2) return { value: null, note: "Needs two debt entries in 90 days." };
      return { value: d[0].value - d[d.length - 1].value, note: "Decrease in debt over 90 days." };
    }
    case "financial_literacy":
      return { value: stats.counts.activity_financial_lesson ?? 0, note: "Lessons completed." };
    case "communication_practice":
      return { value: countIn(["communication"], 30), note: "Last 30 days." };
    case "public_speaking_total":
      return { value: stats.counts.activity_public_speaking ?? 0, note: "Lifetime." };
    case "presentations_total":
      return { value: stats.counts.activity_presentation ?? 0, note: "Lifetime." };
    case "networking_30d":
      return { value: countIn(["networking"], 30), note: "Last 30 days." };
    case "relationship_maintenance":
      return { value: countIn(["social_connection"], 30), note: "Last 30 days." };
    case "volunteering_hours":
      return { value: stats.counts.volunteering_hours_total ?? 0, note: "Lifetime." };
    case "mentoring_total":
      return { value: stats.counts.activity_mentoring ?? 0, note: "Lifetime." };
    case "interpersonal_development":
      return { value: countIn(["interpersonal"], 30), note: "Last 30 days." };
    case "sleep_regularity": {
      const nights = entriesOf(data, "sleep_duration", addDays(today, -13));
      if (!nights.length) return { value: null, note: "Log sleep to compute." };
      return { value: pct(nights.filter((n) => n.value >= 7 && n.value <= 9).length, 14), note: "Nights at 7–9 h out of the last 14." };
    }
    case "stress_management_7d":
      return { value: countIn(["stress_management"], 7), note: "Last 7 days." };
    case "journaling_7d":
      return { value: countIn(["reflection"], 7), note: "Last 7 days." };
    case "emotional_regulation_7d":
      return { value: countIn(["emotional_regulation"], 7), note: "Last 7 days." };
    case "personal_development_30d":
      return { value: countIn(["personal_development"], 30), note: "Last 30 days." };
    case "mindfulness_minutes_week":
      return { value: sumMinutes(["mindfulness"], 7), note: "Last 7 days." };
    case "recovery_days_7d": {
      const trained = daysWith(TRAINING_TYPES, 7);
      // Not meaningful until training is being logged at all.
      if (!data.activities.some((a) => TRAINING_TYPES.includes(a.type))) return { value: null, note: "Log training to track recovery balance." };
      return { value: 7 - trained, note: "Days without training in the last 7." };
    }
    case "decision_reflections_30d":
      return { value: countIn(["decision_reflection"], 30), note: "Last 30 days." };
    default:
      return { value: null, note: "" };
  }
}
