import { addDays, isoWeekday, weekStart, type ISODate } from "../domain/dates";
import { DEFAULT_REGIMEN, type QUEST_CATEGORIES, type QuestCategory, type Regimen } from "../domain/regimen";
import { lbToKg } from "../domain/units";
import type { XpConfig } from "../domain/xp";
import type { AttributeCode, UnitSystem } from "../domain/types";
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

/** A category is on when the regimen enables it and the player tracks a related attribute. */
export function categoryEnabled(p: ProfileRow, r: Regimen, c: (typeof QUEST_CATEGORIES)[number]): boolean {
  if (!r.categories[c]) return false;
  const related: Record<(typeof QUEST_CATEGORIES)[number], AttributeCode[]> = { physical: ["STR", "END", "PHY"], intellectual: ["INT"], mental: ["WIS"], health: ["PHY", "WIS"], social: ["CHA"], discipline: ["DIS"] };
  return related[c].some((a) => tracks(p, a));
}

function daily(date: ISODate, cfg: XpConfig, category: QuestCategory, code: string, title: string, description: string, attribute: AttributeCode, objectives: ObjectiveDraft[], opts: { habit?: boolean; xp?: number; difficulty?: QuestRow["difficulty"] } = {}): QuestDraft {
  return {
    kind: "daily",
    template_code: code,
    title,
    description,
    attribute_code: attribute,
    difficulty: opts.difficulty ?? "D",
    period_start: date,
    period_end: date,
    deadline: null,
    status: "active",
    xp_reward: opts.xp ?? cfg.dailyQuest,
    config: { habit: opts.habit ?? false, category },
    objectives,
  };
}

export function formatRunDistance(km: number, units: UnitSystem): string {
  return units === "imperial" ? `${Math.round((km / 1.609344) * 100) / 100} mi` : `${Math.round(km * 100) / 100} km`;
}

/** Daily quest board: one or more quests per enabled category, built from the player's regimen. */
export function generateDailyQuests(p: ProfileRow, date: ISODate, cfg: XpConfig, _userId: string, r: Regimen = DEFAULT_REGIMEN, units: UnitSystem = "metric"): QuestDraft[] {
  const out: QuestDraft[] = [];

  if (categoryEnabled(p, r, "physical") && r.restDays.includes(isoWeekday(date))) {
    out.push(daily(date, cfg, "physical", "daily_rest", "Scheduled rest day", "No training regimen today. Muscles grow during recovery: log a rest day, a mobility session or an easy walk.", "PHY", [{ title: "Rest, mobility or an easy walk", tracker: { type: "activity_count", activities: ["rest_day", "mobility", "walk"] }, target: 1 }], { habit: true, difficulty: "E" }));
  } else if (categoryEnabled(p, r, "physical")) {
    const objs: ObjectiveDraft[] = [];
    if (r.pushups > 0) objs.push({ title: `${r.pushups} push-ups`, tracker: { type: "activity_quantity", activities: ["pushups"] }, target: r.pushups });
    if (r.situps > 0) objs.push({ title: `${r.situps} sit-ups`, tracker: { type: "activity_quantity", activities: ["situps"] }, target: r.situps });
    if (r.squats > 0) objs.push({ title: `${r.squats} squats`, tracker: { type: "activity_quantity", activities: ["squats"] }, target: r.squats });
    if (r.dips > 0) objs.push({ title: `${r.dips} dips`, tracker: { type: "activity_quantity", activities: ["dips"] }, target: r.dips });
    if (r.pullups > 0) objs.push({ title: `${r.pullups} pull-ups`, tracker: { type: "activity_quantity", activities: ["pullups"] }, target: r.pullups });
    if (r.runKm > 0) objs.push({ title: `Run ${formatRunDistance(r.runKm, units)}`, tracker: { type: "activity_quantity", activities: ["run"] }, target: Math.round(r.runKm * 100) / 100 });
    if (objs.length)
      out.push(
        daily(date, cfg, "physical", "daily_regimen", "PREPARATIONS TO BECOME POWERFUL", "The daily training regimen. Log reps in as many sets as you like. Clear it on every training day but one and next week's targets rise; failing it opens the Penalty Zone.", "STR", objs, {
          xp: cfg.dailyQuest * objs.length,
          difficulty: "C",
        }),
      );
  }

  if (out.some((q) => q.template_code === "daily_regimen")) {
    out.push(daily(date, cfg, "physical", "daily_stretch", "Stretch after training", "Ten minutes of stretching or mobility once the regimen is done. Cheap insurance against the injuries that cost whole weeks.", "PHY", [{ title: "10 minutes of stretching", tracker: { type: "activity_minutes", activities: ["mobility"] }, target: 10 }], { habit: true }));
  }

  if (categoryEnabled(p, r, "discipline")) {
    out.push(daily(date, cfg, "discipline", "daily_plan", "Plan the day: top 3 priorities", "Two minutes, ideally first thing: write down the three things that would make today a win.", "DIS", [{ title: "Lock in today's top 3", tracker: { type: "activity_count", activities: ["daily_plan"] }, target: 1 }], { habit: true }));
  }

  if (categoryEnabled(p, r, "intellectual")) {
    const mins = r.studyMinutes ?? scale(90, p, 15);
    if (mins > 0) out.push(daily(date, cfg, "intellectual", "daily_study", `Complete ${mins} minutes of focused study`, "Deep, distraction-free study. Dungeon sessions count.", "INT", [{ title: `Study ${mins} minutes`, tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: mins }]));
    if (r.dailyTrial) out.push(daily(date, cfg, "intellectual", "daily_trial", "Complete a System Trial", "Any trial counts: reasoning, memory, speed or knowledge.", "INT", [{ title: "1 System Trial", tracker: { type: "activity_count", activities: ["system_trial"] }, target: 1 }]));
  }

  if (categoryEnabled(p, r, "mental")) {
    out.push(daily(date, cfg, "mental", "daily_reflection", "Reflect or meditate", "Three minutes of reflection or five of mindfulness: what went well, what you learned, tomorrow's priority.", "WIS", [{ title: "Reflection or meditation", tracker: { type: "activity_count", activities: ["reflection", "mindfulness"] }, target: 1 }], { habit: true }));
  }

  if (categoryEnabled(p, r, "health")) {
    out.push(daily(date, cfg, "health", "daily_sleep", "Get adequate sleep (7–9 h)", "Log last night's sleep. 7–9 hours is the goal: not less, and no bonus for more.", "PHY", [{ title: "Log sleep within 7–9 h", tracker: { type: "sleep_in_range", min: 7, max: 9 }, target: 1 }], { habit: true }));
  }

  if (categoryEnabled(p, r, "social")) {
    out.push(daily(date, cfg, "social", "daily_connection", "Reach out to someone who matters", "A call, a coffee, a meaningful message.", "CHA", [{ title: "Relationship maintenance", tracker: { type: "activity_count", activities: ["social_connection", "communication", "networking"] }, target: 1 }]));
  }
  return out;
}

/**
 * The Penalty Zone: issued the day after daily quests fail. It demands the unfinished work on top of
 * the new day's own quests, and failing it costs double.
 */
export function penaltyZoneDraft(date: ISODate, failed: { quest: QuestRow; remaining: { title: string; tracker: Tracker; amount: number }[] }[], todays: QuestDraft[], failPenalty: number): QuestDraft | null {
  const objectives: ObjectiveDraft[] = [];
  for (const f of failed)
    for (const rem of f.remaining) {
      const t = rem.tracker;
      if (t.type !== "activity_quantity" && t.type !== "activity_minutes" && t.type !== "activity_count") continue;
      const same = (x: Tracker) => x.type === t.type && JSON.stringify([...(x as { activities: string[] }).activities].sort()) === JSON.stringify([...t.activities].sort());
      const beyond = todays.flatMap((d) => d.objectives).filter((o) => same(o.tracker)).reduce((a, o) => a + o.target, 0);
      const amount = Math.round(rem.amount * 100) / 100;
      objectives.push({ title: `Unfinished: ${rem.title} (${amount} left)`, tracker: { ...t, beyond }, target: amount });
    }
  if (!objectives.length) return null;
  return {
    kind: "penalty",
    template_code: "penalty_zone",
    title: "PENALTY ZONE",
    description: `You failed to complete yesterday's quests. Finish the remaining work today, on top of today's quests, before midnight. Failure costs ${failPenalty} XP.`,
    attribute_code: "DIS",
    difficulty: "A",
    period_start: date,
    period_end: date,
    deadline: null,
    status: "active",
    xp_reward: 0,
    config: { category: "discipline", penalized: true, penaltyXp: failPenalty, causes: failed.map((f) => f.quest.id) },
    objectives: objectives.slice(0, 12),
  };
}

function weekly(ws: ISODate, cfg: XpConfig, category: QuestCategory, code: string, title: string, description: string, attribute: AttributeCode, objectives: ObjectiveDraft[]): QuestDraft {
  return { kind: "weekly", template_code: code, title, description, attribute_code: attribute, difficulty: "C", period_start: ws, period_end: addDays(ws, 6), deadline: null, status: "active", xp_reward: cfg.weeklyQuest, config: { category }, objectives };
}

export function generateWeeklyQuests(p: ProfileRow, date: ISODate, cfg: XpConfig): QuestDraft[] {
  const ws = weekStart(date);
  const out: QuestDraft[] = [];
  if (tracks(p, "INT")) {
    const hours = scale(15, p, 1);
    out.push(weekly(ws, cfg, "intellectual", "weekly_study", `Study ${hours} focused hours`, "Spread across the week. Five 3-hour days beats one 15-hour panic.", "INT", [{ title: `${hours} hours of study`, tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: hours * 60 }]));
    out.push(weekly(ws, cfg, "intellectual", "weekly_reviews", "Finish all scheduled academic reviews", "Clear your review backlog and sit one practice block.", "INT", [
      { title: "Complete scheduled reviews (confirm)", tracker: { type: "manual" }, target: 1 },
      { title: "One quiz or practice-exam block", tracker: { type: "activity_count", activities: ["quiz", "practice_exam"] }, target: 1 },
    ]));
  }
  out.push(weekly(ws, cfg, "discipline", "weekly_flawless", "Clear every daily quest on 5 days", "Consistency is the real stat. Days waived with a recovery pass don't count.", "DIS", [{ title: "5 flawless days", tracker: { type: "perfect_days" }, target: 5 }]));
  out.push(weekly(ws, cfg, "discipline", "weekly_dungeons", "Clear 3 dungeons", "Three focus sessions of any type.", "DIS", [{ title: "3 dungeons cleared", tracker: { type: "dungeon_clears" }, target: 3 }]));
  out.push(weekly(ws, cfg, "discipline", "weekly_improve", "Improve a personal metric", "Set a new personal record on any tracked performance metric.", "DIS", [{ title: "1 personal record", tracker: { type: "personal_records" }, target: 1 }]));
  if (tracks(p, "WLT")) {
    out.push(weekly(ws, cfg, "financial", "weekly_finance", "Financial check-in", "Review your budget and log your savings balance.", "WLT", [
      { title: "Budget review", tracker: { type: "activity_count", activities: ["financial_review"] }, target: 1 },
      { title: "Log savings", tracker: { type: "metric_logged", metric: "savings" }, target: 1 },
    ]));
  }
  if (tracks(p, "CHA")) {
    out.push(weekly(ws, cfg, "social", "weekly_social", "Strengthen your bonds", "Two intentional social or professional connections.", "CHA", [{ title: "2 connections", tracker: { type: "activity_count", activities: ["social_connection", "networking", "communication", "mentoring", "volunteering"] }, target: 2 }]));
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
    title: "THE SCHOLAR'S ASCENSION",
    tagline: "Master your chosen field of study, one focused hour at a time.",
    attribute: "INT",
    titleReward: "white_coat",
    chapters: [
      { number: 1, name: "Chapter I: The Foundations", description: "Set your baseline and build the study habit.", objectives: [
        { title: "Complete 3 System Trials", tracker: { type: "lifetime_stat", stat: "trials_completed" }, target: 3 },
        { title: "20 focused study hours", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 1200 },
      ] },
      { number: 2, name: "Chapter II: The Gauntlet of Knowledge", description: "Volume and pressure.", objectives: [
        { title: "100 focused study hours", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 6000 },
        { title: "Defeat 3 boss dungeons", tracker: { type: "dungeon_clears", kinds: ["boss_exam"] }, target: 3 },
      ] },
      { number: 3, name: "Chapter III: The Proving Grounds", description: "Apply what you know under pressure.", objectives: [
        { title: "25 quiz or practice-exam blocks", tracker: { type: "activity_count", activities: ["quiz", "practice_exam"] }, target: 25 },
        { title: "Reasoning rating ≥ 1150", tracker: { type: "metric_reach", metric: "reasoning_rating", target: 1150, direction: "higher" }, target: 1 },
      ] },
      { number: 4, name: "Chapter IV: The Examiner's Trial", description: "Prove it on exams.", objectives: [
        { title: "Course exam average ≥ 90%", tracker: { type: "metric_reach", metric: "exam_average", target: 90, direction: "higher" }, target: 1 },
        { title: "10 practice examinations", tracker: { type: "activity_count", activities: ["practice_exam"] }, target: 10 },
      ] },
      { number: 5, name: "Chapter V: Ascension", description: "Mastery.", objectives: [
        { title: "300 focused study hours", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 18000 },
        { title: "Knowledge rating ≥ 1300", tracker: { type: "metric_reach", metric: "knowledge_rating", target: 1300, direction: "higher" }, target: 1 },
      ] },
    ],
  });
  arcs.push({
    code: "main_titan",
    title: "THE TITAN'S BODY",
    tagline: "Build lean muscle slowly and sustainably: +5 lb, then +10 lb.",
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
    tagline: "Climb the 5K ladder, from your first timed run to sub-20.",
    attribute: "END",
    titleReward: "limiter_broken",
    chapters: [
      { number: 1, name: "Chapter I: First Steps", description: "Build the habit and set a baseline.", objectives: [
        { title: "Run 25 km", tracker: { type: "activity_quantity", activities: ["run"] }, target: 25 },
        { title: "Log a timed 5K", tracker: { type: "metric_logged", metric: "run_5k" }, target: 1 },
      ] },
      { number: 2, name: "Chapter II: The 30-Minute Gate", description: "Run the whole way.", objectives: [{ title: "Current 5K ≤ 30:00", tracker: { type: "metric_reach", metric: "run_5k", target: 1800, direction: "lower" }, target: 1 }] },
      { number: 3, name: "Chapter III: The 25-Minute Wall", description: "Add tempo and intervals.", objectives: [
        { title: "Run 100 km in total", tracker: { type: "activity_quantity", activities: ["run"] }, target: 100 },
        { title: "Current 5K ≤ 25:00", tracker: { type: "metric_reach", metric: "run_5k", target: 1500, direction: "lower" }, target: 1 },
      ] },
      { number: 4, name: "Chapter IV: Uncharted Pace", description: "Threshold work pays off.", objectives: [{ title: "Current 5K ≤ 22:30", tracker: { type: "metric_reach", metric: "run_5k", target: 1350, direction: "lower" }, target: 1 }] },
      { number: 5, name: "Chapter V: Break the Limiter", description: "Sub-20.", objectives: [{ title: "Current 5K under 20:00", tracker: { type: "metric_reach", metric: "run_5k", target: 1199, direction: "lower" }, target: 1 }] },
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

/** Optional, time-limited challenges. Declining an offer is free; an accepted gate that closes unfinished is failed. */
export function generateEmergencyQuests(p: ProfileRow, date: ISODate, now: Date, cfg: XpConfig, userId: string): QuestDraft[] {
  const out: QuestDraft[] = [];
  if (tracks(p, "INT") && hashString(`emg:${userId}:${date}`) % 3 !== 0) {
    out.push({
      kind: "emergency",
      template_code: "emergency_study_block",
      title: "URGENT STUDY BLOCK",
      description: "A gate has opened. Accept to start a 3-hour window to complete a 45-minute study block. Declining is free; accepting and failing costs XP.",
      config: { category: "intellectual", baseline: { windowHours: 3 } },
      attribute_code: "INT",
      difficulty: "B",
      period_start: date,
      period_end: date,
      deadline: null, // set when accepted
      status: "offered",
      xp_reward: cfg.emergencyQuest,
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
      config: { category: "intellectual" },
      objectives: [
        { title: "Two quiz / practice-exam blocks", tracker: { type: "activity_count", activities: ["quiz", "practice_exam"] }, target: 2 },
        { title: "5 hours of exam-focused study", tracker: { type: "activity_minutes", activities: ["study", "quiz", "practice_exam"] }, target: 300 },
      ],
    });
  }
  void now;
  return out;
}
