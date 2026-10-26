"use client";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill, XpBar } from "@/components/system/primitives";
import { api } from "@/lib/client/api";
import { pushEvents } from "@/lib/client/events";
import { play } from "@/lib/client/sound";
import { SNAPSHOT_KEY } from "@/lib/client/use-game";
import { TRIAL_INFO } from "@/lib/domain/trials";
import type { GameEvent } from "@/lib/game/commands";
import type { PlayerSnapshot } from "@/lib/server/game/snapshot";
import type { TrialView } from "@/lib/server/game/trials";
import { cn } from "@/lib/utils";

interface TrialResponse {
  view: TrialView | null;
  events: GameEvent[];
  snapshot: PlayerSnapshot | null;
}

/** Hook that talks to /api/trial and keeps the game snapshot in sync when a trial finishes. */
export function useTrialApi() {
  const qc = useQueryClient();
  return useCallback(
    async (body: Record<string, unknown>) => {
      const r = await api<TrialResponse>("/api/trial", { json: body });
      if (r.snapshot) {
        qc.setQueryData(SNAPSHOT_KEY, r.snapshot);
        pushEvents(r.events);
      }
      return r.view;
    },
    [qc],
  );
}

function Countdown({ seconds, resetKey, onExpire }: { seconds: number; resetKey: string | number; onExpire?: () => void }) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);
  useEffect(() => {
    const start = Date.now();
    fired.current = false;
    const t = setInterval(() => {
      const l = Math.max(0, seconds - (Date.now() - start) / 1000);
      setLeft(l);
      if (l === 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    }, 200);
    return () => clearInterval(t);
  }, [seconds, resetKey, onExpire]);
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between font-mono text-xs text-dim">
        <span>Time</span>
        <span className={left < 10 ? "text-warning" : ""}>{Math.ceil(left)} s</span>
      </div>
      <XpBar value={left} max={seconds} thin label="Time remaining" color={left < 10 ? "#fbbf24" : undefined} />
    </div>
  );
}

export function TrialRunner({ initial, onExit }: { initial: TrialView; onExit: () => void }) {
  const call = useTrialApi();
  const [view, setView] = useState<TrialView>(initial);
  const [feedback, setFeedback] = useState<TrialView["last"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = TRIAL_INFO[view.kind];

  const send = useCallback(
    async (body: Record<string, unknown>, showFeedbackMs = 700) => {
      setBusy(true);
      setError(null);
      try {
        const next = await call({ ...body, sessionId: view.id });
        if (!next) return onExit();
        if (next.last) {
          setFeedback(next.last);
          play(next.last.correct ? "xp" : "error");
          if (showFeedbackMs) await new Promise((r) => setTimeout(r, next.last!.explanation ? showFeedbackMs * 3 : showFeedbackMs));
          setFeedback(null);
        }
        if (next.status === "completed") play("clear");
        setView(next);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [call, view.id, onExit],
  );

  async function abandon() {
    if (view.status === "active" && !confirm("Leave this trial? It won't be scored, and abandoning a trial costs a little INT XP.")) return;
    if (view.status === "active") await call({ action: "abandon", sessionId: view.id }).catch(() => null);
    onExit();
  }

  return (
    <section className="sys-panel sys-panel-glow scanlines relative mb-6 overflow-hidden p-5 sm:p-7" aria-label={info.name}>
      <div className="holo-sheen" />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-display text-[10px] tracking-[0.3em] text-accent text-glow">[SYSTEM TRIAL]</p>
            <h2 className="text-xl font-bold text-fg">{info.name}</h2>
            <p className="text-sm text-accent-2">{info.subtitle}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={abandon}>
            <X /> {view.status === "active" ? "Leave" : "Close"}
          </Button>
        </div>

        {view.status === "completed" && view.result ? (
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
            <p className="font-display text-xs tracking-[0.3em] text-success">[TRIAL COMPLETE]</p>
            <p className="mt-3 font-display text-5xl font-black text-sky-300 text-glow light:text-sky-700">{view.result.score}</p>
            <p className="mt-2 text-fg">{view.result.summary}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {Object.entries(view.result.details).map(([k, v]) => (
                <Pill key={k}>
                  {k}: {v}
                </Pill>
              ))}
            </div>
            <Button className="mt-5" onClick={onExit}>
              Return
            </Button>
          </motion.div>
        ) : view.reasoning ? (
          <Reasoning view={view} busy={busy} feedback={feedback} onAnswer={(choice) => send({ action: "answer", choice })} />
        ) : view.knowledge ? (
          <Knowledge view={view} busy={busy} feedback={feedback} onAnswer={(choice) => send({ action: "answer", choice }, 1200)} />
        ) : view.memory ? (
          <Memory view={view} busy={busy} feedback={feedback} onRecall={(digits) => send({ action: "recall", digits }, 900)} />
        ) : view.speed ? (
          <Speed view={view} busy={busy} onSubmit={(answers) => send({ action: "submit_speed", answers }, 0)} />
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-300 light:text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}

function ChoiceGrid<T extends string | number>({ choices, onPick, disabled, feedback, picked }: { choices: T[]; onPick: (i: number) => void; disabled: boolean; feedback: TrialView["last"] | null; picked: number | null }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {choices.map((c, i) => {
        const isCorrect = feedback && feedback.correctChoice === i;
        const isWrongPick = feedback && picked === i && !feedback.correct;
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onPick(i)}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 text-left transition-all disabled:cursor-default",
              isCorrect ? "border-emerald-400 bg-emerald-500/15" : isWrongPick ? "border-red-400 bg-red-500/15" : "border-line hover:border-line-strong hover:bg-accent/10",
            )}
          >
            <span className="font-display text-xs text-accent">{String.fromCharCode(65 + i)}</span>
            <span className="font-mono text-fg">{c}</span>
            {isCorrect ? <Check className="ml-auto size-4 text-success" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function Reasoning({ view, busy, feedback, onAnswer }: { view: TrialView; busy: boolean; feedback: TrialView["last"] | null; onAnswer: (i: number) => void }) {
  const r = view.reasoning!;
  const [picked, setPicked] = useState<number | null>(null);
  const expire = useCallback(() => {
    // choice 5 never exists (items have 4 options), so a timeout is scored as wrong
    if (!busy) onAnswer(5);
  }, [busy, onAnswer]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>
          Item {r.index + 1} / {r.total}
        </Pill>
        <Pill>Difficulty {r.level}</Pill>
      </div>
      <Countdown seconds={r.secondsPerItem} resetKey={r.index} onExpire={expire} />
      <p className="text-fg">{r.item.prompt}</p>
      {r.item.format === "series" ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Number series">
          {r.item.series!.map((n, i) => (
            <span key={i} className="flex h-12 min-w-12 items-center justify-center rounded-lg border border-line bg-bg/60 px-3 font-mono text-lg text-fg">
              {n}
            </span>
          ))}
          <span className="flex h-12 min-w-12 items-center justify-center rounded-lg border border-dashed border-line-strong px-3 font-mono text-lg text-accent">?</span>
        </div>
      ) : (
        <div className="grid w-fit grid-cols-3 gap-2" aria-label="Number grid">
          {r.item.grid!.map((n, i) => (
            <span key={i} className={cn("flex size-14 items-center justify-center rounded-lg border font-mono text-lg", n === null ? "border-dashed border-line-strong text-accent" : "border-line bg-bg/60 text-fg")}>
              {n ?? "?"}
            </span>
          ))}
        </div>
      )}
      <ChoiceGrid
        choices={r.item.choices}
        disabled={busy}
        feedback={feedback}
        picked={picked}
        onPick={(i) => {
          setPicked(i);
          onAnswer(i);
        }}
      />
    </div>
  );
}

function Knowledge({ view, busy, feedback, onAnswer }: { view: TrialView; busy: boolean; feedback: TrialView["last"] | null; onAnswer: (i: number) => void }) {
  const k = view.knowledge!;
  const [picked, setPicked] = useState<number | null>(null);
  const expire = useCallback(() => {
    if (!busy) onAnswer(5);
  }, [busy, onAnswer]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>
          Question {k.index + 1} / {k.total}
        </Pill>
        <Pill>{k.item.deck}</Pill>
        <Pill>{k.item.topic}</Pill>
        <Pill>{k.item.difficulty}</Pill>
        {k.item.source === "ai" ? <Pill className="text-warning">AI-generated · unverified</Pill> : null}
      </div>
      <Countdown seconds={k.secondsPerItem} resetKey={k.index} onExpire={expire} />
      <p className="whitespace-pre-wrap text-lg text-fg">{k.item.prompt}</p>
      <ChoiceGrid
        choices={k.item.choices}
        disabled={busy}
        feedback={feedback}
        picked={picked}
        onPick={(i) => {
          setPicked(i);
          onAnswer(i);
        }}
      />
      {feedback?.explanation ? <p className="rounded-lg border border-line/60 bg-bg/40 p-3 text-sm text-dim">{feedback.explanation}</p> : null}
    </div>
  );
}

function Memory(props: { view: TrialView; busy: boolean; feedback: TrialView["last"] | null; onRecall: (digits: string) => void }) {
  const m = props.view.memory!;
  // A new key per round remounts the round, which resets its display and input state.
  return <MemoryRound key={`${m.phase}-${m.length}-${m.attempt}`} {...props} />;
}

function MemoryRound({ view, busy, feedback, onRecall }: { view: TrialView; busy: boolean; feedback: TrialView["last"] | null; onRecall: (digits: string) => void }) {
  const m = view.memory!;
  const [shown, setShown] = useState<number>(-1); // index being displayed, -1 = before, length = done
  const [value, setValue] = useState("");
  useEffect(() => {
    let i = -1;
    const t = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= m.sequence.length) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [m.sequence.length]);
  const showing = shown < m.sequence.length;
  return (
    <div className="space-y-4 text-center">
      <div className="flex flex-wrap justify-center gap-2">
        <Pill>{m.phase === "forward" ? "Forward: repeat in the same order" : "Backward: repeat in REVERSE order"}</Pill>
        <Pill>{m.length} digits</Pill>
        <Pill>
          Best: {m.forwardBest} forward · {m.backwardBest} backward
        </Pill>
      </div>
      <div className="flex h-28 items-center justify-center" aria-live="polite">
        {showing ? (
          <motion.span key={shown} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-mono text-7xl font-bold text-sky-300 text-glow light:text-sky-700">
            {shown >= 0 ? m.sequence[shown] : "·"}
          </motion.span>
        ) : feedback ? (
          <p className={cn("text-lg", feedback.correct ? "text-success" : "text-warning")}>{feedback.correct ? "Correct" : `It was ${feedback.expected}`}</p>
        ) : (
          <p className="text-dim">Enter the digits{m.phase === "backward" ? " in reverse order" : ""}.</p>
        )}
      </div>
      <form
        className="mx-auto flex max-w-xs gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!showing && value) onRecall(value);
        }}
      >
        <Input aria-label="Digits" inputMode="numeric" autoComplete="off" value={value} disabled={showing || busy} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 20))} className="text-center text-xl tracking-[0.3em]" autoFocus />
        <Button type="submit" disabled={showing || busy || !value}>
          {busy ? <Loader2 className="animate-spin" /> : "Enter"}
        </Button>
      </form>
    </div>
  );
}

function Speed({ view, busy, onSubmit }: { view: TrialView; busy: boolean; onSubmit: (answers: (number | null)[]) => void }) {
  const s = view.speed!;
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const answers = useRef<(number | null)[]>([]);
  const submitted = useRef(false);
  const finish = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    onSubmit(answers.current);
  }, [onSubmit]);
  return (
    <div className="space-y-4 text-center">
      <Countdown seconds={s.seconds} resetKey="speed" onExpire={finish} />
      <p className="font-display text-xs tracking-[0.2em] text-dim">PROBLEM {index + 1}</p>
      <p className="font-mono text-5xl font-semibold text-fg">{s.problems[index] ?? "Done"}</p>
      <form
        className="mx-auto flex max-w-xs gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value || submitted.current) return;
          answers.current[index] = Number(value);
          setValue("");
          if (index + 1 >= s.problems.length) finish();
          else setIndex(index + 1);
        }}
      >
        <Input aria-label="Answer" inputMode="numeric" autoComplete="off" value={value} disabled={busy} onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, "").slice(0, 7))} className="text-center text-2xl" autoFocus />
        <Button type="submit" disabled={busy || !value}>
          Next
        </Button>
      </form>
      <p className="text-xs text-faint">Type the answer and press Enter. Scoring happens when the 60 seconds are up.</p>
    </div>
  );
}
