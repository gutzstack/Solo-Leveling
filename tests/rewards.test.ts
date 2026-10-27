import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chestContents, rollChestRarity, streakMultiplier } from "@/lib/domain/rewards";
import type { LocalDatabase } from "@/lib/server/db/local";
import type { GameService } from "@/lib/server/game/service";
import { key, onboardedPlayer, testClock, testDb } from "./helpers";

let db: LocalDatabase;
beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => db.close());

const log = (game: GameService, activity: string, quantity: number, day: string) =>
  game.execute({ type: "log_activity", activity, durationMin: activity === "run" ? 30 : null, quantity, occurredOn: day, idempotencyKey: key(activity) });

async function clearRegimen(game: GameService, day: string) {
  for (const a of ["pushups", "situps", "squats", "dips", "pullups"]) await log(game, a, 35, day);
  return log(game, "run", 2.5, day);
}

/** A player whose daily board (from the 2nd day on) is only the physical regimen. */
async function physicalOnly() {
  const clock = testClock("2026-10-19T14:00:00.000Z"); // Monday
  const p = await onboardedPlayer(db, clock, false);
  await p.game.execute({ type: "update_settings", settings: { regimen: { restDays: [], categories: { physical: true, intellectual: false, mental: false, health: false, social: false } } } });
  return p;
}

const grantGold = (userId: string, amount: number) =>
  db.raw("insert into public.gold_ledger (user_id, amount, kind, source_type, reason, idempotency_key, awarded_on) values ($1, $2, 'bonus', 'test', 'test', $3, '2026-10-19')", [userId, amount, key("g")]);

describe("reward domain", () => {
  it("streak tiers and deterministic chests", () => {
    expect([0, 2, 3, 6, 7, 13, 14, 40].map(streakMultiplier)).toEqual([1, 1, 1.1, 1.1, 1.25, 1.25, 1.5, 1.5]);
    expect(rollChestRarity("u:2026-10-20")).toBe(rollChestRarity("u:2026-10-20"));
    expect(chestContents("epic", "abc")).toEqual(chestContents("epic", "abc"));
    const legendary = chestContents("legendary", "x");
    expect(legendary.gold).toBeGreaterThanOrEqual(600);
    expect(legendary.title).toBe("chosen_by_the_system");
    // roughly 70/22/7/1
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (let i = 0; i < 4000; i++) counts[rollChestRarity(`seed-${i}`)] += 1;
    expect(counts.common / 4000).toBeGreaterThan(0.65);
    expect(counts.legendary).toBeGreaterThan(10);
  });
});

describe("gold, chests and the streak multiplier", () => {
  it("pays gold per quest, a chest for clearing every daily, and multiplies with a perfect streak", async () => {
    const { game, clock } = await physicalOnly();
    clock.set("2026-10-20T14:00:00.000Z");
    const r = await clearRegimen(game, "2026-10-20");
    expect(r.events).toContainEqual(expect.objectContaining({ type: "gold", amount: 50 }));
    expect(r.events).toContainEqual(expect.objectContaining({ type: "gold", amount: 25 }));
    expect(r.events.some((e) => e.type === "chest")).toBe(true);
    expect(r.snapshot.rewards.inventory.filter((i) => i.item_code === "chest")).toHaveLength(1);
    expect(r.snapshot.rewards.perfectStreak).toBe(1);

    for (const d of ["21", "22"]) {
      clock.set(`2026-10-${d}T14:00:00.000Z`);
      await clearRegimen(game, `2026-10-${d}`);
    }
    clock.set("2026-10-23T14:00:00.000Z");
    const day4 = await clearRegimen(game, "2026-10-23");
    // three perfect days behind it → ×1.1
    expect(day4.events).toContainEqual(expect.objectContaining({ type: "gold", amount: 55 }));
    expect(day4.snapshot.rewards.multiplier).toBe(1.1);
  });

  it("opens a chest once and pays out its contents", async () => {
    const { game, clock } = await physicalOnly();
    clock.set("2026-10-20T14:00:00.000Z");
    const r = await clearRegimen(game, "2026-10-20");
    const chest = r.snapshot.rewards.inventory.find((i) => i.item_code === "chest")!;
    const before = r.snapshot.rewards.balance;
    const opened = await game.execute({ type: "open_chest", itemId: chest.id });
    const ev = opened.events.find((e) => e.type === "chest_opened");
    expect(ev && ev.type === "chest_opened" && ev.gold).toBeGreaterThan(0);
    expect(opened.snapshot.rewards.balance).toBe(before + (ev && ev.type === "chest_opened" ? ev.gold : 0));
    await expect(game.execute({ type: "open_chest", itemId: chest.id })).rejects.toThrow(/already open/);
  });

  it("deleting a log takes back the quest's gold and the unopened chest", async () => {
    const { game, clock } = await physicalOnly();
    clock.set("2026-10-20T14:00:00.000Z");
    const r = await clearRegimen(game, "2026-10-20");
    expect(r.snapshot.rewards.balance).toBe(75);
    const run = r.snapshot.activities.find((a) => a.type === "run" && a.occurred_on === "2026-10-20")!;
    const after = await game.execute({ type: "delete_activity", activityId: run.id });
    expect(after.snapshot.rewards.balance).toBe(0);
    expect(after.snapshot.rewards.inventory.some((i) => i.item_code === "chest")).toBe(false);
  });
});

describe("dungeon gold", () => {
  it("clearing a dungeon pays gold by difficulty", async () => {
    const { game, clock } = await physicalOnly();
    const start = await game.execute({ type: "start_dungeon", code: "study_gate", minutes: 30, mode: "focus", objective: "", idempotencyKey: key("d") });
    clock.advance(30 * 60_000);
    const done = await game.execute({ type: "complete_dungeon", sessionId: start.snapshot.activeSession!.id });
    expect(done.events).toContainEqual(expect.objectContaining({ type: "gold", amount: 15, reason: "Dungeon cleared: Study Dungeon" }));
    expect(done.snapshot.rewards.ledger.find((g) => g.source_type === "dungeon")?.amount).toBe(15);
  });
});

describe("shop and items", () => {
  it("buys the player's own rewards only with enough gold", async () => {
    const { game, userId } = await physicalOnly();
    await game.execute({ type: "create_reward", name: "1 hour of gaming", description: "", price: 150 });
    let snap = await game.snapshot();
    const reward = snap.rewards.shop[0];
    await expect(game.execute({ type: "buy_reward", rewardId: reward.id, idempotencyKey: key("b") })).rejects.toThrow(/Not enough gold/);
    await grantGold(userId, 200);
    const k = key("b");
    const bought = await game.execute({ type: "buy_reward", rewardId: reward.id, idempotencyKey: k });
    expect(bought.snapshot.rewards.balance).toBe(50);
    await expect(game.execute({ type: "buy_reward", rewardId: reward.id, idempotencyKey: k })).rejects.toThrow(/already/);
    await game.execute({ type: "delete_reward", rewardId: reward.id });
    snap = await game.snapshot();
    expect(snap.rewards.shop).toHaveLength(0);
  });

  it("a Penalty Shield absorbs the next penalty", async () => {
    const { game, userId, clock } = await physicalOnly();
    await grantGold(userId, 1000);
    await game.execute({ type: "buy_item", code: "penalty_shield", idempotencyKey: key("s") });
    clock.set("2026-10-20T14:00:00.000Z");
    const snap = await game.snapshot();
    const day1 = snap.quests.filter((q) => q.kind === "daily" && q.period_start === "2026-10-19");
    const penalized = day1.filter((q) => snap.xpLedger.some((x) => x.kind === "penalty" && x.source_id === q.id));
    expect(penalized).toHaveLength(day1.length - 1); // one absorbed
    expect(snap.rewards.inventory.find((i) => i.item_code === "penalty_shield")!.used_at).not.toBeNull();
    // the remaining failures also cost gold
    expect(snap.rewards.ledger.some((g) => g.kind === "penalty")).toBe(true);
  });

  it("a Double-XP Elixir doubles XP for the rest of the day", async () => {
    const { game, userId } = await physicalOnly();
    await grantGold(userId, 400);
    const b = await game.execute({ type: "buy_item", code: "xp_elixir", idempotencyKey: key("e") });
    const elixir = b.snapshot.rewards.inventory.find((i) => i.item_code === "xp_elixir")!;
    await game.execute({ type: "use_item", itemId: elixir.id });
    const r = await log(game, "pushups", 20, "2026-10-19");
    expect(r.events).toContainEqual(expect.objectContaining({ type: "xp", amount: 10 }));
    expect(r.snapshot.xpLedger.some((x) => x.reason.includes("×2 elixir") && x.amount === 20)).toBe(true);
    expect(r.snapshot.rewards.elixirActive).toBe(true);
  });

  it("a Recovery Pass item works once the weekly free pass is used", async () => {
    const { game, userId, clock } = await physicalOnly();
    await grantGold(userId, 500);
    await game.execute({ type: "buy_item", code: "recovery_pass", idempotencyKey: key("r") });
    clock.set("2026-10-20T14:00:00.000Z");
    await game.execute({ type: "use_recovery_pass" });
    clock.set("2026-10-21T14:00:00.000Z");
    const r = await game.execute({ type: "use_recovery_pass" });
    expect(r.snapshot.rewards.inventory.find((i) => i.item_code === "recovery_pass")!.used_at).not.toBeNull();
    clock.set("2026-10-22T14:00:00.000Z");
    await expect(game.execute({ type: "use_recovery_pass" })).rejects.toThrow(/no Recovery Pass items/);
  });
});
