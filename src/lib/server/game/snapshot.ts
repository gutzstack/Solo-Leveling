import { TITLE_BY_CODE, type TitleDef } from "../../domain/titles";
import type { LevelProgress } from "../../domain/xp";
import type { Evaluation, AchievementView, QuestView, SkillView } from "../../game/evaluate";
import type { AttributeSummary, HunterSummary } from "../../game/hunter";
import type { MetricState } from "../../game/metric-state";
import type { ActivityRow, DungeonSessionRow, GameData, NotificationRow, ProfileRow, SettingsRow } from "../../game/rows";
import { BENCHMARK_SOURCES } from "../../percentile/registry";
import type { BenchmarkSource } from "../../percentile/registry-schema";
import type { XpConfig } from "../../domain/xp";

export interface PlayerSnapshot {
  backend: "local" | "supabase";
  today: string;
  serverTime: string;
  profile: ProfileRow;
  settings: SettingsRow;
  xpConfig: XpConfig;
  player: {
    level: LevelProgress;
    effortXp: number;
    performanceXp: number;
    streak: number;
    longestStreak: number;
    equippedTitle: TitleDef | null;
    titles: (TitleDef & { unlockedAt: string; source: string })[];
  };
  attributes: AttributeSummary[];
  hunter: HunterSummary;
  metrics: MetricState[];
  quests: QuestView[];
  skills: SkillView[];
  achievements: AchievementView[];
  activeSession: (DungeonSessionRow & { activeSecondsNow: number }) | null;
  recentSessions: DungeonSessionRow[];
  activities: ActivityRow[];
  xpLedger: { id: string; amount: number; kind: string; attribute: string | null; reason: string; awarded_on: string; created_at: string; reversed: boolean }[];
  activeDays: string[];
  notifications: NotificationRow[];
  sources: BenchmarkSource[];
}

export function buildSnapshot(data: GameData, ev: Evaluation, backend: "local" | "supabase"): PlayerSnapshot {
  const reversed = new Set(data.xp.filter((x) => x.reverses_id).map((x) => x.reverses_id));
  const titles = data.titleUnlocks
    .map((t) => (TITLE_BY_CODE[t.title_code] ? { ...TITLE_BY_CODE[t.title_code], unlockedAt: t.unlocked_at, source: t.source } : null))
    .filter((t): t is NonNullable<typeof t> => t !== null);
  // Only today's offers and still-relevant quests go to the board; history stays available for analytics.
  const cutoff = new Date(data.now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);
  return {
    backend,
    today: data.today,
    serverTime: data.now.toISOString(),
    profile: data.profile,
    settings: data.settings,
    xpConfig: ev.cfg,
    player: {
      level: ev.level,
      effortXp: ev.totals.effort,
      performanceXp: ev.totals.performance,
      streak: ev.stats.currentStreak,
      longestStreak: ev.stats.longestStreak,
      equippedTitle: data.equippedTitle ? (TITLE_BY_CODE[data.equippedTitle.title_code] ?? null) : null,
      titles,
    },
    attributes: ev.attributes,
    hunter: ev.hunter,
    metrics: ev.metrics,
    quests: ev.quests.filter((q) => q.kind === "main" || q.period_start >= cutoff),
    skills: ev.skills,
    achievements: ev.achievements,
    activeSession: ev.activeSession,
    recentSessions: data.sessions.slice(-30).reverse(),
    activities: data.activities,
    xpLedger: data.xp.map((x) => ({ id: x.id, amount: x.amount, kind: x.kind, attribute: x.attribute_code, reason: x.reason, awarded_on: x.awarded_on, created_at: x.created_at, reversed: reversed.has(x.id) })),
    activeDays: [...ev.stats.activeDays].sort(),
    notifications: data.notifications,
    sources: BENCHMARK_SOURCES,
  };
}
