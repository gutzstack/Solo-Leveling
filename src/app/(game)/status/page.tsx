"use client";
import { motion } from "framer-motion";
import { ChevronRight, DoorOpen, Flame, PenLine, Plus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/switch";
import { GuidePanel } from "@/components/game/guide-panel";
import { LogActivityDialog, LogMetricDialog } from "@/components/game/log-dialogs";
import { StreakCalendar } from "@/components/game/streak-calendar";
import { EvidenceBadge, Panel, RankBadge, Stat, XpBar } from "@/components/system/primitives";
import { Icon } from "@/components/system/icon";
import { chartTheme } from "@/lib/client/chart-theme";
import { useSnapshot } from "@/lib/client/use-game";
import { ATTRIBUTE_BY_CODE } from "@/lib/domain/attributes";
import { computeGuideFacts } from "@/lib/game/guide";

export default function StatusPage() {
  const { data } = useSnapshot();
  const facts = useMemo(() => (data ? computeGuideFacts(data) : null), [data]);
  if (!data || !facts) return null;
  const t = chartTheme(data.settings.theme);
  const lv = data.player.level;
  const tracked = data.attributes.filter((a) => a.tracked);
  const radar = tracked.map((a) => ({ attr: a.code, level: a.level.level, name: a.name }));
  const daily = data.quests.filter((q) => q.kind === "daily" && q.period_start === data.today && q.status !== "offered");
  const doneDaily = daily.filter((q) => q.status === "completed").length;
  const ranked = data.metrics.filter((m) => m.rank && m.score !== null && !m.excludeFromScore).sort((a, b) => (b.score as number) - (a.score as number));
  const xpByDay: Record<string, number> = {};
  for (const x of data.xpLedger) if (!x.reversed && x.amount > 0) xpByDay[x.awarded_on] = (xpByDay[x.awarded_on] ?? 0) + x.amount;

  return (
    <div className="space-y-5">
      {/* Status window */}
      <section className="sys-panel sys-panel-glow scanlines relative overflow-hidden">
        <div className="holo-sheen" />
        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="font-display text-[10px] tracking-[0.35em] text-accent text-glow">[STATUS]</p>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="font-display text-[10px] tracking-[0.25em] text-faint">NAME</p>
                <h1 className="text-2xl font-bold text-fg sm:text-3xl">{data.profile.display_name}</h1>
                <p className="text-sm text-accent-2">{data.player.equippedTitle ? `Title: ${data.player.equippedTitle.name}` : "No title equipped"}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="font-display text-[10px] tracking-[0.25em] text-faint">LEVEL</p>
                <motion.p key={lv.level} initial={{ scale: 1.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-6xl font-black leading-none text-sky-300 text-glow light:text-sky-700 sm:text-7xl">
                  {lv.level}
                </motion.p>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between font-mono text-xs text-dim">
                <span>EXP</span>
                <span>
                  {lv.xpIntoLevel.toLocaleString()} / {lv.xpForNext.toLocaleString()} → Lv {lv.level + 1}
                </span>
              </div>
              <XpBar value={lv.xpIntoLevel} max={lv.xpForNext} label={`Experience: ${lv.xpIntoLevel} of ${lv.xpForNext}`} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Total XP" value={lv.totalXp.toLocaleString()} />
              <Stat label="Effort XP" value={data.player.effortXp.toLocaleString()} sub="from actions" />
              <Stat label="Performance XP" value={data.player.performanceXp.toLocaleString()} sub="from records" />
              <Stat label="Streak" value={<span className="inline-flex items-center gap-1"><Flame className="size-4 text-orange-400" />{data.player.streak}d</span>} sub={`best ${data.player.longestStreak}d`} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <LogActivityDialog>
                <Button><Plus /> Log activity</Button>
              </LogActivityDialog>
              <LogMetricDialog>
                <Button variant="outline"><PenLine /> Log measurement</Button>
              </LogMetricDialog>
              <Button variant="outline" asChild>
                <Link href="/dungeons"><DoorOpen /> Enter dungeon</Link>
              </Button>
            </div>
          </div>

          {/* Hunter rank */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-line/60 bg-bg/40 p-5 text-center">
            <p className="font-display text-[10px] tracking-[0.3em] text-faint">HUNTER RANK</p>
            <div className="my-4">
              <RankBadge rank={data.hunter.rank} size="xl" />
            </div>
            {data.hunter.score !== null ? (
              <p className="font-mono text-sm text-dim">
                Score {data.hunter.score}
                {data.hunter.uncertainty !== null ? ` ± ${data.hunter.uncertainty}` : ""} / 100
                {data.hunter.provisional ? " · provisional" : ""}
              </p>
            ) : null}
            <p className="mt-2 max-w-xs text-xs text-faint">Game-defined aggregate of your ranked attributes. It is not a population percentile. <Link href="/rankings" className="text-accent underline-offset-2 hover:underline">How it&apos;s calculated</Link></p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Attributes */}
        <Panel title="Attributes" subtitle="Level = XP earned; rank = performance evidence" className="lg:col-span-2" actions={<Link href="/attributes" className="text-xs text-accent hover:underline">All attributes</Link>}>
          <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
            <div className="h-64" aria-label="Radar chart of attribute levels">
              <ResponsiveContainer>
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke={t.grid} />
                  <PolarAngleAxis dataKey="attr" tick={{ fill: t.textDim, fontSize: 11, fontFamily: "Orbitron" }} />
                  <PolarRadiusAxis tick={false} axisLine={false} domain={[0, Math.max(5, ...radar.map((r) => r.level))]} />
                  <Radar dataKey="level" name="Level" stroke={t.accent} strokeWidth={2} fill={t.accent} fillOpacity={0.22} isAnimationActive={!data.settings.reduced_motion} />
                  <Tooltip contentStyle={{ background: t.surface, border: `1px solid ${t.axis}`, borderRadius: 8, color: t.text }} formatter={(v) => [`Lv ${v}`, "Level"]} labelFormatter={(l) => ATTRIBUTE_BY_CODE[l as keyof typeof ATTRIBUTE_BY_CODE]?.name ?? l} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2">
              {tracked.map((a) => (
                <li key={a.code}>
                  <Link href={`/attributes/${a.code}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/5">
                    <span className="w-9 font-display text-xs font-bold" style={{ color: data.settings.theme === "dark" ? ATTRIBUTE_BY_CODE[a.code].color : ATTRIBUTE_BY_CODE[a.code].colorLight }}>
                      {a.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="truncate text-fg">{a.name}</span>
                        <span className="font-mono text-xs text-dim">Lv {a.level.level}</span>
                      </div>
                      <XpBar value={a.level.xpIntoLevel} max={a.level.xpForNext} thin label={`${a.name} XP`} />
                    </div>
                    <Tip content={a.explanation}>
                      <span tabIndex={0}>
                        <RankBadge rank={a.rank} size="sm" />
                      </span>
                    </Tip>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        {/* Today's quests */}
        <Panel title="Daily Quests" subtitle={`${doneDaily}/${daily.length} complete`} actions={<Link href="/quests" className="text-xs text-accent hover:underline">Quest board</Link>}>
          <ul className="space-y-3">
            {daily.map((q) => (
              <li key={q.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className={q.status === "completed" ? "text-sm text-success line-through decoration-1" : "text-sm text-fg"}>{q.title}</p>
                  <span className="shrink-0 font-mono text-[11px] text-faint">+{q.xp_reward}</span>
                </div>
                <XpBar value={q.progress * 100} max={100} thin label={`${q.title} progress`} color={q.status === "completed" ? "#34d399" : undefined} />
              </li>
            ))}
            {!daily.length ? <li className="text-sm text-faint">No daily quests today.</li> : null}
          </ul>
          {daily.length > 0 && doneDaily === daily.length ? <p className="mt-3 text-sm text-success">All daily quests cleared. The System acknowledges your discipline.</p> : null}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Strengths" subtitle="Highest-ranked metrics">
          <MetricList items={ranked.slice(0, 4)} icon={TrendingUp} empty="Log measurements to reveal your strengths." />
        </Panel>
        <Panel title="Weaknesses" subtitle="Lowest-ranked metrics">
          <MetricList items={ranked.length > 4 ? ranked.slice(-4).reverse() : []} icon={TrendingDown} empty="More ranked metrics are needed to show weaknesses." />
        </Panel>
        <Panel title="Next Evolution" subtitle="Closest milestones">
          <ul className="space-y-2 text-sm">
            {facts.nextMilestones.length ? (
              facts.nextMilestones.slice(0, 5).map((m, i) => (
                <li key={i} className="flex gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-2" />
                  <span className="text-dim">{m}</span>
                </li>
              ))
            ) : (
              <li className="text-faint">Milestones appear as you log activity.</li>
            )}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <GuidePanel />
        <div className="space-y-5">
          <Panel title="Progress Calendar" subtitle={`${data.player.streak}-day streak`}>
            <StreakCalendar activeDays={data.activeDays} today={data.today} xpByDay={xpByDay} />
          </Panel>
          <Panel title="Recent Activity">
            <ul className="divide-y divide-line/50">
              {data.activities.slice(-6).reverse().map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="text-accent"><ActivityIcon type={a.type} /></span>
                  <span className="flex-1 text-fg">{a.type.replace(/_/g, " ")}</span>
                  <span className="font-mono text-xs text-faint">{a.duration_min ? `${Math.round(a.duration_min)} min · ` : ""}{a.occurred_on}</span>
                </li>
              ))}
              {!data.activities.length ? <li className="py-2 text-sm text-faint">Nothing logged yet. Your first action awaits.</li> : null}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const icons: Record<string, string> = { study: "BookOpen", workout: "Dumbbell", run: "Footprints", reflection: "NotebookPen", flashcards: "Layers", mindfulness: "Flower2", practice_exam: "ClipboardCheck", mobility: "StretchHorizontal" };
  return <Icon name={icons[type] ?? "Activity"} className="size-4" />;
}

function MetricList({ items, icon: I, empty }: { items: { id: string; name: string; rank: string | null; evidence: "verified" | "estimated" | "personal" | null; attribute: string }[]; icon: React.ElementType; empty: string }) {
  if (!items.length) return <p className="text-sm text-faint">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((m) => (
        <li key={m.id}>
          <Link href={`/attributes/${m.attribute}#${m.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-accent/5">
            <I className="size-4 text-faint" />
            <span className="flex-1 truncate text-sm text-fg">{m.name}</span>
            <EvidenceBadge evidence={m.evidence} />
            <RankBadge rank={m.rank} size="sm" />
            <ChevronRight className="size-4 text-faint" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
