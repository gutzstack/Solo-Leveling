import type { ISODate } from "../domain/dates";
import type { AttributeCode, EntryContext, Sex, UnitSystem } from "../domain/types";
import type { QuestCategory } from "../domain/regimen";
import type { XpTransactionRow } from "../domain/xp";

/** Row shapes exactly as stored (snake_case columns, see supabase/migrations). */

export interface ProfileRow {
  user_id: string;
  display_name: string;
  date_of_birth: ISODate | null;
  age_years: number | null;
  country: string;
  height_cm: number | null;
  weight_kg: number | null;
  sex: Sex | null;
  education_level: string | null;
  occupation: string | null;
  goals: string[];
  fitness_experience: string | null;
  academic_info: { program?: string; year?: string; nextExamDate?: string | null; nextExamName?: string | null };
  financial_info: { emergencyFundTargetMonths?: number; savingsTarget?: number | null; trackFinances?: boolean };
  difficulty: "casual" | "normal" | "hard" | "nightmare";
  tracked_categories: AttributeCode[];
  timezone: string;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingsRow {
  user_id: string;
  unit_system: UnitSystem;
  theme: "dark" | "light";
  reduced_motion: boolean;
  sound_enabled: boolean;
  ambient_enabled: boolean;
  ai_enabled: boolean;
  profile_public: boolean;
  xp_config: Record<string, unknown>;
  hunter_weights: Partial<Record<AttributeCode, number>>;
  comparison_preference: "sex_matched" | "all";
  last_login_on: ISODate | null;
  login_streak: number;
  /** absent until migration 0003 is applied */
  regimen?: Record<string, unknown>;
  updated_at: string;
}

export interface CustomMetricRow {
  id: string;
  user_id: string;
  attribute_code: AttributeCode;
  name: string;
  unit_kind: string;
  direction: "higher" | "lower" | "neutral";
  description: string;
  input: "manual";
  is_custom: true;
  config: Record<string, unknown>;
  created_at: string;
}

export interface MetricEntryRow {
  id: string;
  user_id: string;
  metric_id: string;
  value: number;
  recorded_on: ISODate;
  context: EntryContext;
  note: string | null;
  source: "manual" | "onboarding" | "import" | "dungeon";
  idempotency_key: string;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  user_id: string;
  type: string;
  duration_min: number | null;
  quantity: number | null;
  occurred_on: ISODate;
  occurred_at: string;
  details: Record<string, unknown>;
  source: "manual" | "dungeon" | "import" | "trial";
  idempotency_key: string;
  created_at: string;
}

/** Public part of a trial session (the answer key in `state` never leaves the server). */
export interface TrialAttempt {
  itemRating: number;
  correct: boolean;
  ms: number;
  level?: number;
  topic?: string;
  questionId?: string;
}

export interface TrialResultRow {
  id: string;
  user_id: string;
  kind: "reasoning" | "memory" | "speed" | "knowledge";
  status: "active" | "completed" | "abandoned";
  seed: number;
  results: { attempts?: TrialAttempt[]; forward?: number; backward?: number; correct?: number; attempted?: number; rating?: number };
  score: number | null;
  started_at: string;
  completed_at: string | null;
}

export type QuestKind = "daily" | "weekly" | "main" | "emergency" | "custom" | "penalty";
export type QuestStatus = "offered" | "active" | "completed" | "expired" | "abandoned" | "failed" | "exempt";

export interface QuestRow {
  id: string;
  user_id: string;
  kind: QuestKind;
  template_code: string;
  title: string;
  description: string;
  attribute_code: AttributeCode | null;
  difficulty: "E" | "D" | "C" | "B" | "A" | "S";
  period_start: ISODate;
  period_end: ISODate | null;
  deadline: string | null;
  status: QuestStatus;
  xp_reward: number;
  config: {
    titleReward?: string;
    chapters?: { number: number; name: string; description: string }[];
    storyArc?: string;
    habit?: boolean;
    baseline?: Record<string, number>;
    category?: QuestCategory;
    /** failing this quest costs XP (set on quests issued once penalties exist) */
    penalized?: boolean;
    /** XP lost when this quest fails, fixed when it was issued */
    penaltyXp?: number;
    /** Penalty Zone: quests whose failure caused it */
    causes?: string[];
    recoveryPass?: boolean;
  };
  created_at: string;
  completed_at: string | null;
}

export type Tracker =
  | { type: "activity_minutes"; activities: string[]; beyond?: number }
  | { type: "activity_count"; activities: string[]; beyond?: number }
  | { type: "activity_quantity"; activities: string[]; beyond?: number }
  | { type: "metric_logged"; metric: string }
  | { type: "sleep_in_range"; min: number; max: number }
  | { type: "metric_reach"; metric: string; target: number; direction: "higher" | "lower" }
  | { type: "metric_gain"; metric: string; amount: number }
  | { type: "dungeon_clears"; kinds?: string[] }
  | { type: "personal_records" }
  | { type: "perfect_days" }
  | { type: "lifetime_stat"; stat: string }
  | { type: "manual" };

export interface ObjectiveRow {
  id: string;
  quest_id: string;
  user_id: string;
  sort_order: number;
  chapter: number;
  title: string;
  tracker: Tracker;
  target: number;
  manual_progress: number;
  completed_at: string | null;
}

export interface QuestCompletionRow {
  id: string;
  user_id: string;
  quest_id: string;
  chapter: number;
  completed_at: string;
  xp_awarded: number;
}

export interface DungeonSessionRow {
  id: string;
  user_id: string;
  dungeon_code: string;
  mode: "focus" | "pomodoro";
  planned_minutes: number;
  objective: string;
  status: "active" | "paused" | "cleared" | "retreated";
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  last_resumed_at: string | null;
  pause_count: number;
  xp_awarded: number;
  idempotency_key: string;
}

export interface UnlockRow {
  id: string;
  user_id: string;
  unlocked_at: string;
  xp_awarded: number;
}
export interface SkillUnlockRow extends UnlockRow {
  skill_code: string;
}
export interface AchievementUnlockRow extends UnlockRow {
  achievement_code: string;
}
export interface TitleUnlockRow {
  id: string;
  user_id: string;
  title_code: string;
  source: string;
  unlocked_at: string;
}
export interface EquippedTitleRow {
  user_id: string;
  title_code: string;
  equipped_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export interface PercentileResultRow {
  id: string;
  user_id: string;
  metric_id: string;
  distribution_id: string;
  entry_id: string | null;
  value: number;
  percentile: number | null;
  ci_low: number | null;
  ci_high: number | null;
  evidence: "verified" | "estimated";
  rank: string | null;
  computed_at: string;
}

export interface GameData {
  userId: string;
  now: Date;
  today: ISODate;
  profile: ProfileRow;
  settings: SettingsRow;
  customMetrics: CustomMetricRow[];
  entries: MetricEntryRow[];
  activities: ActivityRow[];
  quests: QuestRow[];
  objectives: ObjectiveRow[];
  questCompletions: QuestCompletionRow[];
  sessions: DungeonSessionRow[];
  xp: XpTransactionRow[];
  skillUnlocks: SkillUnlockRow[];
  achievementUnlocks: AchievementUnlockRow[];
  titleUnlocks: TitleUnlockRow[];
  equippedTitle: EquippedTitleRow | null;
  notifications: NotificationRow[];
  trials: TrialResultRow[];
  questionCount: number;
}
