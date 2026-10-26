import { randomUUID } from "node:crypto";
import { ACTIVITY_BY_TYPE, qualifiesForXp } from "../../domain/activities";
import { ATTRIBUTE_BY_CODE } from "../../domain/attributes";
import { addDays, daysBetween, localDate, weekStart, type ISODate } from "../../domain/dates";
import { activeSecondsNow, canClear, creditedMinutes, DUNGEON_BY_CODE, DUNGEON_CLEAR_XP, DUNGEON_DAILY_BONUS_CAP, RETREAT_CREDIT_MINUTES } from "../../domain/dungeons";
import { METRIC_BY_ID, type MetricDef } from "../../domain/metrics";
import { DUNGEON_RETREAT_PENALTY, flatPenalty, MAX_BACKFILL_DAYS, PENALTY_ZONE_FAIL_FACTOR, progressRegimen, questPenalty, resolveRegimen } from "../../domain/regimen";
import { compareRanks } from "../../domain/ranks";
import { TITLE_BY_CODE } from "../../domain/titles";
import type { AttributeCode, Rank } from "../../domain/types";
import { evaluatePersonalRecord, findLikelyDuplicate, planActivityXp, planMetricLogXp, resolveXpConfig, type XpKind, type XpTransactionRow } from "../../domain/xp";
import { CommandSchema, ImportSchema, type Command, type GameEvent } from "../../game/commands";
import { evaluate, planAwards, type Evaluation } from "../../game/evaluate";
import { customMetricDef } from "../../game/metric-state";
import { objectiveProgress } from "../../game/quest-progress";
import { formatRunDistance, generateDailyQuests, generateEmergencyQuests, generateWeeklyQuests, mainQuestDrafts, penaltyZoneDraft, type QuestDraft } from "../../game/quest-templates";
import { computeStats } from "../../game/stats";
import type { ActivityRow, CustomMetricRow, DungeonSessionRow, GameData, MetricEntryRow, ObjectiveRow, ProfileRow, QuestRow, SettingsRow, TrialResultRow } from "../../game/rows";
import { UniqueViolationError, type Database, type DataClient } from "../db/types";
import { applyPenalty, penaltiesEnabled } from "./penalty";
import { buildSnapshot, type PlayerSnapshot } from "./snapshot";

export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GameError";
  }
}

const DEFAULT_PROFILE = (userId: string): Omit<ProfileRow, "created_at" | "updated_at"> => ({
  user_id: userId,
  display_name: "Player",
  date_of_birth: null,
  age_years: null,
  country: "US",
  height_cm: null,
  weight_kg: null,
  sex: null,
  education_level: null,
  occupation: null,
  goals: [],
  fitness_experience: null,
  academic_info: {},
  financial_info: {},
  difficulty: "normal",
  tracked_categories: ["STR", "END", "PHY", "INT", "DIS", "WLT", "CHA", "WIS"],
  timezone: "America/New_York",
  onboarded_at: null,
});

export class GameService {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private get u(): DataClient {
    return this.db.user(this.userId);
  }
  private get svc(): DataClient {
    return this.db.service();
  }

  // ───────────────────────────── Loading ─────────────────────────────

  async ensureBootstrap(email?: string | null): Promise<void> {
    const svc = this.svc;
    await svc.insertIgnore("users", { id: this.userId, email: email ?? null }, ["id"]);
    await svc.insertIgnore("profiles", DEFAULT_PROFILE(this.userId), ["user_id"]);
    await svc.insertIgnore("settings", { user_id: this.userId }, ["user_id"]);
  }

  async load(): Promise<GameData> {
    const u = this.u;
    const uid = { user_id: this.userId };
    const [profiles, settings, customMetrics, entries, activities, quests, objectives, questCompletions, sessions, xp, skillUnlocks, achievementUnlocks, titleUnlocks, equipped, notifications, trialRows, questions] = await Promise.all([
      u.select<ProfileRow>("profiles", { eq: uid }),
      u.select<SettingsRow>("settings", { eq: uid }),
      u.select<CustomMetricRow>("metrics", { eq: { user_id: this.userId, is_custom: true } }),
      u.select<MetricEntryRow>("metric_entries", { eq: uid, order: [{ column: "recorded_on" }, { column: "created_at" }] }),
      u.select<ActivityRow>("activity_logs", { eq: uid, order: [{ column: "occurred_on" }, { column: "created_at" }] }),
      u.select<QuestRow>("quests", { eq: uid, order: [{ column: "created_at" }] }),
      u.select<ObjectiveRow>("quest_objectives", { eq: uid }),
      u.select<GameData["questCompletions"][number]>("quest_completions", { eq: uid }),
      u.select<DungeonSessionRow>("dungeon_sessions", { eq: uid, order: [{ column: "started_at" }] }),
      u.select<XpTransactionRow>("player_xp", { eq: uid, order: [{ column: "created_at" }] }),
      u.select<GameData["skillUnlocks"][number]>("skill_unlocks", { eq: uid }),
      u.select<GameData["achievementUnlocks"][number]>("achievement_unlocks", { eq: uid }),
      u.select<GameData["titleUnlocks"][number]>("title_unlocks", { eq: uid }),
      u.select<NonNullable<GameData["equippedTitle"]>>("equipped_titles", { eq: uid }),
      u.select<GameData["notifications"][number]>("notifications", { eq: uid, order: [{ column: "created_at", ascending: false }], limit: 60 }),
      // trial_sessions.state holds answer keys and isn't client-readable, so load via the service role (scoped to this user).
      this.svc.select<TrialResultRow & { state?: unknown }>("trial_sessions", { eq: uid, order: [{ column: "started_at" }] }),
      u.select<{ id: string }>("question_items", { eq: { ...uid, flagged: false } }),
    ]);
    if (!profiles[0] || !settings[0]) throw new GameError("Player profile missing", 500);
    const now = this.clock();
    const profile = profiles[0];
    return {
      userId: this.userId,
      now,
      today: localDate(now, profile.timezone),
      profile,
      settings: settings[0],
      customMetrics,
      entries,
      activities,
      quests,
      objectives,
      questCompletions,
      sessions,
      xp,
      skillUnlocks,
      achievementUnlocks,
      titleUnlocks,
      equippedTitle: equipped[0] ?? null,
      notifications,
      trials: trialRows.map((t) => {
        const { state, ...rest } = t;
        void state; // answer keys stay server-side
        return rest;
      }),
      questionCount: questions.length,
    };
  }

  // ───────────────────────────── XP ledger ─────────────────────────────

  /** Idempotent XP award. Returns true only if this call created the transaction. */
  private async award(t: { amount: number; kind: XpKind; attribute: AttributeCode | null; sourceType: string; sourceId: string | null; reason: string; key: string; day: ISODate }): Promise<boolean> {
    if (t.amount <= 0) return false;
    const rows = await this.svc.insertIgnore(
      "player_xp",
      { user_id: this.userId, amount: Math.round(t.amount), kind: t.kind, attribute_code: t.attribute, source_type: t.sourceType, source_id: t.sourceId, reason: t.reason, idempotency_key: t.key, awarded_on: t.day },
      ["user_id", "idempotency_key"],
    );
    return rows.length > 0;
  }

  /** Idempotency key for an award that may be re-earned after its earlier award was reversed. */
  private rekey(data: GameData, key: string, sourceId: string): string {
    const n = data.xp.filter((x) => x.kind === "reversal" && x.source_id === sourceId).length;
    return n ? `${key}:${n}` : key;
  }

  /**
   * After a log is deleted, re-opens any still-running quest it had completed: the completion XP
   * (and the all-dailies bonus) is reversed, and the quest can be earned again, or failed.
   */
  private async revalidateQuests() {
    const data = await this.load();
    const stats = computeStats(data);
    const ev = evaluate(data);
    const current = (id: string) => ev.metrics.find((m) => m.id === id)?.current?.value ?? null;
    for (const q of data.quests) {
      if (q.kind === "main" || q.status !== "completed" || (q.period_end !== null && q.period_end < data.today)) continue;
      const objs = data.objectives.filter((o) => o.quest_id === q.id);
      const progress = objs.map((o) => ({ o, done: o.tracker.type === "manual" || o.tracker.type === "metric_reach" ? Boolean(o.completed_at) : objectiveProgress({ ...o, completed_at: null }, q, data, stats, current).done }));
      if (progress.every((x) => x.done)) continue;
      await this.reverseFor(data, q.id, "Quest progress removed");
      if (q.kind === "daily") await this.reverseFor(data, `daily_all:${q.period_start}`, "Daily quest re-opened");
      await this.svc.delete("quest_completions", { quest_id: q.id, user_id: this.userId, chapter: 0 });
      await this.svc.update("quests", { id: q.id, user_id: this.userId }, { status: "active", completed_at: null });
      for (const x of progress) if (!x.done && x.o.completed_at) await this.svc.update("quest_objectives", { id: x.o.id, user_id: this.userId }, { completed_at: null });
      await this.notify("quest", "[QUEST REOPENED]", `${q.title}: a deleted log means it's no longer complete.`);
    }
  }

  /** Reverse every unreversed transaction attached to a deleted source. */
  private async reverseFor(data: GameData, sourceId: string, reason: string): Promise<number> {
    const reversed = new Set(data.xp.filter((x) => x.reverses_id).map((x) => x.reverses_id));
    let total = 0;
    for (const tx of data.xp.filter((x) => x.source_id === sourceId && x.kind !== "reversal" && !reversed.has(x.id))) {
      await this.svc.insertIgnore(
        "player_xp",
        { user_id: this.userId, amount: -tx.amount, kind: "reversal", attribute_code: tx.attribute_code, source_type: tx.source_type, source_id: sourceId, reason, reverses_id: tx.id, idempotency_key: `reversal:${tx.id}`, awarded_on: data.today },
        ["user_id", "idempotency_key"],
      );
      total += tx.amount;
    }
    return total;
  }

  private async notify(kind: string, title: string, body: string, payload: Record<string, unknown> = {}) {
    await this.svc.insert("notifications", { user_id: this.userId, kind, title, body, payload });
  }

  // ───────────────────────────── Quest board ─────────────────────────────

  private async insertQuestDrafts(drafts: QuestDraft[], baseline: Record<string, number>): Promise<number> {
    let created = 0;
    for (const d of drafts) {
      const { objectives, ...quest } = d;
      const config = quest.kind === "main" ? { ...quest.config, baseline } : quest.config;
      const inserted = await this.svc.insertIgnore<QuestRow>("quests", { ...quest, config, user_id: this.userId }, ["user_id", "template_code", "period_start"]);
      if (!inserted.length) continue;
      created += 1;
      await this.svc.insert(
        "quest_objectives",
        objectives.map((o, i) => ({ quest_id: inserted[0].id, user_id: this.userId, sort_order: i, chapter: o.chapter ?? 1, title: o.title, tracker: o.tracker, target: o.target })),
      );
    }
    return created;
  }

  private async penalize(data: GameData, p: { amount: number; attribute: AttributeCode | null; sourceType: string; sourceId: string | null; reason: string; key: string }): Promise<boolean> {
    return applyPenalty(this.svc, this.userId, { ...p, day: data.today });
  }

  /**
   * Fails or expires quests whose time is up, then generates today's/this week's quests, the story
   * arcs, emergency offers and, after failed dailies, the Penalty Zone. Days the player missed
   * entirely (up to a week) get a board too, which fails, so staying away isn't a way out.
   */
  async ensureQuests(data: GameData, events: GameEvent[] = []): Promise<number> {
    if (!data.profile.onboarded_at) return 0;
    const cfg = resolveXpConfig(data.settings.xp_config);
    let regimen = resolveRegimen(data.settings.regimen);
    const units = data.settings.unit_system;
    const p = data.profile;
    const penal = await penaltiesEnabled(this.db);
    const mark = (ds: QuestDraft[]) => (penal ? ds.map((d) => (d.kind === "main" ? d : { ...d, config: { ...d.config, penalized: true, penaltyXp: d.config.penaltyXp ?? questPenalty(d.xp_reward, p.difficulty) } })) : ds);
    let have = new Set(data.quests.map((q) => `${q.template_code}|${q.period_start}`));
    const missing = (ds: QuestDraft[]) => ds.filter((d) => !have.has(`${d.template_code}|${d.period_start}`));
    const baseline = () => ({ strength_prs: computeStats(data).counts.strength_prs ?? 0 });
    let created = 0;

    // Missed days
    if (penal) {
      const last = data.quests.filter((q) => q.kind === "daily" && q.config?.penalized && q.period_start < data.today).reduce<ISODate | null>((m, q) => (!m || q.period_start > m ? q.period_start : m), null);
      if (last) {
        const from = addDays(data.today, -MAX_BACKFILL_DAYS) > addDays(last, 1) ? addDays(data.today, -MAX_BACKFILL_DAYS) : addDays(last, 1);
        for (let d = from; d < data.today; d = addDays(d, 1)) created += await this.insertQuestDrafts(mark(missing(generateDailyQuests(p, d, cfg, this.userId, regimen, units))), baseline());
        if (created) {
          data = await this.load();
          have = new Set(data.quests.map((q) => `${q.template_code}|${q.period_start}`));
        }
      }
    }

    // Time's up
    const yesterday = addDays(data.today, -1);
    const stale = data.quests.filter(
      (q) =>
        ((q.status === "active" || q.status === "offered") && (q.kind === "daily" || q.kind === "weekly" || q.kind === "penalty") && q.period_end !== null && q.period_end < data.today) ||
        (q.status === "offered" && q.period_end !== null && q.period_end < data.today) ||
        (q.status === "active" && (q.kind === "emergency" || q.kind === "custom") && q.deadline !== null && Date.parse(q.deadline) < data.now.getTime()),
    );
    const failedYesterday: Parameters<typeof penaltyZoneDraft>[1] = [];
    let lost = 0;
    const failedTitles: string[] = [];
    if (stale.length) {
      const views = new Map(evaluate(data).quests.map((q) => [q.id, q]));
      for (const q of stale) {
        const view = views.get(q.id);
        // Finished but not yet recorded (e.g. a back-dated log): the progression loop completes it.
        if (q.status === "active" && view?.allDone) continue;
        if (!(penal && q.status === "active" && q.config?.penalized)) {
          await this.svc.update("quests", { id: q.id, user_id: this.userId }, { status: "expired" });
          continue;
        }
        await this.svc.update("quests", { id: q.id, user_id: this.userId }, { status: "failed" });
        const amount = q.config.penaltyXp ?? questPenalty(q.xp_reward, p.difficulty);
        const zone = q.kind === "penalty";
        if (await this.penalize(data, { amount, attribute: q.attribute_code, sourceType: zone ? "penalty_zone" : "quest_failed", sourceId: q.id, reason: zone ? "Penalty Zone failed" : `Quest failed: ${q.title}`, key: `penalty:${q.id}` })) {
          lost += amount;
          failedTitles.push(q.title);
        }
        if (q.kind === "daily" && q.period_end === yesterday && view)
          failedYesterday.push({ quest: q, remaining: view.objectives.filter((o) => !o.progress.done).map((o) => ({ title: o.title, tracker: o.tracker, amount: o.target - o.progress.value })) });
      }
    }
    if (failedTitles.length) {
      const body = `${failedTitles.length} quest${failedTitles.length === 1 ? "" : "s"} failed: ${failedTitles.slice(0, 4).join(", ")}${failedTitles.length > 4 ? "…" : ""}. −${lost} XP.`;
      events.push({ type: "penalty", title: "Quests failed", body, xp: lost, zone: false });
      await this.notify("penalty", "[PENALTY]", body);
    }

    // One-time: boards issued with the original 100/100/100/5 km defaults move to the new starting
    // regimen for players who never customised it.
    if (penal && Object.keys(data.settings.regimen ?? {}).length === 0) {
      const old = data.quests.find((q) => q.template_code === "daily_regimen" && q.period_start === data.today && q.status === "active");
      const objs = old ? data.objectives.filter((o) => o.quest_id === old.id).sort((a, b) => a.sort_order - b.sort_order) : [];
      if (old && objs.map((o) => o.target).join() === "100,100,100,5" && !objs.some((o) => o.completed_at)) {
        const fresh = generateDailyQuests(p, data.today, cfg, this.userId, regimen, units).find((d) => d.template_code === "daily_regimen");
        if (fresh) for (const [i, o] of objs.entries()) if (fresh.objectives[i]) await this.svc.update("quest_objectives", { id: o.id, user_id: this.userId }, { target: fresh.objectives[i].target, title: fresh.objectives[i].title });
      }
    }

    // Weekly progression of the training regimen, judged on last week's training days.
    const ws = weekStart(data.today);
    if (penal && regimen.progressedWeek !== ws) {
      const last = data.quests.filter((q) => q.template_code === "daily_regimen" && q.period_start >= addDays(ws, -7) && q.period_start < ws && q.status !== "exempt");
      const cleared = last.filter((q) => q.status === "completed").length;
      const { next, change } = progressRegimen(regimen, cleared, last.length);
      regimen = { ...next, progressedWeek: ws };
      await this.svc.update("settings", { user_id: this.userId }, { regimen });
      if (change !== "hold") {
        const parts = [regimen.pushups && `${regimen.pushups} push-ups`, regimen.situps && `${regimen.situps} sit-ups`, regimen.pullups && `${regimen.pullups} pull-ups`, regimen.runKm && `a ${formatRunDistance(regimen.runKm, units)} run`].filter(Boolean).join(", ");
        const body = change === "up" ? `You cleared ${cleared} of ${last.length} training days. This week's regimen: ${parts}.` : `You cleared only ${cleared} of ${last.length} training days. The regimen steps back to ${parts}.`;
        events.push({ type: "info", title: change === "up" ? "Training level up" : "Training scaled back", body });
        await this.notify("quest", change === "up" ? "[TRAINING LEVEL UP]" : "[TRAINING ADJUSTED]", body);
      }
    }

    // Today's board
    const todays = mark(generateDailyQuests(p, data.today, cfg, this.userId, regimen, units));
    const dailies = missing(todays);
    created += await this.insertQuestDrafts(dailies, baseline());
    created += await this.insertQuestDrafts(mark(missing(generateWeeklyQuests(p, data.today, cfg))), baseline());
    created += await this.insertQuestDrafts(missing(mainQuestDrafts(p, data.today, cfg)), baseline());
    created += await this.insertQuestDrafts(mark(missing(generateEmergencyQuests(p, data.today, data.now, cfg, this.userId))), baseline());
    if (dailies.length) await this.notify("quests", "[SYSTEM NOTIFICATION]", "New daily quests have appeared.", { date: data.today });

    // Penalty Zone
    if (penal && failedYesterday.length) {
      const failPenalty = PENALTY_ZONE_FAIL_FACTOR * failedYesterday.reduce((a, f) => a + (f.quest.config.penaltyXp ?? questPenalty(f.quest.xp_reward, p.difficulty)), 0);
      const zone = penaltyZoneDraft(data.today, failedYesterday, todays, failPenalty);
      if (zone && (await this.insertQuestDrafts(missing([zone]), baseline()))) {
        created += 1;
        const body = `Complete yesterday's unfinished work by midnight, on top of today's quests. Failure costs ${failPenalty} XP.`;
        events.push({ type: "penalty", title: "PENALTY ZONE", body, xp: 0, zone: true });
        await this.notify("penalty", "[PENALTY ZONE]", body);
      }
    }
    return created + stale.length;
  }

  // ───────────────────────────── Progression loop ─────────────────────────────

  /** Applies newly earned awards until nothing changes. */
  private async progress(events: GameEvent[]): Promise<{ data: GameData; ev: Evaluation }> {
    let data = await this.load();
    let ev = evaluate(data);
    for (let pass = 0; pass < 6; pass++) {
      const awards = planAwards(data, ev);
      if (!awards.length) break;
      for (const a of awards) {
        switch (a.type) {
          case "objective_done":
            await this.svc.update("quest_objectives", { id: a.objectiveId, user_id: this.userId }, { completed_at: data.now.toISOString() });
            break;
          case "quest_complete": {
            const ins = await this.svc.insertIgnore("quest_completions", { user_id: this.userId, quest_id: a.quest.id, chapter: 0, xp_awarded: a.xp }, ["user_id", "quest_id", "chapter"]);
            await this.svc.update("quests", { id: a.quest.id, user_id: this.userId }, { status: "completed", completed_at: data.now.toISOString() });
            if (ins.length) {
              await this.award({ amount: a.xp, kind: "quest", attribute: a.quest.attribute_code, sourceType: "quest", sourceId: a.quest.id, reason: `Quest complete: ${a.quest.title}`, key: this.rekey(data, `quest:${a.quest.id}`, a.quest.id), day: data.today });
              events.push({ type: "quest_complete", title: a.quest.title, kind: a.quest.kind, xp: a.xp });
              await this.notify("quest", "[QUEST COMPLETE]", `${a.quest.title} (+${a.xp} XP)`);
            }
            break;
          }
          case "chapter_complete": {
            const ins = await this.svc.insertIgnore("quest_completions", { user_id: this.userId, quest_id: a.quest.id, chapter: a.chapter, xp_awarded: a.xp }, ["user_id", "quest_id", "chapter"]);
            if (ins.length) {
              await this.award({ amount: a.xp, kind: "milestone", attribute: a.quest.attribute_code, sourceType: "main_chapter", sourceId: a.quest.id, reason: `${a.quest.title}: ${a.chapterName}`, key: `chapter:${a.quest.id}:${a.chapter}`, day: data.today });
              events.push({ type: "chapter_complete", questTitle: a.quest.title, chapter: a.chapterName, xp: a.xp, final: a.final });
              await this.notify("story", "[MAIN QUEST UPDATED]", `${a.quest.title}: ${a.chapterName} complete.${a.final ? " The arc is complete." : " The next chapter is unlocked."}`);
              if (a.final) {
                await this.svc.insertIgnore("quest_completions", { user_id: this.userId, quest_id: a.quest.id, chapter: 0, xp_awarded: 0 }, ["user_id", "quest_id", "chapter"]);
                await this.svc.update("quests", { id: a.quest.id, user_id: this.userId }, { status: "completed", completed_at: data.now.toISOString() });
              }
            }
            break;
          }
          case "daily_all_complete":
            if (await this.award({ amount: a.xp, kind: "quest", attribute: "DIS", sourceType: "daily_all", sourceId: `daily_all:${a.date}`, reason: "All daily quests complete", key: this.rekey(data, `daily_all:${a.date}`, `daily_all:${a.date}`), day: data.today })) {
              events.push({ type: "quest_complete", title: "All daily quests complete", kind: "daily_bonus", xp: a.xp });
              await this.notify("quest", "[DAILY QUESTS CLEARED]", `Every daily quest is complete. Bonus +${a.xp} XP.`);
            }
            break;
          case "skill_unlock": {
            const ins = await this.svc.insertIgnore("skill_unlocks", { user_id: this.userId, skill_code: a.skill.code, xp_awarded: a.skill.xp }, ["user_id", "skill_code"]);
            if (ins.length) {
              const attr: AttributeCode = a.skill.tree === "academic" ? "INT" : a.skill.tree === "physical" ? "STR" : "DIS";
              await this.award({ amount: a.skill.xp, kind: "skill", attribute: attr, sourceType: "skill", sourceId: a.skill.code, reason: `Skill unlocked: ${a.skill.name}`, key: `skill:${a.skill.code}`, day: data.today });
              events.push({ type: "skill", code: a.skill.code, name: a.skill.name, xp: a.skill.xp });
              await this.notify("skill", "[SKILL ACQUIRED]", `${a.skill.name}: ${a.skill.requirement.label}.`);
            }
            break;
          }
          case "achievement_unlock": {
            const ins = await this.svc.insertIgnore("achievement_unlocks", { user_id: this.userId, achievement_code: a.achievement.code, xp_awarded: a.achievement.xp }, ["user_id", "achievement_code"]);
            if (ins.length) {
              await this.award({ amount: a.achievement.xp, kind: "achievement", attribute: null, sourceType: "achievement", sourceId: a.achievement.code, reason: `Achievement: ${a.achievement.name}`, key: `achievement:${a.achievement.code}`, day: data.today });
              events.push({ type: "achievement", code: a.achievement.code, name: a.achievement.name, rarity: a.achievement.rarity, xp: a.achievement.xp, description: a.achievement.description });
              await this.notify("achievement", "[ACHIEVEMENT UNLOCKED]", `${a.achievement.name}: ${a.achievement.description}`);
            }
            break;
          }
          case "title_unlock": {
            const ins = await this.svc.insertIgnore("title_unlocks", { user_id: this.userId, title_code: a.titleCode, source: a.source }, ["user_id", "title_code"]);
            if (ins.length) {
              const t = TITLE_BY_CODE[a.titleCode];
              events.push({ type: "title_unlocked", code: a.titleCode, name: t.name });
              await this.notify("title", "[TITLE ACQUIRED]", `You may now bear the title "${t.name}".`);
            }
            break;
          }
        }
      }
      data = await this.load();
      ev = evaluate(data);
    }
    return { data, ev };
  }

  private async cacheLevel(ev: Evaluation) {
    await this.svc.upsert(
      "player_levels",
      {
        user_id: this.userId,
        level: ev.level.level,
        total_xp: ev.level.totalXp,
        hunter_rank: ev.hunter.rank,
        hunter_score: ev.hunter.score,
        attribute_levels: Object.fromEntries(ev.attributes.map((a) => [a.code, a.level.level])),
        updated_at: new Date().toISOString(),
      },
      ["user_id"],
    );
    // Percentile cache (auditable record of the latest population comparisons).
    const rows = ev.metrics.flatMap((m) =>
      m.current
        ? m.percentiles.map((p) => ({
            user_id: this.userId,
            metric_id: m.id,
            distribution_id: p.distributionId,
            entry_id: m.current!.entryId,
            value: m.current!.value,
            percentile: p.percentile,
            ci_low: p.low,
            ci_high: p.high,
            evidence: p.evidence,
            rank: p.rank,
            computed_at: new Date().toISOString(),
          }))
        : [],
    );
    if (rows.length) await this.svc.upsert("percentile_results", rows, ["user_id", "metric_id", "distribution_id"]);
  }

  private diffEvents(before: Evaluation, after: Evaluation, events: GameEvent[], focusMetric?: string) {
    if (after.level.level > before.level.level) events.push({ type: "level_up", from: before.level.level, to: after.level.level });
    for (const a of after.attributes) {
      const b = before.attributes.find((x) => x.code === a.code)!;
      if (a.level.level > b.level.level) events.push({ type: "attribute_level_up", attribute: a.code, from: b.level.level, to: a.level.level });
      if (a.rank && (!b.rank || compareRanks(a.rank, b.rank) > 0)) events.push({ type: "rank_up", scope: "attribute", name: ATTRIBUTE_BY_CODE[a.code].name, from: b.rank, to: a.rank });
    }
    if (after.hunter.rank && (!before.hunter.rank || compareRanks(after.hunter.rank, before.hunter.rank) > 0)) events.push({ type: "rank_up", scope: "hunter", name: "Hunter Rank", from: before.hunter.rank, to: after.hunter.rank });
    if (focusMetric) {
      const a = after.metrics.find((m) => m.id === focusMetric);
      const b = before.metrics.find((m) => m.id === focusMetric);
      if (a?.rank && (!b?.rank || compareRanks(a.rank as Rank, b.rank as Rank) > 0)) events.push({ type: "rank_up", scope: "metric", name: a.name, from: b?.rank ?? null, to: a.rank });
    }
  }

  // ───────────────────────────── Public API ─────────────────────────────

  async snapshot(): Promise<PlayerSnapshot> {
    let data = await this.load();
    if (await this.ensureQuests(data)) data = await this.load();
    const events: GameEvent[] = [];
    const { data: d2, ev } = await this.progress(events);
    data = d2;
    return buildSnapshot(data, ev, this.db.kind);
  }

  async execute(raw: unknown): Promise<{ events: GameEvent[]; snapshot: PlayerSnapshot }> {
    const parsed = CommandSchema.safeParse(raw);
    if (!parsed.success) throw new GameError(parsed.error.issues.map((i) => `${i.path.join(".") || "command"}: ${i.message}`).join("; "));
    const cmd = parsed.data;
    let data = await this.load();
    if (cmd.type !== "complete_onboarding" && !data.profile.onboarded_at && cmd.type !== "update_settings") throw new GameError("Complete the awakening (onboarding) first.", 409);
    const events: GameEvent[] = [];
    // The daily-login overlay summarises penalties itself.
    if (await this.ensureQuests(data, cmd.type === "daily_login" ? [] : events)) data = await this.load();
    const before = evaluate(data);
    let focusMetric: string | undefined;

    switch (cmd.type) {
      case "complete_onboarding":
        await this.onboard(data, cmd);
        break;
      case "update_profile":
        await this.svc.update("profiles", { user_id: this.userId }, { ...cmd.profile, updated_at: new Date().toISOString() });
        break;
      case "update_settings": {
        const patch: Record<string, unknown> = { ...cmd.settings, updated_at: new Date().toISOString() };
        if (cmd.settings.xp_config) patch.xp_config = resolveXpConfig(cmd.settings.xp_config);
        if (cmd.settings.regimen) {
          if (!(await penaltiesEnabled(this.db))) throw new GameError("The daily regimen needs database migration 0003 (supabase/migrations/0003_regimen_penalties.sql). Run it in the Supabase SQL Editor, then try again.", 409);
          patch.regimen = resolveRegimen(cmd.settings.regimen);
        }
        await this.u.update("settings", { user_id: this.userId }, patch);
        break;
      }
      case "log_metric":
        focusMetric = cmd.metricId;
        await this.logMetric(data, cmd, events);
        break;
      case "delete_metric_entry": {
        const entry = data.entries.find((e) => e.id === cmd.entryId);
        if (!entry) throw new GameError("Entry not found", 404);
        await this.reverseFor(data, entry.id, "Measurement deleted");
        await this.u.delete("metric_entries", { id: entry.id, user_id: this.userId });
        break;
      }
      case "log_activity":
        await this.logActivity(data, cmd, events);
        break;
      case "delete_activity": {
        const act = data.activities.find((a) => a.id === cmd.activityId);
        if (!act) throw new GameError("Activity not found", 404);
        await this.reverseFor(data, act.id, "Activity deleted");
        await this.u.delete("activity_logs", { id: act.id, user_id: this.userId });
        await this.revalidateQuests();
        break;
      }
      case "set_objective": {
        const obj = data.objectives.find((o) => o.id === cmd.objectiveId);
        if (!obj) throw new GameError("Objective not found", 404);
        if (obj.tracker.type !== "manual") throw new GameError("This objective is tracked automatically from your logs.");
        const quest = data.quests.find((q) => q.id === obj.quest_id);
        if (!quest || quest.status !== "active") throw new GameError("Quest is not active.");
        if (obj.completed_at && !cmd.done) throw new GameError("Completed objectives stay completed.");
        await this.svc.update("quest_objectives", { id: obj.id, user_id: this.userId }, { manual_progress: cmd.done ? obj.target : 0 });
        break;
      }
      case "accept_quest": {
        const q = data.quests.find((x) => x.id === cmd.questId);
        if (!q || q.status !== "offered") throw new GameError("Quest is not on offer.");
        const hours = (q.config?.baseline as { windowHours?: number } | undefined)?.windowHours ?? 3;
        const deadline = new Date(data.now.getTime() + hours * 3_600_000).toISOString();
        await this.svc.update("quests", { id: q.id, user_id: this.userId }, { status: "active", deadline, config: { ...q.config, baseline: { ...(q.config?.baseline ?? {}), acceptedAt: data.now.getTime() } } });
        await this.notify("quest", "[EMERGENCY QUEST ACCEPTED]", `${q.title}: the gate closes at ${new Date(deadline).toLocaleTimeString("en-US", { timeZone: data.profile.timezone, hour: "numeric", minute: "2-digit" })}.`);
        break;
      }
      case "dismiss_quest": {
        const q = data.quests.find((x) => x.id === cmd.questId);
        if (!q || q.status !== "offered") throw new GameError("Quest is not on offer.");
        await this.svc.update("quests", { id: q.id, user_id: this.userId }, { status: "abandoned" });
        break;
      }
      case "abandon_quest": {
        const q = data.quests.find((x) => x.id === cmd.questId);
        if (!q || q.status !== "active" || (q.kind !== "custom" && q.kind !== "emergency")) throw new GameError("Only active custom or emergency quests can be abandoned.");
        await this.svc.update("quests", { id: q.id, user_id: this.userId }, { status: "abandoned" });
        if (q.config?.penalized && (await penaltiesEnabled(this.db))) {
          const amount = q.config.penaltyXp ?? questPenalty(q.xp_reward, data.profile.difficulty);
          if (await this.penalize(data, { amount, attribute: q.attribute_code, sourceType: "quest_abandoned", sourceId: q.id, reason: `Quest abandoned: ${q.title}`, key: `penalty:${q.id}` })) {
            events.push({ type: "penalty", title: "Quest abandoned", body: `${q.title}: −${amount} XP.`, xp: amount, zone: false });
            await this.notify("penalty", "[PENALTY]", `Quest abandoned: ${q.title}. −${amount} XP.`);
          }
        }
        break;
      }
      case "use_recovery_pass": {
        if (!(await penaltiesEnabled(this.db))) throw new GameError("Recovery passes need database migration 0003.", 409);
        const regimen = resolveRegimen(data.settings.regimen);
        const ws = weekStart(data.today);
        const usedDays = new Set(data.quests.filter((q) => q.config?.recoveryPass && q.period_start >= ws && q.period_start <= data.today).map((q) => q.period_start));
        if (usedDays.has(data.today)) throw new GameError("Today's recovery pass is already in use.");
        if (usedDays.size >= regimen.recoveryPassesPerWeek) throw new GameError(regimen.recoveryPassesPerWeek ? `You have used this week's recovery pass${regimen.recoveryPassesPerWeek > 1 ? "es" : ""}. They reset on Monday.` : "Recovery passes are turned off in your regimen.");
        const physical = data.quests.filter((q) => q.kind === "daily" && q.period_start === data.today && q.status === "active" && q.config?.category === "physical");
        if (!physical.length) throw new GameError("There are no open physical quests today.");
        for (const q of physical) await this.svc.update("quests", { id: q.id, user_id: this.userId }, { status: "exempt", config: { ...q.config, recoveryPass: true } });
        await this.notify("quest", "[RECOVERY PASS]", "Today's physical quests are waived. Rest well and return stronger.");
        events.push({ type: "info", title: "Recovery pass used", body: "Today's physical quests are waived without penalty." });
        break;
      }
      case "create_custom_quest":
        await this.createCustomQuest(data, cmd);
        break;
      case "create_custom_metric": {
        if (data.customMetrics.length >= 50) throw new GameError("Custom stat limit reached (50).");
        const slug = cmd.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "stat";
        const id = `custom_${slug}_${randomUUID().slice(0, 8)}`;
        await this.u.insert("metrics", { id, user_id: this.userId, attribute_code: cmd.attribute, name: cmd.name, unit_kind: cmd.unit, direction: cmd.direction, description: cmd.description, input: "manual", is_custom: true, config: {} });
        break;
      }
      case "delete_custom_metric": {
        const m = data.customMetrics.find((x) => x.id === cmd.metricId);
        if (!m) throw new GameError("Custom stat not found", 404);
        for (const e of data.entries.filter((x) => x.metric_id === m.id)) await this.reverseFor(data, e.id, "Custom stat deleted");
        await this.u.delete("metrics", { id: m.id, user_id: this.userId });
        break;
      }
      case "start_dungeon":
        await this.startDungeon(data, cmd);
        break;
      case "pause_dungeon":
      case "resume_dungeon":
        await this.pauseResume(data, cmd.sessionId, cmd.type === "pause_dungeon");
        break;
      case "complete_dungeon":
        await this.completeDungeon(data, cmd, events);
        break;
      case "retreat_dungeon":
        await this.retreatDungeon(data, cmd.sessionId, events);
        break;
      case "equip_title":
        if (cmd.titleCode === null) await this.u.delete("equipped_titles", { user_id: this.userId });
        else {
          if (!data.titleUnlocks.some((t) => t.title_code === cmd.titleCode)) throw new GameError("That title has not been earned.", 403);
          await this.u.upsert("equipped_titles", { user_id: this.userId, title_code: cmd.titleCode, equipped_at: new Date().toISOString() }, ["user_id"]);
        }
        break;
      case "mark_notifications_read": {
        const ids = cmd.ids ?? data.notifications.filter((n) => !n.read_at).map((n) => n.id);
        for (const id of ids) await this.u.update("notifications", { id, user_id: this.userId }, { read_at: new Date().toISOString() });
        break;
      }
      case "daily_login": {
        const last = data.settings.last_login_on;
        const firstToday = last !== data.today;
        let streak = data.settings.login_streak;
        if (firstToday) {
          streak = last && daysBetween(last, data.today) === 1 ? streak + 1 : 1;
          await this.svc.update("settings", { user_id: this.userId }, { last_login_on: data.today, login_streak: streak });
        }
        const newQuests = data.quests.filter((q) => q.kind === "daily" && q.period_start === data.today).length;
        const penaltyRows = data.xp.filter((x) => x.kind === "penalty" && x.awarded_on === data.today && x.source_type === "quest_failed");
        const zoneFailed = data.xp.some((x) => x.kind === "penalty" && x.awarded_on === data.today && x.source_type === "penalty_zone");
        const zone = data.quests.find((q) => q.kind === "penalty" && q.period_start === data.today && q.status === "active");
        const penalties = penaltyRows.length || zone || zoneFailed ? { xp: -data.xp.filter((x) => x.kind === "penalty" && x.awarded_on === data.today).reduce((a, x) => a + x.amount, 0), failed: penaltyRows.map((x) => x.reason.replace(/^Quest failed: /, "")), zone: Boolean(zone), zoneFailed } : undefined;
        events.push({ type: "daily_login", streak, firstToday, newQuests, penalties });
        break;
      }
      case "trial_completed": {
        const t = data.trials.find((x) => x.id === cmd.sessionId);
        if (!t || t.status !== "completed") throw new GameError("Trial not found or not completed.", 404);
        if (!data.activities.some((a) => a.idempotency_key === `trial:${t.id}`)) {
          const minutes = t.completed_at ? Math.max(1, Math.round((Date.parse(t.completed_at) - Date.parse(t.started_at)) / 60_000)) : null;
          await this.logActivity(data, { type: "log_activity", activity: "system_trial", durationMin: minutes, quantity: t.score, occurredOn: data.today, note: `${t.kind} trial`, idempotencyKey: `trial:${t.id}`, confirmDuplicate: true }, events, "trial", { trialSessionId: t.id, kind: t.kind });
        }
        break;
      }
      case "sync":
        break;
    }

    const { data: after, ev } = await this.progress(events);
    this.diffEvents(before, ev, events, focusMetric);
    await this.cacheLevel(ev);
    return { events, snapshot: buildSnapshot(after, ev, this.db.kind) };
  }

  // ───────────────────────────── Import / export ─────────────────────────────

  async exportData(): Promise<Record<string, unknown>> {
    const data = await this.load();
    return {
      format: "system-irl-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: data.profile,
      settings: data.settings,
      customMetrics: data.customMetrics,
      metricEntries: data.entries,
      activities: data.activities,
      quests: data.quests,
      questObjectives: data.objectives,
      questCompletions: data.questCompletions,
      dungeonSessions: data.sessions,
      xpLedger: data.xp,
      skillUnlocks: data.skillUnlocks,
      achievementUnlocks: data.achievementUnlocks,
      titleUnlocks: data.titleUnlocks,
    };
  }

  /**
   * Imports measurements, activities, custom stats and (optionally) the profile from an export.
   * XP, unlocks and quest history are NOT imported, because the server re-derives them. Imported
   * activities earn no activity XP, though achievements they satisfy may unlock.
   */
  async importData(raw: unknown): Promise<{ imported: Record<string, number>; events: GameEvent[]; snapshot: PlayerSnapshot }> {
    const parsed = ImportSchema.safeParse(raw);
    if (!parsed.success) throw new GameError("Import file is not a valid SYSTEM IRL export: " + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const inp = parsed.data;
    const data = await this.load();
    const counts = { customMetrics: 0, metricEntries: 0, activities: 0 };
    const idMap = new Map<string, string>();
    for (const m of inp.customMetrics) {
      const existing = data.customMetrics.find((c) => c.name === m.name && c.attribute_code === m.attribute_code);
      if (existing) {
        idMap.set(m.id, existing.id);
        continue;
      }
      const id = `custom_${m.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${randomUUID().slice(0, 8)}`;
      await this.u.insert("metrics", { id, user_id: this.userId, attribute_code: m.attribute_code, name: m.name, unit_kind: m.unit_kind, direction: m.direction, description: m.description ?? "", input: "manual", is_custom: true, config: {} });
      idMap.set(m.id, id);
      counts.customMetrics += 1;
    }
    const entries = inp.metricEntries
      .map((e) => ({ ...e, metric_id: idMap.get(e.metric_id) ?? e.metric_id }))
      .filter((e) => (METRIC_BY_ID[e.metric_id]?.input === "manual" || [...idMap.values()].includes(e.metric_id) || data.customMetrics.some((c) => c.id === e.metric_id)) && e.recorded_on <= data.today)
      .map((e) => ({ user_id: this.userId, metric_id: e.metric_id, value: e.value, recorded_on: e.recorded_on, context: e.context, note: e.note ?? null, source: "import", idempotency_key: `import:${e.idempotency_key ?? e.id}` }));
    for (let i = 0; i < entries.length; i += 200) counts.metricEntries += (await this.svc.insertIgnore("metric_entries", entries.slice(i, i + 200), ["user_id", "idempotency_key"])).length;
    const acts = inp.activities
      .filter((a) => ACTIVITY_BY_TYPE[a.type] && a.occurred_on <= data.today)
      .map((a) => ({ user_id: this.userId, type: a.type, duration_min: a.duration_min, quantity: a.quantity, occurred_on: a.occurred_on, occurred_at: a.occurred_at ?? `${a.occurred_on}T12:00:00.000Z`, details: { ...(a.details ?? {}), imported: true }, source: "import", idempotency_key: `import:${a.idempotency_key ?? a.id}` }));
    for (let i = 0; i < acts.length; i += 200) counts.activities += (await this.svc.insertIgnore("activity_logs", acts.slice(i, i + 200), ["user_id", "idempotency_key"])).length;
    const res = await this.execute({ type: "sync" });
    return { imported: counts, ...res };
  }

  // ───────────────────────────── Command handlers ─────────────────────────────

  private metricDef(data: GameData, id: string): MetricDef | null {
    const sys = METRIC_BY_ID[id];
    if (sys) return sys;
    const c = data.customMetrics.find((m) => m.id === id);
    return c ? customMetricDef(c) : null;
  }

  private async onboard(data: GameData, cmd: Extract<Command, { type: "complete_onboarding" }>) {
    if (data.profile.onboarded_at) throw new GameError("Already awakened.", 409);
    if (!cmd.profile.date_of_birth && !cmd.profile.age_years) throw new GameError("Provide a date of birth or an age so comparisons can be age-matched.");
    await this.svc.update("profiles", { user_id: this.userId }, { ...cmd.profile, onboarded_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await this.svc.update("settings", { user_id: this.userId }, { unit_system: cmd.unit_system });
    const rows = [];
    for (const m of cmd.metrics) {
      const def = METRIC_BY_ID[m.metricId];
      if (!def || def.input !== "manual") throw new GameError(`Unknown metric ${m.metricId}`);
      if (m.recordedOn > localDate(data.now, cmd.profile.timezone)) throw new GameError("Entries cannot be dated in the future.");
      rows.push({ user_id: this.userId, metric_id: m.metricId, value: m.value, recorded_on: m.recordedOn, context: m.context, note: m.note ?? null, source: "onboarding", idempotency_key: `onboarding:${m.metricId}:${m.context}` });
    }
    // Profile height/weight double as the first measurements.
    if (cmd.profile.weight_kg && !cmd.metrics.some((m) => m.metricId === "body_weight")) rows.push({ user_id: this.userId, metric_id: "body_weight", value: cmd.profile.weight_kg, recorded_on: localDate(data.now, cmd.profile.timezone), context: "current", note: "From onboarding", source: "onboarding", idempotency_key: "onboarding:body_weight:current" });
    if (cmd.profile.height_cm && !cmd.metrics.some((m) => m.metricId === "height")) rows.push({ user_id: this.userId, metric_id: "height", value: cmd.profile.height_cm, recorded_on: localDate(data.now, cmd.profile.timezone), context: "current", note: "From onboarding", source: "onboarding", idempotency_key: "onboarding:height:current" });
    if (rows.length) await this.svc.insertIgnore("metric_entries", rows, ["user_id", "idempotency_key"]);
    await this.notify("system", "[SYSTEM]", "You have been selected as a Player. The System is now active.");
    // Generate quests immediately so the first dashboard is populated.
    await this.ensureQuests(await this.load());
  }

  private async logMetric(data: GameData, cmd: Extract<Command, { type: "log_metric" }>, events: GameEvent[]) {
    const def = this.metricDef(data, cmd.metricId);
    if (!def) throw new GameError("Unknown metric", 404);
    if (def.input !== "manual") throw new GameError("This metric is computed automatically from your logs.");
    if (cmd.recordedOn > data.today) throw new GameError("Entries cannot be dated in the future.");
    if (cmd.value < 0 && def.unit !== "kg_per_week") throw new GameError("Value cannot be negative.");
    if (def.unit === "duration" && cmd.value <= 0) throw new GameError("Time must be positive.");
    if (def.unit === "gpa" && cmd.value > 5) throw new GameError("GPA must be on a 0–5 scale.");
    if (def.unit === "percent" && cmd.value > 100) throw new GameError("Percent must be 0–100.");
    if (def.unit === "rating" && (cmd.value < 1 || cmd.value > 10)) throw new GameError("Ratings are 1–10.");
    const prior = data.entries.filter((e) => e.metric_id === def.id);
    let inserted: MetricEntryRow[];
    try {
      inserted = await this.u.insert<MetricEntryRow>("metric_entries", { user_id: this.userId, metric_id: def.id, value: cmd.value, recorded_on: cmd.recordedOn, context: cmd.context, note: cmd.note ?? null, source: "manual", idempotency_key: cmd.idempotencyKey });
    } catch (e) {
      if (e instanceof UniqueViolationError) throw new GameError("This entry was already submitted.", 409);
      throw e;
    }
    const entry = inserted[0];
    const cfg = resolveXpConfig(data.settings.xp_config);
    const reversed = new Set(data.xp.filter((x) => x.reverses_id).map((x) => x.reverses_id));
    const loggedToday = data.xp.filter((x) => x.source_type === "metric_log" && x.awarded_on === data.today && !reversed.has(x.id)).length;
    const logXp = planMetricLogXp(cmd.context, loggedToday, cfg);
    if (logXp.amount > 0) {
      await this.award({ amount: logXp.amount, kind: "effort", attribute: def.attribute, sourceType: "metric_log", sourceId: entry.id, reason: `${logXp.reason}: ${def.name}`, key: `metric_log:${entry.id}`, day: data.today });
      events.push({ type: "xp", amount: logXp.amount, reason: `${logXp.reason}: ${def.name}`, attribute: def.attribute });
    } else events.push({ type: "xp_withheld", reason: logXp.reason });
    // Personal record (performance XP, separate from effort XP)
    const prKeyPrefix = `pr:${def.id}:`;
    const lastPr = data.xp.filter((x) => x.idempotency_key.startsWith(prKeyPrefix) && !reversed.has(x.id)).map((x) => x.awarded_on).sort().pop() ?? null;
    const pr = evaluatePersonalRecord(def, entry, prior, lastPr, data.today, cfg);
    if (pr.isRecord) {
      events.push({ type: "personal_record", metricId: def.id, name: def.name, value: entry.value, previous: pr.previousBest as number });
      await this.notify("record", "[NEW PERSONAL RECORD]", `${def.name}: you have surpassed your previous limit.`, { metricId: def.id, value: entry.value, previous: pr.previousBest });
      if (pr.amount > 0) {
        await this.award({ amount: pr.amount, kind: "performance", attribute: def.attribute, sourceType: "personal_record", sourceId: entry.id, reason: `Personal record: ${def.name}`, key: `${prKeyPrefix}${entry.id}`, day: data.today });
        events.push({ type: "xp", amount: pr.amount, reason: `Personal record: ${def.name}`, attribute: def.attribute });
      } else events.push({ type: "xp_withheld", reason: pr.reason });
    } else if (pr.isBaseline && cmd.context !== "historical") {
      events.push({ type: "baseline", metricId: def.id, name: def.name });
    }
  }

  private async logActivity(data: GameData, cmd: Omit<Extract<Command, { type: "log_activity" }>, "activity"> & { activity: string }, events: GameEvent[], source: "manual" | "dungeon" | "trial" = "manual", extraDetails: Record<string, unknown> = {}): Promise<ActivityRow> {
    const def = ACTIVITY_BY_TYPE[cmd.activity];
    if (cmd.occurredOn > data.today) throw new GameError("Activities cannot be dated in the future.");
    if (daysBetween(cmd.occurredOn, data.today) > 30 && source === "manual") throw new GameError("Activities older than 30 days can be added through data import.");
    if (def.requiresDuration && !(cmd.durationMin && cmd.durationMin > 0)) throw new GameError("Enter how many minutes it took.");
    const candidate = { type: cmd.activity, duration_min: cmd.durationMin, quantity: cmd.quantity, occurred_on: cmd.occurredOn };
    if (data.activities.some((a) => a.idempotency_key === cmd.idempotencyKey)) throw new GameError("This activity was already submitted.", 409);
    if (!cmd.confirmDuplicate && source === "manual" && !def.sets) {
      // occurred_at is stamped with server time at logging, so it doubles as the "logged at" time.
      const dup = findLikelyDuplicate(candidate, data.activities.map((a) => ({ ...a, created_at: a.occurred_at })), data.now);
      if (dup) throw new GameError("DUPLICATE: This looks identical to an activity you logged a few minutes ago. Submit again with confirmation if it's a separate session.", 409);
    }
    let inserted: ActivityRow[];
    try {
      inserted = await this.u.insert<ActivityRow>("activity_logs", { user_id: this.userId, type: cmd.activity, duration_min: cmd.durationMin, quantity: cmd.quantity, occurred_on: cmd.occurredOn, occurred_at: data.now.toISOString(), details: { note: cmd.note ?? null, ...extraDetails }, source, idempotency_key: cmd.idempotencyKey });
    } catch (e) {
      if (e instanceof UniqueViolationError) throw new GameError("This activity was already submitted.", 409);
      throw e;
    }
    const act = inserted[0];
    const cfg = resolveXpConfig(data.settings.xp_config);
    const reversed = new Set(data.xp.filter((x) => x.reverses_id).map((x) => x.reverses_id));
    const sameDayIds = new Set(data.activities.filter((a) => a.type === act.type && a.occurred_on === act.occurred_on).map((a) => a.id));
    const awardedSameType = data.xp.filter((x) => x.source_type === "activity" && x.source_id && sameDayIds.has(x.source_id) && !reversed.has(x.id)).length;
    const decision = planActivityXp(act, awardedSameType, cfg);
    if (decision.amount > 0) {
      await this.award({ amount: decision.amount, kind: "effort", attribute: def.attribute, sourceType: "activity", sourceId: act.id, reason: decision.reason, key: `activity:${act.id}`, day: data.today });
      events.push({ type: "xp", amount: decision.amount, reason: decision.reason, attribute: def.attribute });
    } else events.push({ type: "xp_withheld", reason: decision.reason });
    return act;
  }

  private async createCustomQuest(data: GameData, cmd: Extract<Command, { type: "create_custom_quest" }>) {
    const activeCustom = data.quests.filter((q) => (q.kind === "custom" || q.kind === "emergency") && q.status === "active").length;
    if (activeCustom >= 20) throw new GameError("Too many active custom quests (20).");
    for (const o of cmd.objectives) {
      const t = o.tracker;
      if ("activities" in t && !t.activities.every((a) => ACTIVITY_BY_TYPE[a])) throw new GameError("Unknown activity in objective.");
      if ("metric" in t && !this.metricDef(data, t.metric)) throw new GameError("Unknown metric in objective.");
    }
    if (cmd.deadline && Date.parse(cmd.deadline) <= data.now.getTime()) throw new GameError("Deadline must be in the future.");
    const cfg = resolveXpConfig(data.settings.xp_config);
    const diffBonus = { E: 10, D: 20, C: 30, B: 45, A: 60, S: 80 }[cmd.difficulty];
    // Custom-quest XP is computed by the server and capped; it is never taken from the client.
    const xp = Math.min(cfg.customQuestMax, diffBonus + 5 * cmd.objectives.length);
    const kind = cmd.deadline ? "emergency" : "custom";
    const inserted = await this.svc.insertIgnore<QuestRow>(
      "quests",
      {
        user_id: this.userId,
        kind,
        template_code: `custom:${cmd.idempotencyKey}`,
        title: cmd.title,
        description: cmd.description,
        attribute_code: cmd.attribute,
        difficulty: cmd.difficulty,
        period_start: data.today,
        period_end: null,
        deadline: cmd.deadline,
        status: "active",
        xp_reward: xp,
        config: { baseline: { acceptedAt: data.now.getTime() }, ...((await penaltiesEnabled(this.db)) ? { penalized: true, penaltyXp: questPenalty(xp, data.profile.difficulty) } : {}) },
      },
      ["user_id", "template_code", "period_start"],
    );
    if (!inserted.length) throw new GameError("This quest was already created.", 409);
    await this.svc.insert(
      "quest_objectives",
      cmd.objectives.map((o, i) => ({ quest_id: inserted[0].id, user_id: this.userId, sort_order: i, chapter: 1, title: o.title, tracker: o.tracker, target: o.tracker.type === "manual" || o.tracker.type === "metric_reach" ? 1 : o.target })),
    );
  }

  private async startDungeon(data: GameData, cmd: Extract<Command, { type: "start_dungeon" }>) {
    const def = DUNGEON_BY_CODE[cmd.code];
    if (cmd.minutes < def.minMinutes || cmd.minutes > def.maxMinutes) throw new GameError(`${def.name} runs ${def.minMinutes}–${def.maxMinutes} minutes.`);
    if (!def.modes.includes(cmd.mode)) throw new GameError("Mode not available for this dungeon.");
    if (data.sessions.some((s) => s.status === "active" || s.status === "paused")) throw new GameError("You are already inside a dungeon.", 409);
    const activity = def.code === "custom_gate" && cmd.activity ? cmd.activity : def.activity;
    try {
      await this.svc.insert("dungeon_sessions", {
        user_id: this.userId,
        dungeon_code: def.code,
        mode: cmd.mode,
        planned_minutes: cmd.minutes,
        objective: `${cmd.objective || def.objective}${activity !== def.activity ? ` [${activity}]` : ""}`,
        status: "active",
        started_at: data.now.toISOString(),
        last_resumed_at: data.now.toISOString(),
        idempotency_key: cmd.idempotencyKey,
      });
    } catch (e) {
      if (e instanceof UniqueViolationError) throw new GameError("Dungeon already started.", 409);
      throw e;
    }
  }

  private openSession(data: GameData, id: string): DungeonSessionRow {
    const s = data.sessions.find((x) => x.id === id);
    if (!s) throw new GameError("Dungeon session not found", 404);
    if (s.status !== "active" && s.status !== "paused") throw new GameError("This dungeon has already ended.", 409);
    return s;
  }

  private async pauseResume(data: GameData, id: string, pause: boolean) {
    const s = this.openSession(data, id);
    if (pause) {
      if (s.status !== "active") return;
      await this.svc.update("dungeon_sessions", { id, user_id: this.userId }, { status: "paused", active_seconds: activeSecondsNow(s, data.now), last_resumed_at: null, pause_count: s.pause_count + 1 });
    } else {
      if (s.status !== "paused") return;
      await this.svc.update("dungeon_sessions", { id, user_id: this.userId }, { status: "active", last_resumed_at: data.now.toISOString() });
    }
  }

  private sessionActivity(s: DungeonSessionRow): string {
    const def = DUNGEON_BY_CODE[s.dungeon_code];
    const m = s.objective.match(/\[([a-z_]+)\]$/);
    return m && ACTIVITY_BY_TYPE[m[1]] ? m[1] : def.activity;
  }

  private async completeDungeon(data: GameData, cmd: Extract<Command, { type: "complete_dungeon" }>, events: GameEvent[]) {
    const s = this.openSession(data, cmd.sessionId);
    const def = DUNGEON_BY_CODE[s.dungeon_code];
    const secs = activeSecondsNow(s, data.now);
    if (!canClear(s.planned_minutes, secs)) throw new GameError(`The boss still stands: ${Math.ceil((s.planned_minutes * 60 * 0.9 - secs) / 60)} more minutes needed to clear. Retreating keeps partial credit but costs XP.`);
    // Ending the session first prevents a double clear.
    const updated = await this.svc.update<DungeonSessionRow>("dungeon_sessions", { id: s.id, user_id: this.userId, status: s.status }, { status: "cleared", active_seconds: secs, ended_at: data.now.toISOString(), last_resumed_at: null });
    if (!updated.length) throw new GameError("Dungeon already ended.", 409);
    const minutes = creditedMinutes(s.mode, secs);
    const activity = this.sessionActivity(s);
    const quantity = def.completionInput === "distance" ? (cmd.distanceKm ?? null) : activity === "workout" ? (cmd.volumeKg ?? null) : null;
    await this.logActivity(data, { type: "log_activity", activity, durationMin: minutes, quantity, occurredOn: data.today, note: `Dungeon: ${def.name}`, idempotencyKey: `dungeon:${s.id}`, confirmDuplicate: true }, events, "dungeon", { dungeonSessionId: s.id });
    if (def.completionInput === "score" && cmd.scorePct !== null && cmd.scorePct !== undefined) {
      await this.u.insert("metric_entries", { user_id: this.userId, metric_id: "knowledge_assessment", value: cmd.scorePct, recorded_on: data.today, context: "test", note: `Boss dungeon: ${def.name}`, source: "dungeon", idempotency_key: `dungeon_score:${s.id}` });
    }
    const clearsToday = data.sessions.filter((x) => x.status === "cleared" && x.ended_at && localDate(new Date(x.ended_at), data.profile.timezone) === data.today).length;
    const uninterrupted = s.pause_count === 0;
    let bonus = 0;
    if (clearsToday < DUNGEON_DAILY_BONUS_CAP) {
      bonus = DUNGEON_CLEAR_XP[def.difficulty] + (uninterrupted && def.code === "deep_focus" ? Math.round(DUNGEON_CLEAR_XP[def.difficulty] * 0.2) : 0);
      const attr = ACTIVITY_BY_TYPE[activity].attribute;
      await this.award({ amount: bonus, kind: "dungeon", attribute: attr, sourceType: "dungeon", sourceId: s.id, reason: `Dungeon cleared: ${def.name}`, key: `dungeon_clear:${s.id}`, day: data.today });
      await this.svc.update("dungeon_sessions", { id: s.id, user_id: this.userId }, { xp_awarded: bonus });
    } else events.push({ type: "xp_withheld", reason: `Dungeon clear bonus is limited to ${DUNGEON_DAILY_BONUS_CAP} per day; activity XP still applies.` });
    events.push({ type: "dungeon_clear", name: def.name, xp: bonus, boss: def.boss ?? null, uninterrupted });
    await this.notify("dungeon", "[DUNGEON CLEARED]", `${def.name} cleared in ${minutes} minutes${bonus ? ` (+${bonus} XP)` : ""}.`);
  }

  private async retreatDungeon(data: GameData, id: string, events: GameEvent[]) {
    const s = this.openSession(data, id);
    const def = DUNGEON_BY_CODE[s.dungeon_code];
    const secs = activeSecondsNow(s, data.now);
    const updated = await this.svc.update("dungeon_sessions", { id: s.id, user_id: this.userId, status: s.status }, { status: "retreated", active_seconds: secs, ended_at: data.now.toISOString(), last_resumed_at: null });
    if (!updated.length) throw new GameError("Dungeon already ended.", 409);
    const minutes = creditedMinutes(s.mode, secs);
    let credited = 0;
    if (minutes >= RETREAT_CREDIT_MINUTES) {
      const activity = this.sessionActivity(s);
      const adef = ACTIVITY_BY_TYPE[activity];
      if (qualifiesForXp(adef, { duration_min: minutes, quantity: null }).qualifies || !adef.requiresDuration) {
        await this.logActivity(data, { type: "log_activity", activity, durationMin: minutes, quantity: null, occurredOn: data.today, note: `Partial dungeon: ${def.name}`, idempotencyKey: `dungeon:${s.id}`, confirmDuplicate: true }, events, "dungeon", { dungeonSessionId: s.id, retreated: true });
        credited = minutes;
      }
    }
    let penalty = 0;
    if (await penaltiesEnabled(this.db)) {
      const amount = flatPenalty(DUNGEON_RETREAT_PENALTY, data.profile.difficulty);
      if (await this.penalize(data, { amount, attribute: "DIS", sourceType: "dungeon_retreat", sourceId: s.id, reason: `Retreated from ${def.name}`, key: `penalty:dungeon:${s.id}` })) penalty = amount;
    }
    events.push({ type: "dungeon_retreat", name: def.name, creditedMinutes: credited, penalty });
  }
}
