import { ACHIEVEMENTS, type AchievementDef } from "../domain/achievements";
import { activeSecondsNow } from "../domain/dungeons";
import { rankIndex } from "../domain/ranks";
import { requirementMet, requirementProgress, SKILLS, type SkillDef } from "../domain/skills";
import { TITLE_BY_CODE } from "../domain/titles";
import { levelFromXp, resolveXpConfig, sumLedger, type LevelProgress, type XpConfig, type XpTotals } from "../domain/xp";
import { hunterRank, summarizeAttributes, type AttributeSummary, type HunterSummary } from "./hunter";
import { computeMetricStates, type MetricState } from "./metric-state";
import { currentChapter, objectiveProgress, type ObjectiveProgress } from "./quest-progress";
import { computeStats, type Stats } from "./stats";
import type { DungeonSessionRow, GameData, ObjectiveRow, QuestRow } from "./rows";

export interface QuestView extends QuestRow {
  objectives: (ObjectiveRow & { progress: ObjectiveProgress; locked: boolean })[];
  progress: number;
  allDone: boolean;
  completedChapters: number[];
  currentChapter: number | null;
}

export interface SkillView extends SkillDef {
  unlocked: boolean;
  unlockedAt: string | null;
  available: boolean;
  progress: number;
  current: number | null;
}

export interface AchievementView extends AchievementDef {
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
  current: number;
}

export interface Evaluation {
  cfg: XpConfig;
  stats: Stats;
  totals: XpTotals;
  level: LevelProgress;
  metrics: MetricState[];
  attributes: AttributeSummary[];
  hunter: HunterSummary;
  progressStats: Record<string, number>;
  quests: QuestView[];
  skills: SkillView[];
  achievements: AchievementView[];
  activeSession: (DungeonSessionRow & { activeSecondsNow: number }) | null;
}

function chaptersCompleted(data: GameData, questId: string): Set<number> {
  return new Set(data.questCompletions.filter((c) => c.quest_id === questId && c.chapter > 0).map((c) => c.chapter));
}

export function evaluate(data: GameData): Evaluation {
  const cfg = resolveXpConfig(data.settings.xp_config);
  const stats = computeStats(data);
  const totals = sumLedger(data.xp);
  const level = levelFromXp(totals.total, cfg.levelBase, cfg.levelExponent);

  const unlockedSkills = new Map(data.skillUnlocks.map((u) => [u.skill_code, u]));
  const academicSkills = SKILLS.filter((s) => s.tree === "academic" && unlockedSkills.has(s.code)).length;
  const finQuest = data.quests.find((q) => q.template_code === "main_financial");
  const finObjs = finQuest ? data.objectives.filter((o) => o.quest_id === finQuest.id) : [];
  const financialArcProgress = finObjs.length ? Math.round((finObjs.filter((o) => o.completed_at).length / finObjs.length) * 1000) / 10 : null;
  const mainIds = new Set(data.quests.filter((q) => q.kind === "main").map((q) => q.id));
  const since30 = data.now.getTime() - 30 * 86_400_000;
  const mainObjectives30d = data.objectives.filter((o) => mainIds.has(o.quest_id) && o.completed_at && Date.parse(o.completed_at) >= since30).length;

  const metrics = computeMetricStates(data, stats, { academicSkills, financialArcProgress, mainObjectives30d });
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const currentValue = (id: string) => metricById.get(id)?.current?.value ?? null;
  const attributes = summarizeAttributes(metrics, totals.byAttribute, data.profile.tracked_categories, cfg);
  const hunter = hunterRank(attributes, data.settings.hunter_weights);

  // Quests
  const quests: QuestView[] = data.quests.map((q) => {
    const objs = data.objectives.filter((o) => o.quest_id === q.id).sort((a, b) => a.chapter - b.chapter || a.sort_order - b.sort_order);
    const done = q.kind === "main" ? chaptersCompleted(data, q.id) : new Set<number>();
    const cur = q.kind === "main" ? currentChapter(q, done) : null;
    const withProgress = objs.map((o) => {
      const progress = objectiveProgress(o, q, data, stats, currentValue);
      const locked = q.kind === "main" && cur !== null && o.chapter > cur;
      return { ...o, progress, locked };
    });
    const scope = q.kind === "main" ? withProgress.filter((o) => o.chapter === cur) : withProgress;
    const allDone = scope.length > 0 && scope.every((o) => o.progress.done);
    const progress = q.kind === "main" ? (objs.length ? withProgress.filter((o) => o.completed_at).length / objs.length : 0) : scope.length ? scope.reduce((s, o) => s + o.progress.fraction, 0) / scope.length : 0;
    return { ...q, objectives: withProgress, progress: q.status === "completed" ? 1 : progress, allDone, completedChapters: [...done].sort(), currentChapter: cur };
  });

  // Progress stats for skills and achievements
  const c = stats.counts;
  const attrLevels = attributes.filter((a) => a.tracked).map((a) => a.level.level);
  const verifiedRanks = metrics.filter((m) => m.evidence === "verified" && m.rank).map((m) => rankIndex(m.rank!));
  const personalRanks = metrics.filter((m) => m.evidence === "personal" && m.rank && m.scoreBasis === "standard").map((m) => rankIndex(m.rank!));
  const debtEntries = data.entries.filter((e) => e.metric_id === "debt").sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
  const progressStats: Record<string, number> = {
    ...c,
    level: level.level,
    longest_streak: stats.longestStreak,
    current_streak: stats.currentStreak,
    comebacks: stats.comebacks,
    longest_run_km: Math.max(0, ...data.entries.filter((e) => e.metric_id === "longest_run").map((e) => e.value), ...data.activities.filter((a) => a.type === "run").map((a) => a.quantity ?? 0)),
    population_ranked: metrics.filter((m) => m.scoreBasis === "population").length,
    best_verified_rank_index: verifiedRanks.length ? Math.max(...verifiedRanks) : -1,
    best_personal_rank_index: personalRanks.length ? Math.max(...personalRanks) : -1,
    hunter_rank_index: hunter.rank && !hunter.provisional ? rankIndex(hunter.rank) : -1,
    skills_tier5: data.skillUnlocks.filter((u) => u.skill_code.endsWith("_5")).length,
    reflections_total: c.activity_reflection ?? 0,
    mindfulness_minutes_total: c.activity_mindfulness_minutes ?? 0,
    rest_days_total: c.activity_rest_day ?? 0,
    presentations_total: c.activity_presentation ?? 0,
    mentoring_total: c.activity_mentoring ?? 0,
    networking_total: c.activity_networking ?? 0,
    financial_lessons: c.activity_financial_lesson ?? 0,
    practice_exams_total: c.activity_practice_exam ?? 0,
    // boss dungeons log a practice_exam activity when cleared
    practice_exams_and_bosses: c.activity_practice_exam ?? 0,
    mobility_total: c.activity_mobility ?? 0,
    financial_entries: data.entries.filter((e) => metricById.get(e.metric_id)?.attribute === "WLT").length,
    emergency_fund_months: currentValue("emergency_fund_months") ?? 0,
    savings_rate_current: currentValue("savings_rate") ?? 0,
    debt_free: debtEntries.length >= 2 && debtEntries.some((e) => e.value > 0) && debtEntries[debtEntries.length - 1].value === 0 ? 1 : 0,
    max_attribute_level: attrLevels.length ? Math.max(...attrLevels) : 0,
    min_attribute_level: attrLevels.length === data.profile.tracked_categories.length && attrLevels.length >= 4 ? Math.min(...attrLevels) : 0,
    quests_weekly_completed: c.quests_weekly_completed ?? 0,
    quests_emergency_completed: c.quests_emergency_completed ?? 0,
    current_5k_seconds: currentValue("run_5k") ?? Number.POSITIVE_INFINITY,
    reasoning_rating_value: currentValue("reasoning_rating") ?? 0,
    knowledge_rating_value: currentValue("knowledge_rating") ?? 0,
    working_memory_value: currentValue("working_memory_span") ?? 0,
  };

  const skills: SkillView[] = SKILLS.map((s) => {
    const u = unlockedSkills.get(s.code);
    const prereqOk = !s.requires || unlockedSkills.has(s.requires);
    const cur = progressStats[s.requirement.stat];
    return {
      ...s,
      unlocked: Boolean(u),
      unlockedAt: u?.unlocked_at ?? null,
      available: !u && prereqOk,
      progress: u ? 1 : requirementProgress(s.requirement, progressStats),
      current: Number.isFinite(cur) ? cur : null,
    };
  });

  const unlockedAch = new Map(data.achievementUnlocks.map((u) => [u.achievement_code, u]));
  const achievements: AchievementView[] = ACHIEVEMENTS.map((a) => {
    const u = unlockedAch.get(a.code);
    const cur = progressStats[a.stat] ?? 0;
    return { ...a, unlocked: Boolean(u), unlockedAt: u?.unlocked_at ?? null, progress: u ? 1 : Math.max(0, Math.min(1, cur / a.threshold)), current: Number.isFinite(cur) ? cur : 0 };
  });

  const open = data.sessions.find((s) => s.status === "active" || s.status === "paused") ?? null;
  const activeSession = open ? { ...open, activeSecondsNow: activeSecondsNow(open, data.now) } : null;

  return { cfg, stats, totals, level, metrics, attributes, hunter, progressStats, quests, skills, achievements, activeSession };
}

// ───────────────────────────── Awards planning ─────────────────────────────

export type PlannedAward =
  | { type: "objective_done"; objectiveId: string; questId: string }
  | { type: "quest_complete"; quest: QuestRow; xp: number }
  | { type: "chapter_complete"; quest: QuestRow; chapter: number; chapterName: string; xp: number; final: boolean }
  | { type: "daily_all_complete"; date: string; xp: number }
  | { type: "skill_unlock"; skill: SkillDef }
  | { type: "achievement_unlock"; achievement: AchievementDef }
  | { type: "title_unlock"; titleCode: string; source: string };

/** Pure: given an evaluation, list everything that is newly earned and not yet recorded. */
export function planAwards(data: GameData, ev: Evaluation): PlannedAward[] {
  const out: PlannedAward[] = [];
  for (const q of ev.quests) {
    if (q.status !== "active") continue;
    if (q.kind === "emergency" && q.deadline && Date.parse(q.deadline) < data.now.getTime()) continue;
    for (const o of q.objectives) {
      if (!o.completed_at && o.progress.done && !o.locked && (q.kind !== "main" || o.chapter === q.currentChapter)) out.push({ type: "objective_done", objectiveId: o.id, questId: q.id });
    }
    if (q.kind === "main") {
      if (q.allDone && q.currentChapter !== null) {
        const chapters = q.config?.chapters ?? [];
        const ch = chapters.find((c) => c.number === q.currentChapter);
        const final = chapters[chapters.length - 1]?.number === q.currentChapter;
        out.push({ type: "chapter_complete", quest: q, chapter: q.currentChapter, chapterName: ch?.name ?? `Chapter ${q.currentChapter}`, xp: q.xp_reward, final });
        if (final && q.config?.titleReward) out.push({ type: "title_unlock", titleCode: q.config.titleReward, source: `quest:${q.template_code}` });
      }
    } else if (q.allDone) {
      out.push({ type: "quest_complete", quest: q, xp: q.xp_reward });
    }
  }
  // Daily all-complete bonus
  const todays = data.quests.filter((q) => q.kind === "daily" && q.period_start === data.today && q.status !== "offered");
  const completingNow = new Set(out.filter((a): a is Extract<PlannedAward, { type: "quest_complete" }> => a.type === "quest_complete").map((a) => a.quest.id));
  if (todays.length > 0 && todays.every((q) => q.status === "completed" || completingNow.has(q.id))) {
    if (!data.xp.some((x) => x.idempotency_key === `daily_all:${data.today}`)) out.push({ type: "daily_all_complete", date: data.today, xp: ev.cfg.dailyAllComplete });
  }
  // Skills: sequential within a line, so several tiers can unlock in one pass.
  const unlocked = new Set(data.skillUnlocks.map((u) => u.skill_code));
  for (const s of SKILLS) {
    if (unlocked.has(s.code)) continue;
    if (s.requires && !unlocked.has(s.requires)) continue;
    if (requirementMet(s.requirement, ev.progressStats)) {
      out.push({ type: "skill_unlock", skill: s });
      unlocked.add(s.code);
    }
  }
  for (const a of ev.achievements) {
    if (a.unlocked) continue;
    if ((ev.progressStats[a.stat] ?? 0) >= a.threshold) {
      out.push({ type: "achievement_unlock", achievement: a });
      if (a.title) out.push({ type: "title_unlock", titleCode: a.title, source: `achievement:${a.code}` });
    }
  }
  const haveTitles = new Set(data.titleUnlocks.map((t) => t.title_code));
  return out.filter((a) => a.type !== "title_unlock" || (!haveTitles.has(a.titleCode) && Boolean(TITLE_BY_CODE[a.titleCode])));
}

