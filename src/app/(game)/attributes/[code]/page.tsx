"use client";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { CustomStatDialog } from "@/components/game/custom-stat";
import { MetricCard } from "@/components/game/metric-card";
import { EmptyState, PageHeader, Panel, RankBadge, XpBar } from "@/components/system/primitives";
import { newKey } from "@/lib/client/api";
import { chartTheme } from "@/lib/client/chart-theme";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { ATTRIBUTE_BY_CODE } from "@/lib/domain/attributes";
import { ATTRIBUTE_CODES, type AttributeCode } from "@/lib/domain/types";
import { RECOMMENDED } from "@/lib/game/recommendations";

const SKILL_TREE: Partial<Record<AttributeCode, string>> = { INT: "academic", STR: "physical", END: "physical", PHY: "physical", DIS: "discipline" };

export default function AttributeDetail() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase() as AttributeCode;
  const { data } = useSnapshot();
  const [filter, setFilter] = useState<"all" | "logged" | "ranked">("all");
  const series = useMemo(() => {
    if (!data) return [];
    const rows = data.xpLedger.filter((x) => x.attribute === code).sort((a, b) => a.created_at.localeCompare(b.created_at));
    let total = 0;
    const byDay = new Map<string, number>();
    for (const r of rows) {
      total += r.amount;
      byDay.set(r.awarded_on, total);
    }
    return [...byDay.entries()].map(([date, xp]) => ({ date, xp }));
  }, [data, code]);
  if (!data) return null;
  if (!ATTRIBUTE_CODES.includes(code)) return <EmptyState title="Unknown attribute" />;
  const def = ATTRIBUTE_BY_CODE[code];
  const a = data.attributes.find((x) => x.code === code)!;
  const t = chartTheme(data.settings.theme);
  const color = t.attribute[code];
  const metrics = data.metrics.filter((m) => m.attribute === code).filter((m) => (filter === "logged" ? m.current || m.history.length : filter === "ranked" ? m.rank : true));
  const tree = SKILL_TREE[code];
  const nextSkills = data.skills.filter((s) => s.tree === tree && s.available).sort((x, y) => y.progress - x.progress).slice(0, 4);

  return (
    <div className="space-y-5">
      <Link href="/attributes" className="inline-flex items-center gap-1 text-sm text-dim hover:text-fg">
        <ArrowLeft className="size-4" /> Attributes
      </Link>
      <PageHeader title={def.name} kicker={`Attribute · ${code}`}>
        <CustomStatDialog attribute={code}>
          <Button variant="outline">
            <Plus /> Custom stat
          </Button>
        </CustomStatDialog>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Status" glow>
          <div className="flex items-center gap-5">
            <RankBadge rank={a.rank} size="lg" />
            <div className="flex-1">
              <p className="font-display text-4xl font-black" style={{ color }}>
                Lv {a.level.level}
              </p>
              <p className="font-mono text-xs text-dim">
                {a.level.xpIntoLevel}/{a.level.xpForNext} XP · {a.xp} total
              </p>
              <XpBar value={a.level.xpIntoLevel} max={a.level.xpForNext} color={color} className="mt-2" />
            </div>
          </div>
          <p className="mt-4 text-sm text-dim">{def.description}</p>
          <p className="mt-2 text-xs text-faint">{a.explanation}</p>
          {def.scientificNote ? <p className="mt-2 rounded-lg border border-line/60 bg-bg/40 p-2 text-xs text-dim">{def.scientificNote}</p> : null}
          {code === "INT" ? (
            <Button asChild className="mt-3">
              <Link href="/trials">Take a System Trial</Link>
            </Button>
          ) : null}
          {a.strongest ? <p className="mt-3 text-sm text-dim">Strongest: <span className="text-fg">{a.strongest.name}</span> ({a.strongest.rank})</p> : null}
          {a.weakest ? <p className="text-sm text-dim">Weakest: <span className="text-fg">{a.weakest.name}</span> ({a.weakest.rank})</p> : null}
        </Panel>
        <Panel title="XP History" subtitle="Cumulative attribute XP">
          {series.length >= 2 ? (
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid stroke={t.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: t.textDim, fontSize: 11 }} stroke={t.axis} minTickGap={24} />
                  <YAxis tick={{ fill: t.textDim, fontSize: 11 }} stroke={t.axis} width={44} />
                  <Tooltip contentStyle={{ background: t.surface, border: `1px solid ${t.axis}`, borderRadius: 8, color: t.text }} formatter={(v) => [`${v} XP`, def.name]} />
                  <Area type="monotone" dataKey="xp" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.18} isAnimationActive={!data.settings.reduced_motion} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Not enough history yet">Log actions for this attribute on two or more days to see the trend.</EmptyState>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Next Milestones">
          <ul className="space-y-3">
            {nextSkills.map((s) => (
              <li key={s.code}>
                <div className="flex justify-between text-sm">
                  <span className="text-fg">{s.name}</span>
                  <span className="font-mono text-xs text-faint">{Math.floor(s.progress * 100)}%</span>
                </div>
                <p className="text-xs text-dim">{s.requirement.label}</p>
                <XpBar value={s.progress * 100} max={100} thin label={s.name} />
              </li>
            ))}
            {data.achievements
              .filter((x) => !x.unlocked && x.progress > 0)
              .filter((x) => (code === "INT" ? x.category === "Knowledge" : code === "STR" ? x.category === "Strength" : code === "END" ? x.category === "Endurance" : code === "WIS" ? x.category === "Wellness" : code === "CHA" ? x.category === "Social" : code === "WLT" ? x.category === "Wealth" : code === "DIS" ? x.category === "Discipline" : false))
              .slice(0, 3)
              .map((x) => (
                <li key={x.code}>
                  <div className="flex justify-between text-sm">
                    <span className="text-fg">{x.name}</span>
                    <span className="font-mono text-xs text-faint">{Math.floor(x.progress * 100)}%</span>
                  </div>
                  <p className="text-xs text-dim">{x.description}</p>
                  <XpBar value={x.progress * 100} max={100} thin label={x.name} />
                </li>
              ))}
            {!nextSkills.length ? <li className="text-sm text-faint">Achievements and skills in this area will appear as you progress.</li> : null}
          </ul>
        </Panel>
        <Panel title="Recommended Quests">
          <ul className="space-y-3">
            {RECOMMENDED[code].map((r) => (
              <RecommendedQuest key={r.title} code={code} rec={r} />
            ))}
          </ul>
        </Panel>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="sys-title text-sm text-accent">Metrics</h2>
          {(["all", "logged", "ranked"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)} aria-pressed={filter === f}>
              {f}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((m) => (
            <MetricCard key={m.id} m={m} />
          ))}
        </div>
        {!metrics.length ? <EmptyState title="No metrics match this filter" /> : null}
      </div>
    </div>
  );
}

function RecommendedQuest({ code, rec }: { code: AttributeCode; rec: (typeof RECOMMENDED)[AttributeCode][number] }) {
  const cmd = useCommand();
  const [done, setDone] = useState(false);
  return (
    <li className="rounded-lg border border-line/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-fg">{rec.title}</p>
          <p className="text-sm text-dim">{rec.description}</p>
          <p className="mt-1 text-xs text-faint">{rec.objectives.map((o) => o.title).join(" · ")}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={done || cmd.isPending}
          onClick={() => cmd.mutate({ type: "create_custom_quest", title: rec.title, description: rec.description, attribute: code, difficulty: rec.difficulty, deadline: null, objectives: rec.objectives, idempotencyKey: newKey("rec") }, { onSuccess: () => setDone(true) })}
        >
          {done ? "Accepted" : "Accept"}
        </Button>
      </div>
    </li>
  );
}
