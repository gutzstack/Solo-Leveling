import { randomInt } from "node:crypto";
import { z } from "zod";
import {
  digitSequence,
  KNOWLEDGE_ITEMS,
  KNOWLEDGE_RATING,
  nextReasoningLevel,
  REASONING_ITEMS,
  reasoningItem,
  reasoningItemRating,
  replayRating,
  SPAN_MAX,
  SPAN_START,
  SPEED_SECONDS,
  speedProblems,
  type TrialKind,
} from "../../domain/trials";
import type { TrialAttempt } from "../../game/rows";
import type { Database, DataClient } from "../db/types";
import { GameError } from "./service";

/**
 * Trial sessions are server-authoritative: items are generated from a server-side seed, the
 * answer key lives in `trial_sessions.state` (not client-readable), and answers are checked here.
 */

const ITEM_SECONDS = 60;
const STALE_MINUTES = 30;

interface QuestionRow {
  id: string;
  deck: string;
  topic: string;
  prompt: string;
  choices: string[];
  answer_index: number;
  explanation: string | null;
  difficulty: "easy" | "medium" | "hard";
  source: "import" | "ai";
}

type ReasoningState = { kind: "reasoning"; index: number; level: number; itemStartedAt: number };
type MemoryState = { kind: "memory"; phase: "forward" | "backward"; length: number; attempt: number; misses: number; forwardBest: number; backwardBest: number; shownAt: number };
type SpeedState = { kind: "speed"; startedAt: number };
type KnowledgeState = { kind: "knowledge"; ids: string[]; index: number; itemStartedAt: number };
type TrialState = ReasoningState | MemoryState | SpeedState | KnowledgeState;

interface SessionRow {
  id: string;
  user_id: string;
  kind: TrialKind;
  status: "active" | "completed" | "abandoned";
  seed: number;
  state: TrialState;
  results: { attempts?: TrialAttempt[]; forward?: number; backward?: number; correct?: number; attempted?: number; rating?: number; topics?: Record<string, { correct: number; total: number }> };
  score: number | null;
  started_at: string;
  completed_at: string | null;
}

export const TrialRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), kind: z.enum(["reasoning", "memory", "speed", "knowledge"]), deck: z.string().max(60).optional() }),
  z.object({ action: z.literal("answer"), sessionId: z.string().uuid(), choice: z.number().int().min(0).max(5) }),
  z.object({ action: z.literal("recall"), sessionId: z.string().uuid(), digits: z.string().regex(/^\d{0,20}$/) }),
  z.object({ action: z.literal("submit_speed"), sessionId: z.string().uuid(), answers: z.array(z.number().int().min(-1000).max(100000).nullable()).max(200) }),
  z.object({ action: z.literal("abandon"), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("current") }),
]);
export type TrialRequest = z.infer<typeof TrialRequestSchema>;

export interface TrialView {
  id: string;
  kind: TrialKind;
  status: SessionRow["status"];
  /** feedback for the answer just given */
  last?: { correct: boolean; correctChoice?: number; expected?: string; explanation?: string | null };
  reasoning?: { index: number; total: number; level: number; secondsPerItem: number; item: { format: "series" | "grid"; prompt: string; series?: (number | null)[]; grid?: (number | null)[]; choices: number[] } };
  memory?: { phase: "forward" | "backward"; length: number; attempt: number; sequence: number[]; forwardBest: number; backwardBest: number };
  speed?: { problems: string[]; seconds: number };
  knowledge?: { index: number; total: number; secondsPerItem: number; item: { prompt: string; choices: string[]; topic: string; deck: string; difficulty: string; source: string } };
  result?: { score: number; summary: string; details: Record<string, number | string> };
}

export class TrialService {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private get svc(): DataClient {
    return this.db.service();
  }

  private async session(id: string): Promise<SessionRow> {
    const rows = await this.svc.select<SessionRow>("trial_sessions", { eq: { id, user_id: this.userId } });
    if (!rows[0]) throw new GameError("Trial not found.", 404);
    return rows[0];
  }

  private async active(): Promise<SessionRow | null> {
    const rows = await this.svc.select<SessionRow>("trial_sessions", { eq: { user_id: this.userId, status: "active" } });
    const s = rows[0] ?? null;
    if (s && this.clock().getTime() - Date.parse(s.started_at) > STALE_MINUTES * 60_000) {
      await this.svc.update("trial_sessions", { id: s.id, user_id: this.userId }, { status: "abandoned", completed_at: this.clock().toISOString() });
      return null;
    }
    return s;
  }

  private async save(s: SessionRow, patch: Partial<SessionRow>) {
    const rows = await this.svc.update<SessionRow>("trial_sessions", { id: s.id, user_id: this.userId, status: "active" }, patch as Record<string, unknown>);
    if (!rows.length) throw new GameError("This trial has already ended.", 409);
    return rows[0];
  }

  async handle(req: TrialRequest): Promise<{ view: TrialView | null; completedId: string | null }> {
    switch (req.action) {
      case "current": {
        const s = await this.active();
        return { view: s ? await this.view(s) : null, completedId: null };
      }
      case "start":
        return { view: await this.start(req.kind, req.deck), completedId: null };
      case "abandon": {
        const s = await this.session(req.sessionId);
        if (s.status === "active") await this.save(s, { status: "abandoned", completed_at: this.clock().toISOString() });
        return { view: null, completedId: null };
      }
      case "answer":
      case "recall":
      case "submit_speed": {
        const s = await this.session(req.sessionId);
        if (s.status !== "active") throw new GameError("This trial has already ended.", 409);
        const next = await this.answer(s, req);
        return { view: next, completedId: next.status === "completed" ? s.id : null };
      }
    }
  }

  private async start(kind: TrialKind, deck?: string): Promise<TrialView> {
    if (await this.active()) throw new GameError("A trial is already in progress. Finish or abandon it first.", 409);
    const now = this.clock().getTime();
    const seed = randomInt(1, 2 ** 31 - 1);
    let state: TrialState;
    if (kind === "reasoning") state = { kind, index: 0, level: 3, itemStartedAt: now };
    else if (kind === "memory") state = { kind, phase: "forward", length: SPAN_START, attempt: 0, misses: 0, forwardBest: 0, backwardBest: 0, shownAt: now };
    else if (kind === "speed") state = { kind, startedAt: now };
    else {
      const ids = await this.pickQuestions(seed, deck);
      if (ids.length < 5) throw new GameError("Import at least 5 questions (not flagged) to take a Knowledge Trial.");
      state = { kind, ids, index: 0, itemStartedAt: now };
    }
    const rows = await this.svc.insert<SessionRow>("trial_sessions", { user_id: this.userId, kind, seed, state, results: { attempts: [] }, started_at: new Date(now).toISOString() });
    return this.view(rows[0]);
  }

  /** Prefer questions answered least and missed most; deterministic per seed. */
  private async pickQuestions(seed: number, deck?: string): Promise<string[]> {
    const qs = await this.db.user(this.userId).select<QuestionRow>("question_items", { eq: deck ? { user_id: this.userId, flagged: false, deck } : { user_id: this.userId, flagged: false } });
    const done = await this.svc.select<SessionRow>("trial_sessions", { eq: { user_id: this.userId, kind: "knowledge", status: "completed" } });
    const stats = new Map<string, { seen: number; wrong: number }>();
    for (const t of done) for (const a of t.results.attempts ?? []) {
      if (!a.questionId) continue;
      const st = stats.get(a.questionId) ?? { seen: 0, wrong: 0 };
      st.seen += 1;
      if (!a.correct) st.wrong += 1;
      stats.set(a.questionId, st);
    }
    let x = seed;
    const jitter = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    return qs
      .map((q) => {
        const st = stats.get(q.id) ?? { seen: 0, wrong: 0 };
        return { id: q.id, key: st.seen - 2 * st.wrong + jitter() * 1.5 };
      })
      .sort((a, b) => a.key - b.key)
      .slice(0, KNOWLEDGE_ITEMS)
      .map((q) => q.id);
  }

  private async question(id: string): Promise<QuestionRow> {
    const rows = await this.db.user(this.userId).select<QuestionRow>("question_items", { eq: { id, user_id: this.userId } });
    if (!rows[0]) throw new GameError("A question in this trial was deleted. Abandon the trial and start again.", 409);
    return rows[0];
  }

  private async answer(s: SessionRow, req: Extract<TrialRequest, { action: "answer" | "recall" | "submit_speed" }>): Promise<TrialView> {
    const now = this.clock().getTime();
    const st = s.state;
    const attempts = [...(s.results.attempts ?? [])];

    if (st.kind === "reasoning") {
      if (req.action !== "answer") throw new GameError("Wrong answer type for this trial.");
      const item = reasoningItem(s.seed + st.index, st.level);
      const ms = now - st.itemStartedAt;
      const inTime = ms <= (ITEM_SECONDS + 5) * 1000;
      const correct = inTime && req.choice === item.answer;
      attempts.push({ itemRating: reasoningItemRating(item.level), correct, ms, level: item.level });
      const last = { correct, correctChoice: item.answer, explanation: inTime ? null : "Time ran out for this item." };
      const index = st.index + 1;
      if (index >= REASONING_ITEMS) {
        const prior = await this.priorAttempts("reasoning");
        const rating = replayRating([...prior, ...attempts]);
        const saved = await this.save(s, { status: "completed", completed_at: new Date(now).toISOString(), results: { attempts, rating }, score: rating, state: { ...st, index } });
        return { ...(await this.view(saved)), last };
      }
      const saved = await this.save(s, { results: { attempts }, state: { ...st, index, level: nextReasoningLevel(st.level, correct), itemStartedAt: now } });
      return { ...(await this.view(saved)), last };
    }

    if (st.kind === "knowledge") {
      if (req.action !== "answer") throw new GameError("Wrong answer type for this trial.");
      const q = await this.question(st.ids[st.index]);
      const ms = now - st.itemStartedAt;
      const inTime = ms <= (ITEM_SECONDS * 2 + 5) * 1000;
      const correct = inTime && req.choice === q.answer_index;
      attempts.push({ itemRating: KNOWLEDGE_RATING[q.difficulty], correct, ms, topic: q.topic, questionId: q.id });
      const last = { correct, correctChoice: q.answer_index, explanation: inTime ? q.explanation : "Time ran out for this question." };
      const index = st.index + 1;
      if (index >= st.ids.length) {
        const prior = await this.priorAttempts("knowledge");
        const rating = replayRating([...prior, ...attempts]);
        const topics: Record<string, { correct: number; total: number }> = {};
        for (const a of attempts) {
          const t = (topics[a.topic ?? "General"] ??= { correct: 0, total: 0 });
          t.total += 1;
          if (a.correct) t.correct += 1;
        }
        const saved = await this.save(s, { status: "completed", completed_at: new Date(now).toISOString(), results: { attempts, rating, topics }, score: rating, state: { ...st, index } });
        return { ...(await this.view(saved)), last };
      }
      const saved = await this.save(s, { results: { attempts }, state: { ...st, index, itemStartedAt: now } });
      return { ...(await this.view(saved)), last };
    }

    if (st.kind === "memory") {
      if (req.action !== "recall") throw new GameError("Wrong answer type for this trial.");
      const seq = digitSequence(s.seed, st.length, st.attempt, st.phase === "backward");
      const expected = (st.phase === "backward" ? [...seq].reverse() : seq).join("");
      const correct = req.digits === expected;
      const last = { correct, expected };
      let { phase, length, attempt, misses, forwardBest, backwardBest } = st;
      if (correct) {
        if (phase === "forward") forwardBest = Math.max(forwardBest, length);
        else backwardBest = Math.max(backwardBest, length);
        length += 1;
        attempt = 0;
        misses = 0;
      } else {
        misses += 1;
        attempt += 1;
      }
      const phaseOver = misses >= 2 || length > SPAN_MAX;
      if (phaseOver && phase === "forward") {
        phase = "backward";
        length = SPAN_START - 1;
        attempt = 0;
        misses = 0;
      } else if (phaseOver) {
        const score = forwardBest + backwardBest;
        const saved = await this.save(s, { status: "completed", completed_at: new Date(now).toISOString(), results: { forward: forwardBest, backward: backwardBest }, score, state: { ...st, forwardBest, backwardBest } });
        return { ...(await this.view(saved)), last };
      }
      const saved = await this.save(s, { state: { kind: "memory", phase, length, attempt, misses, forwardBest, backwardBest, shownAt: now } });
      return { ...(await this.view(saved)), last };
    }

    // speed
    if (req.action !== "submit_speed") throw new GameError("Wrong answer type for this trial.");
    const elapsed = (now - st.startedAt) / 1000;
    if (elapsed < 10) throw new GameError("Too fast. The sprint runs for 60 seconds.");
    if (elapsed > SPEED_SECONDS + 20) {
      await this.save(s, { status: "abandoned", completed_at: new Date(now).toISOString() });
      throw new GameError("Time limit exceeded, so this attempt wasn't scored. Start a new Speed Trial.", 409);
    }
    const problems = speedProblems(s.seed);
    let correct = 0;
    let attempted = 0;
    req.answers.forEach((a, i) => {
      if (a === null || i >= problems.length) return;
      attempted += 1;
      if (a === problems[i].answer) correct += 1;
    });
    const score = Math.round((correct * 60) / SPEED_SECONDS);
    const saved = await this.save(s, { status: "completed", completed_at: new Date(now).toISOString(), results: { correct, attempted }, score, state: st });
    return this.view(saved);
  }

  private async priorAttempts(kind: "reasoning" | "knowledge"): Promise<TrialAttempt[]> {
    const done = await this.svc.select<SessionRow>("trial_sessions", { eq: { user_id: this.userId, kind, status: "completed" } });
    return done.sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? "")).flatMap((t) => t.results.attempts ?? []);
  }

  private async view(s: SessionRow): Promise<TrialView> {
    const base: TrialView = { id: s.id, kind: s.kind, status: s.status };
    if (s.status === "completed") {
      const r = s.results;
      if (s.kind === "reasoning" || s.kind === "knowledge") {
        const att = r.attempts ?? [];
        const right = att.filter((a) => a.correct).length;
        const details: Record<string, number | string> = { correct: `${right}/${att.length}`, rating: r.rating ?? 0 };
        if (s.kind === "reasoning") details.highestLevel = Math.max(0, ...att.filter((a) => a.correct).map((a) => a.level ?? 0));
        for (const [t, v] of Object.entries(r.topics ?? {})) details[`topic: ${t}`] = `${v.correct}/${v.total}`;
        return { ...base, result: { score: s.score ?? 0, summary: `${right} of ${att.length} correct · rating ${r.rating}`, details } };
      }
      if (s.kind === "memory") return { ...base, result: { score: s.score ?? 0, summary: `Forward span ${r.forward} + backward span ${r.backward} = ${s.score}`, details: { forward: r.forward ?? 0, backward: r.backward ?? 0 } } };
      return { ...base, result: { score: s.score ?? 0, summary: `${r.correct} correct of ${r.attempted} attempted in ${SPEED_SECONDS} s`, details: { correct: r.correct ?? 0, attempted: r.attempted ?? 0 } } };
    }
    if (s.status !== "active") return base;
    const st = s.state;
    if (st.kind === "reasoning") {
      const item = reasoningItem(s.seed + st.index, st.level);
      return { ...base, reasoning: { index: st.index, total: REASONING_ITEMS, level: st.level, secondsPerItem: ITEM_SECONDS, item: { format: item.format, prompt: item.prompt, series: item.series, grid: item.grid, choices: item.choices } } };
    }
    if (st.kind === "memory") {
      return { ...base, memory: { phase: st.phase, length: st.length, attempt: st.attempt, sequence: digitSequence(s.seed, st.length, st.attempt, st.phase === "backward"), forwardBest: st.forwardBest, backwardBest: st.backwardBest } };
    }
    if (st.kind === "speed") return { ...base, speed: { problems: speedProblems(s.seed).map((p) => p.text), seconds: SPEED_SECONDS } };
    const q = await this.question(st.ids[st.index]);
    return { ...base, knowledge: { index: st.index, total: st.ids.length, secondsPerItem: ITEM_SECONDS * 2, item: { prompt: q.prompt, choices: q.choices, topic: q.topic, deck: q.deck, difficulty: q.difficulty, source: q.source } } };
  }
}
