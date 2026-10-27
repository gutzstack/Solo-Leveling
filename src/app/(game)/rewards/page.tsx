"use client";
import { Coins, Flame, Gem, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Icon } from "@/components/system/icon";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/system/primitives";
import { newKey } from "@/lib/client/api";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { CHEST_INFO, DAILY_ALL_GOLD, ITEM_INFO, MAIN_CHAPTER_GOLD, STREAK_TIERS, SYSTEM_SHOP, type ChestRarity, type ItemCode } from "@/lib/domain/rewards";
import type { ShopRewardRow } from "@/lib/game/rows";
import { cn } from "@/lib/utils";

const RARITY_TONE: Record<ChestRarity, string> = {
  common: "border-slate-400/50 text-slate-200 light:text-slate-700",
  rare: "border-sky-400/60 text-sky-300 light:text-sky-800",
  epic: "border-violet-400/70 text-violet-300 light:text-violet-800",
  legendary: "border-amber-400/80 text-amber-300 light:text-amber-800",
};

export default function RewardsPage() {
  const { data } = useSnapshot();
  const cmd = useCommand();
  if (!data) return null;
  const rw = data.rewards;
  const chests = rw.inventory.filter((i) => i.item_code === "chest" && !i.used_at);
  const opened = rw.inventory.filter((i) => i.item_code === "chest" && i.used_at).slice(-6).reverse();
  const items = (Object.keys(ITEM_INFO) as ItemCode[]).map((code) => ({ code, unused: rw.inventory.filter((i) => i.item_code === code && !i.used_at) }));
  const next = STREAK_TIERS.find((t) => rw.perfectStreak < t.days);

  return (
    <div className="space-y-5">
      <PageHeader title="Rewards" kicker="Treasury" />
      {!rw.enabled ? (
        <div className="rounded-xl border border-amber-400/60 bg-amber-950/30 px-4 py-3 text-sm text-fg light:bg-amber-50">
          <p className="font-display text-[10px] tracking-[0.25em] text-amber-300 light:text-amber-800">[REWARDS OFFLINE]</p>
          Gold, chests and the shop need the database update <code>supabase/migrations/0004_rewards.sql</code>. Run it once in the Supabase SQL Editor.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Gold" glow>
          <p className="flex items-center gap-2 font-display text-4xl font-black text-amber-300 light:text-amber-800">
            <Coins className="size-8" /> {rw.balance.toLocaleString()}
          </p>
          <ul className="mt-4 space-y-1 text-xs text-dim">
            <li>Training regimen: 50 · other dailies: 10 · weekly: 75</li>
            <li>Emergency: 40 · custom: 20 · story chapter: {MAIN_CHAPTER_GOLD}</li>
            <li>Dungeon clears: 5 (E) to 60 (S), up to 4 a day</li>
            <li>All dailies cleared: +{DAILY_ALL_GOLD} and a reward chest</li>
            <li className="text-red-300/90 light:text-red-700">Failed quests cost gold too.</li>
          </ul>
        </Panel>
        <Panel title="Perfect streak" subtitle="Consecutive days with every daily quest cleared">
          <p className="flex items-center gap-2 font-display text-4xl font-black text-fg">
            <Flame className={cn("size-8", rw.perfectStreak ? "text-orange-400" : "text-faint")} /> {rw.perfectStreak}
            <span className="text-base text-amber-300 light:text-amber-800">×{rw.multiplier} gold</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STREAK_TIERS.map((t) => (
              <Pill key={t.days} className={cn(rw.perfectStreak >= t.days && "border-amber-400/60 text-amber-300 light:text-amber-800")}>
                {t.days} days: ×{t.multiplier}
              </Pill>
            ))}
          </div>
          <p className="mt-3 text-xs text-dim">{next ? `${next.days - rw.perfectStreak} more perfect day${next.days - rw.perfectStreak === 1 ? "" : "s"} for ×${next.multiplier}.` : "Maximum multiplier reached."} One missed day resets it.</p>
        </Panel>
        <Panel title="Inventory">
          <ul className="space-y-3">
            {items.map(({ code, unused }) => (
              <li key={code} className="flex items-start gap-3">
                <Icon name={ITEM_INFO[code].icon} className="mt-0.5 size-5 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">
                    {ITEM_INFO[code].name} <span className="font-mono text-xs text-dim">×{unused.length}</span>
                  </p>
                  <p className="text-xs text-faint">{ITEM_INFO[code].description}</p>
                </div>
                {code === "xp_elixir" && unused.length ? (
                  <Button size="sm" variant="outline" disabled={cmd.isPending || rw.elixirActive} onClick={() => cmd.mutate({ type: "use_item", itemId: unused[0].id })}>
                    {rw.elixirActive ? "Active" : "Drink"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {rw.elixirActive ? <p className="mt-3 text-xs text-success">Double XP is active for the rest of today.</p> : null}
        </Panel>
      </div>

      <Panel title="Reward chests" subtitle="One drops each day you clear every daily quest. Common 70% · Rare 22% · Epic 7% · Legendary 1%">
        {chests.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {chests.map((c) => (
              <div key={c.id} className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-center", RARITY_TONE[c.rarity ?? "common"])}>
                <Gem className="size-10" />
                <p className="font-display text-xs tracking-[0.2em]">{CHEST_INFO[c.rarity ?? "common"].name.toUpperCase()}</p>
                <p className="text-[11px] text-faint">{c.data.date ?? c.acquired_at.slice(0, 10)}</p>
                <Button size="sm" disabled={cmd.isPending} onClick={() => cmd.mutate({ type: "open_chest", itemId: c.id })}>
                  Open
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Gem} title="No chests waiting">
            Clear every daily quest today to earn one.
          </EmptyState>
        )}
        {opened.length ? (
          <div className="mt-4">
            <p className="mb-2 font-display text-[10px] tracking-[0.18em] text-dim">RECENTLY OPENED</p>
            <ul className="space-y-1 text-sm">
              {opened.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <Pill className={RARITY_TONE[c.rarity ?? "common"]}>{c.rarity}</Pill>
                  <span className="text-fg">+{c.data.opened?.gold ?? 0} gold</span>
                  {(c.data.opened?.items ?? []).map((it, i) => (
                    <span key={i} className="text-dim">+ {ITEM_INFO[it].name}</span>
                  ))}
                  {c.data.opened?.title ? <span className="text-amber-300 light:text-amber-800">+ title</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Your reward shop" subtitle="Real-life rewards you set the price for. Claim them only with gold you've earned.">
          <ShopList rewards={rw.shop} balance={rw.balance} enabled={rw.enabled} />
        </Panel>
        <Panel title="System shop" subtitle="Items the System sells for gold">
          <ul className="space-y-3">
            {SYSTEM_SHOP.map((o) => (
              <li key={o.code} className="flex items-start gap-3">
                <Icon name={ITEM_INFO[o.code].icon} className="mt-0.5 size-5 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{ITEM_INFO[o.code].name}</p>
                  <p className="text-xs text-faint">{ITEM_INFO[o.code].description}</p>
                </div>
                <Button size="sm" variant="outline" disabled={cmd.isPending || !rw.enabled || rw.balance < o.price} onClick={() => cmd.mutate({ type: "buy_item", code: o.code, idempotencyKey: newKey("buy") })}>
                  <Coins /> {o.price}
                </Button>
              </li>
            ))}
          </ul>
          {cmd.error ? <p className="mt-3 text-xs text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
        </Panel>
      </div>

      <Panel title="Gold history">
        {rw.ledger.length ? (
          <ul className="divide-y divide-line/40 text-sm">
            {rw.ledger.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-1.5">
                <span className={cn("w-16 shrink-0 text-right font-mono", g.amount > 0 ? "text-amber-300 light:text-amber-800" : "text-red-300 light:text-red-700")}>
                  {g.amount > 0 ? "+" : ""}
                  {g.amount}
                </span>
                <span className="min-w-0 flex-1 truncate text-fg">{g.reason}</span>
                <span className="font-mono text-[11px] text-faint">{g.awarded_on}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No gold yet">Complete a quest to earn your first gold.</EmptyState>
        )}
      </Panel>
    </div>
  );
}

function ShopList({ rewards, balance, enabled }: { rewards: ShopRewardRow[]; balance: number; enabled: boolean }) {
  const cmd = useCommand();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {rewards.length ? (
        <ul className="space-y-2">
          {rewards.map((r) =>
            editing === r.id ? (
              <li key={r.id}>
                <RewardForm initial={r} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className="flex items-start gap-3 rounded-lg border border-line/60 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{r.name}</p>
                  {r.description ? <p className="text-xs text-faint">{r.description}</p> : null}
                </div>
                <Button
                  size="sm"
                  disabled={cmd.isPending || balance < r.price}
                  onClick={() => confirm(`Claim "${r.name}" for ${r.price} gold?`) && cmd.mutate({ type: "buy_reward", rewardId: r.id, idempotencyKey: newKey("claim") })}
                  title={balance < r.price ? `You need ${r.price - balance} more gold` : undefined}
                >
                  <Coins /> {r.price.toLocaleString()}
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r.id)}>
                  <Pencil />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => confirm(`Remove "${r.name}" from your shop?`) && cmd.mutate({ type: "delete_reward", rewardId: r.id })}>
                  <Trash2 />
                </Button>
              </li>
            ),
          )}
        </ul>
      ) : (
        <EmptyState title="Your shop is empty">Add rewards you actually want: an hour of gaming, a cheat meal, new gear.</EmptyState>
      )}
      {cmd.error ? <p className="text-xs text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
      {enabled ? <RewardForm /> : null}
    </div>
  );
}

function RewardForm({ initial, onDone }: { initial?: ShopRewardRow; onDone?: () => void }) {
  const cmd = useCommand({ silent: true });
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  return (
    <form
      className="space-y-2 rounded-lg border border-dashed border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const p = Math.round(Number(price));
        if (!name.trim() || !(p > 0)) return;
        const body = { name: name.trim(), description: description.trim(), price: p };
        cmd.mutate(initial ? { type: "update_reward", rewardId: initial.id, ...body } : { type: "create_reward", ...body }, {
          onSuccess: () => {
            if (!initial) {
              setName("");
              setDescription("");
              setPrice("");
            }
            onDone?.();
          },
        });
      }}
    >
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Field label={initial ? "Reward" : "New reward"} htmlFor={`rw-name-${initial?.id ?? "new"}`}>
          <Input id={`rw-name-${initial?.id ?? "new"}`} maxLength={80} placeholder="1 hour of gaming" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Price (gold)" htmlFor={`rw-price-${initial?.id ?? "new"}`}>
          <Input id={`rw-price-${initial?.id ?? "new"}`} type="number" min={1} max={1000000} placeholder="150" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <Textarea aria-label="Description (optional)" maxLength={300} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-0" rows={1} />
      {cmd.error ? <p className="text-xs text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={cmd.isPending || !name.trim() || !price}>
          {initial ? "Save" : (
            <>
              <Plus /> Add reward
            </>
          )}
        </Button>
        {initial ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
