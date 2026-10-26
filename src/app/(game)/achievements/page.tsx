"use client";
import { Crown, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/system/icon";
import { EmptyState, PageHeader, Panel, XpBar } from "@/components/system/primitives";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { RARITY_ORDER } from "@/lib/domain/achievements";
import { TITLES } from "@/lib/domain/titles";
import { cn } from "@/lib/utils";

export default function AchievementsPage() {
  const { data } = useSnapshot();
  const cmd = useCommand();
  const [category, setCategory] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [status, setStatus] = useState<"all" | "unlocked" | "locked">("all");
  const list = useMemo(() => {
    if (!data) return [];
    return data.achievements
      .filter((a) => (category === "all" || a.category === category) && (rarity === "all" || a.rarity === rarity) && (status === "all" || (status === "unlocked" ? a.unlocked : !a.unlocked)))
      .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  }, [data, category, rarity, status]);
  if (!data) return null;
  const categories = [...new Set(data.achievements.map((a) => a.category))];
  const unlockedCount = data.achievements.filter((a) => a.unlocked).length;
  const owned = new Map(data.player.titles.map((t) => [t.code, t]));
  return (
    <div>
      <PageHeader title="Achievements" kicker={`${unlockedCount} / ${data.achievements.length} unlocked`} />
      <Tabs defaultValue="gallery">
        <TabsList className="mb-4">
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
          <TabsTrigger value="titles">Titles ({data.player.titles.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="gallery">
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select aria-label="Rarity" value={rarity} onChange={(e) => setRarity(e.target.value)}>
              <option value="all">All rarities</option>
              {RARITY_ORDER.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">All</option>
              <option value="unlocked">Unlocked</option>
              <option value="locked">Locked</option>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((a) => (
              <article key={a.code} className={cn(`rarity-${a.rarity}`, "sys-panel relative flex gap-3 p-3.5", !a.unlocked && "opacity-75")} style={a.unlocked ? { borderColor: "color-mix(in srgb, var(--rarity) 55%, transparent)", boxShadow: "0 0 22px -10px var(--rarity)" } : undefined}>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: "color-mix(in srgb, var(--rarity) 50%, transparent)", color: a.unlocked ? "var(--rarity)" : "var(--text-faint)", background: a.unlocked ? "color-mix(in srgb, var(--rarity) 12%, transparent)" : undefined }}>
                  {a.unlocked ? <Icon name={a.icon} className="size-6" /> : <Lock className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[9px] uppercase tracking-[0.2em]" style={{ color: "var(--rarity)" }}>
                    {a.rarity} · {a.category}
                  </p>
                  <h3 className="truncate font-semibold text-fg">{a.name}</h3>
                  <p className="text-xs text-dim">{a.description}</p>
                  {a.unlocked ? (
                    <p className="mt-1 font-mono text-[11px] text-faint">Unlocked {a.unlockedAt?.slice(0, 10)} · +{a.xp} XP</p>
                  ) : (
                    <div className="mt-1.5">
                      <XpBar value={a.progress * 100} max={100} thin label={`${a.name} progress`} />
                      <p className="mt-0.5 font-mono text-[10px] text-faint">
                        {Math.floor(a.progress * 100)}% · reward +{a.xp} XP{a.title ? " + title" : ""}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!list.length ? <EmptyState title="No achievements match" /> : null}
        </TabsContent>
        <TabsContent value="titles">
          <Panel title="Titles" subtitle="Earned from achievements and story arcs. Equip one to display it on your status window.">
            <div className="mb-3">
              <Button size="sm" variant="ghost" disabled={!data.player.equippedTitle || cmd.isPending} onClick={() => cmd.mutate({ type: "equip_title", titleCode: null })}>
                Unequip title
              </Button>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TITLES.map((t) => {
                const o = owned.get(t.code);
                const equipped = data.player.equippedTitle?.code === t.code;
                return (
                  <li key={t.code} className={cn(`rarity-${t.rarity}`, "flex items-center gap-3 rounded-lg border p-3", o ? "border-line" : "border-line/40 opacity-50")}>
                    <Crown className="size-5 shrink-0" style={{ color: o ? "var(--rarity)" : undefined }} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-fg">{o ? t.name : "???"}</p>
                      <p className="text-xs text-dim">{t.description}</p>
                    </div>
                    {o ? (
                      <Button size="sm" variant={equipped ? "default" : "outline"} disabled={equipped || cmd.isPending} onClick={() => cmd.mutate({ type: "equip_title", titleCode: t.code })}>
                        {equipped ? "Equipped" : "Equip"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
