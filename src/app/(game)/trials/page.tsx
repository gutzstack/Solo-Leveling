"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Brain, Download, Flag, Gauge, Hash, Layers, Loader2, Play, Puzzle, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, EvidenceBadge, PageHeader, Panel, Pill, RankBadge } from "@/components/system/primitives";
import { TrialRunner, useTrialApi } from "@/components/game/trial-runner";
import { api } from "@/lib/client/api";
import { useSnapshot } from "@/lib/client/use-game";
import { TRIAL_INFO, type TrialKind } from "@/lib/domain/trials";
import type { TrialView } from "@/lib/server/game/trials";

const CARDS: { kind: TrialKind; metric: string; icon: React.ElementType; weight: string }[] = [
  { kind: "knowledge", metric: "knowledge_rating", icon: Layers, weight: "3×" },
  { kind: "reasoning", metric: "reasoning_rating", icon: Puzzle, weight: "2×" },
  { kind: "memory", metric: "working_memory_span", icon: Hash, weight: "1×" },
  { kind: "speed", metric: "processing_speed", icon: Gauge, weight: "1×" },
];

interface QuestionItem {
  id: string;
  deck: string;
  topic: string;
  prompt: string;
  choices: string[];
  answer_index: number;
  explanation: string | null;
  difficulty: string;
  source: "import" | "ai";
  flagged: boolean;
}

const TEMPLATE = `question,a,b,c,d,answer,topic,difficulty,explanation
"What is the powerhouse of the cell?",Nucleus,Mitochondrion,Ribosome,Golgi apparatus,B,Biology,easy,"Mitochondria produce most of the cell's ATP."
"Solve for x: 3x + 5 = 20",3,5,15,25,B,Algebra,easy,"3x = 15, so x = 5."
`;

export default function TrialsPage() {
  const { data } = useSnapshot();
  const call = useTrialApi();
  const [active, setActive] = useState<TrialView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<TrialKind | null>(null);
  const questions = useQuery({ queryKey: ["questions"], queryFn: () => api<{ items: QuestionItem[]; aiAvailable: boolean }>("/api/questions") });

  // Resume a trial that's still in progress (e.g. after a reload).
  useEffect(() => {
    call({ action: "current" })
      .then((v) => v && setActive(v))
      .catch(() => undefined);
  }, [call]);

  if (!data) return null;
  const int = data.attributes.find((a) => a.code === "INT")!;
  const usable = (questions.data?.items ?? []).filter((q) => !q.flagged).length;

  async function start(kind: TrialKind) {
    setError(null);
    setStarting(kind);
    try {
      const v = await call({ action: "start", kind });
      if (v) setActive(v);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="System Trials" kicker="How INT is measured" />
      {active ? <TrialRunner initial={active} onExit={() => setActive(null)} /> : null}
      {error ? <p className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200 light:text-red-800">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((c) => {
          const m = data.metrics.find((x) => x.id === c.metric);
          const info = TRIAL_INFO[c.kind];
          const I = c.icon;
          const disabled = Boolean(active) || (c.kind === "knowledge" && usable < 5);
          return (
            <Panel key={c.kind} bodyClassName="flex h-full flex-col gap-3" className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg border border-line-strong bg-accent/10 text-accent">
                  <I className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-fg">{info.name}</h3>
                  <p className="text-xs text-accent-2">
                    {info.subtitle} · weight {c.weight}
                  </p>
                </div>
                <RankBadge rank={m?.rank ?? null} size="sm" />
              </div>
              <p className="flex-1 text-sm text-dim">{info.description}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill>~{info.minutes} min</Pill>
                <Pill>{m?.name}: {m?.current ? Math.round(m.current.value) : "—"}</Pill>
                {m?.evidence ? <EvidenceBadge evidence={m.evidence} /> : null}
              </div>
              {m?.derivedNote ? <p className="text-xs text-faint">{m.derivedNote}</p> : null}
              <Button onClick={() => start(c.kind)} disabled={disabled || starting !== null}>
                {starting === c.kind ? <Loader2 className="animate-spin" /> : <Play />} Begin
              </Button>
              {c.kind === "knowledge" && usable < 5 ? <p className="text-xs text-warning">Import at least 5 questions below to unlock.</p> : null}
            </Panel>
          );
        })}
      </div>

      <Panel title="How your INT rank is calculated" subtitle="Game-defined score. Not an IQ test and not a population percentile.">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-2 text-sm text-dim">
            <p>
              INT rank = weighted average of your ranked INT metrics: <b className="text-fg">Knowledge rating 3×</b>, <b className="text-fg">Reasoning rating 2×</b>, official exam percentile 1.5×, <b className="text-fg">Memory span 1×</b>, <b className="text-fg">Processing speed 1×</b>, and self-reported course exam, quiz and assessment averages 0.5× each. At least 2 ranked metrics are needed.
            </p>
            <p>GPA, study hours, reading and retention are still tracked as records, but they no longer affect the rank. Studying still earns INT XP (your level); trials measure what you can actually do.</p>
            <p>Ratings start at 1000. Getting harder items right raises them more, and items keep adapting to your level, so repeating easy questions barely moves the number.</p>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl border border-line/60 p-4">
            <span className="font-display text-[10px] tracking-[0.2em] text-faint">INT RANK</span>
            <RankBadge rank={int.rank} size="lg" />
            <span className="font-mono text-xs text-dim">{int.score !== null ? `score ${int.score}` : "unranked"}</span>
          </div>
        </div>
      </Panel>

      <QuestionBank items={questions.data?.items ?? []} aiAvailable={Boolean(questions.data?.aiAvailable)} loading={questions.isLoading} />

      <Panel title="Recent trials">
        {data.trials?.filter((t) => t.status === "completed").length ? (
          <ul className="divide-y divide-line/50">
            {[...data.trials]
              .filter((t) => t.status === "completed")
              .reverse()
              .slice(0, 15)
              .map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Brain className="size-4 text-accent" />
                  <span className="flex-1 text-fg">{TRIAL_INFO[t.kind].name}</span>
                  <span className="font-mono text-xs text-dim">score {t.score}</span>
                  <span className="font-mono text-xs text-faint">{t.completed_at?.slice(0, 10)}</span>
                </li>
              ))}
          </ul>
        ) : (
          <EmptyState icon={Brain} title="No trials completed yet">Your first trial establishes a baseline.</EmptyState>
        )}
      </Panel>
    </div>
  );
}

function QuestionBank({ items, aiAvailable, loading }: { items: QuestionItem[]; aiAvailable: boolean; loading: boolean }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["questions"] });
  const decks = useMemo(() => {
    const m = new Map<string, { total: number; ai: number; flagged: number }>();
    for (const q of items) {
      const d = m.get(q.deck) ?? { total: 0, ai: 0, flagged: 0 };
      d.total += 1;
      if (q.source === "ai") d.ai += 1;
      if (q.flagged) d.flagged += 1;
      m.set(q.deck, d);
    }
    return [...m.entries()];
  }, [items]);
  return (
    <Panel title="Question sets" subtitle="Knowledge Trials draw from questions you add, so your rating reflects your own material." actions={<span className="font-mono text-xs text-dim">{items.length} questions</span>}>
      <div className="mb-4 flex flex-wrap gap-2">
        <ImportDialog onDone={refresh} />
        {aiAvailable ? <GenerateDialog onDone={refresh} /> : null}
        <Button variant="ghost" asChild>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="question-template.csv">
            <Download /> CSV template
          </a>
        </Button>
      </div>
      {!aiAvailable ? <p className="mb-3 text-xs text-faint">AI-generated questions are available when the server has an ANTHROPIC_API_KEY. Importing your own questions always works.</p> : null}
      {loading ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : decks.length ? (
        <ul className="divide-y divide-line/50">
          {decks.map(([deck, d]) => (
            <li key={deck} className="flex flex-wrap items-center gap-2 py-2">
              <span className="flex-1 font-semibold text-fg">{deck}</span>
              <Pill>{d.total} questions</Pill>
              {d.ai ? <Pill className="text-warning">{d.ai} AI · unverified</Pill> : null}
              {d.flagged ? <Pill>{d.flagged} flagged</Pill> : null}
              <DeckDialog deck={deck} items={items.filter((q) => q.deck === deck)} onChange={refresh} />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete deck ${deck}`}
                onClick={async () => {
                  if (!confirm(`Delete all ${d.total} questions in "${deck}"?`)) return;
                  await api("/api/questions", { json: { action: "delete_deck", deck } });
                  refresh();
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Layers} title="No question sets yet">
          Import multiple-choice questions from your courses, textbooks or flashcards (CSV or JSON). Download the template to see the format.
        </EmptyState>
      )}
    </Panel>
  );
}

function ImportDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [deck, setDeck] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const format = /^\s*[[{]/.test(text) ? "json" : "csv";
      const r = await api<{ inserted: number; skippedDuplicates: number; errors: string[] }>("/api/questions", { json: { action: "import", deck: deck.trim() || "General", format, text } });
      setMsg(`Imported ${r.inserted} question${r.inserted === 1 ? "" : "s"}${r.skippedDuplicates ? ` (${r.skippedDuplicates} duplicates skipped)` : ""}.${r.errors.length ? ` ${r.errors.length} row(s) skipped: ${r.errors.slice(0, 3).join(" ")}` : ""}`);
      setText("");
      onDone();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> Import questions
        </Button>
      </DialogTrigger>
      <DialogContent title="Import questions" description="CSV with a header row (question, a, b, c, d, answer, topic, difficulty, explanation) or JSON [{prompt, choices, answerIndex, topic?, difficulty?, explanation?}]. The answer is a letter (A–F)." className="max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Deck name" htmlFor="qi-deck">
            <Input id="qi-deck" maxLength={60} placeholder="e.g. Organic Chemistry" value={deck} onChange={(e) => setDeck(e.target.value)} />
          </Field>
          <Field label="Paste CSV or JSON" htmlFor="qi-text">
            <Textarea id="qi-text" rows={8} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={TEMPLATE} />
          </Field>
          <input ref={file} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => file.current?.click()}>
              <Upload /> Load file
            </Button>
            <Button type="submit" disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null} Import
            </Button>
          </div>
          {msg ? <p className="text-sm text-dim">{msg}</p> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [deck, setDeck] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("10");
  const [difficulty, setDifficulty] = useState("medium");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Bot /> Generate with AI
        </Button>
      </DialogTrigger>
      <DialogContent title="Generate practice questions" description="AI-written questions are labelled unverified. Check them against your sources and flag any mistakes; flagged questions are excluded from trials.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            try {
              const r = await api<{ inserted: number }>("/api/questions", { json: { action: "generate", deck: deck.trim() || topic.trim().slice(0, 60), topic, count: Number(count), difficulty } });
              setMsg(`Added ${r.inserted} questions.`);
              onDone();
            } catch (err) {
              setMsg((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Topic" htmlFor="gen-topic">
            <Input id="gen-topic" required minLength={2} maxLength={120} placeholder="e.g. Cell biology: membrane transport" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Deck" htmlFor="gen-deck">
              <Input id="gen-deck" maxLength={60} placeholder="(topic)" value={deck} onChange={(e) => setDeck(e.target.value)} />
            </Field>
            <Field label="Count" htmlFor="gen-count">
              <Input id="gen-count" type="number" min={3} max={20} value={count} onChange={(e) => setCount(e.target.value)} />
            </Field>
            <Field label="Difficulty" htmlFor="gen-diff">
              <Select id="gen-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="animate-spin" /> : <Bot />} Generate
          </Button>
          {msg ? <p className="text-sm text-dim">{msg}</p> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeckDialog({ deck, items, onChange }: { deck: string; items: QuestionItem[]; onChange: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          View
        </Button>
      </DialogTrigger>
      <DialogContent title={deck} description="Flag a question to exclude it from trials (e.g. a wrong answer key)." className="max-w-2xl">
        <ul className="max-h-[65dvh] space-y-3 overflow-y-auto pr-1">
          {items.map((q) => (
            <li key={q.id} className="rounded-lg border border-line/60 p-3 text-sm">
              <div className="mb-1 flex flex-wrap gap-1.5">
                <Pill>{q.topic}</Pill>
                <Pill>{q.difficulty}</Pill>
                {q.source === "ai" ? <Pill className="text-warning">AI · unverified</Pill> : null}
                {q.flagged ? <Pill className="text-warning">flagged</Pill> : null}
              </div>
              <p className="text-fg">{q.prompt}</p>
              <ol className="mt-1 list-[upper-alpha] pl-5 text-dim">
                {q.choices.map((c, i) => (
                  <li key={i} className={i === q.answer_index ? "text-success" : ""}>
                    {c}
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex gap-1">
                <Button size="sm" variant="ghost" onClick={async () => { await api("/api/questions", { json: { action: "flag", id: q.id, flagged: !q.flagged } }); onChange(); }}>
                  <Flag /> {q.flagged ? "Unflag" : "Flag"}
                </Button>
                <Button size="sm" variant="ghost" onClick={async () => { await api("/api/questions", { json: { action: "delete", id: q.id } }); onChange(); }}>
                  <Trash2 /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
