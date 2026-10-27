import "server-only";
import { z } from "zod";
import { UsernameSchema, type FriendCard, type FriendStats } from "../domain/friends";
import { UniqueViolationError, type Database } from "./db/types";
import { friendsEnabled } from "./game/penalty";
import { GameError } from "./game/service";

/**
 * Friends: mutual (a request must be accepted), found by exact username only (no browsing), and
 * limited to the progress summary in player_levels.stats. All reads of other players go through the
 * service role after the friendship is checked here; RLS keeps everything else private.
 */

export const FriendRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("set_username"), username: UsernameSchema }),
  z.object({ action: z.literal("request"), username: UsernameSchema }),
  z.object({ action: z.literal("accept"), friendshipId: z.string().uuid() }),
  z.object({ action: z.literal("decline"), friendshipId: z.string().uuid() }),
  z.object({ action: z.literal("remove"), friendshipId: z.string().uuid() }),
]);
export type FriendRequest = z.infer<typeof FriendRequestSchema>;

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
}

export interface FriendsView {
  enabled: boolean;
  username: string | null;
  me: FriendCard;
  friends: FriendCard[];
  incoming: FriendCard[];
  outgoing: FriendCard[];
}

const MAX_FRIENDS = 100;
const MAX_PENDING = 30;

export class FriendsService {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  private get svc() {
    return this.db.service();
  }

  async handle(req: FriendRequest): Promise<FriendsView> {
    if (!(await friendsEnabled(this.db))) {
      if (req.action !== "list") throw new GameError("Friends need database migration 0005 (supabase/migrations/0005_friends.sql). Run it in the Supabase SQL Editor, then try again.", 409);
      return { enabled: false, username: null, me: { userId: this.userId, friendshipId: null, username: null, displayName: "You", stats: null }, friends: [], incoming: [], outgoing: [] };
    }
    switch (req.action) {
      case "list":
        break;
      case "set_username":
        try {
          await this.db.user(this.userId).update("profiles", { user_id: this.userId }, { username: req.username, updated_at: new Date().toISOString() });
        } catch (e) {
          if (e instanceof UniqueViolationError) throw new GameError(`@${req.username} is taken. Try another.`, 409);
          throw e;
        }
        break;
      case "request":
        await this.request(req.username);
        break;
      case "accept": {
        const f = await this.mine(req.friendshipId);
        if (f.addressee_id !== this.userId || f.status !== "pending") throw new GameError("No such friend request.", 404);
        await this.svc.update("friendships", { id: f.id }, { status: "accepted", responded_at: new Date().toISOString() });
        break;
      }
      case "decline":
      case "remove":
        await this.mine(req.friendshipId);
        await this.svc.delete("friendships", { id: req.friendshipId });
        break;
    }
    return this.view();
  }

  private async mine(id: string): Promise<FriendshipRow> {
    const f = (await this.svc.select<FriendshipRow>("friendships", { eq: { id } }))[0];
    if (!f || (f.requester_id !== this.userId && f.addressee_id !== this.userId)) throw new GameError("Not found.", 404);
    return f;
  }

  private async all(): Promise<FriendshipRow[]> {
    const [a, b] = await Promise.all([this.svc.select<FriendshipRow>("friendships", { eq: { requester_id: this.userId } }), this.svc.select<FriendshipRow>("friendships", { eq: { addressee_id: this.userId } })]);
    return [...a, ...b];
  }

  private async request(username: string) {
    const me = (await this.svc.select<{ username: string | null }>("profiles", { eq: { user_id: this.userId } }))[0];
    if (!me?.username) throw new GameError("Choose your own username first, so your friend knows who's asking.");
    const target = (await this.svc.select<{ user_id: string }>("profiles", { eq: { username } }))[0];
    // Usernames are meant to be shared, so a clear "not found" beats hiding which names exist.
    if (!target) throw new GameError(`No player is called @${username}.`, 404);
    if (target.user_id === this.userId) throw new GameError("That's you.");
    const rows = await this.all();
    const existing = rows.find((f) => f.requester_id === target.user_id || f.addressee_id === target.user_id);
    if (existing?.status === "accepted") throw new GameError(`You're already friends with @${username}.`);
    if (existing && existing.requester_id === this.userId) throw new GameError(`Request already sent to @${username}.`);
    if (existing) {
      // They already asked you: accept instead of sending a second request.
      await this.svc.update("friendships", { id: existing.id }, { status: "accepted", responded_at: new Date().toISOString() });
      return;
    }
    if (rows.filter((f) => f.status === "accepted").length >= MAX_FRIENDS) throw new GameError(`Friend limit reached (${MAX_FRIENDS}).`);
    if (rows.filter((f) => f.status === "pending" && f.requester_id === this.userId).length >= MAX_PENDING) throw new GameError("Too many pending requests. Wait for some to be answered.");
    try {
      await this.svc.insert("friendships", { requester_id: this.userId, addressee_id: target.user_id });
    } catch (e) {
      if (e instanceof UniqueViolationError) throw new GameError(`Request already pending with @${username}.`, 409);
      throw e;
    }
  }

  private async cards(ids: string[], withStats: boolean): Promise<Map<string, FriendCard>> {
    const out = new Map<string, FriendCard>();
    if (!ids.length) return out;
    const [profiles, levels] = await Promise.all([
      this.svc.select<{ user_id: string; display_name: string; username: string | null }>("profiles", { in: { user_id: ids } }),
      withStats ? this.svc.select<{ user_id: string; stats: FriendStats | Record<string, never> }>("player_levels", { in: { user_id: ids } }) : Promise.resolve([]),
    ]);
    for (const p of profiles) {
      const st = levels.find((l) => l.user_id === p.user_id)?.stats;
      // Only the display name and username, never the rest of the profile.
      out.set(p.user_id, { userId: p.user_id, friendshipId: null, username: p.username, displayName: p.display_name, stats: st && "level" in st ? (st as FriendStats) : null });
    }
    return out;
  }

  async view(): Promise<FriendsView> {
    const rows = await this.all();
    const other = (f: FriendshipRow) => (f.requester_id === this.userId ? f.addressee_id : f.requester_id);
    const accepted = rows.filter((f) => f.status === "accepted");
    const pending = rows.filter((f) => f.status === "pending");
    const [withStats, plain] = await Promise.all([this.cards([this.userId, ...accepted.map(other)], true), this.cards(pending.map(other), false)]);
    const card = (f: FriendshipRow, m: Map<string, FriendCard>): FriendCard => ({ ...(m.get(other(f)) ?? { userId: other(f), username: null, displayName: "Player", stats: null }), friendshipId: f.id });
    const me = withStats.get(this.userId) ?? { userId: this.userId, friendshipId: null, username: null, displayName: "You", stats: null };
    return {
      enabled: true,
      username: me.username,
      me,
      friends: accepted.map((f) => card(f, withStats)).sort((a, b) => (b.stats?.level ?? 0) - (a.stats?.level ?? 0)),
      incoming: pending.filter((f) => f.addressee_id === this.userId).map((f) => card(f, plain)),
      outgoing: pending.filter((f) => f.requester_id === this.userId).map((f) => card(f, plain)),
    };
  }
}
