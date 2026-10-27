import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LocalDatabase } from "@/lib/server/db/local";
import { FriendRequestSchema, FriendsService } from "@/lib/server/friends";
import { onboardedPlayer, testClock, testDb } from "./helpers";

let db: LocalDatabase;
beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => db.close());

let n = 0;
async function player(name?: string) {
  const p = await onboardedPlayer(db, testClock());
  const friends = new FriendsService(db, p.userId);
  const call = (raw: unknown) => friends.handle(FriendRequestSchema.parse(raw));
  if (name) await call({ action: "set_username", username: name });
  return { ...p, call };
}
const uname = (base: string) => `${base}_${++n}_${Math.floor(Math.random() * 1e4)}`.slice(0, 20);

describe("usernames", () => {
  it("are unique regardless of case and validated", async () => {
    const name = uname("shadow");
    await player(name);
    const b = await player();
    await expect(b.call({ action: "set_username", username: name.toUpperCase() })).rejects.toThrow(/taken/);
    expect(() => FriendRequestSchema.parse({ action: "set_username", username: "no spaces!" })).toThrow(/3–20 characters/);
    expect(FriendRequestSchema.parse({ action: "set_username", username: "@Mixed_Case1" })).toMatchObject({ username: "mixed_case1" });
  });
});

describe("friends", () => {
  it("send by username, accept, then see each other's progress summary (nothing sensitive)", async () => {
    const aName = uname("alpha");
    const bName = uname("bravo");
    const a = await player(aName);
    const b = await player(bName);
    await expect(a.call({ action: "request", username: "nobody_here_x" })).rejects.toThrow(/No player/);
    await expect(a.call({ action: "request", username: aName })).rejects.toThrow(/That's you/);
    const sent = await a.call({ action: "request", username: bName });
    expect(sent.outgoing.map((f) => f.username)).toEqual([bName]);
    await expect(a.call({ action: "request", username: bName })).rejects.toThrow(/already sent/);
    const inbox = await b.call({ action: "list" });
    expect(inbox.incoming).toHaveLength(1);
    expect(inbox.incoming[0].stats).toBeNull(); // no stats before accepting
    const accepted = await b.call({ action: "accept", friendshipId: inbox.incoming[0].friendshipId! });
    expect(accepted.friends.map((f) => f.username)).toEqual([aName]);
    const friend = accepted.friends[0];
    expect(friend.stats?.level).toBeGreaterThanOrEqual(1);
    expect(friend.stats?.regimen?.pushups).toBe(35);
    const json = JSON.stringify(friend);
    for (const secret of ["weight", "height", "gpa", "email", "savings", "debt", "date_of_birth", "@example", "note"]) expect(json.toLowerCase()).not.toContain(secret);
    expect(Object.keys(friend).sort()).toEqual(["displayName", "friendshipId", "stats", "userId", "username"]);

    const removed = await a.call({ action: "remove", friendshipId: friend.friendshipId! });
    expect(removed.friends).toHaveLength(0);
  });

  it("asking someone who already asked you accepts their request", async () => {
    const aName = uname("charlie");
    const bName = uname("delta");
    const a = await player(aName);
    const b = await player(bName);
    await a.call({ action: "request", username: bName });
    const r = await b.call({ action: "request", username: aName });
    expect(r.friends.map((f) => f.username)).toEqual([aName]);
    expect(r.incoming).toHaveLength(0);
  });

  it("needs your own username first, and strangers can't read your friendships", async () => {
    const a = await player();
    const bName = uname("echo");
    const b = await player(bName);
    await expect(a.call({ action: "request", username: bName })).rejects.toThrow(/own username/);
    const c = await player(uname("fox"));
    await c.call({ action: "request", username: bName });
    expect(await db.user(a.userId).select("friendships")).toHaveLength(0);
    expect((await db.user(b.userId).select("friendships")).length).toBe(1);
    await expect(db.user(a.userId).insert("friendships", { requester_id: a.userId, addressee_id: b.userId, status: "accepted" })).rejects.toThrow();
  });
});
