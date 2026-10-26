import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LocalDatabase } from "@/lib/server/db/local";
import { DEFAULT_REGIMEN, progressRegimen } from "@/lib/domain/regimen";
import { TrialService } from "@/lib/server/game/trials";
import type { GameService } from "@/lib/server/game/service";
import { key, onboardedPlayer, testClock, testDb } from "./helpers";

let db: LocalDatabase;
beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => db.close());

const reps = (game: GameService, activity: string, quantity: number, occurredOn: string) =>
  game.execute({ type: "log_activity", activity, durationMin: activity === "run" ? 30 : null, quantity, occurredOn, idempotencyKey: key(activity) });

describe("daily quest categories and the training regimen", () => {
  it("splits the daily board into categories with the 35/35/35/1.5 mi starting regimen", async () => {
    const { game } = await onboardedPlayer(db, testClock());
    const snap = await game.snapshot();
    const daily = snap.quests.filter((q) => q.kind === "daily" && q.period_start === "2026-10-20");
    expect(new Set(daily.map((q) => q.config.category))).toEqual(new Set(["physical", "intellectual", "mental", "health", "social"]));
    expect(daily.every((q) => q.config.penalized && (q.config.penaltyXp ?? 0) > 0)).toBe(true);
    const regimen = daily.find((q) => q.template_code === "daily_regimen")!;
    expect(regimen.objectives.map((o) => [o.tracker.type === "activity_quantity" ? o.tracker.activities[0] : o.tracker.type, o.target])).toEqual([
      ["pushups", 35],
      ["situps", 35],
      ["pullups", 35],
      ["run", 2.41],
    ]);
    expect(regimen.objectives[3].title).toBe("Run 1.5 mi");
  });

  it("completes the regimen from reps logged in sets", async () => {
    const { game } = await onboardedPlayer(db, testClock());
    for (const a of ["pushups", "situps", "pullups"]) for (const n of [10, 10, 15]) await reps(game, a, n, "2026-10-20");
    const r = await reps(game, "run", 2.414, "2026-10-20");
    const regimen = r.snapshot.quests.find((q) => q.template_code === "daily_regimen")!;
    expect(regimen.status).toBe("completed");
  });

  it("moves a regimen quest still on the old 100/100/100/5 km defaults to the lighter targets", async () => {
    const { game } = await onboardedPlayer(db, testClock());
    const q = (await game.snapshot()).quests.find((x) => x.template_code === "daily_regimen")!;
    await db.raw("update public.quests set created_at = '2026-10-20T04:00:00Z' where id = $1", [q.id]);
    for (const [i, t] of [100, 100, 100, 5].entries()) await db.raw("update public.quest_objectives set target = $1 where quest_id = $2 and sort_order = $3", [t, q.id, i]);
    await game.execute({ type: "update_settings", settings: { regimen: { pushups: 35 } } });
    const after = (await game.snapshot()).quests.find((x) => x.id === q.id)!;
    expect(after.objectives.map((o) => o.target)).toEqual([35, 35, 35, 2.41]);
  });

  it("deleting a log re-opens the quest it completed and takes back the XP", async () => {
    const { game } = await onboardedPlayer(db, testClock());
    for (const a of ["pushups", "situps", "pullups"]) await reps(game, a, 35, "2026-10-20");
    let snap = (await reps(game, "run", 2.5, "2026-10-20")).snapshot;
    const regimen = () => snap.quests.find((q) => q.template_code === "daily_regimen")!;
    expect(regimen().status).toBe("completed");
    const run = snap.activities.find((a) => a.type === "run")!;
    snap = (await game.execute({ type: "delete_activity", activityId: run.id })).snapshot;
    expect(regimen().status).toBe("active");
    const net = snap.xpLedger.filter((x) => x.source_id === regimen().id).reduce((a, x) => a + x.amount, 0);
    expect(net).toBe(0);
    const again = await reps(game, "run", 2.5, "2026-10-20");
    expect(again.events).toContainEqual(expect.objectContaining({ type: "quest_complete", title: "PREPARATIONS TO BECOME POWERFUL", xp: 100 }));
  });

  it("uses the player's regimen from the next day, never mid-day", async () => {
    const clock = testClock();
    const { game } = await onboardedPlayer(db, clock);
    await game.execute({ type: "update_settings", settings: { regimen: { pushups: 50, situps: 0, pullups: 20, runKm: 3, categories: { physical: true, intellectual: true, mental: false, health: true, social: false } } } });
    let snap = await game.snapshot();
    expect(snap.quests.find((q) => q.template_code === "daily_regimen" && q.period_start === "2026-10-20")!.objectives).toHaveLength(4);
    clock.set("2026-10-22T14:00:00.000Z");
    snap = await game.snapshot();
    const tomorrow = snap.quests.filter((q) => q.kind === "daily" && q.period_start === "2026-10-22");
    expect(tomorrow.find((q) => q.template_code === "daily_regimen")!.objectives.map((o) => o.target)).toEqual([50, 20, 3]);
    expect(tomorrow.some((q) => q.config.category === "mental" || q.config.category === "social")).toBe(false);
  });
});

describe("rest days and weekly progression", () => {
  it("swaps the regimen for a recovery quest on rest days (Wednesday and Sunday by default)", async () => {
    const clock = testClock();
    const { game } = await onboardedPlayer(db, clock);
    clock.set("2026-10-21T14:00:00.000Z");
    const snap = await game.snapshot();
    const wed = snap.quests.filter((q) => q.kind === "daily" && q.period_start === "2026-10-21");
    expect(wed.some((q) => q.template_code === "daily_regimen")).toBe(false);
    expect(wed.find((q) => q.template_code === "daily_rest")!.config.category).toBe("physical");
  });

  it("progressRegimen steps up, holds or steps back, capped at the goal", () => {
    const r = DEFAULT_REGIMEN;
    expect(progressRegimen(r, 4, 5)).toMatchObject({ change: "up", next: { pushups: 40, situps: 40, pullups: 38, runKm: 2.81 } });
    expect(progressRegimen(r, 3, 5).change).toBe("hold");
    expect(progressRegimen({ ...r, pushups: 50 }, 1, 5)).toMatchObject({ change: "down", next: { pushups: 45, pullups: 32 } });
    expect(progressRegimen(r, 2, 2).change).toBe("hold");
    expect(progressRegimen({ ...r, pushups: 98 }, 5, 5).next.pushups).toBe(100);
    expect(progressRegimen({ ...r, progression: { ...r.progression, enabled: false } }, 5, 5).change).toBe("hold");
  });

  it("raises next week's targets after a strong week", async () => {
    const clock = testClock("2026-10-19T14:00:00.000Z"); // Monday
    const { game } = await onboardedPlayer(db, clock, false);
    for (const d of ["19", "20", "22", "23", "24"]) {
      clock.set(`2026-10-${d}T14:00:00.000Z`);
      for (const a of ["pushups", "situps", "pullups"]) await reps(game, a, 35, `2026-10-${d}`);
      await reps(game, "run", 2.5, `2026-10-${d}`);
    }
    clock.set("2026-10-26T14:00:00.000Z");
    const r = await game.execute({ type: "sync" });
    expect(r.events).toContainEqual(expect.objectContaining({ type: "info", title: "Training level up" }));
    const mon = r.snapshot.quests.find((q) => q.template_code === "daily_regimen" && q.period_start === "2026-10-26")!;
    expect(mon.objectives.map((o) => o.target)).toEqual([40, 40, 38, 2.81]);
    // only once per week
    const again = await game.execute({ type: "sync" });
    expect(again.events.some((e) => e.type === "info" && e.title === "Training level up")).toBe(false);
  });
});

describe("penalties", () => {
  it("fails missed dailies, deducts XP and opens a Penalty Zone that counts only extra work", async () => {
    const clock = testClock();
    const { game } = await onboardedPlayer(db, clock, false);
    await game.execute({ type: "update_settings", settings: { regimen: { restDays: [] } } });
    await reps(game, "pullups", 20, "2026-10-20");
    clock.set("2026-10-21T14:00:00.000Z");
    const r = await game.execute({ type: "daily_login" });
    const login = r.events.find((e) => e.type === "daily_login");
    expect(login && login.type === "daily_login" && login.penalties?.zone).toBe(true);
    const failed = r.snapshot.quests.filter((q) => q.period_start === "2026-10-20" && q.kind === "daily");
    expect(failed.every((q) => q.status === "failed")).toBe(true);
    const penalties = r.snapshot.xpLedger.filter((x) => x.kind === "penalty");
    expect(penalties.length).toBe(failed.length);
    expect(penalties.find((x) => x.source_id === failed.find((q) => q.template_code === "daily_regimen")!.id)!.amount).toBe(-100);

    const zone = r.snapshot.quests.find((q) => q.kind === "penalty" && q.period_start === "2026-10-21")!;
    const pull = zone.objectives.find((o) => o.title.includes("pull-ups"))!;
    expect(pull.target).toBe(15);
    // Today's 35 pull-ups belong to today's quest; only reps beyond them count for the zone.
    let s = (await reps(game, "pullups", 35, "2026-10-21")).snapshot;
    expect(s.quests.find((q) => q.id === zone.id)!.objectives.find((o) => o.id === pull.id)!.progress.value).toBe(0);
    s = (await reps(game, "pullups", 15, "2026-10-21")).snapshot;
    expect(s.quests.find((q) => q.id === zone.id)!.objectives.find((o) => o.id === pull.id)!.progress.done).toBe(true);
  });

  it("charges double when the Penalty Zone itself fails, and never takes XP below zero", async () => {
    const clock = testClock();
    const { game } = await onboardedPlayer(db, clock, false);
    clock.set("2026-10-21T14:00:00.000Z");
    const day2 = await game.snapshot();
    const zone = day2.quests.find((q) => q.kind === "penalty")!;
    expect(zone.config.penaltyXp).toBeGreaterThan(0);
    clock.set("2026-10-22T14:00:00.000Z");
    const day3 = await game.snapshot();
    expect(day3.quests.find((q) => q.id === zone.id)!.status).toBe("failed");
    expect(day3.xpLedger.find((x) => x.source_id === zone.id && x.kind === "penalty")!.amount).toBe(-zone.config.penaltyXp!);
    expect(day3.player.level.totalXp).toBeGreaterThanOrEqual(0);
    // a failed zone doesn't spawn another zone from itself
    expect(day3.quests.filter((q) => q.kind === "penalty" && q.period_start === "2026-10-22")).toHaveLength(1);
  });

  it("fills in and fails days the player stayed away (up to a week)", async () => {
    const clock = testClock();
    const { game } = await onboardedPlayer(db, clock, false);
    clock.set("2026-10-24T14:00:00.000Z");
    const snap = await game.snapshot();
    for (const d of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]) {
      const day = snap.quests.filter((q) => q.kind === "daily" && q.period_start === d);
      expect(day.length).toBeGreaterThan(0);
      expect(day.every((q) => q.status === "failed")).toBe(true);
    }
    expect(snap.quests.filter((q) => q.kind === "penalty" && q.period_start === "2026-10-24")).toHaveLength(1);
  });

  it("a recovery pass waives today's physical quests once a week", async () => {
    const clock = testClock();
    const { game } = await onboardedPlayer(db, clock, false);
    const r = await game.execute({ type: "use_recovery_pass" });
    const regimen = r.snapshot.quests.find((q) => q.template_code === "daily_regimen")!;
    expect(regimen.status).toBe("exempt");
    clock.set("2026-10-21T14:00:00.000Z");
    const next = await game.snapshot();
    expect(next.xpLedger.some((x) => x.source_id === regimen.id)).toBe(false);
    await expect(game.execute({ type: "use_recovery_pass" })).rejects.toThrow(/this week/);
    const zone = next.quests.find((q) => q.kind === "penalty" && q.period_start === "2026-10-21");
    expect(zone?.objectives.some((o) => /push-ups|pull-ups|sit-ups|Run/.test(o.title)) ?? false).toBe(false);
  });

  it("abandoning custom quests, retreating from dungeons and abandoning trials cost XP", async () => {
    const clock = testClock();
    const { game, userId } = await onboardedPlayer(db, clock);
    const c = await game.execute({ type: "create_custom_quest", title: "Read a book", description: "", attribute: "INT", difficulty: "C", deadline: null, objectives: [{ title: "Read", tracker: { type: "manual" }, target: 1 }], idempotencyKey: key("cq") });
    const q = c.snapshot.quests.find((x) => x.title === "Read a book")!;
    const a = await game.execute({ type: "abandon_quest", questId: q.id });
    expect(a.events).toContainEqual(expect.objectContaining({ type: "penalty", xp: q.config.penaltyXp }));

    const s = await game.execute({ type: "start_dungeon", code: "study_gate", minutes: 30, mode: "focus", objective: "", idempotencyKey: key() });
    clock.advance(60_000);
    const ret = await game.execute({ type: "retreat_dungeon", sessionId: s.snapshot.activeSession!.id });
    expect(ret.events).toContainEqual(expect.objectContaining({ type: "dungeon_retreat", penalty: 15 }));

    const trials = new TrialService(db, userId, clock.now);
    const { view } = await trials.handle({ action: "start", kind: "speed" });
    await trials.handle({ action: "abandon", sessionId: view!.id });
    const snap = await game.snapshot();
    expect(snap.xpLedger.some((x) => x.kind === "penalty" && x.source_id === view!.id && x.amount === -10)).toBe(true);
  });
});
