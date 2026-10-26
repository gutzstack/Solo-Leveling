"use client";
import { Check, Clock, Lock, Plus, Trash2 } from "lucide-react";
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
import { TITLE_BY_CODE } from "@/lib/domain/titles";
import { displayUnit, parseDisplayInput } from "@/lib/domain/units";
import type { AttributeCode, UnitKind } from "@/lib/domain/types";
import type { QuestView } from "@/lib/game/evaluate";
import { cn } from "@/lib/utils";

export default function QuestsPage() {
  const { data } = useSnapshot();
  const [showHistory, setShowHistory] = useState(false);
  if (!data) return null;
  const visible = (q: QuestView) => showHistory || q.status === "active" || q.status === "offered" || (q.status === "completed" && (q.period_end === null || q.period_end >= data.today));
  const by = (k: QuestView["kind"]) => data.quests.filter((q) => q.kind === k).filter(visible).sort((a, b) => order(a) - order(b) || b.period_start.localeCompare(a.period_start));
  const tabs: { id: string; label: string; quests: QuestView[]; empty: string }[] = [
    { id: "daily", label: "Daily", quests: by("daily"), empty: "Daily quests appear each morning (your local time)." },
    { id: "weekly", label: "Weekly", quests: by("weekly"), empty: "Weekly quests reset every Monday." },
    { id: "main", label: "Main Story", quests: by("main"), empty: "Story arcs follow the categories you track." },
    { id: "emergency", label: "Emergency", quests: by("emergency"), empty: "No emergency gates are open. They are optional and time-limited, and declining has no penalty." },
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
            {t.quests.length ? (
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
  return { offered: 0, active: 1, completed: 2, expired: 3, abandoned: 4 }[q.status];
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
  const done = q.status === "completed";
  const inactive = q.status === "expired" || q.status === "abandoned";
  return (
    <Panel className={cn(done && "border-emerald-400/40", inactive && "opacity-60", q.status === "offered" && "pulse-ring")} bodyClassName="space-y-3">
      <div className="flex items-start gap-3">
        <RankBadge rank={q.difficulty} size="sm" label={`Difficulty ${q.difficulty}`} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[9px] tracking-[0.2em] text-accent-2">{q.kind === "emergency" ? "[EMERGENCY QUEST]" : `[${q.kind.toUpperCase()} QUEST]`}</p>
          <h3 className="font-semibold leading-snug text-fg">{q.title}</h3>
        </div>
        <span className="font-mono text-xs text-accent">+{q.xp_reward} XP</span>
      </div>
      {q.description ? <p className="text-sm text-dim">{q.description}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {q.attribute_code ? <Pill>{q.attribute_code}</Pill> : null}
        {q.deadline && q.status === "active" ? <Countdown deadline={q.deadline} /> : null}
        {done ? <Pill className="border-emerald-400/50 text-emerald-300 light:text-emerald-800">completed</Pill> : null}
        {q.status === "expired" ? <Pill>faded (no penalty)</Pill> : null}
        {q.status === "abandoned" ? <Pill>declined</Pill> : null}
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
              <span className="font-mono text-[11px] text-faint">{o.progress.display}</span>
            </div>
            <XpBar value={o.progress.fraction * 100} max={100} thin label={o.title} className="mt-1" />
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
        <Button size="sm" variant="ghost" onClick={() => confirm("Abandon this quest? There is no penalty.") && cmd.mutate({ type: "abandon_quest", questId: q.id })}>
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
