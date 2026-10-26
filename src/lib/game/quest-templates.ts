import { addDays, isoWeekday, weekStart, type ISODate } from "../domain/dates";
import { lbToKg, miToKm } from "../domain/units";
import type { XpConfig } from "../domain/xp";
import type { AttributeCode } from "../domain/types";
import type { ProfileRow, QuestKind, QuestRow, Tracker } from "./rows";

export interface ObjectiveDraft {
  title: string;
  tracker: Tracker;
  target: number;
  chapter?: number;
}

export interface QuestDraft {
  kind: QuestKind;
  template_code: string;
  title: string;
  description: string;
  attribute_code: AttributeCode | null;
  difficulty: QuestRow["difficulty"];
  period_start: ISODate;
  period_end: ISODate | null;
  deadline: string | null;
  status: "active" | "offered";
  xp_reward: number;
  config: QuestRow["config"];
  objectives: ObjectiveDraft[];
}

const MULT: Record<ProfileRow["difficulty"], number> = { casual: 0.67, normal: 1, hard: 1.33, nightmare: 1.67 };

function scale(base: number, p: ProfileRow, step = 5): number {
  return Math.max(step, Math.round((base * MULT[p.difficulty]) / step) * step);
}

/** Small deterministic hash so a day's quest board is stable but varies between days and players. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const tracks = (p: ProfileRow, a: AttributeCode) => p.tracked_categories.includes(a);

function daily(p: ProfileRow, date: ISODate, cfg: XpConfig, code: string, title: string, description: string, attribute: AttributeCode, objectives: ObjectiveDraft[], habit = false): QuestDraft {
  return {
    kind: "daily",
    template_code: code,
    title,
    description,
    attribute_code: attribute,
    difficulty: "D",
    period_start: date,
    period_end: date,
    deadline: null,
    status: "active",
    xp_reward: cfg.dailyQuest,
    config: { habit },
    objectives,
  };
}

/** Daily quest board, generated from tracked categories, goals and difficulty. */
export function generateDailyQuests(p: ProfileRow, date: ISODate, cfg: XpConfig, userId: string): QuestDraft[] {
  const out: QuestDraft[] = [];
  const wd = isoWeekday(date);
  const h = hashString(`${userId}:${date}`);

  if (tracks(p, "INT")) {
    const mins = scale(90, p, 15);
    out.push(daily(p, date, cfg, "daily_study", `Complete ${mins} minutes of focused study`, "Deep, distraction-free study. Dungeon sessions count.", "INT", [{ title: `Study ${mins} minutes`, tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: mins }]));
  }

  // Training split by weekday, with a recovery day built in.
  const plan: Record<number, "upper" | "run" | "lower" | "mobility" | "full" | "long_run" | "rest"> = { 1: "upper", 2: "run", 3: "lower", 4: "mobility", 5: "full", 6: "long_run", 7: "rest" };
  const today = plan[wd];
  const str = tracks(p, "STR");
  const end = tracks(p, "END");
  if ((today === "upper" || today === "lower" || today === "full") && str) {
    const label = today === "upper" ? "an upper-body" : today === "lower" ? "a lower-body" : "a full-body";
    out.push(daily(p, date, cfg, `daily_workout_${today}`, `Perform ${label} workout`, "Any strength session of 20+ minutes. Leave a rep or two in reserve; injuries cost more than they earn.", "STR", [{ title: "Strength workout (20+ min)", tracker: { type: "activity_count", activities: ["workout"] }, target: 1 }]));
  } else if ((today === "run" || today === "long_run") && end) {
    const km = today === "long_run" ? miToKm(scale(6, p, 1)) : miToKm(scale(3, p, 1));
    out.push(daily(p, date, cfg, `daily_${today}`, today === "long_run" ? `Long run: ${Math.round((km / 1.609344) * 10) / 10} miles` : `Run ${Math.round((km / 1.609344) * 10) / 10} miles`, "Mostly easy, conversational pace.", "END", [{ title: "Run distance", tracker: { type: "activity_quantity", activities: ["run"] }, target: Math.round(km * 100) / 100 }]));
  } else if (today === "mobility" && (str || end || tracks(p, "PHY"))) {
    out.push(daily(p, date, cfg, "daily_mobility", "Mobility & recovery session", "15+ minutes of mobility or stretching keeps you training tomorrow.", "PHY", [{ title: "Mobility session", tracker: { type: "activity_count", activities: ["mobility"] }, target: 1 }]));
  } else if (today === "rest") {
    out.push(daily(p, date, cfg, "daily_rest", "Take a planned recovery day", "Adaptation happens during rest. Log a recovery day (easy walking is fine).", "PHY", [{ title: "Log a recovery day", tracker: { type: "activity_count", activities: ["rest_day"] }, target: 1 }], true));
  }

  if (tracks(p, "PHY") || tracks(p, "WIS")) {
    out.push(daily(p, date, cfg, "daily_sleep", "Get adequate sleep (7–9 h)", "Log last night's sleep. 7–9 hours is the goal: not less, and no bonus for more.", "PHY", [{ title: "Log sleep within 7–9 h", tracker: { type: "sleep_in_range", min: 7, max: 9 }, target: 1 }], true));
  }

  const optional: QuestDraft[] = [];
  if (tracks(p, "INT")) {
    const cards = scale(50, p, 10);
    optional.push(daily(p, date, cfg, "daily_flashcards", `Review ${cards} flashcards`, "Spaced retrieval practice.", "INT", [{ title: `${cards} cards`, tracker: { type: "activity_quantity", activities: ["flashcards"] }, target: cards }]));
  }
  if (tracks(p, "PHY")) {
    optional.push(daily(p, date, cfg, "daily_steps", "Walk 8,000 steps", "Log a walk with your step count.", "PHY", [{ title: "8,000 steps", tracker: { type: "activity_quantity", activities: ["walk"] }, target: 8000 }]));
    optional.push(daily(p, date, cfg, "daily_nutrition", "Log your nutrition", "A quick log of today's meals and protein.", "PHY", [{ title: "Nutrition log", tracker: { type: "activity_count", activities: ["nutrition_log"] }, target: 1 }], true));
  }
  if (tracks(p, "WIS")) {
    optional.push(daily(p, date, cfg, "daily_reflection", "Complete a daily reflection", "Three minutes: what went well, what you learned, tomorrow's priority.", "WIS", [{ title: "Reflection", tracker: { type: "activity_count", activities: ["reflection"] }, target: 1 }], true));
  }
  if (tracks(p, "CHA")) {
    optional.push(daily(p, date, cfg, "daily_connection", "Reach out to someone who matters", "A call, a coffee, a meaningful message.", "CHA", [{ title: "Relationship maintenance", tracker: { type: "activity_count", activities: ["social_connection", "communication", "networking"] }, target: 1 }]));
  }
  // Pick up to three optional quests, rotated deterministically.
  const picks = Math.min(3, optional.length);
  const start = optional.length ? h % optional.length : 0;
  for (let i = 0; i < picks; i++) out.push(optional[(start + i) % optional.length]);
  return out;
}

function weekly(p: ProfileRow, ws: ISODate, cfg: XpConfig, code: string, title: string, description: string, attribute: AttributeCode, objectives: ObjectiveDraft[]): QuestDraft {
  return { kind: "weekly", template_code: code, title, description, attribute_code: attribute, difficulty: "C", period_start: ws, period_end: addDays(ws, 6), deadline: null, status: "active", xp_reward: cfg.weeklyQuest, config: {}, objectives };
}

export function generateWeeklyQuests(p: ProfileRow, date: ISODate, cfg: XpConfig): QuestDraft[] {
  const ws = weekStart(date);
  const out: QuestDraft[] = [];
  if (tracks(p, "INT")) {
    const hours = scale(15, p, 1);
    out.push(weekly(p, ws, cfg, "weekly_study", `Study ${hours} focused hours`, "Spread across the week. Five 3-hour days beats one 15-hour panic.", "INT", [{ title: `${hours} hours of study`, tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: hours * 60 }]));
    out.push(weekly(p, ws, cfg, "weekly_reviews", "Finish all scheduled academic reviews", "Clear your review backlog and sit one practice block.", "INT", [
      { title: "Complete scheduled reviews (confirm)", tracker: { type: "manual" }, target: 1 },
      { title: "One quiz or practice-exam block", tracker: { type: "activity_count", activities: ["quiz", "practice_exam"] }, target: 1 },
    ]));
  }
  if (tracks(p, "STR")) {
    const n = Math.min(6, scale(4, p, 1));
    out.push(weekly(p, ws, cfg, "weekly_workouts", `Complete ${n} workouts`, "Strength sessions of 20+ minutes.", "STR", [{ title: `${n} workouts`, tracker: { type: "activity_count", activities: ["workout"] }, target: n }]));
  }
  if (tracks(p, "END")) {
    const mi = scale(15, p, 1);
    out.push(weekly(p, ws, cfg, "weekly_mileage", `Run ${mi} miles`, "Build the aerobic engine. Increase weekly volume gradually.", "END", [{ title: `${mi} miles`, tracker: { type: "activity_quantity", activities: ["run"] }, target: Math.round(miToKm(mi) * 100) / 100 }]));
  }
  out.push(weekly(p, ws, cfg, "weekly_dungeons", "Clear 3 dungeons", "Three focus sessions of any type.", "DIS", [{ title: "3 dungeons cleared", tracker: { type: "dungeon_clears" }, target: 3 }]));
  out.push(weekly(p, ws, cfg, "weekly_improve", "Improve a personal metric", "Set a new personal record on any tracked performance metric.", "DIS", [{ title: "1 personal record", tracker: { type: "personal_records" }, target: 1 }]));
  if (tracks(p, "WLT")) {
    out.push(weekly(p, ws, cfg, "weekly_finance", "Financial check-in", "Review your budget and log your savings balance.", "WLT", [
      { title: "Budget review", tracker: { type: "activity_count", activities: ["financial_review"] }, target: 1 },
      { title: "Log savings", tracker: { type: "metric_logged", metric: "savings" }, target: 1 },
    ]));
  }
  if (tracks(p, "CHA")) {
    out.push(weekly(p, ws, cfg, "weekly_social", "Strengthen your bonds", "Two intentional social or professional connections.", "CHA", [{ title: "2 connections", tracker: { type: "activity_count", activities: ["social_connection", "networking", "communication", "mentoring", "volunteering"] }, target: 2 }]));
  }
  return out;
}

// ─────────────────────────────── Main story quests ───────────────────────────────

export interface StoryArc {
  code: string;
  title: string;
  tagline: string;
  attribute: AttributeCode;
  titleReward: string;
  chapters: { number: number; name: string; description: string; objectives: ObjectiveDraft[] }[];
}

export function storyArcs(p: ProfileRow): StoryArc[] {
  const efTarget = p.financial_info?.emergencyFundTargetMonths ?? 6;
  const arcs: StoryArc[] = [];
  arcs.push({
    code: "main_white_coat",
    title: "THE WHITE COAT ASCENSION",
    tagline: "Become an exceptional PA student, then an exceptional clinician.",
    attribute: "INT",
    titleReward: "white_coat",
    chapters: [
      { number: 1, name: "Chapter I: The Foundations", description: "Set your baseline and build the study habit.", objectives: [
        { title: "Log your current program GPA", tracker: { type: "metric_logged", metric: "program_gpa" }, target: 1 },
        { title: "20 focused study hours", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 1200 },
      ] },
      { number: 2, name: "Chapter II: The Gauntlet of Knowledge", description: "Volume and pressure.", objectives: [
        { title: "100 focused study hours", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 6000 },
        { title: "Defeat 3 boss dungeons", tracker: { type: "dungeon_clears", kinds: ["boss_exam"] }, target: 3 },
      ] },
      { number: 3, name: "Chapter III: The Clinical Crucible", description: "Reason like a clinician.", objectives: [
        { title: "25 quiz or practice-exam blocks", tracker: { type: "activity_count", activities: ["quiz", "practice_exam"] }, target: 25 },
        { title: "Retrieval accuracy ≥ 80%", tracker: { type: "metric_reach", metric: "retrieval_accuracy", target: 80, direction: "higher" }, target: 1 },
      ] },
      { number: 4, name: "Chapter IV: The Examiner's Trial", description: "Prove it on exams.", objectives: [
        { title: "Course exam average ≥ 90%", tracker: { type: "metric_reach", metric: "exam_average", target: 90, direction: "higher" }, target: 1 },
        { title: "10 practice examinations", tracker: { type: "activity_count", activities: ["practice_exam"] }, target: 10 },
      ] },
      { number: 5, name: "Chapter V: Ascension", description: "Mastery.", objectives: [
        { title: "300 focused study hours", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 18000 },
        { title: "Program GPA ≥ 3.70", tracker: { type: "metric_reach", metric: "program_gpa", target: 3.7, direction: "higher" }, target: 1 },
      ] },
    ],
  });
  arcs.push({
    code: "main_titan",
    title: "THE TITAN'S BODY",
    tagline: "Build 10 pounds of lean muscle, slowly and sustainably.",
    attribute: "STR",
    titleReward: "titan",
    chapters: [
      { number: 1, name: "Chapter I: Awakening the Frame", description: "Measure, then train.", objectives: [
        { title: "Log body weight", tracker: { type: "metric_logged", metric: "body_weight" }, target: 1 },
        { title: "Log body-fat %", tracker: { type: "metric_logged", metric: "body_fat_pct" }, target: 1 },
        { title: "10 strength workouts", tracker: { type: "activity_count", activities: ["workout"] }, target: 10 },
      ] },
      { number: 2, name: "Chapter II: Progressive Overload", description: "Add load over time.", objectives: [
        { title: "3 strength personal records", tracker: { type: "lifetime_stat", stat: "strength_prs" }, target: 3 },
        { title: "30 strength workouts", tracker: { type: "activity_count", activities: ["workout"] }, target: 30 },
      ] },
      { number: 3, name: "Chapter III: Hypertrophy", description: "Half way.", objectives: [
        { title: "+5 lb lean mass", tracker: { type: "metric_reach", metric: "muscle_gain", target: lbToKg(5), direction: "higher" }, target: 1 },
        { title: "60 strength workouts", tracker: { type: "activity_count", activities: ["workout"] }, target: 60 },
      ] },
      { number: 4, name: "Chapter IV: The Titan", description: "The goal.", objectives: [{ title: "+10 lb lean mass", tracker: { type: "metric_reach", metric: "muscle_gain", target: lbToKg(10), direction: "higher" }, target: 1 }] },
    ],
  });
  arcs.push({
    code: "main_limiter",
    title: "BREAK THE LIMITER",
    tagline: "Run a sub-18-minute 5K.",
    attribute: "END",
    titleReward: "limiter_broken",
    chapters: [
      { number: 1, name: "Chapter I: Rekindling", description: "Rebuild volume.", objectives: [
        { title: "Run 50 km", tracker: { type: "activity_quantity", activities: ["run"] }, target: 50 },
        { title: "Current 5K ≤ 21:00", tracker: { type: "metric_reach", metric: "run_5k", target: 1260, direction: "lower" }, target: 1 },
      ] },
      { number: 2, name: "Chapter II: The 20-Minute Wall", description: "Threshold work.", objectives: [{ title: "Current 5K ≤ 20:00", tracker: { type: "metric_reach", metric: "run_5k", target: 1200, direction: "lower" }, target: 1 }] },
      { number: 3, name: "Chapter III: Reclaim the Former Self", description: "Match your all-time best.", objectives: [{ title: "Current 5K ≤ 19:30", tracker: { type: "metric_reach", metric: "run_5k", target: 1170, direction: "lower" }, target: 1 }] },
      { number: 4, name: "Chapter IV: Uncharted Pace", description: "Beyond any past self.", objectives: [{ title: "Current 5K ≤ 19:00", tracker: { type: "metric_reach", metric: "run_5k", target: 1140, direction: "lower" }, target: 1 }] },
      { number: 5, name: "Chapter V: Break the Limiter", description: "Sub-18.", objectives: [{ title: "Current 5K under 18:00", tracker: { type: "metric_reach", metric: "run_5k", target: 1079, direction: "lower" }, target: 1 }] },
    ],
  });
  arcs.push({
    code: "main_financial",
    title: "FINANCIAL AWAKENING",
    tagline: "Build the foundations of financial independence.",
    attribute: "WLT",
    titleReward: "financially_awakened",
    chapters: [
      { number: 1, name: "Chapter I: See Clearly", description: "Know your numbers.", objectives: [
        { title: "Log savings", tracker: { type: "metric_logged", metric: "savings" }, target: 1 },
        { title: "Log monthly expenses", tracker: { type: "metric_logged", metric: "monthly_expenses" }, target: 1 },
        { title: "Log debt (enter 0 if none)", tracker: { type: "metric_logged", metric: "debt" }, target: 1 },
        { title: "Complete a budget review", tracker: { type: "activity_count", activities: ["financial_review"] }, target: 1 },
      ] },
      { number: 2, name: "Chapter II: The First Shield", description: "One month of runway.", objectives: [
        { title: "Emergency fund ≥ 1 month", tracker: { type: "metric_reach", metric: "emergency_fund_months", target: 1, direction: "higher" }, target: 1 },
        { title: "5 financial-literacy lessons", tracker: { type: "activity_count", activities: ["financial_lesson"] }, target: 5 },
      ] },
      { number: 3, name: "Chapter III: Compounding", description: "Save with intent.", objectives: [
        { title: "Savings rate ≥ 15%", tracker: { type: "metric_reach", metric: "savings_rate", target: 15, direction: "higher" }, target: 1 },
        { title: "Emergency fund ≥ 3 months", tracker: { type: "metric_reach", metric: "emergency_fund_months", target: 3, direction: "higher" }, target: 1 },
      ] },
      { number: 4, name: "Chapter IV: Awakened", description: "Your chosen milestone.", objectives: [{ title: `Emergency fund ≥ ${efTarget} months`, tracker: { type: "metric_reach", metric: "emergency_fund_months", target: efTarget, direction: "higher" }, target: 1 }] },
    ],
  });
  return arcs.filter((a) => tracks(p, a.attribute));
}

export function mainQuestDrafts(p: ProfileRow, date: ISODate, cfg: XpConfig): QuestDraft[] {
  return storyArcs(p).map((arc) => ({
    kind: "main",
    template_code: arc.code,
    title: arc.title,
    description: arc.tagline,
    attribute_code: arc.attribute,
    difficulty: "S",
    period_start: "2000-01-01", // one instance per player for all time
    period_end: null,
    deadline: null,
    status: "active",
    xp_reward: cfg.mainChapter,
    config: { titleReward: arc.titleReward, storyArc: arc.code, chapters: arc.chapters.map((c) => ({ number: c.number, name: c.name, description: c.description })) },
    objectives: arc.chapters.flatMap((c) => c.objectives.map((o) => ({ ...o, chapter: c.number }))),
  }));
}

// ─────────────────────────────── Emergency quests ───────────────────────────────

/** Optional, time-limited challenges. Declining or expiring has no penalty. */
export function generateEmergencyQuests(p: ProfileRow, date: ISODate, now: Date, cfg: XpConfig, userId: string): QuestDraft[] {
  const out: QuestDraft[] = [];
  if (tracks(p, "INT") && hashString(`emg:${userId}:${date}`) % 3 !== 0) {
    out.push({
      kind: "emergency",
      template_code: "emergency_study_block",
      title: "URGENT STUDY BLOCK",
      description: "A gate has opened. Accept to start a 3-hour window to complete a 45-minute study block. Declining has no penalty.",
      attribute_code: "INT",
      difficulty: "B",
      period_start: date,
      period_end: date,
      deadline: null, // set when accepted
      status: "offered",
      xp_reward: cfg.emergencyQuest,
      config: { baseline: { windowHours: 3 } },
      objectives: [{ title: "45 minutes of study", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 45 }],
    });
  }
  const exam = p.academic_info?.nextExamDate;
  if (exam && exam > date && exam <= addDays(date, 10)) {
    out.push({
      kind: "emergency",
      template_code: `exam_prep_${exam}`,
      title: `PREPARE FOR ${(p.academic_info.nextExamName || "YOUR EXAM").toUpperCase()}`,
      description: `Your examination is on ${exam}. Complete focused preparation before the gate closes.`,
      attribute_code: "INT",
      difficulty: "A",
      period_start: exam,
      period_end: exam,
      deadline: new Date(`${exam}T00:00:00Z`).toISOString(),
      status: "active",
      xp_reward: Math.max(cfg.emergencyQuest, 100),
      config: {},
      objectives: [
        { title: "Two quiz / practice-exam blocks", tracker: { type: "activity_count", activities: ["quiz", "practice_exam"] }, target: 2 },
        { title: "5 hours of exam-focused study", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 300 },
      ],
    });
  }
  void now;
  return out;
}
