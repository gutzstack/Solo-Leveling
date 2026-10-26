import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LocalDatabase } from "@/lib/server/db/local";
import { PermissionError } from "@/lib/server/db/types";
import { createUser, testDb } from "./helpers";

/**
 * Data permissions: these run the real migration's row-level-security policies in PostgreSQL
 * (PGlite), acting as the `authenticated` role with a JWT subject, the same as Supabase.
 */
let db: LocalDatabase;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await testDb();
  alice = await createUser(db);
  bob = await createUser(db);
  for (const id of [alice, bob]) {
    await db.service().insertIgnore("users", { id }, ["id"]);
    await db.service().insertIgnore("profiles", { user_id: id }, ["user_id"]);
    await db.service().insertIgnore("settings", { user_id: id }, ["user_id"]);
  }
  await db.user(alice).insert("metric_entries", { user_id: alice, metric_id: "bench_press_1rm", value: 90, recorded_on: "2026-10-26", idempotency_key: "a1" });
  await db.service().insert("player_xp", { user_id: alice, amount: 50, kind: "effort", source_type: "t", reason: "test", idempotency_key: "x1", awarded_on: "2026-10-26" });
});
afterAll(async () => db.close());

describe("row-level security", () => {
  it("users only see their own rows", async () => {
    expect(await db.user(alice).select("metric_entries")).toHaveLength(1);
    expect(await db.user(bob).select("metric_entries")).toHaveLength(0);
    expect(await db.user(bob).select("player_xp")).toHaveLength(0);
    expect((await db.user(bob).select("profiles")).map((p) => p.user_id)).toEqual([bob]);
  });

  it("users cannot write rows for someone else", async () => {
    await expect(db.user(bob).insert("metric_entries", { user_id: alice, metric_id: "bench_press_1rm", value: 999, recorded_on: "2026-10-26", idempotency_key: "evil" })).rejects.toThrow();
    const n = await db.user(bob).update("profiles", { user_id: alice }, { display_name: "hacked" });
    expect(n).toHaveLength(0);
    expect(await db.user(bob).delete("metric_entries", { user_id: alice })).toBe(0);
  });

  it("users cannot grant themselves XP, unlocks or levels directly", async () => {
    await expect(db.user(alice).insert("player_xp", { user_id: alice, amount: 9999, kind: "effort", source_type: "t", reason: "cheat", idempotency_key: "cheat", awarded_on: "2026-10-26" })).rejects.toBeInstanceOf(PermissionError);
    await expect(db.user(alice).insert("achievement_unlocks", { user_id: alice, achievement_code: "the_awakening" })).rejects.toBeInstanceOf(PermissionError);
    await expect(db.user(alice).insert("quests", { user_id: alice, kind: "custom", template_code: "x", title: "free xp", period_start: "2026-10-26", xp_reward: 1000 })).rejects.toBeInstanceOf(PermissionError);
    await expect(db.user(alice).upsert("player_levels", { user_id: alice, level: 100 }, ["user_id"])).rejects.toBeInstanceOf(PermissionError);
  });

  it("users can only change the read flag on notifications", async () => {
    const [n] = await db.service().insert<{ id: string }>("notifications", { user_id: alice, kind: "t", title: "T", body: "b" });
    await expect(db.user(alice).update("notifications", { id: n.id }, { read_at: new Date().toISOString() })).resolves.toHaveLength(1);
    await expect(db.user(alice).update("notifications", { id: n.id }, { body: "edited" })).rejects.toBeInstanceOf(PermissionError);
  });

  it("titles can only be equipped once unlocked", async () => {
    await expect(db.user(alice).insert("equipped_titles", { user_id: alice, title_code: "the_ascended" })).rejects.toThrow(/not unlocked/);
  });

  it("custom metrics are private; catalog metrics are shared and read-only", async () => {
    await db.user(alice).insert("metrics", { id: "custom_alice_secret", user_id: alice, attribute_code: "STR", name: "Secret", unit_kind: "count", direction: "higher", is_custom: true });
    expect((await db.user(bob).select("metrics", { eq: { id: "custom_alice_secret" } })).length).toBe(0);
    expect((await db.user(bob).select("metrics", { eq: { id: "bench_press_1rm" } })).length).toBe(1);
    expect(await db.user(bob).update("metrics", { id: "bench_press_1rm" }, { name: "renamed" })).toHaveLength(0);
  });

  it("the XP ledger rejects duplicate idempotency keys and malformed reversals", async () => {
    const svc = db.service();
    expect(await svc.insertIgnore("player_xp", { user_id: alice, amount: 50, kind: "effort", source_type: "t", reason: "dup", idempotency_key: "x1", awarded_on: "2026-10-26" }, ["user_id", "idempotency_key"])).toHaveLength(0);
    await expect(svc.insert("player_xp", { user_id: alice, amount: -50, kind: "effort", source_type: "t", reason: "neg", idempotency_key: "neg", awarded_on: "2026-10-26" })).rejects.toThrow();
  });
});
