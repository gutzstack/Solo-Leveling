"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Check, Flame, Swords, UserMinus, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel, Pill, RankBadge } from "@/components/system/primitives";
import { api } from "@/lib/client/api";
import { useSnapshot } from "@/lib/client/use-game";
import { COMPARE_ROWS, type FriendCard, type FriendStats } from "@/lib/domain/friends";
import type { FriendRequest, FriendsView } from "@/lib/server/friends";
import { cn } from "@/lib/utils";

const KEY = ["friends"] as const;

function useFriends() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api<FriendsView>("/api/friends", { json: { action: "list" } }),
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: (req: FriendRequest) => api<FriendsView>("/api/friends", { json: req }),
    onSuccess: (v) => qc.setQueryData(KEY, v),
  });
  return { ...query, act: mutation };
}

export default function FriendsPage() {
  const { data, act } = useFriends();
  const [comparing, setComparing] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"level" | "weekXp" | "perfectStreak">("level");
  if (!data) return null;
  if (!data.enabled)
    return (
      <div>
        <PageHeader title="Friends" kicker="Party" />
        <div className="rounded-xl border border-amber-400/60 bg-amber-950/30 px-4 py-3 text-sm text-fg light:bg-amber-50">
          <p className="font-display text-[10px] tracking-[0.25em] text-amber-300 light:text-amber-800">[FRIENDS OFFLINE]</p>
          Friends need the database update <code>supabase/migrations/0005_friends.sql</code>. Run it once in the Supabase SQL Editor.
        </div>
      </div>
    );
  const friend = data.friends.find((f) => f.userId === comparing) ?? null;
  const board = [data.me, ...data.friends].filter((c) => c.stats).sort((a, b) => (b.stats![sortBy] ?? 0) - (a.stats![sortBy] ?? 0));

  return (
    <div className="space-y-5">
      <PageHeader title="Friends" kicker="Party" />
      <div className="grid gap-5 lg:grid-cols-2">
        <UsernamePanel username={data.username} />
        <Panel title="Add a friend" subtitle="By their exact username. They see your progress only after they accept.">
          <AddFriend disabled={!data.username} />
        </Panel>
      </div>

      {data.incoming.length || data.outgoing.length ? (
        <Panel title="Requests">
          <ul className="space-y-2">
            {data.incoming.map((r) => (
              <li key={r.friendshipId} className="flex items-center gap-3">
                <Person card={r} />
                <span className="flex-1 text-xs text-dim">wants to be friends</span>
                <Button
                  size="sm"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({
                      action: "accept",
                      friendshipId: r.friendshipId!,
                    })
                  }
                >
                  <Check /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({
                      action: "decline",
                      friendshipId: r.friendshipId!,
                    })
                  }
                >
                  <X /> Decline
                </Button>
              </li>
            ))}
            {data.outgoing.map((r) => (
              <li key={r.friendshipId} className="flex items-center gap-3">
                <Person card={r} />
                <span className="flex-1 text-xs text-faint">request sent</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({
                      action: "remove",
                      friendshipId: r.friendshipId!,
                    })
                  }
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {data.friends.length ? (
        <>
          <Panel
            title="Leaderboard"
            subtitle="You and your friends"
            actions={
              <div className="flex gap-1">
                {(
                  [
                    ["level", "Level"],
                    ["weekXp", "This week"],
                    ["perfectStreak", "Streak"],
                  ] as const
                ).map(([k, label]) => (
                  <Button key={k} size="sm" variant={sortBy === k ? "default" : "ghost"} aria-pressed={sortBy === k} onClick={() => setSortBy(k)}>
                    {label}
                  </Button>
                ))}
              </div>
            }
          >
            <ol className="space-y-1.5">
              {board.map((c, i) => (
                <li key={c.userId} className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5", c.userId === data.me.userId && "bg-accent/10")}>
                  <span className="w-6 text-right font-display text-sm text-dim">{i + 1}</span>
                  <Person card={c} you={c.userId === data.me.userId} />
                  <span className="ml-auto font-mono text-sm text-fg">
                    {sortBy === "level" ? `Lv ${c.stats!.level}` : sortBy === "weekXp" ? `${c.stats!.weekXp.toLocaleString()} XP` : `${c.stats!.perfectStreak} days`}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.friends.map((f) => (
              <Panel key={f.userId} bodyClassName="space-y-3">
                <div className="flex items-start gap-3">
                  <RankBadge rank={f.stats?.hunterRank ?? null} size="md" label={`Hunter rank ${f.stats?.hunterRank ?? "unranked"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg">{f.displayName}</p>
                    <p className="text-xs text-dim">@{f.username}</p>
                    {f.stats?.title ? <p className="text-xs text-accent-2">&ldquo;{f.stats.title}&rdquo;</p> : null}
                  </div>
                  <span className="font-display text-lg text-sky-300 light:text-sky-800">Lv {f.stats?.level ?? "?"}</span>
                </div>
                {f.stats ? <StatsGrid s={f.stats} /> : <p className="text-sm text-faint">No progress shared yet.</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={comparing === f.userId ? "default" : "outline"}
                    disabled={!f.stats || !data.me.stats}
                    onClick={() => setComparing(comparing === f.userId ? null : f.userId)}
                  >
                    <Swords /> Compare
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={act.isPending}
                    onClick={() =>
                      confirm(`Remove ${f.displayName} from your friends?`) &&
                      act.mutate({
                        action: "remove",
                        friendshipId: f.friendshipId!,
                      })
                    }
                  >
                    <UserMinus /> Remove
                  </Button>
                </div>
              </Panel>
            ))}
          </div>

          {friend && friend.stats && data.me.stats ? <Compare me={data.me.stats} them={friend.stats} name={friend.displayName} /> : null}
        </>
      ) : (
        <EmptyState icon={UserPlus} title="No friends yet">
          Share your username and add theirs. Friends see your level, ranks, streaks, quest counts and training targets, never your measurements, grades, finances or notes.
        </EmptyState>
      )}
      {act.error ? <p className="text-sm text-red-300 light:text-red-700">{act.error.message}</p> : null}
    </div>
  );
}

function Person({ card, you }: { card: FriendCard; you?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="font-semibold text-fg">{you ? "You" : card.displayName}</span>
      {card.username ? <span className="ml-1.5 text-xs text-dim">@{card.username}</span> : null}
    </span>
  );
}

function StatsGrid({ s }: { s: FriendStats }) {
  const r = s.regimen;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-1.5">
        <Pill>
          <Flame className="size-3" /> {s.perfectStreak}-day streak
        </Pill>
        <Pill>{s.weekXp.toLocaleString()} XP this week</Pill>
        <Pill>{s.questsCompleted} quests</Pill>
        <Pill>{s.achievements} achievements</Pill>
      </div>
      <div className="flex flex-wrap gap-1">
        {s.attributes.map((a) => (
          <span key={a.code} className="rounded border border-line/60 px-1.5 py-0.5 font-mono text-[10px] text-dim">
            {a.code} {a.level}
            {a.rank ? ` · ${a.rank}` : ""}
          </span>
        ))}
      </div>
      {r ? (
        <p className="text-faint">
          Training: {r.pushups} push-ups · {r.situps} sit-ups · {r.squats} squats · {r.dips} dips · {r.pullups} pull-ups · {Math.round((r.runKm / 1.609344) * 100) / 100} mi
        </p>
      ) : null}
    </div>
  );
}

function Compare({ me, them, name }: { me: FriendStats; them: FriendStats; name: string }) {
  const rows = COMPARE_ROWS.map((r) => ({
    ...r,
    a: r.get(me),
    b: r.get(them),
  }));
  const wins = rows.filter((r) => r.a > r.b).length;
  const losses = rows.filter((r) => r.a < r.b).length;
  return (
    <Panel
      title={`You vs ${name}`}
      subtitle={wins > losses ? `You lead in ${wins} of ${rows.length}.` : wins < losses ? `${name} leads in ${losses} of ${rows.length}. Time to train.` : "Dead even."}
      glow
    >
      <ul className="space-y-3">
        {rows.map((r) => {
          const max = Math.max(r.a, r.b, 1);
          return (
            <li key={r.key}>
              <div className="mb-1 flex justify-between text-xs">
                <span className={cn("font-mono", r.a > r.b ? "text-success" : "text-dim")}>{r.a.toLocaleString()}</span>
                <span className="text-dim">{r.label}</span>
                <span className={cn("font-mono", r.b > r.a ? "text-success" : "text-dim")}>{r.b.toLocaleString()}</span>
              </div>
              <div className="flex gap-1">
                <div className="flex h-1.5 flex-1 justify-end rounded bg-line/40">
                  <div className="h-full rounded bg-sky-400" style={{ width: `${(Math.max(0, r.a) / max) * 100}%` }} />
                </div>
                <div className="h-1.5 flex-1 rounded bg-line/40">
                  <div className="h-full rounded bg-violet-400" style={{ width: `${(Math.max(0, r.b) / max) * 100}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <p className="text-sky-300 light:text-sky-800">You: Hunter rank {me.hunterRank ?? "unranked"}</p>
        <p className="text-right text-violet-300 light:text-violet-800">
          {name}: Hunter rank {them.hunterRank ?? "unranked"}
        </p>
      </div>
    </Panel>
  );
}

function UsernamePanel({ username }: { username: string | null }) {
  const { act } = useFriends();
  const [editing, setEditing] = useState(!username);
  const [value, setValue] = useState(username ?? "");
  const { data: snap } = useSnapshot();
  return (
    <Panel title="Your username" subtitle="Friends add you by this. Letters, numbers and underscores, 3–20 characters.">
      {editing ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act.mutate({ action: "set_username", username: value }, { onSuccess: () => setEditing(false) });
          }}
        >
          <div className="flex-1">
            <Field label="Username" htmlFor="fr-username">
              <Input
                id="fr-username"
                maxLength={21}
                placeholder={(snap?.profile.display_name ?? "hunter")
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "_")
                  .slice(0, 20)}
                value={value}
                onChange={(e) => setValue(e.target.value.toLowerCase())}
              />
            </Field>
          </div>
          <Button type="submit" disabled={act.isPending || value.trim().length < 3}>
            Save
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <AtSign className="size-5 text-accent" />
          <span className="font-display text-xl text-fg">{username}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      )}
      {act.error ? <p className="mt-2 text-sm text-red-300 light:text-red-700">{act.error.message}</p> : null}
    </Panel>
  );
}

function AddFriend({ disabled }: { disabled: boolean }) {
  const { act } = useFriends();
  const [value, setValue] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(null);
        act.mutate({ action: "request", username: value }, { onSuccess: () => (setSent(value.replace(/^@/, "")), setValue("")) });
      }}
    >
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Their username" htmlFor="fr-add">
            <Input id="fr-add" maxLength={21} placeholder="@username" value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={disabled || act.isPending || value.trim().length < 3}>
          <UserPlus /> Send
        </Button>
      </div>
      {disabled ? <p className="text-xs text-faint">Choose your username first.</p> : null}
      {sent ? <p className="text-xs text-success">Request sent to @{sent}.</p> : null}
      {act.error ? <p className="text-xs text-red-300 light:text-red-700">{act.error.message}</p> : null}
    </form>
  );
}
