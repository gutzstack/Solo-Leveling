import { z } from "zod";

/**
 * The player's daily regimen: the fixed targets behind each day's quests, grouped into categories.
 * Every field has a default, so an empty settings object yields the standard regimen.
 * Changes apply from the next quest board, never to quests already issued.
 */
export const QUEST_CATEGORIES = ["physical", "intellectual", "mental", "health", "social"] as const;
export type QuestCategory = (typeof QUEST_CATEGORIES)[number] | "financial" | "discipline";

export const CATEGORY_INFO: Record<QuestCategory, { name: string; blurb: string }> = {
  physical: { name: "Physical", blurb: "The daily training regimen. Strength and endurance." },
  intellectual: { name: "Intellectual", blurb: "Study and System Trials. Sharpen the mind." },
  mental: { name: "Mental", blurb: "Reflection and mindfulness. Command yourself." },
  health: { name: "Health & Recovery", blurb: "Sleep and nutrition. The body rebuilds here." },
  social: { name: "Social", blurb: "Bonds with the people who matter." },
  financial: { name: "Financial", blurb: "Money habits." },
  discipline: { name: "Discipline", blurb: "Consistency across everything." },
};

const reps = (d: number) => z.number().int().min(0).max(1000).default(d);
const km = (d: number) => z.number().min(0).max(50).default(d);

/** 1.5 miles, rounded to 10 m. */
export const START_RUN_KM = 2.41;

export const ProgressionSchema = z.object({
  /** Re-evaluated every Monday from the previous week's regimen days. */
  enabled: z.boolean().default(true),
  repStep: z.number().int().min(0).max(50).default(5),
  /** pull-ups and dips */
  pullupStep: z.number().int().min(0).max(50).default(3),
  /** ≈ 0.25 mi */
  runStepKm: z.number().min(0).max(5).default(0.4),
  /** training days you may miss in a week and still level up */
  allowedMisses: z.number().int().min(0).max(5).default(1),
  goal: z.object({ pushups: reps(100), situps: reps(100), squats: reps(100), dips: reps(100), pullups: reps(100), runKm: km(5) }).prefault({}),
});

export const RegimenSchema = z.object({
  categories: z.object({ physical: z.boolean().default(true), intellectual: z.boolean().default(true), mental: z.boolean().default(true), health: z.boolean().default(true), social: z.boolean().default(true) }).prefault({}),
  pushups: reps(35),
  situps: reps(35),
  squats: reps(35),
  dips: reps(35),
  pullups: reps(35),
  runKm: km(START_RUN_KM),
  /** ISO weekdays (1 = Monday … 7 = Sunday) with no training regimen, only a recovery quest. */
  restDays: z.array(z.number().int().min(1).max(7)).max(4).default([3, 7]),
  progression: ProgressionSchema.prefault({}),
  /** week (Monday) the progression was last applied for */
  progressedWeek: z.string().nullable().default(null),
  /** null = scale 90 minutes by difficulty */
  studyMinutes: z.number().int().min(0).max(600).nullable().default(null),
  dailyTrial: z.boolean().default(true),
  /** Recovery passes waive one day's physical quests (illness, injury). */
  recoveryPassesPerWeek: z.number().int().min(0).max(2).default(1),
});
export type Regimen = z.infer<typeof RegimenSchema>;

export const DEFAULT_REGIMEN: Regimen = RegimenSchema.parse({});

export function resolveRegimen(raw: unknown): Regimen {
  const parsed = RegimenSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_REGIMEN;
}

export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type ProgressionChange = "up" | "down" | "hold";

/**
 * Weekly auto-progression. `trained` = regimen days issued last week (rest days and recovery
 * passes excluded), `cleared` = how many of them were completed.
 *  - miss at most `allowedMisses` → every target rises one step, capped at the goal;
 *  - clear fewer than half → targets drop one step (never below 10 reps / 1 km);
 *  - otherwise hold. Fewer than 3 training days (a new player, a short week) always holds.
 */
export function progressRegimen(r: Regimen, cleared: number, trained: number): { next: Regimen; change: ProgressionChange } {
  const pr = r.progression;
  if (!pr.enabled || trained < 3) return { next: r, change: "hold" };
  const change: ProgressionChange = cleared >= trained - pr.allowedMisses ? "up" : cleared < trained / 2 ? "down" : "hold";
  if (change === "hold") return { next: r, change };
  const move = (cur: number, step: number, goal: number, floor: number) => {
    if (cur <= 0) return cur;
    if (change === "up") return cur >= goal ? cur : Math.min(goal, cur + step);
    return Math.max(Math.min(floor, cur), cur - step);
  };
  const round = (x: number) => Math.round(x * 100) / 100;
  const next: Regimen = {
    ...r,
    pushups: move(r.pushups, pr.repStep, pr.goal.pushups, 10),
    situps: move(r.situps, pr.repStep, pr.goal.situps, 10),
    squats: move(r.squats, pr.repStep, pr.goal.squats, 10),
    dips: move(r.dips, pr.pullupStep, pr.goal.dips, 10),
    pullups: move(r.pullups, pr.pullupStep, pr.goal.pullups, 10),
    runKm: round(move(r.runKm, pr.runStepKm, pr.goal.runKm, 1)),
  };
  const same = next.pushups === r.pushups && next.situps === r.situps && next.squats === r.squats && next.dips === r.dips && next.pullups === r.pullups && next.runKm === r.runKm;
  return { next, change: same ? "hold" : change };
}

// ─────────────────────────────── Penalties ───────────────────────────────

/** Penalty severity follows the player's chosen difficulty. */
export const PENALTY_MULTIPLIER = { casual: 0.5, normal: 1, hard: 1.5, nightmare: 2 } as const;
export type PenaltyDifficulty = keyof typeof PENALTY_MULTIPLIER;

/** Failing a quest costs the XP it would have paid, scaled by difficulty. */
export function questPenalty(xpReward: number, difficulty: PenaltyDifficulty): number {
  return Math.max(5, Math.round(xpReward * PENALTY_MULTIPLIER[difficulty]));
}

/** Failing a Penalty Zone costs double what the original failures cost. */
export const PENALTY_ZONE_FAIL_FACTOR = 2;
export const DUNGEON_RETREAT_PENALTY = 15;
export const TRIAL_ABANDON_PENALTY = 10;
/** Missed days that are filled in (and failed) when the player returns after time away. */
export const MAX_BACKFILL_DAYS = 7;

export function flatPenalty(base: number, difficulty: PenaltyDifficulty): number {
  return Math.max(1, Math.round(base * PENALTY_MULTIPLIER[difficulty]));
}
