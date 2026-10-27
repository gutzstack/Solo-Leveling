"use client";
import { BedDouble, Check, Clock, Lock, Plus, Skull, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, Panel, Pill, RankBadge, XpBar } from "@/components/system/primitives";
import { newKey } from "@/lib/client/api";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { ACTIVITIES } from "@/lib/domain/activities";
import { ATTRIBUTES } from "@/lib/domain/attributes";
import { CATEGORY_INFO, QUEST_CATEGORIES, resolveRegimen, type QuestCategory } from "@/lib/domain/regimen";
import { questGold } from "@/lib/domain/rewards";
import { TITLE_BY_CODE } from "@/lib/domain/titles";
import { displayUnit, parseDisplayInput } from "@/lib/domain/units";
import type { AttributeCode, UnitKind } from "@/lib/domain/types";
import type { QuestView } from "@/lib/game/evaluate";
import { cn } from "@/lib/utils";

export default function QuestsPage() {
  const { data } = useSnapshot();
  const [showHistory, setShowHistory] = useState(false);
  if (!data) return null;
  const zone = data.quests.find((q) => q.kind === "penalty" && q.status === "active") ?? null;
  const visible = (q: QuestView) => showHistory || q.status === "active" || q.status === "offered" || ((q.status === "completed" || (q.status === "exempt" && q.config.recoveryPass)) && (q.period_end === null || q.period_end >= data.today));
  const by = (k: QuestView["kind"]) => data.quests.filter((q) => q.kind === k).filter(visible).sort((a, b) => order(a) - order(b) || b.period_start.localeCompare(a.period_start));
  const tabs: { id: string; label: string; quests: QuestView[]; empty: string }[] = [
    { id: "daily", label: "Daily", quests: [...by("penalty"), ...by("daily")], empty: "Daily quests appear each morning (your local time)." },
    { id: "weekly", label: "Weekly", quests: by("weekly"), empty: "Weekly quests reset every Monday." },
    { id: "main", label: "Main Story", quests: by("main"), empty: "Story arcs follow the categories you track." },
    { id: "emergency", label: "Emergency", quests: by("emergency"), empty: "No emergency gates are open. They are optional and time-limited: declining is free, but an accepted gate that closes unfinished costs XP." },
    { id: "custom", label: "Custom", quests: by("custom"), empty: "Create your own quests with measurable objectives." },
  ];
  return (
    <div>
      <PageHeader title="Quest Board" kicker="Missions">
        <Button variant={showHistory ? "default" : "outline"} size="sm" onClick={() => setShowHistory((v) => !v)} aria-pressed={showHistory}>
          {showHistory ? "Hide history" : "Show history"}
        </Button>
        <CustomQuestDialog>
          <Button>
            <Plus /> Custom quest
          </Button>
        </CustomQuestDialog>
      </PageHeader>
      {!data.penaltiesEnabled ? (
        <div className="mb-4 rounded-xl border border-amber-400/60 bg-amber-950/30 px-4 py-3 text-sm text-fg light:bg-amber-50">
          <p className="font-display text-[10px] tracking-[0.25em] text-amber-300 light:text-amber-800">[PENALTIES OFFLINE]</p>
          Penalties, rest-day passes and regimen changes need the database update <code>supabase/migrations/0003_regimen_penalties.sql</code>. Run it once in the Supabase SQL Editor.
        </div>
      ) : null}
      {zone ? <PenaltyBanner q={zone} /> : null}
      <Tabs defaultValue="daily">
        <TabsList className="mb-4">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label} <span className="ml-1 text-faint">{t.quests.filter((q) => q.status === "active" || q.status === "offered").length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            {t.id === "daily" && t.quests.length ? (
              <DailyBoard quests={t.quests} today={data.today} />
            ) : t.quests.length ? (
              <div className={cn("grid gap-4", t.id === "main" ? "lg:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3")}>
                {t.quests.map((q) => (q.kind === "main" ? <MainQuestCard key={q.id} q={q} /> : <QuestCard key={q.id} q={q} />))}
              </div>
            ) : (
              <EmptyState title="Nothing here">{t.empty}</EmptyState>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function order(q: QuestView) {
  return { offered: 0, active: 1, completed: 2, exempt: 3, failed: 4, expired: 5, abandoned: 6 }[q.status];
}

function PenaltyBanner({ q }: { q: QuestView }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/60 bg-red-950/40 px-4 py-3 light:bg-red-50">
      <Skull className="mt-0.5 size-5 shrink-0 text-red-400" />
      <div className="min-w-0 text-sm">
        <p className="font-display text-[10px] tracking-[0.25em] text-red-400">[PENALTY ZONE ACTIVE]</p>
        <p className="text-fg">Finish yesterday&apos;s unfinished work before midnight, on top of today&apos;s quests. Failure costs {q.config.penaltyXp ?? 0} XP.</p>
      </div>
    </div>
  );
}

/** Today's daily quests grouped by category; any Penalty Zone sits on top. */
function DailyBoard({ quests, today }: { quests: QuestView[]; today: string }) {
  const { data } = useSnapshot();
  const cmd = useCommand();
  const penalty = quests.filter((q) => q.kind === "penalty");
  const daily = quests.filter((q) => q.kind === "daily");
  const groups: QuestCategory[] = [...QUEST_CATEGORIES];
  const uncategorized = daily.filter((q) => !q.config.category);
  const regimen = resolveRegimen(data?.settings.regimen);
  const passesUsed = new Set((data?.quests ?? []).filter((q) => q.config.recoveryPass && q.period_start >= weekStartOf(today)).map((q) => q.period_start)).size;
  const physicalOpen = daily.some((q) => q.config.category === "physical" && q.status === "active" && q.period_start === today);
  return (
    <div className="space-y-6">
      {penalty.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {penalty.map((q) => (
            <QuestCard key={q.id} q={q} />
          ))}
        </div>
      ) : null}
      {groups.map((c) => {
        const qs = daily.filter((q) => q.config.category === c);
        if (!qs.length) return null;
        return (
          <section key={c} aria-label={CATEGORY_INFO[c].name}>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="sys-title text-sm text-fg">{CATEGORY_INFO[c].name}</h2>
                <p className="text-xs text-faint">{CATEGORY_INFO[c].blurb}</p>
              </div>
              {c === "physical" && physicalOpen && regimen.recoveryPassesPerWeek > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cmd.isPending || passesUsed >= regimen.recoveryPassesPerWeek}
                  onClick={() => confirm("Use a recovery pass? Today's physical quests are waived with no XP and no penalty. Use it for illness, injury or a needed rest day.") && cmd.mutate({ type: "use_recovery_pass" })}
                >
                  <BedDouble /> Recovery pass ({Math.max(0, regimen.recoveryPassesPerWeek - passesUsed)} left this week)
                </Button>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {qs.map((q) => (
                <QuestCard key={q.id} q={q} />
              ))}
            </div>
          </section>
        );
      })}
      {uncategorized.length ? (
        <section aria-label="Other">
          <h2 className="sys-title mb-2 text-sm text-fg">Other</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {uncategorized.map((q) => (
              <QuestCard key={q.id} q={q} />
            ))}
          </div>
        </section>
      ) : null}
      {cmd.error ? <p className="text-xs text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
    </div>
  );
}

function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const SET_ACTIVITIES = new Set(["pushups", "situps", "squats", "dips", "pullups"]);

/** One-tap logging for rep-based objectives; runs take distance and time. */
const KM_PER_MI = 1.609344;

/** Run objectives are stored in km; show them in the player's units. */
function progressText(o: QuestView["objectives"][number], units: string | undefined): string {
  if (units === "imperial" && "activities" in o.tracker && o.tracker.activities.length === 1 && o.tracker.activities[0] === "run") {
    const mi = (x: number) => Math.round((x / KM_PER_MI) * 100) / 100;
    return `${mi(Math.min(o.progress.value, o.progress.target))} / ${mi(o.progress.target)} mi`;
  }
  return o.progress.display;
}

function QuickLog({ activity, today }: { activity: string; today: string }) {
  const cmd = useCommand();
  const { data } = useSnapshot();
  const imperial = data?.settings.unit_system === "imperial";
  const [custom, setCustom] = useState("");
  const [km, setKm] = useState("");
  const [min, setMin] = useState("");
  const log = (quantity: number, durationMin: number | null = null) => cmd.mutate({ type: "log_activity", activity, quantity, durationMin, occurredOn: today, idempotencyKey: newKey(activity) });
  if (SET_ACTIVITIES.has(activity))
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {[10, 25].map((n) => (
          <Button key={n} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={cmd.isPending} onClick={() => log(n)}>
            +{n}
          </Button>
        ))}
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.round(Number(custom));
            if (n > 0) log(n, null);
            setCustom("");
          }}
        >
          <Input aria-label="Reps" type="number" inputMode="numeric" min={1} max={1000} className="h-7 w-20 text-xs" placeholder="reps" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={cmd.isPending || !custom}>
            Log
          </Button>
        </form>
        {cmd.error ? <span className="text-xs text-red-300 light:text-red-700">{cmd.error.message}</span> : null}
      </div>
    );
  if (activity === "run")
    return (
      <form
        className="mt-1.5 flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const d = Number(km) * (imperial ? KM_PER_MI : 1);
          const m = Number(min);
          if (d > 0 && m > 0) log(Math.round(d * 1000) / 1000, m);
          setKm("");
          setMin("");
        }}
      >
        <Input aria-label={imperial ? "Distance in miles" : "Distance in km"} type="number" inputMode="decimal" step="0.01" min={0.05} className="h-7 w-20 text-xs" placeholder={imperial ? "mi" : "km"} value={km} onChange={(e) => setKm(e.target.value)} />
        <Input aria-label="Minutes" type="number" inputMode="numeric" min={1} className="h-7 w-20 text-xs" placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} />
        <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={cmd.isPending || !km || !min}>
          Log run
        </Button>
        {cmd.error ? <span className="text-xs text-red-300 light:text-red-700">{cmd.error.message}</span> : null}
      </form>
    );
  return null;
}

function Countdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Date.parse(deadline) - now;
  if (ms <= 0) return <Pill>gate closed</Pill>;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return (
    <Pill className="border-amber-400/50 text-amber-300 light:text-amber-800">
      <Clock className="size-3" /> {h > 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}
    </Pill>
  );
}

function QuestCard({ q }: { q: QuestView }) {
  const cmd = useCommand();
  const snap = useSnapshot().data;
  const units = snap?.settings.unit_system;
  const gold = snap?.rewards.enabled ? Math.round(questGold(q) * snap.rewards.multiplier) : 0;
  const done = q.status === "completed";
  const inactive = q.status === "expired" || q.status === "abandoned" || q.status === "exempt";
  const failed = q.status === "failed";
  const zone = q.kind === "penalty";
  const fine = q.config.penaltyXp ?? 0;
  const today = q.period_start === q.period_end ? q.period_start : null;
  return (
    <Panel className={cn(done && "border-emerald-400/40", inactive && "opacity-60", failed && "border-red-500/50 opacity-75", zone && q.status === "active" && "border-red-500/70", q.status === "offered" && "pulse-ring")} bodyClassName="space-y-3">
      <div className="flex items-start gap-3">
        <RankBadge rank={q.difficulty} size="sm" label={`Difficulty ${q.difficulty}`} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-display text-[9px] tracking-[0.2em]", zone ? "text-red-400" : "text-accent-2")}>{zone ? "[PENALTY QUEST]" : q.kind === "emergency" ? "[EMERGENCY QUEST]" : `[${q.kind.toUpperCase()} QUEST]`}</p>
          <h3 className="font-semibold leading-snug text-fg">{q.title}</h3>
        </div>
        <div className="flex flex-col items-end">
          {q.xp_reward ? <span className="font-mono text-xs text-accent">+{q.xp_reward} XP</span> : null}
          {gold ? <span className="font-mono text-[11px] text-amber-300 light:text-amber-800">+{gold} gold</span> : null}
        </div>
      </div>
      {q.description ? <p className="text-sm text-dim">{q.description}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {q.attribute_code ? <Pill>{q.attribute_code}</Pill> : null}
        {q.deadline && q.status === "active" ? <Countdown deadline={q.deadline} /> : null}
        {done ? <Pill className="border-emerald-400/50 text-emerald-300 light:text-emerald-800">completed</Pill> : null}
        {q.status === "active" && q.config.penalized && fine ? <Pill className="border-red-500/50 text-red-300 light:text-red-700">fail: −{fine} XP</Pill> : null}
        {failed ? <Pill className="border-red-500/60 text-red-300 light:text-red-700">failed{fine ? ` · −${fine} XP` : ""}</Pill> : null}
        {q.status === "exempt" ? <Pill>{q.config.recoveryPass ? "waived (recovery pass)" : "waived"}</Pill> : null}
        {q.status === "expired" ? <Pill>faded (no penalty)</Pill> : null}
        {q.status === "abandoned" ? <Pill>{q.config.penalized && q.kind !== "emergency" ? `abandoned · −${fine} XP` : "declined"}</Pill> : null}
        {q.period_end && q.kind !== "emergency" ? <Pill>{q.period_start === q.period_end ? q.period_start : `${q.period_start} → ${q.period_end}`}</Pill> : null}
      </div>
      <ul className="space-y-2">
        {q.objectives.map((o) => (
          <li key={o.id}>
            <div className="flex items-center gap-2 text-sm">
              {o.tracker.type === "manual" && q.status === "active" ? (
                <input type="checkbox" className="size-4 accent-sky-400" checked={o.progress.done} disabled={Boolean(o.completed_at) || cmd.isPending} onChange={(e) => cmd.mutate({ type: "set_objective", objectiveId: o.id, done: e.target.checked })} aria-label={o.title} />
              ) : o.progress.done ? (
                <Check className="size-4 text-success" />
              ) : (
                <span className="size-4 rounded-full border border-line" />
              )}
              <span className={cn("flex-1", o.progress.done ? "text-dim line-through decoration-1" : "text-fg")}>{o.title}</span>
              <span className="font-mono text-[11px] text-faint">{progressText(o, units)}</span>
            </div>
            <XpBar value={o.progress.fraction * 100} max={100} thin label={o.title} className="mt-1" />
            {q.status === "active" && today && !o.progress.done && "activities" in o.tracker && o.tracker.activities.length === 1 ? <QuickLog activity={o.tracker.activities[0]} today={today} /> : null}
          </li>
        ))}
      </ul>
      {q.status === "offered" ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => cmd.mutate({ type: "accept_quest", questId: q.id })} disabled={cmd.isPending}>
            Accept
          </Button>
          <Button size="sm" variant="ghost" onClick={() => cmd.mutate({ type: "dismiss_quest", questId: q.id })} disabled={cmd.isPending}>
            Decline
          </Button>
        </div>
      ) : null}
      {q.status === "active" && (q.kind === "custom" || q.kind === "emergency") ? (
        <Button size="sm" variant="ghost" onClick={() => confirm(q.config.penalized && fine ? `Abandon this quest? It costs ${fine} XP.` : "Abandon this quest?") && cmd.mutate({ type: "abandon_quest", questId: q.id })}>
          Abandon
        </Button>
      ) : null}
      {cmd.error ? <p className="text-xs text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
    </Panel>
  );
}

function MainQuestCard({ q }: { q: QuestView }) {
  const chapters = q.config?.chapters ?? [];
  const title = q.config?.titleReward ? TITLE_BY_CODE[q.config.titleReward] : null;
  return (
    <Panel glow={q.status === "active"} bodyClassName="space-y-4">
      <div>
        <p className="font-display text-[9px] tracking-[0.25em] text-accent-2">[MAIN STORY QUEST]</p>
        <h3 className="sys-title mt-1 text-base font-bold text-fg text-glow">{q.title}</h3>
        <p className="text-sm text-dim">{q.description}</p>
      </div>
      <div>
        <div className="mb-1 flex justify-between font-mono text-xs text-dim">
          <span>Arc progress</span>
          <span>{Math.round(q.progress * 100)}%</span>
        </div>
        <XpBar value={q.progress * 100} max={100} label={`${q.title} progress`} />
      </div>
      <ol className="space-y-3">
        {chapters.map((c) => {
          const completed = q.completedChapters.includes(c.number);
          const current = q.currentChapter === c.number;
          const locked = !completed && !current;
          const objs = q.objectives.filter((o) => o.chapter === c.number);
          return (
            <li key={c.number} className={cn("rounded-lg border p-3", current ? "border-line-strong bg-accent/5" : "border-line/50", locked && "opacity-55")}>
              <div className="flex items-center gap-2">
                {completed ? <Check className="size-4 text-success" /> : locked ? <Lock className="size-4 text-faint" /> : <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--glow)]" />}
                <p className="flex-1 font-semibold text-fg">{c.name}</p>
                <span className="font-mono text-[11px] text-faint">+{q.xp_reward} XP</span>
              </div>
              <p className="ml-6 text-xs text-dim">{c.description}</p>
              {!locked || completed ? (
                <ul className="ml-6 mt-2 space-y-1.5">
                  {objs.map((o) => (
                    <li key={o.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn("flex-1", o.progress.done || o.completed_at ? "text-dim line-through decoration-1" : "text-fg")}>{o.title}</span>
                        <span className="font-mono text-[11px] text-faint">{o.completed_at ? "done" : o.progress.display}</span>
                      </div>
                      {current ? <XpBar value={o.progress.fraction * 100} max={100} thin label={o.title} className="mt-1" /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ml-6 mt-1 text-xs text-faint">Prerequisite: complete the previous chapter.</p>
              )}
            </li>
          );
        })}
      </ol>
      {title ? <p className="text-xs text-dim">Reward: title <span className="text-accent-2">&ldquo;{title.name}&rdquo;</span> + {q.xp_reward} XP per chapter</p> : null}
    </Panel>
  );
}

type TrackerType = "activity_minutes" | "activity_count" | "activity_quantity" | "metric_reach" | "manual";
interface ObjDraft {
  id: number;
  title: string;
  type: TrackerType;
  activity: string;
  metric: string;
  direction: "higher" | "lower";
  target: string;
}

function CustomQuestDialog({ children }: { children: React.ReactNode }) {
  const { data } = useSnapshot();
  const cmd = useCommand();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attribute, setAttribute] = useState<AttributeCode>("INT");
  const [difficulty, setDifficulty] = useState<"E" | "D" | "C" | "B" | "A" | "S">("C");
  const [deadline, setDeadline] = useState("");
  const [objs, setObjs] = useState<ObjDraft[]>([{ id: 1, title: "", type: "activity_minutes", activity: "study", metric: "run_5k", direction: "lower", target: "60" }]);
  const [error, setError] = useState<string | null>(null);
  const manualMetrics = (data?.metrics ?? []).filter((m) => m.input === "manual");
  const units = data?.settings.unit_system ?? "imperial";
  const targetHint = (o: ObjDraft) => {
    const m = manualMetrics.find((x) => x.id === o.metric);
    if (!m) return "Target";
    return m.unit === "duration" ? "Target time (e.g. 18:00)" : `Target (${displayUnit(m.unit as UnitKind, units).label || "value"})`;
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const objectives = [];
    for (const o of objs) {
      // metric targets are entered in display units (lb, mi, m:ss…) and stored canonically
      const mdef = manualMetrics.find((m) => m.id === o.metric);
      const target = o.type === "metric_reach" && mdef ? (parseDisplayInput(mdef.unit as UnitKind, o.target, units) ?? NaN) : Number(o.target);
      if (o.type !== "manual" && !(target > 0)) return setError(o.type === "metric_reach" ? "Enter the metric target in the shown units (times as m:ss)." : "Every objective needs a positive target.");
      const tracker =
        o.type === "manual" ? { type: "manual" as const } : o.type === "metric_reach" ? { type: "metric_reach" as const, metric: o.metric, target, direction: o.direction } : { type: o.type, activities: [o.activity] };
      objectives.push({ title: o.title || autoTitle(o), tracker, target: o.type === "manual" ? 1 : target });
    }
    cmd.mutate(
      { type: "create_custom_quest", title, description, attribute, difficulty, deadline: deadline ? new Date(deadline).toISOString() : null, objectives, idempotencyKey: newKey("cq") },
      { onSuccess: () => { setOpen(false); setTitle(""); setDescription(""); setDeadline(""); }, onError: (err) => setError(err.message) },
    );
  }

  function autoTitle(o: ObjDraft) {
    const act = ACTIVITIES.find((a) => a.type === o.activity)?.name ?? o.activity;
    if (o.type === "activity_minutes") return `${o.target} min of ${act.toLowerCase()}`;
    if (o.type === "activity_count") return `${o.target}× ${act.toLowerCase()}`;
    if (o.type === "activity_quantity") return `${o.target} ${act.toLowerCase()} (quantity)`;
    if (o.type === "metric_reach") {
      const m = manualMetrics.find((x) => x.id === o.metric);
      return `Reach ${o.target}${m && m.unit !== "duration" ? ` ${displayUnit(m.unit as UnitKind, units).label}` : ""} on ${m?.name ?? o.metric}`;
    }
    return "Complete (confirm manually)";
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Create custom quest" description="Objectives track automatically from your logs where possible. XP is set by the System (max 100) from difficulty and objective count." className="max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="cq-title">
            <Input id="cq-title" required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="cq-desc">
            <Textarea id="cq-desc" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Attribute" htmlFor="cq-attr">
              <Select id="cq-attr" value={attribute} onChange={(e) => setAttribute(e.target.value as AttributeCode)}>
                {ATTRIBUTES.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Difficulty" htmlFor="cq-diff">
              <Select id="cq-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                {["E", "D", "C", "B", "A", "S"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </Field>
            <Field label="Deadline (optional)" htmlFor="cq-dl" hint="With a deadline it becomes an emergency quest.">
              <Input id="cq-dl" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-3">
            <p className="font-display text-[10px] tracking-[0.18em] text-dim">OBJECTIVES</p>
            {objs.map((o) => (
              <div key={o.id} className="grid gap-2 rounded-lg border border-line/60 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Select aria-label="Objective type" value={o.type} onChange={(e) => setObjs((l) => l.map((x) => (x.id === o.id ? { ...x, type: e.target.value as TrackerType } : x)))}>
                  <option value="activity_minutes">Minutes of an activity</option>
                  <option value="activity_count">Number of sessions</option>
                  <option value="activity_quantity">Quantity (km, cards, pages…)</option>
                  <option value="metric_reach">Reach a metric value</option>
                  <option value="manual">Manual check-off</option>
                </Select>
                {o.type === "metric_reach" ? (
                  <Select aria-label="Metric" value={o.metric} onChange={(e) => setObjs((l) => l.map((x) => (x.id === o.id ? { ...x, metric: e.target.value } : x)))}>
                    {manualMetrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                ) : o.type !== "manual" ? (
                  <Select aria-label="Activity" value={o.activity} onChange={(e) => setObjs((l) => l.map((x) => (x.id === o.id ? { ...x, activity: e.target.value } : x)))}>
                    {ACTIVITIES.map((a) => (
                      <option key={a.type} value={a.type}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="self-center text-xs text-faint">You confirm it yourself.</span>
                )}
                <Button type="button" size="icon" variant="ghost" aria-label="Remove objective" disabled={objs.length === 1} onClick={() => setObjs((l) => l.filter((x) => x.id !== o.id))}>
                  <Trash2 />
                </Button>
                {o.type !== "manual" ? (
                  <Input aria-label="Target" type={o.type === "metric_reach" ? "text" : "number"} inputMode="decimal" step="any" min={0} value={o.target} onChange={(e) => setObjs((l) => l.map((x) => (x.id === o.id ? { ...x, target: e.target.value } : x)))} placeholder={o.type === "metric_reach" ? targetHint(o) : "Target"} />
                ) : null}
                {o.type === "metric_reach" ? (
                  <Select aria-label="Direction" value={o.direction} onChange={(e) => setObjs((l) => l.map((x) => (x.id === o.id ? { ...x, direction: e.target.value as "higher" | "lower" } : x)))}>
                    <option value="higher">At or above target</option>
                    <option value="lower">At or below target</option>
                  </Select>
                ) : null}
                <Input aria-label="Objective title (optional)" className="sm:col-span-3" placeholder={autoTitle(o)} value={o.title} onChange={(e) => setObjs((l) => l.map((x) => (x.id === o.id ? { ...x, title: e.target.value } : x)))} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" disabled={objs.length >= 8} onClick={() => setObjs((l) => [...l, { id: Date.now(), title: "", type: "activity_count", activity: "workout", metric: "run_5k", direction: "lower", target: "1" }])}>
              <Plus /> Add objective
            </Button>
          </div>
          {error ? <p className="text-sm text-red-300 light:text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={cmd.isPending}>
            Create quest
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
