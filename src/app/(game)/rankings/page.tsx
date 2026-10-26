"use client";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ExternalLink, FlaskConical, Gamepad2 } from "lucide-react";
import Link from "next/link";
import { PercentileLine } from "@/components/game/metric-card";
import { EvidenceBadge, PageHeader, Panel, Pill, RankBadge } from "@/components/system/primitives";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { ATTRIBUTE_BY_CODE } from "@/lib/domain/attributes";
import { METRIC_BY_ID } from "@/lib/domain/metrics";
import { RANK_LOWER_BOUNDS } from "@/lib/domain/ranks";
import { formatValue } from "@/lib/domain/units";
import { RANKS, type UnitKind } from "@/lib/domain/types";
import { UNAVAILABLE_MESSAGE } from "@/lib/percentile/engine";
import type { BenchmarkSource } from "@/lib/percentile/registry-schema";

interface RegistrySummary {
  sources: BenchmarkSource[];
  distributions: { id: string; sourceId: string; metricId: string; ageMin: number; ageMax: number; sex: string; units: string; kind: string; evidence: string; nUnweighted: number | null; nEffective: number | null; population: string; variable: string; quantiles: Record<string, number> | null; weightedMean: number | null }[];
}

export default function RankingsPage() {
  const { data } = useSnapshot();
  const cmd = useCommand({ silent: true });
  const registry = useQuery({ queryKey: ["benchmarks"], queryFn: () => api<RegistrySummary>("/api/benchmarks"), staleTime: Infinity });
  if (!data) return null;
  const u = data.settings.unit_system;
  const population = data.metrics.filter((m) => m.percentiles.length > 0);
  const personal = data.metrics.filter((m) => m.rank && m.scoreBasis !== "population");
  const unavailable = data.metrics.filter((m) => m.current && m.percentiles.length === 0);
  const benchmarked = new Set((registry.data?.distributions ?? []).map((d) => d.metricId));
  const awaiting = data.metrics.filter((m) => !m.current && benchmarked.has(m.id));

  return (
    <div className="space-y-5">
      <PageHeader title="Rankings" kicker="Real-world comparisons">
        <div className="flex gap-1" role="radiogroup" aria-label="Comparison population">
          {(["sex_matched", "all"] as const).map((p) => (
            <Button key={p} size="sm" variant={data.settings.comparison_preference === p ? "default" : "outline"} aria-pressed={data.settings.comparison_preference === p} onClick={() => cmd.mutate({ type: "update_settings", settings: { comparison_preference: p } })}>
              {p === "sex_matched" ? "Sex-matched" : "All adults"}
            </Button>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-3">
        <ModeCard icon={BadgeCheck} title="VERIFIED" tone="text-emerald-300 light:text-emerald-800" body="Computed from appropriate population data (here, NHANES survey microdata with survey weights)." />
        <ModeCard icon={FlaskConical} title="ESTIMATED" tone="text-amber-300 light:text-amber-800" body="Relies on explicitly disclosed assumptions, e.g. interpolating between published percentiles, and is labelled as such." />
        <ModeCard icon={Gamepad2} title="PERSONAL" tone="text-violet-300 light:text-violet-800" body="Game-defined standards or evidence-based goal attainment. Never presented as a population percentile." />
      </div>

      <Panel title="Population percentiles" subtitle={`Age ${data.profile.age_years ?? "from DOB"}${data.profile.sex ? ` · ${data.profile.sex}` : " · sex not set (all-adult comparisons)"} · U.S. comparison groups`}>
        {population.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {population.map((m) => (
              <article key={m.id} className="rounded-xl border border-line/70 p-4">
                <div className="flex items-start gap-3">
                  <RankBadge rank={m.rank} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[10px] tracking-[0.2em] text-accent">{m.name.toUpperCase()}</p>
                    <p className="mt-1 text-sm text-dim">
                      Current: <span className="font-mono text-fg">{formatValue(m.unit as UnitKind, m.current?.value, u)}</span>
                      {m.personalBest ? (
                        <>
                          {" "}· Personal best: <span className="font-mono text-fg">{formatValue(m.unit as UnitKind, m.personalBest.value, u)}</span>
                          {m.personalBest.context === "historical" ? " (historical)" : ""}
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-faint">{m.rankExplanation}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {m.percentiles.map((p) => (
                    <PercentileLine key={p.distributionId} p={p} unit={m.unit as UnitKind} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-faint">Log a metric that has population data (see the registry below) to receive a population percentile.</p>
        )}
        {awaiting.length ? <p className="mt-3 text-xs text-dim">Population data exists for: {awaiting.map((m) => m.name).join(", ")}. Log a current value to compare.</p> : null}
      </Panel>

      <Panel title="Hunter Rank breakdown" subtitle="Game-defined aggregate; configurable in SYSTEM → Scoring">
        <div className="flex flex-wrap items-center gap-4">
          <RankBadge rank={data.hunter.rank} size="lg" />
          <div className="flex-1 text-sm text-dim">
            <p>{data.hunter.explanation}</p>
            {data.hunter.score !== null ? (
              <p className="mt-1 font-mono text-xs text-fg">
                Score {data.hunter.score}
                {data.hunter.uncertainty !== null ? ` ± ${data.hunter.uncertainty} (propagated from population-metric CIs only)` : " (no statistical uncertainty: based only on game standards)"}
              </p>
            ) : null}
          </div>
        </div>
        {data.hunter.breakdown.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="font-display text-[10px] tracking-[0.12em] text-dim">
                <tr>
                  <th className="px-2 py-1.5">Attribute</th>
                  <th className="px-2 py-1.5">Score</th>
                  <th className="px-2 py-1.5">Weight</th>
                  <th className="px-2 py-1.5">Contribution</th>
                  <th className="px-2 py-1.5">Evidence mix</th>
                </tr>
              </thead>
              <tbody>
                {data.hunter.breakdown.map((b) => {
                  const a = data.attributes.find((x) => x.code === b.code)!;
                  return (
                    <tr key={b.code} className="border-t border-line/40">
                      <td className="px-2 py-1.5 text-fg">{ATTRIBUTE_BY_CODE[b.code].name}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{b.score}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{b.weight}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{b.contribution}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">
                        {a.evidenceMix.verified}V · {a.evidenceMix.estimated}E · {a.evidenceMix.personal}P
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {RANKS.map((r, i) => (
            <Pill key={r}>
              {r}: {RANK_LOWER_BOUNDS[r]}
              {i < RANKS.length - 1 ? `–<${RANK_LOWER_BOUNDS[RANKS[i + 1]]}` : "+"}
            </Pill>
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">Percentile = share of the comparison population whose performance you match or exceed. Lower is better for times and resting heart rate. Optimal-range metrics (sleep) use goal attainment.</p>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Game-standard & goal ranks" subtitle="PERSONAL evidence">
          {personal.length ? (
            <ul className="divide-y divide-line/50">
              {personal.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <RankBadge rank={m.rank} size="sm" />
                  <Link href={`/attributes/${m.attribute}#${m.id}`} className="flex-1 text-sm text-fg hover:underline">
                    {m.name}
                  </Link>
                  <span className="font-mono text-xs text-dim">{formatValue(m.unit as UnitKind, m.current?.value, u)}</span>
                  <EvidenceBadge evidence={m.evidence} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">No game-standard ranks yet.</p>
          )}
        </Panel>
        <Panel title="Personal progression only" subtitle={UNAVAILABLE_MESSAGE}>
          {unavailable.length ? (
            <ul className="divide-y divide-line/50">
              {unavailable.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1 text-fg">{m.name}</span>
                  <span className="font-mono text-xs text-dim">{formatValue(m.unit as UnitKind, m.current?.value, u)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">Nothing yet.</p>
          )}
          <p className="mt-3 text-xs text-faint">No percentile is shown for these because no reputable, appropriate population distribution was available to the System, and it never invents thresholds. Running times, lifts, GPA and wealth fall here for now; add sourced tables to the registry to enable them.</p>
        </Panel>
      </div>

      <Panel title="Benchmark registry" subtitle="Every population distribution the System can compare against">
        {registry.data ? (
          <div className="space-y-5">
            {registry.data.sources.map((s) => (
              <div key={s.id} className="rounded-xl border border-line/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-fg">{s.name}</p>
                    <p className="text-xs text-dim">
                      {s.publisher} · {s.publicationYear} · quality: {s.quality} · last verified {s.lastVerified}
                    </p>
                  </div>
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Source <ExternalLink className="size-3" />
                  </a>
                </div>
                <p className="mt-2 text-sm text-dim">{s.population}</p>
                <p className="mt-1 text-xs text-faint">Method: {s.statisticalMethod}</p>
                <p className="mt-1 text-xs text-faint">License: {s.license}</p>
                <details className="mt-2 text-xs text-faint">
                  <summary className="cursor-pointer text-dim">Limitations, files & provenance</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {s.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <ul className="mt-2 space-y-0.5 font-mono">
                    {s.retrieval.files.map((f) => (
                      <li key={f.name} className="break-all">
                        {f.name}: {f.records.toLocaleString()} records · sha256 {f.sha256}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">{s.retrieval.notes}</p>
                </details>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="font-display text-[9px] tracking-[0.12em] text-dim">
                      <tr>
                        <th className="px-2 py-1">Metric</th>
                        <th className="px-2 py-1">Group</th>
                        <th className="px-2 py-1">n (eff.)</th>
                        <th className="px-2 py-1">P10 / P50 / P90</th>
                        <th className="px-2 py-1">Evidence</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {registry.data.distributions
                        .filter((d) => d.sourceId === s.id)
                        .map((d) => (
                          <tr key={d.id} className="border-t border-line/40">
                            <td className="px-2 py-1 font-sans text-fg">{METRIC_BY_ID[d.metricId]?.name ?? d.metricId}</td>
                            <td className="px-2 py-1">
                              {d.sex} {d.ageMin}–{d.ageMax}
                            </td>
                            <td className="px-2 py-1">
                              {d.nUnweighted} ({d.nEffective})
                            </td>
                            <td className="px-2 py-1">{d.quantiles ? `${d.quantiles.p10} / ${d.quantiles.p50} / ${d.quantiles.p90} ${d.units}` : "—"}</td>
                            <td className="px-2 py-1">{d.evidence}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-faint">Loading registry…</p>
        )}
      </Panel>
    </div>
  );
}

function ModeCard({ icon: I, title, body, tone }: { icon: React.ElementType; title: string; body: string; tone: string }) {
  return (
    <div className="sys-panel p-4">
      <p className={`flex items-center gap-2 font-display text-xs tracking-[0.2em] ${tone}`}>
        <I className="size-4" /> {title}
      </p>
      <p className="mt-2 text-sm text-dim">{body}</p>
    </div>
  );
}
