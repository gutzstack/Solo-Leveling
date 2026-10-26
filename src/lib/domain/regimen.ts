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

export const RegimenSchema = z.object({
  categories: z
    .object({ physical: z.boolean().default(true), intellectual: z.boolean().default(true), mental: z.boolean().default(true), health: z.boolean().default(true), social: z.boolean().default(true) })
    .default({ physical: true, intellectual: true, mental: true, health: true, social: true }),
  pushups: reps(100),
  situps: reps(100),
  pullups: reps(100),
  runKm: z.number().min(0).max(50).default(5),
  /** null = scale 90 minutes by difficulty */
  studyMinutes: z.number().int().min(0).max(600).nullable().default(null),
  dailyTrial: z.boolean().default(true),
  /** Recovery passes waive one day's physical quests (illness, injury, planned rest). */
  recoveryPassesPerWeek: z.number().int().min(0).max(2).default(1),
});
export type Regimen = z.infer<typeof RegimenSchema>;

export const DEFAULT_REGIMEN: Regimen = RegimenSchema.parse({});

export function resolveRegimen(raw: unknown): Regimen {
  const parsed = RegimenSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_REGIMEN;
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
