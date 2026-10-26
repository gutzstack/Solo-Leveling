import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LocalDatabase } from "@/lib/server/db/local";
import { GameService } from "@/lib/server/game/service";
import { key, onboardedPlayer, testClock, testDb } from "./helpers";

let db: LocalDatabase;
beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => {
  await db.close();
});

describe("onboarding", () => {
  it("creates the profile, initial entries, quests and the Awakening achievement", async () => {
    const { game } = await onboardedPlayer(db);
    const snap = await game.snapshot();
    expect(snap.profile.onboarded_at).not.toBeNull();
    const fiveK = snap.metrics.find((m) => m.id === "run_5k")!;
    // Current 5K is the recent 21:34, not the historical 19:30 PB.
    expect(fiveK.current?.value).toBe(21 * 60 + 34);
    expect(fiveK.personalBest?.value).toBe(19 * 60 + 30);
    expect(fiveK.personalBest?.context).toBe("historical");
    const mile = snap.metrics.find((m) => m.id === "mile_time")!;
    expect(mile.current).toBeNull();
    expect(mile.historicalOnly).toBe(true);
    expect(mile.rank).toBeNull();
    expect(snap.achievements.find((a) => a.code === "the_awakening")?.unlocked).toBe(true);
    // Past marathon-distance run is recognised (31 mi > 42.195 km)
    expect(snap.achievements.find((a) => a.code === "longest_run_km_42_195")?.unlocked).toBe(true);
    expect(snap.quests.filter((q) => q.kind === "daily").length).toBeGreaterThanOrEqual(3);
    expect(snap.quests.filter((q) => q.kind === "weekly").length).toBeGreaterThanOrEqual(3);
    expect(snap.quests.filter((q) => q.kind === "main").map((q) => q.template_code).sort()).toEqual(["main_financial", "main_limiter", "main_titan", "main_white_coat"]);
    // Unprovided metrics stay blank
    expect(snap.metrics.find((m) => m.id === "squat_1rm")?.current).toBeNull();
    // Bench is ranked against a game standard (no population data), with explicit evidence label
    const bench = snap.metrics.find((m) => m.id === "bench_press_1rm")!;
    expect(bench.evidence).toBe("personal");
    expect(bench.populationMessage).toBe("Population percentile unavailable — tracking personal progression.");
    // Body weight is compared descriptively against NHANES men 20–24, without a rank
    const bw = snap.metrics.find((m) => m.id === "body_weight")!;
    expect(bw.primary?.evidence).toBe("verified");
    expect(bw.primary?.descriptive).toBe(true);
    expect(bw.rank).toBeNull();
  });

  it("rejects commands before onboarding", async () => {
    const userId = (await db.raw<{ id: string }>("insert into auth.users (email, encrypted_password) values ('pre@x.test','x') returning id"))[0].id;
    const game = new GameService(db, userId);
    await game.ensureBootstrap();
    await expect(game.execute({ type: "log_activity", activity: "study", durationMin: 30, quantity: null, occurredOn: "2026-10-20", idempotencyKey: key() })).rejects.toThrow(/onboarding/);
  });
});

describe("activities and XP", () => {
  it("awards effort XP, enforces the meaningful-completion bar and daily caps", async () => {
    const clock = testClock();
    const { game } = await onboardedPlayer(db, clock);
    const day = "2026-10-20";
    const short = await game.execute({ type: "log_activity", activity: "study", durationMin: 5, quantity: null, occurredOn: day, idempotencyKey: key() });
    expect(short.events.find((e) => e.type === "xp_withheld")).toBeTruthy();
    const before = short.snapshot.player.level.totalXp;
    const ok = await game.execute({ type: "log_activity", activity: "workout", durationMin: 45, quantity: null, occurredOn: day, idempotencyKey: key() });
    expect(ok.events).toContainEqual(expect.objectContaining({ type: "xp", amount: 50 }));
    expect(ok.snapshot.player.level.totalXp).toBeGreaterThanOrEqual(before + 50);
    // workouts cap at 2/day
    clock.advance(20 * 60_000);
    await game.execute({ type: "log_activity", activity: "workout", durationMin: 30, quantity: null, occurredOn: day, idempotencyKey: key() });
    clock.advance(20 * 60_000);
    const third = await game.execute({ type: "log_activity", activity: "workout", durationMin: 35, quantity: null, occurredOn: day, idempotencyKey: key() });
    expect(third.events.find((e) => e.type === "xp" && e.reason.includes("Strength"))).toBeUndefined();
    expect(third.events).toContainEqual(expect.objectContaining({ type: "xp_withheld" }));
  });

  it("rejects duplicate submissions (idempotency key) and likely duplicates", async () => {
    const { game } = await onboardedPlayer(db);
    const k = key();
    const cmd = { type: "log_activity" as const, activity: "run", durationMin: 30, quantity: 5, occurredOn: "2026-10-20", idempotencyKey: k };
    await game.execute(cmd);
    await expect(game.execute(cmd)).rejects.toThrow(/already submitted/);
    await expect(game.execute({ ...cmd, idempotencyKey: key() })).rejects.toThrow(/DUPLICATE/);
    const forced = await game.execute({ ...cmd, idempotencyKey: key(), confirmDuplicate: true });
    expect(forced.snapshot.activities.filter((a) => a.type === "run").length).toBe(2);
  });

  it("reverses XP when an activity is deleted (auditable ledger)", async () => {
    const { game } = await onboardedPlayer(db);
    const r = await game.execute({ type: "log_activity", activity: "reading", durationMin: 30, quantity: 20, occurredOn: "2026-10-20", idempotencyKey: key() });
    const act = r.snapshot.activities.find((a) => a.type === "reading")!;
    const xpBefore = r.snapshot.player.level.totalXp;
    const d = await game.execute({ type: "delete_activity", activityId: act.id });
    expect(d.snapshot.player.level.totalXp).toBe(xpBefore - 15);
    const rev = d.snapshot.xpLedger.filter((x) => x.kind === "reversal");
    expect(rev.length).toBe(1);
    expect(rev[0].amount).toBe(-15);
  });
});

describe("metrics, PRs and ranks", () => {
  it("separates baseline, PR XP and historical entries", async () => {
    const { game } = await onboardedPlayer(db);
    const base = await game.execute({ type: "log_metric", metricId: "squat_1rm", value: 100, recordedOn: "2026-10-20", context: "current", idempotencyKey: key() });
    expect(base.events).toContainEqual(expect.objectContaining({ type: "baseline", metricId: "squat_1rm" }));
    const pr = await game.execute({ type: "log_metric", metricId: "squat_1rm", value: 105, recordedOn: "2026-10-20", context: "current", idempotencyKey: key() });
    expect(pr.events).toContainEqual(expect.objectContaining({ type: "personal_record", metricId: "squat_1rm" }));
    expect(pr.events).toContainEqual(expect.objectContaining({ type: "xp", amount: 200 }));
    // second PR inside the 7-day cooldown: recorded but no PR XP
    const pr2 = await game.execute({ type: "log_metric", metricId: "squat_1rm", value: 110, recordedOn: "2026-10-20", context: "current", idempotencyKey: key() });
    expect(pr2.events).toContainEqual(expect.objectContaining({ type: "personal_record" }));
    expect(pr2.events.find((e) => e.type === "xp" && e.amount === 200)).toBeUndefined();
    // historical entries never award XP
    const hist = await game.execute({ type: "log_metric", metricId: "deadlift_1rm", value: 180, recordedOn: "2026-10-20", context: "historical", idempotencyKey: key() });
    expect(hist.events.find((e) => e.type === "xp")).toBeUndefined();
  });

  it("ranks resting heart rate against verified NHANES data (lower is better)", async () => {
    const { game } = await onboardedPlayer(db);
    const r = await game.execute({ type: "log_metric", metricId: "resting_hr", value: 52, recordedOn: "2026-10-20", context: "current", idempotencyKey: key() });
    const hr = r.snapshot.metrics.find((m) => m.id === "resting_hr")!;
    expect(hr.evidence).toBe("verified");
    expect(hr.primary?.comparisonGroup).toMatch(/men aged 20–24/);
    expect(hr.primary!.percentile!).toBeGreaterThan(90);
    expect(hr.primary!.low!).toBeLessThan(hr.primary!.percentile!);
  });

  it("rejects future-dated entries and derived-metric writes", async () => {
    const { game } = await onboardedPlayer(db);
    await expect(game.execute({ type: "log_metric", metricId: "squat_1rm", value: 100, recordedOn: "2099-01-01", context: "current", idempotencyKey: key() })).rejects.toThrow(/future/);
    await expect(game.execute({ type: "log_metric", metricId: "strength_total", value: 400, recordedOn: "2026-10-20", context: "current", idempotencyKey: key() })).rejects.toThrow(/computed automatically/);
  });
});

describe("quests", () => {
  it("auto-completes a daily quest from logged activity and awards XP once", async () => {
    const clock = testClock("2026-10-20T14:00:00.000Z"); // Tuesday
    const { game } = await onboardedPlayer(db, clock);
    const snap = await game.snapshot();
    const study = snap.quests.find((q) => q.template_code === "daily_study")!;
    expect(study.status).toBe("active");
    const r = await game.execute({ type: "log_activity", activity: "study", durationMin: 90, quantity: null, occurredOn: "2026-10-20", idempotencyKey: key() });
    expect(r.events).toContainEqual(expect.objectContaining({ type: "quest_complete", xp: 25 }));
    const q = r.snapshot.quests.find((x) => x.id === study.id)!;
    expect(q.status).toBe("completed");
    // re-sync does not award again
    const again = await game.execute({ type: "sync" });
    expect(again.events.filter((e) => e.type === "quest_complete" && e.title === study.title)).toHaveLength(0);
    const ledger = again.snapshot.xpLedger.filter((x) => x.reason.startsWith("Quest complete") && x.reason.includes(study.title));
    expect(ledger).toHaveLength(1);
  });

  it("only allows manual toggles on manual objectives and expires old quests without penalty", async () => {
    const clock = testClock("2026-10-20T14:00:00.000Z");
    const { game } = await onboardedPlayer(db, clock);
    const snap = await game.snapshot();
    const auto = snap.quests.find((q) => q.template_code === "daily_study")!.objectives[0];
    await expect(game.execute({ type: "set_objective", objectiveId: auto.id, done: true })).rejects.toThrow(/automatically/);
    const weekly = snap.quests.find((q) => q.template_code === "weekly_reviews")!;
    const manual = weekly.objectives.find((o) => o.tracker.type === "manual")!;
    const r = await game.execute({ type: "set_objective", objectiveId: manual.id, done: true });
    expect(r.snapshot.quests.find((q) => q.id === weekly.id)!.objectives.find((o) => o.id === manual.id)!.progress.done).toBe(true);
    clock.set("2026-10-22T14:00:00.000Z");
    const later = await game.snapshot();
    const oldDaily = later.quests.find((q) => q.template_code === "daily_study" && q.period_start === "2026-10-20")!;
    expect(oldDaily.status).toBe("expired");
    expect(later.quests.some((q) => q.template_code === "daily_study" && q.period_start === "2026-10-22")).toBe(true);
  });

  it("emergency quests must be accepted and respect their deadline window", async () => {
    const clock = testClock("2026-10-20T14:00:00.000Z");
    const { game } = await onboardedPlayer(db, clock);
    const snap = await game.snapshot();
    const offered = snap.quests.find((q) => q.kind === "emergency" && q.status === "offered");
    if (!offered) return; // not offered on this deterministic day for this player
    // activity before accepting does not count
    await game.execute({ type: "log_activity", activity: "study", durationMin: 50, quantity: null, occurredOn: "2026-10-20", idempotencyKey: key() });
    clock.advance(60_000);
    await game.execute({ type: "accept_quest", questId: offered.id });
    clock.advance(60_000);
    const r = await game.execute({ type: "log_activity", activity: "study", durationMin: 45, quantity: null, occurredOn: "2026-10-20", idempotencyKey: key(), confirmDuplicate: true });
    expect(r.snapshot.quests.find((q) => q.id === offered.id)!.status).toBe("completed");
  });

  it("creates custom quests with server-capped XP", async () => {
    const { game } = await onboardedPlayer(db);
    const r = await game.execute({ type: "create_custom_quest", title: "Finish pharmacology deck", description: "", attribute: "INT", difficulty: "S", deadline: null, objectives: [{ title: "200 cards", tracker: { type: "activity_quantity", activities: ["flashcards"] }, target: 200 }], idempotencyKey: key() });
    const q = r.snapshot.quests.find((x) => x.title === "Finish pharmacology deck")!;
    expect(q.xp_reward).toBeLessThanOrEqual(100);
  });
});

describe("dungeons", () => {
  it("uses server time: cannot clear early, can clear after the planned time, and retreat keeps credit", async () => {
    const clock = testClock("2026-10-20T14:00:00.000Z");
    const { game } = await onboardedPlayer(db, clock);
    const s = await game.execute({ type: "start_dungeon", code: "study_gate", minutes: 30, mode: "focus", objective: "Cardio block", idempotencyKey: key() });
    const session = s.snapshot.activeSession!;
    await expect(game.execute({ type: "start_dungeon", code: "study_gate", minutes: 30, mode: "focus", objective: "", idempotencyKey: key() })).rejects.toThrow(/already inside/);
    clock.advance(10 * 60_000);
    await expect(game.execute({ type: "complete_dungeon", sessionId: session.id })).rejects.toThrow(/more minutes/);
    await game.execute({ type: "pause_dungeon", sessionId: session.id });
    clock.advance(60 * 60_000); // paused time doesn't count
    await game.execute({ type: "resume_dungeon", sessionId: session.id });
    clock.advance(18 * 60_000);
    const done = await game.execute({ type: "complete_dungeon", sessionId: session.id });
    expect(done.events).toContainEqual(expect.objectContaining({ type: "dungeon_clear", xp: 60 }));
    const log = done.snapshot.activities.find((a) => a.source === "dungeon")!;
    expect(log.duration_min).toBe(28);
    await expect(game.execute({ type: "complete_dungeon", sessionId: session.id })).rejects.toThrow(/already ended/);

    const s2 = await game.execute({ type: "start_dungeon", code: "reading_archive", minutes: 45, mode: "focus", objective: "", idempotencyKey: key() });
    clock.advance(20 * 60_000);
    const ret = await game.execute({ type: "retreat_dungeon", sessionId: s2.snapshot.activeSession!.id });
    expect(ret.events).toContainEqual(expect.objectContaining({ type: "dungeon_retreat", creditedMinutes: 20 }));
  });
});

describe("titles", () => {
  it("can equip only earned titles", async () => {
    const { game } = await onboardedPlayer(db);
    await expect(game.execute({ type: "equip_title", titleCode: "the_ascended" })).rejects.toThrow(/not been earned/);
    const r = await game.execute({ type: "equip_title", titleCode: "the_awakened" });
    expect(r.snapshot.player.equippedTitle?.code).toBe("the_awakened");
  });
});
