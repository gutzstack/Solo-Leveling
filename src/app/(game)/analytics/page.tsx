"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/game/chart-card";
import { StreakCalendar } from "@/components/game/streak-calendar";
import { PageHeader, Panel, Pill } from "@/components/system/primitives";
import { Button } from "@/components/ui/button";
import { chartTheme, type ChartTheme } from "@/lib/client/chart-theme";
import { useSnapshot } from "@/lib/client/use-game";
import { displayUnit, formatValue } from "@/lib/domain/units";
import type { UnitKind, UnitSystem } from "@/lib/domain/types";
import { levelFromXp } from "@/lib/domain/xp";
import { improvementVelocity, levelSeries, metricSeries, personalRecords, RANGES, rangeStart, rankDistribution, weeklySeries, type RangeKey } from "@/lib/game/analytics";

function axisProps(t: ChartTheme) {
  return { tick: { fill: t.textDim, fontSize: 11 }, stroke: t.axis, tickLine: false };
}
function tooltipStyle(t: ChartTheme) {
  return { contentStyle: { background: t.surface, border: `1px solid ${t.axis}`, borderRadius: 8, color: t.text, fontSize: 12 }, cursor: { stroke: t.axis, fill: "rgba(56,189,248,0.06)" } };
}

export default function AnalyticsPage() {
  const { data } = useSnapshot();
  const [range, setRange] = useState<RangeKey>("30d");
  const computed = useMemo(() => {
    if (!data) return null;
    const from = rangeStart(data, range);
    return {
      from,
      level: levelSeries(data, from),
      weekly: weeklySeries(data, from),
      strength: metricSeries(data, ["bench_press_1rm", "squat_1rm", "deadlift_1rm", "overhead_press_1rm"], from),
      running: metricSeries(data, ["mile_time", "run_5k", "run_10k", "half_marathon"], from),
      body: metricSeries(data, ["body_weight"], from),
      money: metricSeries(data, ["net_worth", "savings", "debt"], from),
      academic: metricSeries(data, ["exam_average", "quiz_average", "knowledge_assessment"], from),
      ranks: rankDistribution(data),
      prs: personalRecords(data).filter((p) => p.date >= from),
      velocity: improvementVelocity(data, from),
    };
  }, [data, range]);
  if (!data || !computed) return null;
  const t = chartTheme(data.settings.theme);
  const u = data.settings.unit_system;
  const anim = !data.settings.reduced_motion;
  const c = computed;
  const radar = data.attributes.filter((a) => a.tracked).map((a) => ({ attr: a.code, level: a.level.level }));
  const totalXpRange = c.level.reduce((s, d) => s + d.effort + d.performance, 0);
  const massU = displayUnit("mass", u);
  const PACE: Record<string, number> = { mile_time: 1.609344, run_5k: 5, run_10k: 10, half_marathon: 21.0975 };
  const paceRows = c.running.map((r) => {
    const row: Record<string, number | string> = { date: r.date };
    for (const k of Object.keys(PACE)) if (typeof r[k] === "number") row[k] = (r[k] as number) / (u === "imperial" ? PACE[k] / 1.609344 : PACE[k]);
    return row;
  });
  const xpByDay: Record<string, number> = {};
  for (const x of data.xpLedger) if (!x.reversed && x.amount > 0) xpByDay[x.awarded_on] = (xpByDay[x.awarded_on] ?? 0) + x.amount;

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" kicker="Recorded history only. No predictions.">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Time range">
          {RANGES.map((r) => (
            <Button key={r.key} size="sm" variant={range === r.key ? "default" : "outline"} onClick={() => setRange(r.key)} aria-pressed={range === r.key}>
              {r.label}
            </Button>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-4">
        <Panel bodyClassName="p-4"><Kpi label="XP in range" value={totalXpRange.toLocaleString()} /></Panel>
        <Panel bodyClassName="p-4"><Kpi label="Levels gained" value={String(c.level.length ? c.level[c.level.length - 1].level - levelFromXp(c.level[0].total - c.level[0].effort - c.level[0].performance, data.xpConfig.levelBase, data.xpConfig.levelExponent).level : 0)} /></Panel>
        <Panel bodyClassName="p-4"><Kpi label="Personal records" value={String(c.prs.length)} /></Panel>
        <Panel bodyClassName="p-4"><Kpi label="Study hours" value={String(c.weekly.reduce((s, w) => s + w.studyHours, 0).toFixed(1))} /></Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Player level history" subtitle="Level reached each day from recorded XP" table={{ columns: ["Date", "Total XP", "Level"], rows: c.level.map((d) => [d.date, d.total, d.level]) }}>
          <ResponsiveContainer>
            <LineChart data={c.level} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="date" {...axisProps(t)} minTickGap={28} />
              <YAxis {...axisProps(t)} allowDecimals={false} width={32} />
              <Tooltip {...tooltipStyle(t)} />
              <Line type="stepAfter" dataKey="level" name="Level" stroke={t.series[0]} strokeWidth={2} dot={false} isAnimationActive={anim} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="XP earned per day" subtitle="Effort XP (actions) vs performance XP (records)" empty={totalXpRange ? null : "Earn XP to see this chart."} table={{ columns: ["Date", "Effort", "Performance"], rows: c.level.filter((d) => d.effort || d.performance).map((d) => [d.date, d.effort, d.performance]) }}>
          <ResponsiveContainer>
            <BarChart data={c.level} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="date" {...axisProps(t)} minTickGap={28} />
              <YAxis {...axisProps(t)} width={40} />
              <Tooltip {...tooltipStyle(t)} />
              <Legend wrapperStyle={{ fontSize: 12, color: t.textDim }} />
              <Bar dataKey="effort" name="Effort" stackId="xp" fill={t.series[0]} stroke={t.surface} strokeWidth={1} isAnimationActive={anim} />
              <Bar dataKey="performance" name="Performance" stackId="xp" fill={t.series[1]} stroke={t.surface} strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={anim} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Attribute levels" subtitle="Current level of each tracked attribute" table={{ columns: ["Attribute", "Level"], rows: radar.map((r) => [r.attr, r.level]) }}>
          <ResponsiveContainer>
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke={t.grid} />
              <PolarAngleAxis dataKey="attr" tick={{ fill: t.textDim, fontSize: 11 }} />
              <PolarRadiusAxis tick={false} axisLine={false} />
              <Radar dataKey="level" name="Level" stroke={t.accent} fill={t.accent} fillOpacity={0.2} strokeWidth={2} isAnimationActive={anim} />
              <Tooltip {...tooltipStyle(t)} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rank distribution" subtitle="Metrics per rank, by evidence basis (current)" table={{ columns: ["Rank", "Population-based", "Game standard / goal"], rows: c.ranks.map((r) => [r.rank, r.population, r.personal]) }}>
          <ResponsiveContainer>
            <BarChart data={c.ranks} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="rank" {...axisProps(t)} />
              <YAxis {...axisProps(t)} allowDecimals={false} width={28} />
              <Tooltip {...tooltipStyle(t)} />
              <Legend wrapperStyle={{ fontSize: 12, color: t.textDim }} />
              <Bar dataKey="population" name="Population-based" stackId="r" fill={t.series[2]} stroke={t.surface} strokeWidth={1} isAnimationActive={anim} />
              <Bar dataKey="personal" name="Game standard / goal" stackId="r" fill={t.series[6]} stroke={t.surface} strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={anim} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weekly daily-quest completion" subtitle="% of daily quests completed per week" empty={c.weekly.some((w) => w.dailyRate !== null) ? null : "No daily quests in range yet."} table={{ columns: ["Week of", "Completion %"], rows: c.weekly.map((w) => [w.week, w.dailyRate]) }}>
          <ResponsiveContainer>
            <LineChart data={c.weekly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="week" {...axisProps(t)} />
              <YAxis {...axisProps(t)} domain={[0, 100]} unit="%" width={44} />
              <Tooltip {...tooltipStyle(t)} />
              <Line dataKey="dailyRate" name="Completion %" stroke={t.series[0]} strokeWidth={2} dot={{ r: 4, fill: t.series[0], stroke: t.surface, strokeWidth: 2 }} connectNulls isAnimationActive={anim} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Quest completion trends" subtitle="Completed quests per week by type" empty={c.weekly.some((w) => w.daily + w.weekly + w.story + w.other) ? null : "Complete quests to see trends."} table={{ columns: ["Week of", "Daily", "Weekly", "Story chapters", "Emergency/custom"], rows: c.weekly.map((w) => [w.week, w.daily, w.weekly, w.story, w.other]) }}>
          <ResponsiveContainer>
            <BarChart data={c.weekly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="week" {...axisProps(t)} />
              <YAxis {...axisProps(t)} allowDecimals={false} width={28} />
              <Tooltip {...tooltipStyle(t)} />
              <Legend wrapperStyle={{ fontSize: 12, color: t.textDim }} />
              {(["daily", "weekly", "story", "other"] as const).map((k, i, arr) => (
                <Bar key={k} dataKey={k} name={{ daily: "Daily", weekly: "Weekly", story: "Main story", other: "Emergency/custom" }[k]} stackId="q" fill={t.series[i]} stroke={t.surface} strokeWidth={1} radius={i === arr.length - 1 ? [4, 4, 0, 0] : undefined} isAnimationActive={anim} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Panel title="Study hours vs. academic results" subtitle="Shown as two aligned charts (different units, never a dual axis). Correlation is not causation.">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="h-56" aria-label="Weekly study hours">
            <ResponsiveContainer>
              <BarChart data={c.weekly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="week" {...axisProps(t)} />
                <YAxis {...axisProps(t)} unit="h" width={40} />
                <Tooltip {...tooltipStyle(t)} />
                <Bar dataKey="studyHours" name="Study hours" fill={t.series[0]} radius={[4, 4, 0, 0]} isAnimationActive={anim} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-56" aria-label="Academic scores">
            {c.academic.length ? (
              <ResponsiveContainer>
                <LineChart data={c.academic} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={t.grid} vertical={false} />
                  <XAxis dataKey="date" {...axisProps(t)} />
                  <YAxis {...axisProps(t)} domain={[0, 100]} unit="%" width={44} />
                  <Tooltip {...tooltipStyle(t)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: t.textDim }} />
                  <Line dataKey="exam_average" name="Exam avg" stroke={t.series[0]} strokeWidth={2} dot={{ r: 4, fill: t.series[0], stroke: t.surface, strokeWidth: 2 }} connectNulls isAnimationActive={anim} />
                  <Line dataKey="quiz_average" name="Quiz" stroke={t.series[1]} strokeWidth={2} dot={{ r: 4, fill: t.series[1], stroke: t.surface, strokeWidth: 2 }} connectNulls isAnimationActive={anim} />
                  <Line dataKey="knowledge_assessment" name="Assessments" stroke={t.series[2]} strokeWidth={2} dot={{ r: 4, fill: t.series[2], stroke: t.surface, strokeWidth: 2 }} connectNulls isAnimationActive={anim} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-faint">Log exam, quiz or assessment scores to compare.</p>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <SeriesChart t={t} anim={anim} title="Strength progression" subtitle="Current 1RM entries" rows={c.strength} unit="mass" units={u} series={[["bench_press_1rm", "Bench"], ["squat_1rm", "Squat"], ["deadlift_1rm", "Deadlift"], ["overhead_press_1rm", "OHP"]]} transform={(v) => massU.toDisplay(v)} suffix={massU.label} />
        <SeriesChart t={t} anim={anim} title="Running performance" subtitle={`Race pace (min/${u === "imperial" ? "mi" : "km"}); lower is faster`} rows={paceRows} unit="duration" units={u} series={[["mile_time", "Mile"], ["run_5k", "5K"], ["run_10k", "10K"], ["half_marathon", "Half"]]} reversed pace />
        <SeriesChart t={t} anim={anim} title="Body-weight progression" subtitle="Weigh-ins" rows={c.body} unit="mass" units={u} series={[["body_weight", "Body weight"]]} transform={(v) => massU.toDisplay(v)} suffix={massU.label} />
        <SeriesChart t={t} anim={anim} title="Financial progress" subtitle="Individual figures, USD" rows={c.money} unit="currency" units={u} series={[["net_worth", "Net worth"], ["savings", "Savings"], ["debt", "Debt"]]} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Streak history" subtitle={`Current ${data.player.streak}d · longest ${data.player.longestStreak}d`}>
          <StreakCalendar activeDays={data.activeDays} today={data.today} weeks={26} xpByDay={xpByDay} />
        </Panel>
        <Panel title="Personal records" subtitle="Every recorded improvement in range">
          {c.prs.length ? (
            <ul className="max-h-72 divide-y divide-line/50 overflow-y-auto">
              {c.prs.map((p, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="w-24 font-mono text-xs text-faint">{p.date}</span>
                  <span className="flex-1 text-fg">{p.name}</span>
                  <span className="font-mono text-xs text-dim">{formatValue(p.unit as UnitKind, p.previous, u)} → </span>
                  <span className="font-mono text-xs text-success">{formatValue(p.unit as UnitKind, p.value, u)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">No personal records in this range.</p>
          )}
        </Panel>
      </div>

      <Panel title="Improvement velocity" subtitle="Least-squares change per 30 days over recorded entries in range (needs ≥ 2 entries)">
        {c.velocity.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="font-display text-[10px] tracking-[0.12em] text-dim">
                  <th className="px-2 py-1.5">Metric</th>
                  <th className="px-2 py-1.5">Entries</th>
                  <th className="px-2 py-1.5">Change / 30 d</th>
                  <th className="px-2 py-1.5">Trend</th>
                </tr>
              </thead>
              <tbody>
                {c.velocity.map((v) => (
                  <tr key={v.id} className="border-t border-line/40">
                    <td className="px-2 py-1.5 text-fg">{v.name}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{v.entries}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{v.per30 >= 0 ? "+" : "−"}{v.unit === "duration" ? `${Math.abs(Math.round(v.per30))} s` : formatValue(v.unit as UnitKind, Math.abs(v.per30), u)}</td>
                    <td className="px-2 py-1.5">{v.improving === null ? <Pill>descriptive</Pill> : v.improving ? <Pill className="text-success">improving</Pill> : <Pill className="text-warning">declining</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-faint">Log a metric at least twice in this range to measure velocity.</p>
        )}
      </Panel>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-[9px] tracking-[0.2em] text-faint">{label.toUpperCase()}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-fg">{value}</p>
    </div>
  );
}

function SeriesChart({ t, anim, title, subtitle, rows, series, unit, units, transform, suffix, reversed, pace }: { t: ChartTheme; anim: boolean; title: string; subtitle: string; rows: Record<string, number | string>[]; series: [string, string][]; unit: UnitKind; units: UnitSystem; transform?: (v: number) => number; suffix?: string; reversed?: boolean; pace?: boolean }) {
  const present = series.filter(([k]) => rows.some((r) => typeof r[k] === "number"));
  const data = rows.map((r) => {
    const o: Record<string, number | string> = { date: r.date };
    for (const [k] of present) if (typeof r[k] === "number") o[k] = transform ? transform(r[k] as number) : (r[k] as number);
    return o;
  });
  const fmt = (v: number) => (pace || unit === "duration" ? formatValue("duration", v, units) : unit === "currency" ? formatValue("currency", v, units) : `${Math.round(v * 10) / 10}${suffix ? ` ${suffix}` : ""}`);
  return (
    <ChartCard title={title} subtitle={subtitle} empty={present.length ? null : "No current entries in this range."} table={{ columns: ["Date", ...present.map(([, l]) => l)], rows: data.map((r) => [String(r.date), ...present.map(([k]) => (typeof r[k] === "number" ? fmt(r[k] as number) : null))]) }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps(t)} minTickGap={24} />
          <YAxis {...axisProps(t)} reversed={reversed} domain={["auto", "auto"]} tickFormatter={(v) => fmt(Number(v))} width={64} />
          <Tooltip {...tooltipStyle(t)} formatter={(v, n) => [fmt(Number(v)), n]} />
          {present.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: t.textDim }} /> : null}
          {present.map(([k, label], i) => (
            <Line key={k} dataKey={k} name={label} stroke={t.series[i]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: t.surface, fill: t.series[i] }} connectNulls isAnimationActive={anim} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
