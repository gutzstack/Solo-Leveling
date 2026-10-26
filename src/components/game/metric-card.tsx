"use client";
import { ExternalLink, History, Info, PenLine, Trash2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tip } from "@/components/ui/switch";
import { EvidenceBadge, Pill, RankBadge } from "@/components/system/primitives";
import { LogMetricDialog } from "./log-dialogs";
import { chartTheme } from "@/lib/client/chart-theme";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { displayUnit, formatValue } from "@/lib/domain/units";
import type { UnitKind } from "@/lib/domain/types";
import type { MetricState, PercentileView } from "@/lib/game/metric-state";
import { cn } from "@/lib/utils";

export function PercentileLine({ p, unit }: { p: PercentileView; unit: UnitKind }) {
  const { data } = useSnapshot();
  const units = data?.settings.unit_system ?? "imperial";
  const value = p.percentile !== null ? `${p.percentile}${p.bound ? (p.bound === "above" ? "+" : "−") : ""}` : `${p.low}–${p.high}`;
  return (
    <div className="rounded-lg border border-line/60 bg-bg/40 p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-[10px] tracking-[0.18em] text-faint">{p.descriptive ? "POSITION" : "PERCENTILE"}</span>
        <span className="font-mono text-xl font-semibold text-fg">{value}</span>
        {p.low !== null && p.high !== null && p.percentile !== null ? <span className="font-mono text-xs text-dim">95% CI {p.low}–{p.high}</span> : null}
        <EvidenceBadge evidence={p.evidence} />
        {!p.descriptive && p.rank ? <RankBadge rank={p.rank} size="sm" /> : null}
      </div>
      <p className="mt-1 text-xs text-dim">
        {p.descriptive
          ? `${p.percentile ?? "–"}% of ${p.comparisonGroup} are below you. Descriptive only: this measure isn't better or worse, so it gets no rank.`
          : `You match or exceed ${p.percentile ?? `${p.low}–${p.high}`}% of ${p.comparisonGroup}.`}
        {/* benchmark units (kg, cm, bpm, h) equal the app's canonical units */}
        {p.median !== null ? ` Median: ${formatValue(unit, p.median, units)}.` : ""}
      </p>
      <p className="mt-1 text-xs text-faint">
        Comparison group: {p.comparisonGroup} (n = {p.nUnweighted ?? "?"}, effective n ≈ {p.nEffective ?? "?"}) · Source:{" "}
        <a href={p.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-accent hover:underline">
          {p.sourceName} <ExternalLink className="size-3" />
        </a>{" "}
        · Confidence: {p.quality}
      </p>
      <details className="mt-1 text-xs text-faint">
        <summary className="cursor-pointer text-dim">Method & limitations</summary>
        <p className="mt-1">{p.method}</p>
        <p className="mt-1">Variable: {p.variable}. {p.notes}</p>
        <ul className="mt-1 list-disc pl-4">
          {p.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function MetricCard({ m, compact }: { m: MetricState; compact?: boolean }) {
  const { data } = useSnapshot();
  const units = data?.settings.unit_system ?? "imperial";
  const theme = chartTheme(data?.settings.theme ?? "dark");
  const unit = m.unit as UnitKind;
  const du = displayUnit(unit, units);
  const series = m.history.filter((h) => h.context !== "historical").map((h) => ({ date: h.date, v: unit === "duration" ? h.value : du.toDisplay(h.value) }));
  return (
    <article id={m.id} className="sys-panel relative flex flex-col gap-3 p-4">
      <header className="flex items-start gap-3">
        <RankBadge rank={m.rank} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight text-fg">{m.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <EvidenceBadge evidence={m.evidence} />
            {m.input === "derived" ? <Pill>auto-computed</Pill> : null}
            {m.isCustom ? <Pill>custom</Pill> : null}
            {m.direction === "lower" ? <Pill>lower is better</Pill> : m.direction === "optimal" ? <Pill>optimal range</Pill> : m.direction === "neutral" ? <Pill>descriptive</Pill> : null}
          </div>
        </div>
        <Tip content={m.description}>
          <button className="rounded p-1 text-faint hover:text-fg" aria-label={`About ${m.name}`}>
            <Info className="size-4" />
          </button>
        </Tip>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="font-display text-[9px] tracking-[0.18em] text-faint">CURRENT</p>
          <p className="font-mono text-lg text-fg">{m.current ? formatValue(unit, m.current.value, units) : "—"}</p>
          {m.current?.recordedOn && m.input === "manual" ? <p className="text-[11px] text-faint">{m.current.recordedOn}</p> : null}
        </div>
        <div>
          <p className="font-display text-[9px] tracking-[0.18em] text-faint">ALL-TIME BEST</p>
          <p className="font-mono text-lg text-dim">{m.personalBest ? formatValue(unit, m.personalBest.value, units) : "—"}</p>
          {m.personalBest ? <p className="text-[11px] text-faint">{m.personalBest.context === "historical" ? "historical PB" : m.personalBest.recordedOn}</p> : null}
        </div>
      </div>

      {!compact && series.length >= 2 ? (
        <div className="h-14" aria-label={`${m.name} trend`}>
          <ResponsiveContainer>
            <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <YAxis hide domain={["auto", "auto"]} reversed={m.direction === "lower"} />
              <Tooltip contentStyle={{ background: theme.surface, border: `1px solid ${theme.axis}`, borderRadius: 8, color: theme.text, fontSize: 12 }} formatter={(v) => [unit === "duration" ? formatValue("duration", Number(v), units) : `${Math.round(Number(v) * 100) / 100} ${du.label}`, m.name]} />
              <Line type="monotone" dataKey="v" stroke={theme.accent} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <p className="text-xs text-dim">{m.rankExplanation}</p>
      {m.derivedNote ? <p className="text-xs text-faint">{m.derivedNote}</p> : null}
      {m.primary ? <PercentileLine p={m.primary} unit={unit} /> : <p className="text-xs italic text-faint">{m.populationMessage}</p>}
      {m.standardsNote && m.scoreBasis === "standard" ? <p className="text-[11px] text-faint">{m.standardsNote}</p> : null}

      {m.input === "manual" ? (
        <div className="mt-auto flex gap-2 pt-1">
          <LogMetricDialog metricId={m.id}>
            <Button size="sm" variant="outline">
              <PenLine /> Log
            </Button>
          </LogMetricDialog>
          {m.history.length ? <HistoryDialog m={m} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function HistoryDialog({ m }: { m: MetricState }) {
  const { data } = useSnapshot();
  const cmd = useCommand();
  const units = data?.settings.unit_system ?? "imperial";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <History /> History ({m.history.length})
        </Button>
      </DialogTrigger>
      <DialogContent title={`${m.name}: history`} description="Deleting an entry also reverses any XP it earned (recorded in the ledger).">
        <ul className="max-h-[60dvh] divide-y divide-line/50 overflow-y-auto">
          {[...m.history].reverse().map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2">
              <span className="w-24 font-mono text-xs text-faint">{h.date}</span>
              <span className={cn("flex-1 font-mono", h.context === "historical" ? "text-dim" : "text-fg")}>{formatValue(m.unit as UnitKind, h.value, units)}</span>
              <Pill>{h.context}</Pill>
              <Button size="icon" variant="ghost" aria-label="Delete entry" disabled={cmd.isPending} onClick={() => confirm("Delete this entry?") && cmd.mutate({ type: "delete_metric_entry", entryId: h.id })}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
