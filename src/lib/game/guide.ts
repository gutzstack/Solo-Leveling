import { ACTIVITY_BY_TYPE } from "../domain/activities";
import { ATTRIBUTE_BY_CODE } from "../domain/attributes";
import { addDays, daysBetween } from "../domain/dates";
import type { AttributeCode } from "../domain/types";
import { formatValue } from "../domain/units";
import type { PlayerSnapshot } from "../server/game/snapshot";
import { TRAINING_TYPES, STUDY_TYPES } from "./stats";

/**
 * Deterministic System Guide. Every statement is computed from the player's recorded data;
 * nothing is invented. The LLM guide (when configured) receives these same facts and may only
 * rephrase and prioritise them.
 */

export type GuideKind = "daily_briefing" | "weekly_summary" | "neglected" | "milestones" | "explain_stats" | "study_plan" | "recovery";

export interface GuideMessage {
  tag: string;
  title: string;
  body: string;
}

export interface GuideFacts {
  playerLevel: number;
  hunterRank: string | null;
  streak: number;
  activeDailyQuests: { title: string; progressPct: number }[];
  neglectedAttributes: { code: AttributeCode; name: string; daysSinceLastXp: number | null }[];
  last7: { xp: number; studyHours: number; trainingSessions: number; runKm: number; questsCompleted: number; prs: number; avgSleep: number | null; nightsLogged: number };
  prev7: { xp: number; studyHours: number; trainingSessions: number };
  nextMilestones: string[];
  strengths: string[];
  weaknesses: string[];
  nextExam: { name: string; date: string; daysAway: number } | null;
  consecutiveTrainingDays: number;
}

export function computeGuideFacts(s: PlayerSnapshot): GuideFacts {
  const today = s.today;
  const from7 = addDays(today, -6);
  const from14 = addDays(today, -13);
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const acts7 = s.activities.filter((a) => inRange(a.occurred_on, from7, today));
  const actsPrev = s.activities.filter((a) => inRange(a.occurred_on, from14, addDays(from7, -1)));
  const live = s.xpLedger.filter((x) => !x.reversed && x.kind !== "reversal");
  const sumXp = (a: string, b: string) => live.filter((x) => inRange(x.awarded_on, a, b)).reduce((t, x) => t + x.amount, 0);
  const minutes = (list: typeof acts7, types: string[]) => list.filter((a) => types.includes(a.type)).reduce((t, a) => t + (a.duration_min ?? 0), 0);
  const sleep = s.metrics.find((m) => m.id === "sleep_duration")?.history.filter((h) => inRange(h.date, from7, today)) ?? [];

  const neglected = s.attributes
    .filter((a) => a.tracked)
    .map((a) => {
      const last = live.filter((x) => x.attribute === a.code).map((x) => x.awarded_on).sort().pop() ?? null;
      return { code: a.code, name: a.name, daysSinceLastXp: last ? daysBetween(last, today) : null };
    })
    .filter((a) => a.daysSinceLastXp === null || a.daysSinceLastXp >= 7)
    .sort((x, y) => (y.daysSinceLastXp ?? 999) - (x.daysSinceLastXp ?? 999));

  const milestones: string[] = [];
  for (const q of s.quests.filter((q) => q.kind === "main" && q.status === "active")) {
    const ch = q.config?.chapters?.find((c) => c.number === q.currentChapter);
    const open = q.objectives.filter((o) => o.chapter === q.currentChapter && !o.progress.done);
    if (ch && open.length) milestones.push(`${q.title}, ${ch.name}: ${open.map((o) => `${o.title} (${o.progress.display})`).join("; ")}`);
  }
  const closeSkills = s.skills.filter((k) => k.available && k.progress >= 0.5).sort((a, b) => b.progress - a.progress).slice(0, 2);
  for (const k of closeSkills) milestones.push(`Skill ${k.name}: ${k.requirement.label} (${Math.round(k.progress * 100)}%)`);
  const closeAch = s.achievements.filter((a) => !a.unlocked && a.progress >= 0.6 && !a.secret).sort((a, b) => b.progress - a.progress).slice(0, 2);
  for (const a of closeAch) milestones.push(`Achievement "${a.name}": ${a.description} (${Math.round(a.progress * 100)}%)`);

  const ranked = s.metrics.filter((m) => m.score !== null && m.rank && !m.excludeFromScore).sort((a, b) => (b.score as number) - (a.score as number));
  const label = (m: (typeof ranked)[number]) => `${m.name}: ${m.rank} (${m.evidence === "personal" ? "game standard" : m.evidence})`;

  let consecutive = 0;
  for (let d = today; ; d = addDays(d, -1)) {
    if (s.activities.some((a) => a.occurred_on === d && TRAINING_TYPES.includes(a.type))) consecutive += 1;
    else break;
    if (consecutive > 30) break;
  }

  const exam = s.profile.academic_info?.nextExamDate;
  return {
    playerLevel: s.player.level.level,
    hunterRank: s.hunter.rank,
    streak: s.player.streak,
    activeDailyQuests: s.quests.filter((q) => q.kind === "daily" && q.period_start === today && q.status === "active").map((q) => ({ title: q.title, progressPct: Math.round(q.progress * 100) })),
    neglectedAttributes: neglected,
    last7: {
      xp: sumXp(from7, today),
      studyHours: Math.round((minutes(acts7, STUDY_TYPES) / 60) * 10) / 10,
      trainingSessions: acts7.filter((a) => TRAINING_TYPES.includes(a.type)).length,
      runKm: Math.round(acts7.filter((a) => a.type === "run").reduce((t, a) => t + (a.quantity ?? 0), 0) * 10) / 10,
      questsCompleted: s.quests.filter((q) => q.completed_at && inRange(q.completed_at.slice(0, 10), from7, today)).length,
      prs: s.notifications.filter((n) => n.kind === "record" && inRange(n.created_at.slice(0, 10), from7, today)).length,
      avgSleep: sleep.length ? Math.round((sleep.reduce((t, h) => t + h.value, 0) / sleep.length) * 10) / 10 : null,
      nightsLogged: sleep.length,
    },
    prev7: {
      xp: sumXp(from14, addDays(from7, -1)),
      studyHours: Math.round((minutes(actsPrev, STUDY_TYPES) / 60) * 10) / 10,
      trainingSessions: actsPrev.filter((a) => TRAINING_TYPES.includes(a.type)).length,
    },
    nextMilestones: milestones.slice(0, 6),
    strengths: ranked.slice(0, 3).map(label),
    weaknesses: ranked.length > 3 ? ranked.slice(-3).reverse().map(label) : [],
    nextExam: exam && exam >= today ? { name: s.profile.academic_info.nextExamName || "Upcoming exam", date: exam, daysAway: daysBetween(today, exam) } : null,
    consecutiveTrainingDays: consecutive,
  };
}

const trend = (a: number, b: number) => (b === 0 ? (a > 0 ? "up from zero" : "flat") : a > b ? `up ${Math.round(((a - b) / b) * 100)}%` : a < b ? `down ${Math.round(((b - a) / b) * 100)}%` : "unchanged");

export function deterministicGuide(kind: GuideKind, s: PlayerSnapshot): GuideMessage[] {
  const f = computeGuideFacts(s);
  const out: GuideMessage[] = [];
  const name = s.profile.display_name;
  switch (kind) {
    case "daily_briefing": {
      out.push({ tag: "[SYSTEM NOTIFICATION]", title: `Good day, ${name}.`, body: `Level ${f.playerLevel}${f.hunterRank ? ` · Hunter Rank ${f.hunterRank}` : ""} · ${f.streak}-day streak. ${f.activeDailyQuests.length ? `${f.activeDailyQuests.length} daily quest${f.activeDailyQuests.length === 1 ? "" : "s"} await: ${f.activeDailyQuests.map((q) => q.title).join("; ")}.` : "All of today's daily quests are complete."}` });
      if (f.nextExam && f.nextExam.daysAway <= 14) out.push({ tag: "[EMERGENCY]", title: `${f.nextExam.name} in ${f.nextExam.daysAway} day${f.nextExam.daysAway === 1 ? "" : "s"}`, body: "Prioritise retrieval practice and one timed practice block per day. Protect your sleep the two nights before." });
      if (f.neglectedAttributes.length) out.push(neglectMsg(f));
      out.push(...recoveryMsgs(f));
      if (f.nextMilestones[0]) out.push({ tag: "[NEXT EVOLUTION]", title: "Closest milestone", body: f.nextMilestones[0] });
      break;
    }
    case "weekly_summary":
      out.push({
        tag: "[WEEKLY REPORT]",
        title: "The last 7 days",
        body: `XP ${f.last7.xp} (${trend(f.last7.xp, f.prev7.xp)} vs. the week before). Study ${f.last7.studyHours} h (${trend(f.last7.studyHours, f.prev7.studyHours)}). Training sessions ${f.last7.trainingSessions} (${trend(f.last7.trainingSessions, f.prev7.trainingSessions)}). Running ${formatValue("distance", f.last7.runKm, s.settings.unit_system)}. Quests completed ${f.last7.questsCompleted}. New personal records ${f.last7.prs}.${f.last7.avgSleep !== null ? ` Average logged sleep ${f.last7.avgSleep} h over ${f.last7.nightsLogged} nights.` : " No sleep logged."}`,
      });
      if (f.strengths.length) out.push({ tag: "[STRENGTHS]", title: "Highest-ranked metrics", body: f.strengths.join(" · ") });
      if (f.weaknesses.length) out.push({ tag: "[WEAKNESSES]", title: "Lowest-ranked metrics", body: f.weaknesses.join(" · ") });
      break;
    case "neglected":
      out.push(f.neglectedAttributes.length ? neglectMsg(f) : { tag: "[SYSTEM]", title: "No neglected attributes", body: "Every tracked attribute earned XP in the last 7 days." });
      break;
    case "milestones":
      out.push(...(f.nextMilestones.length ? f.nextMilestones.map((m) => ({ tag: "[NEXT MILESTONE]", title: m.split(":")[0], body: m })) : [{ tag: "[SYSTEM]", title: "Log more data", body: "Milestones appear once you have activity and measurements recorded." }]));
      break;
    case "explain_stats":
      for (const a of s.attributes.filter((x) => x.tracked)) {
        out.push({ tag: `[${a.code}]`, title: `${a.name}: Lv ${a.level.level}${a.rank ? ` · ${a.rank}` : ""}`, body: `${a.xp} XP earned from logged actions (level), separate from rank. ${a.explanation}${a.strongest ? ` Strongest: ${a.strongest.name} (${a.strongest.rank}).` : ""}${a.weakest ? ` Weakest: ${a.weakest.name} (${a.weakest.rank}).` : ""}` });
      }
      out.push({ tag: "[HUNTER RANK]", title: s.hunter.rank ? `Hunter Rank ${s.hunter.rank}${s.hunter.provisional ? " (provisional)" : ""}` : "Hunter Rank unranked", body: s.hunter.explanation });
      break;
    case "study_plan": {
      const hrs = Math.max(1, Math.round(f.last7.studyHours / 7));
      const body = f.nextExam
        ? `${f.nextExam.name} is ${f.nextExam.daysAway} days away. Plan ${Math.max(2, hrs + 1)}–${Math.max(3, hrs + 2)} focused hours a day: start each session with 25 minutes of closed-book retrieval (flashcards or questions), then a 50-minute Deep Work Gate on weak topics, then a short review. Run a Boss Dungeon (timed practice exam) every 3–4 days, the last one 2 days before the exam. Keep 7–9 h of sleep, because memory consolidation depends on it.`
        : `You averaged ${f.last7.studyHours} study hours this week. A sustainable structure: two or three 50–90 minute focus dungeons a day, active recall before rereading, spaced flashcard review daily, and a weekly practice block. Add your next exam date in SYSTEM → Profile for a targeted plan.`;
      out.push({ tag: "[STUDY PLAN]", title: "Recommended structure", body });
      break;
    }
    case "recovery":
      out.push(...recoveryMsgs(f));
      if (!out.length) out.push({ tag: "[RECOVERY]", title: "Balanced", body: "No overtraining or sleep-debt signals in your recent logs. Keep at least one recovery day each week." });
      break;
  }
  return out;
}

function neglectMsg(f: GuideFacts): GuideMessage {
  const list = f.neglectedAttributes.slice(0, 3).map((a) => `${a.name} (${a.daysSinceLastXp === null ? "never trained" : `${a.daysSinceLastXp} days`})`);
  const first = f.neglectedAttributes[0];
  const suggestion = suggestionFor(first.code);
  return { tag: "[WARNING]", title: "Neglected attributes detected", body: `${list.join(", ")}. Suggested: ${suggestion}.` };
}

function suggestionFor(code: AttributeCode): string {
  const map: Record<AttributeCode, string> = {
    STR: "a 45-minute strength workout",
    END: "an easy 30-minute run",
    PHY: "a 15-minute mobility session and a weigh-in",
    INT: "a 50-minute Deep Work Gate",
    DIS: "clearing one dungeon and every daily quest today",
    WLT: "a 15-minute budget review",
    CHA: "reaching out to a friend or mentor",
    WIS: "a 5-minute reflection",
  };
  return map[code] ?? ACTIVITY_BY_TYPE.reflection.name;
}

function recoveryMsgs(f: GuideFacts): GuideMessage[] {
  const out: GuideMessage[] = [];
  if (f.consecutiveTrainingDays >= 6) out.push({ tag: "[RECOVERY]", title: `${f.consecutiveTrainingDays} training days in a row`, body: "Schedule a recovery day. Adaptation happens during rest, and no quest rewards training through exhaustion." });
  if (f.last7.avgSleep !== null && f.last7.avgSleep < 7) out.push({ tag: "[RECOVERY]", title: `Average sleep ${f.last7.avgSleep} h`, body: "Below the 7–9 h recommendation for young adults. Sleep comes before extra study hours; it consolidates what you learned." });
  return out;
}

export { ATTRIBUTE_BY_CODE };
