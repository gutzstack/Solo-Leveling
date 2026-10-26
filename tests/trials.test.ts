import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { digitSequence, expected, reasoningItem, REASONING_ITEMS, replayRating, speedProblems } from "@/lib/domain/trials";
import type { LocalDatabase } from "@/lib/server/db/local";
import { PermissionError } from "@/lib/server/db/types";
import { TrialService } from "@/lib/server/game/trials";
import { parseCsv, parseQuestionsCsv, handleQuestions } from "@/lib/server/questions";
import { onboardedPlayer, testClock, testDb } from "./helpers";

describe("trial generators", () => {
  it("reasoning items are deterministic, valid and harder at higher levels", () => {
    for (let level = 1; level <= 10; level++) {
      for (let seed = 1; seed <= 40; seed++) {
        const a = reasoningItem(seed, level);
        expect(reasoningItem(seed, level)).toEqual(a);
        expect(a.choices).toHaveLength(4);
        expect(new Set(a.choices).size).toBe(4);
        expect(a.answer).toBeGreaterThanOrEqual(0);
        expect(a.answer).toBeLessThan(4);
        expect(a.choices.every(Number.isFinite)).toBe(true);
      }
    }
  });
  it("digit sequences have the requested length and no immediate repeats", () => {
    const s = digitSequence(42, 8, 0, false);
    expect(s).toHaveLength(8);
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
    expect(digitSequence(42, 8, 0, false)).toEqual(s);
    expect(digitSequence(42, 8, 1, false)).not.toEqual(s);
  });
  it("speed problems have integer answers", () => {
    for (const p of speedProblems(7)) expect(Number.isInteger(p.answer)).toBe(true);
  });
  it("ratings rise with correct answers on hard items and fall on misses of easy ones", () => {
    expect(expected(1000, 1000)).toBeCloseTo(0.5, 5);
    const up = replayRating(Array.from({ length: 10 }, () => ({ itemRating: 1300, correct: true })));
    const down = replayRating(Array.from({ length: 10 }, () => ({ itemRating: 800, correct: false })));
    expect(up).toBeGreaterThan(1000);
    expect(down).toBeLessThan(1000);
    // hard correct answers raise the rating more than easy ones
    expect(replayRating([{ itemRating: 1400, correct: true }])).toBeGreaterThan(replayRating([{ itemRating: 700, correct: true }]));
  });
});

describe("question import", () => {
  it("parses quoted CSV and validates rows", () => {
    expect(parseCsv('a,"b, with comma","say ""hi"""\n1,2,3')).toEqual([["a", "b, with comma", 'say "hi"'], ["1", "2", "3"]]);
    const { questions, errors } = parseQuestionsCsv("question,a,b,c,d,answer,topic,difficulty\nWhat is 2+2?,3,4,5,6,B,Math,easy\nBroken row,,,,,A,,\n");
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ answerIndex: 1, topic: "Math", difficulty: "easy" });
    expect(errors).toHaveLength(1);
  });
});

let db: LocalDatabase;
beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => db.close());

async function sessionSeed(id: string): Promise<number> {
  return (await db.service().select<{ seed: number }>("trial_sessions", { eq: { id } }))[0].seed;
}

describe("trial sessions (server-authoritative)", () => {
  it("reasoning: scores answers server-side, adapts difficulty, completes after 12 items and feeds INT", async () => {
    const clock = testClock();
    const { userId, game } = await onboardedPlayer(db, clock, false);
    const trials = new TrialService(db, userId, clock.now);
    let { view } = await trials.handle({ action: "start", kind: "reasoning" });
    const seed = await sessionSeed(view!.id);
    let completed: string | null = null;
    for (let i = 0; i < REASONING_ITEMS; i++) {
      const item = reasoningItem(seed + i, view!.reasoning!.level);
      clock.advance(5_000);
      const r = await trials.handle({ action: "answer", sessionId: view!.id, choice: item.answer });
      expect(r.view!.last?.correct).toBe(true);
      view = r.view;
      completed = r.completedId;
    }
    expect(completed).not.toBeNull();
    expect(view!.result!.score).toBeGreaterThan(1000);
    const res = await game.execute({ type: "trial_completed", sessionId: completed! });
    expect(res.events).toContainEqual(expect.objectContaining({ type: "xp", amount: 25, attribute: "INT" }));
    const rr = res.snapshot.metrics.find((m) => m.id === "reasoning_rating")!;
    expect(rr.current?.value).toBeGreaterThan(1000);
    expect(rr.rank).not.toBeNull();
    // logging the same trial twice doesn't award twice
    const again = await game.execute({ type: "trial_completed", sessionId: completed! });
    expect(again.events.find((e) => e.type === "xp")).toBeUndefined();
  });

  it("reasoning: an answer after the time limit counts as wrong", async () => {
    const clock = testClock();
    const { userId } = await onboardedPlayer(db, clock, false);
    const trials = new TrialService(db, userId, clock.now);
    const { view } = await trials.handle({ action: "start", kind: "reasoning" });
    const seed = await sessionSeed(view!.id);
    const item = reasoningItem(seed, view!.reasoning!.level);
    clock.advance(120_000);
    const r = await trials.handle({ action: "answer", sessionId: view!.id, choice: item.answer });
    expect(r.view!.last?.correct).toBe(false);
  });

  it("memory: forward then backward span, two misses end each half", async () => {
    const clock = testClock();
    const { userId } = await onboardedPlayer(db, clock, false);
    const trials = new TrialService(db, userId, clock.now);
    let { view } = await trials.handle({ action: "start", kind: "memory" });
    let completed: string | null = null;
    // pass lengths 3,4,5 forward, then fail twice; pass 2,3,4 backward, then fail twice
    for (let guard = 0; guard < 40 && !completed; guard++) {
      const m = view!.memory!;
      const pass = m.phase === "forward" ? m.length <= 5 : m.length <= 4;
      const digits = pass ? (m.phase === "backward" ? [...m.sequence].reverse() : m.sequence).join("") : "0";
      const r = await trials.handle({ action: "recall", sessionId: view!.id, digits });
      view = r.view;
      completed = r.completedId;
    }
    expect(view!.result!.details).toMatchObject({ forward: 5, backward: 4 });
    expect(view!.result!.score).toBe(9);
  });

  it("speed: scores only correct answers and rejects late or instant submissions", async () => {
    const clock = testClock();
    const { userId } = await onboardedPlayer(db, clock, false);
    const trials = new TrialService(db, userId, clock.now);
    const { view } = await trials.handle({ action: "start", kind: "speed" });
    const seed = await sessionSeed(view!.id);
    const answers = speedProblems(seed).slice(0, 20).map((p, i) => (i < 15 ? p.answer : -1));
    await expect(trials.handle({ action: "submit_speed", sessionId: view!.id, answers })).rejects.toThrow(/Too fast/);
    clock.advance(60_000);
    const r = await trials.handle({ action: "submit_speed", sessionId: view!.id, answers });
    expect(r.view!.result!.score).toBe(15);
    const { view: v2 } = await trials.handle({ action: "start", kind: "speed" });
    clock.advance(200_000);
    await expect(trials.handle({ action: "submit_speed", sessionId: v2!.id, answers: [] })).rejects.toThrow(/Time limit/);
  });

  it("knowledge: needs imported questions and grades against the answer key", async () => {
    const clock = testClock();
    const { userId } = await onboardedPlayer(db, clock, false);
    const trials = new TrialService(db, userId, clock.now);
    await expect(trials.handle({ action: "start", kind: "knowledge" })).rejects.toThrow(/at least 5 questions/);
    const csv = ["question,a,b,c,d,answer,topic,difficulty", ...Array.from({ length: 8 }, (_, i) => `Q${i}: pick the first,right${i},wrong,wrong2,wrong3,A,T${i % 2},hard`)].join("\n");
    const imp = await handleQuestions(db, userId, { action: "import", deck: "Test", format: "csv", text: csv });
    expect(imp).toMatchObject({ inserted: 8 });
    let { view } = await trials.handle({ action: "start", kind: "knowledge" });
    expect(view!.knowledge!.total).toBe(8);
    let done: string | null = null;
    while (!done) {
      clock.advance(3_000);
      const r = await trials.handle({ action: "answer", sessionId: view!.id, choice: 0 });
      expect(r.view!.last?.correct).toBe(true);
      view = r.view;
      done = r.completedId;
    }
    expect(view!.result!.score).toBeGreaterThan(1000);
  });

  it("players cannot read answer keys or write trial results directly", async () => {
    const clock = testClock();
    const { userId } = await onboardedPlayer(db, clock, false);
    await new TrialService(db, userId, clock.now).handle({ action: "start", kind: "reasoning" });
    await expect(db.user(userId).select("trial_sessions")).rejects.toBeInstanceOf(PermissionError);
    await expect(db.user(userId).insert("trial_sessions", { user_id: userId, kind: "speed", seed: 1, status: "completed", score: 999 })).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("INT is no longer ranked on GPA", () => {
  it("GPA entries don't produce an INT rank; trial metrics do", async () => {
    const { game } = await onboardedPlayer(db);
    const snap = await game.snapshot();
    const gpa = snap.metrics.find((m) => m.id === "undergrad_gpa")!;
    expect(gpa.current?.value).toBeCloseTo(3.4);
    expect(gpa.rank).toBeNull();
    expect(gpa.excludeFromScore).toBe(true);
    const int = snap.attributes.find((a) => a.code === "INT")!;
    expect(int.scoredMetrics).toBe(0);
    expect(int.rank).toBeNull();
  });
});
