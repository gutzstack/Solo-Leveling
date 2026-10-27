import { z } from "zod";
import { ACTIVITY_BY_TYPE } from "../domain/activities";
import { isISODate, isValidTimeZone } from "../domain/dates";
import { DUNGEON_BY_CODE } from "../domain/dungeons";
import { RegimenSchema } from "../domain/regimen";
import { ATTRIBUTE_CODES } from "../domain/types";

const isoDate = z.string().refine(isISODate, "invalid date (YYYY-MM-DD)");
const idemKey = z.string().min(8).max(100).regex(/^[A-Za-z0-9_:-]+$/);
const uuid = z.string().uuid();
const attribute = z.enum(ATTRIBUTE_CODES);
const difficulty = z.enum(["E", "D", "C", "B", "A", "S"]);

export const ProfileInputSchema = z.object({
  display_name: z.string().trim().min(1).max(40),
  date_of_birth: isoDate.nullable(),
  age_years: z.number().int().min(13).max(120).nullable(),
  country: z.string().trim().min(2).max(56),
  height_cm: z.number().min(100).max(250).nullable(),
  weight_kg: z.number().min(25).max(350).nullable(),
  sex: z.enum(["male", "female"]).nullable(),
  education_level: z.string().trim().max(80).nullable(),
  occupation: z.string().trim().max(80).nullable(),
  goals: z.array(z.string().trim().min(1).max(200)).max(12),
  fitness_experience: z.string().trim().max(80).nullable(),
  academic_info: z.object({ program: z.string().max(120).optional(), year: z.string().max(40).optional(), nextExamDate: isoDate.nullable().optional(), nextExamName: z.string().max(80).nullable().optional() }),
  financial_info: z.object({ emergencyFundTargetMonths: z.number().min(1).max(24).optional(), savingsTarget: z.number().min(0).max(1e9).nullable().optional(), trackFinances: z.boolean().optional() }),
  difficulty: z.enum(["casual", "normal", "hard", "nightmare"]),
  tracked_categories: z.array(attribute).min(1),
  timezone: z.string().refine(isValidTimeZone, "unknown time zone"),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

const MetricValue = z.number().finite().min(-1e10).max(1e10);

export const InitialMetricSchema = z.object({
  metricId: z.string().regex(/^[a-z0-9_]{2,64}$/),
  value: MetricValue,
  context: z.enum(["current", "historical", "test"]),
  recordedOn: isoDate,
  note: z.string().max(500).optional(),
});

const ManualTracker = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activity_minutes"), activities: z.array(z.string()).min(1).max(5) }),
  z.object({ type: z.literal("activity_count"), activities: z.array(z.string()).min(1).max(5) }),
  z.object({ type: z.literal("activity_quantity"), activities: z.array(z.string()).min(1).max(5) }),
  z.object({ type: z.literal("metric_logged"), metric: z.string() }),
  z.object({ type: z.literal("metric_reach"), metric: z.string(), target: MetricValue, direction: z.enum(["higher", "lower"]) }),
  z.object({ type: z.literal("manual") }),
]);

export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("complete_onboarding"), profile: ProfileInputSchema, metrics: z.array(InitialMetricSchema).max(100), unit_system: z.enum(["imperial", "metric"]) }),
  z.object({ type: z.literal("update_profile"), profile: ProfileInputSchema }),
  z.object({
    type: z.literal("update_settings"),
    settings: z
      .object({
        unit_system: z.enum(["imperial", "metric"]),
        theme: z.enum(["dark", "light"]),
        reduced_motion: z.boolean(),
        sound_enabled: z.boolean(),
        ambient_enabled: z.boolean(),
        ai_enabled: z.boolean(),
        profile_public: z.boolean(),
        comparison_preference: z.enum(["sex_matched", "all"]),
        hunter_weights: z.record(attribute, z.number().min(0).max(10)),
        xp_config: z.record(z.string(), z.unknown()),
        regimen: RegimenSchema,
      })
      .partial(),
  }),
  z.object({ type: z.literal("log_metric"), metricId: z.string().regex(/^[a-z0-9_]{2,64}$/), value: MetricValue, recordedOn: isoDate, context: z.enum(["current", "historical", "test"]), note: z.string().max(500).optional(), idempotencyKey: idemKey }),
  z.object({ type: z.literal("delete_metric_entry"), entryId: uuid }),
  z.object({
    type: z.literal("log_activity"),
    activity: z.string().refine((t) => Boolean(ACTIVITY_BY_TYPE[t]) && t !== "system_trial", "unknown activity (System Trials are logged automatically when you complete one)"),
    durationMin: z.number().min(0).max(1440).nullable(),
    quantity: z.number().min(0).max(1e7).nullable(),
    occurredOn: isoDate,
    note: z.string().max(500).optional(),
    idempotencyKey: idemKey,
    confirmDuplicate: z.boolean().optional(),
  }),
  z.object({ type: z.literal("delete_activity"), activityId: uuid }),
  z.object({ type: z.literal("set_objective"), objectiveId: uuid, done: z.boolean() }),
  z.object({ type: z.literal("accept_quest"), questId: uuid }),
  z.object({ type: z.literal("dismiss_quest"), questId: uuid }),
  z.object({ type: z.literal("abandon_quest"), questId: uuid }),
  z.object({ type: z.literal("use_recovery_pass") }),
  z.object({ type: z.literal("open_chest"), itemId: uuid }),
  z.object({ type: z.literal("use_item"), itemId: uuid }),
  z.object({ type: z.literal("buy_item"), code: z.enum(["xp_elixir", "penalty_shield", "recovery_pass"]), idempotencyKey: idemKey }),
  z.object({ type: z.literal("buy_reward"), rewardId: uuid, idempotencyKey: idemKey }),
  z.object({ type: z.literal("create_reward"), name: z.string().trim().min(1).max(80), description: z.string().trim().max(300), price: z.number().int().min(1).max(1_000_000) }),
  z.object({ type: z.literal("update_reward"), rewardId: uuid, name: z.string().trim().min(1).max(80), description: z.string().trim().max(300), price: z.number().int().min(1).max(1_000_000) }),
  z.object({ type: z.literal("delete_reward"), rewardId: uuid }),
  z.object({
    type: z.literal("create_custom_quest"),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(500),
    attribute,
    difficulty,
    deadline: z.string().datetime().nullable(),
    objectives: z.array(z.object({ title: z.string().trim().min(1).max(160), tracker: ManualTracker, target: z.number().positive().max(1e7) })).min(1).max(8),
    idempotencyKey: idemKey,
  }),
  z.object({
    type: z.literal("create_custom_metric"),
    name: z.string().trim().min(2).max(60),
    attribute,
    unit: z.enum(["count", "reps", "mass", "duration", "distance", "percent", "hours", "minutes", "currency", "rating", "score"]),
    direction: z.enum(["higher", "lower", "neutral"]),
    description: z.string().trim().max(300),
  }),
  z.object({ type: z.literal("delete_custom_metric"), metricId: z.string().regex(/^custom_[a-z0-9_]+$/) }),
  z.object({
    type: z.literal("start_dungeon"),
    code: z.string().refine((c) => Boolean(DUNGEON_BY_CODE[c]), "unknown dungeon"),
    minutes: z.number().int().min(5).max(600),
    mode: z.enum(["focus", "pomodoro"]),
    objective: z.string().trim().max(200),
    activity: z.string().refine((t) => Boolean(ACTIVITY_BY_TYPE[t]), "unknown activity").optional(),
    idempotencyKey: idemKey,
  }),
  z.object({ type: z.literal("pause_dungeon"), sessionId: uuid }),
  z.object({ type: z.literal("resume_dungeon"), sessionId: uuid }),
  z.object({ type: z.literal("complete_dungeon"), sessionId: uuid, distanceKm: z.number().min(0).max(500).nullable().optional(), scorePct: z.number().min(0).max(100).nullable().optional(), volumeKg: z.number().min(0).max(1e6).nullable().optional() }),
  z.object({ type: z.literal("retreat_dungeon"), sessionId: uuid }),
  z.object({ type: z.literal("equip_title"), titleCode: z.string().max(60).nullable() }),
  z.object({ type: z.literal("mark_notifications_read"), ids: z.array(uuid).max(200).optional() }),
  z.object({ type: z.literal("daily_login") }),
  z.object({ type: z.literal("trial_completed"), sessionId: uuid }),
  z.object({ type: z.literal("sync") }),
]);
export type Command = z.infer<typeof CommandSchema>;

export type GameEvent =
  | { type: "xp"; amount: number; reason: string; attribute: string | null }
  | { type: "xp_withheld"; reason: string }
  | { type: "level_up"; from: number; to: number }
  | { type: "attribute_level_up"; attribute: string; from: number; to: number }
  | { type: "rank_up"; scope: "hunter" | "metric" | "attribute"; name: string; from: string | null; to: string }
  | { type: "personal_record"; metricId: string; name: string; value: number; previous: number }
  | { type: "baseline"; metricId: string; name: string }
  | { type: "achievement"; code: string; name: string; rarity: string; xp: number; description: string }
  | { type: "skill"; code: string; name: string; xp: number }
  | { type: "quest_complete"; title: string; kind: string; xp: number }
  | { type: "chapter_complete"; questTitle: string; chapter: string; xp: number; final: boolean }
  | { type: "title_unlocked"; code: string; name: string }
  | { type: "dungeon_clear"; name: string; xp: number; boss: string | null; uninterrupted: boolean }
  | { type: "dungeon_retreat"; name: string; creditedMinutes: number; penalty?: number }
  | { type: "daily_login"; streak: number; firstToday: boolean; newQuests: number; penalties?: { xp: number; failed: string[]; zone: boolean; zoneFailed: boolean } }
  | { type: "penalty"; title: string; body: string; xp: number; zone: boolean }
  | { type: "shielded"; reason: string }
  | { type: "gold"; amount: number; reason: string }
  | { type: "chest"; rarity: "common" | "rare" | "epic" | "legendary" }
  | { type: "chest_opened"; rarity: "common" | "rare" | "epic" | "legendary"; gold: number; items: string[]; title: string | null }
  | { type: "purchase"; name: string; price: number }
  | { type: "duplicate_warning"; message: string }
  | { type: "info"; title: string; body: string };

const dateLike = z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((s) => s.slice(0, 10)).refine(isISODate, "invalid date");

/** Accepts SYSTEM IRL exports (version 1). Unknown fields are ignored. */
export const ImportSchema = z.object({
  format: z.literal("system-irl-export"),
  version: z.literal(1),
  customMetrics: z.array(z.object({ id: z.string(), name: z.string().min(2).max(60), attribute_code: attribute, unit_kind: z.enum(["count", "reps", "mass", "duration", "distance", "percent", "hours", "minutes", "currency", "rating", "score"]), direction: z.enum(["higher", "lower", "neutral"]), description: z.string().max(300).nullable().optional() })).max(50).default([]),
  metricEntries: z.array(z.object({ id: z.string(), metric_id: z.string().max(64), value: MetricValue, recorded_on: dateLike, context: z.enum(["current", "historical", "test"]), note: z.string().max(500).nullable().optional(), idempotency_key: z.string().max(120).optional() })).max(20000).default([]),
  activities: z.array(z.object({ id: z.string(), type: z.string().max(40), duration_min: z.number().min(0).max(1440).nullable(), quantity: z.number().min(0).max(1e7).nullable(), occurred_on: dateLike, occurred_at: z.string().datetime().optional(), details: z.record(z.string(), z.unknown()).optional(), idempotency_key: z.string().max(120).optional() })).max(20000).default([]),
});
