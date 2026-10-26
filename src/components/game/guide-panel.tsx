"use client";
import { Bot, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Panel } from "@/components/system/primitives";
import { api, newKey } from "@/lib/client/api";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { ACTIVITY_BY_TYPE } from "@/lib/domain/activities";
import { deterministicGuide, type GuideKind, type GuideMessage } from "@/lib/game/guide";
import type { GuideResponse, SuggestedQuest } from "@/lib/server/guide-llm";

const KINDS: { kind: GuideKind; label: string }[] = [
  { kind: "daily_briefing", label: "Daily briefing" },
  { kind: "weekly_summary", label: "Weekly summary" },
  { kind: "neglected", label: "Neglected goals" },
  { kind: "milestones", label: "Next milestones" },
  { kind: "explain_stats", label: "Explain my stats" },
  { kind: "study_plan", label: "Plan study sessions" },
  { kind: "recovery", label: "Training & recovery" },
];

export function GuidePanel({ initialKind = "daily_briefing" }: { initialKind?: GuideKind }) {
  const { data } = useSnapshot();
  const [kind, setKind] = useState<GuideKind>(initialKind);
  const [ai, setAi] = useState<GuideResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const local = useMemo(() => (data ? deterministicGuide(kind, data) : []), [data, kind]);
  const messages: GuideMessage[] = ai && ai.messages.length ? ai.messages : local;

  async function askAi() {
    setBusy(true);
    setErr(null);
    try {
      setAi(await api<GuideResponse>("/api/guide", { json: { kind } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="System Guide"
      subtitle={ai ? (ai.source === "llm" ? `AI guide · ${ai.model}` : ai.note) : "Computed from your recorded data"}
      actions={
        <Button size="sm" variant="outline" onClick={askAi} disabled={busy} aria-label="Ask the AI guide">
          {busy ? <Loader2 className="animate-spin" /> : <Bot />} Ask AI
        </Button>
      }
    >
      <Select
        aria-label="Guide topic"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as GuideKind);
          setAi(null);
        }}
        className="mb-3"
      >
        {KINDS.map((k) => (
          <option key={k.kind} value={k.kind}>
            {k.label}
          </option>
        ))}
      </Select>
      <ul className="space-y-3">
        {messages.map((m, i) => (
          <li key={i} className="border-l-2 border-line-strong pl-3">
            <p className="font-display text-[10px] tracking-[0.2em] text-accent">{m.tag}</p>
            <p className="font-semibold text-fg">{m.title}</p>
            <p className="text-sm leading-relaxed text-dim">{m.body}</p>
          </li>
        ))}
      </ul>
      {err ? <p className="mt-3 text-sm text-red-300 light:text-red-700">{err}</p> : null}
      {ai?.suggestedQuests.length ? (
        <div className="mt-4 space-y-2">
          <p className="font-display text-[10px] tracking-[0.2em] text-accent-2">[SUGGESTED QUESTS]</p>
          {ai.suggestedQuests.map((q, i) => (
            <SuggestedQuestCard key={i} q={q} />
          ))}
        </div>
      ) : null}
      <p className="mt-4 text-[11px] text-faint">The guide only restates and prioritises your logged data. It never invents results, sources or rankings.</p>
    </Panel>
  );
}

function SuggestedQuestCard({ q }: { q: SuggestedQuest }) {
  const cmd = useCommand();
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-lg border border-line/70 p-3">
      <p className="font-semibold text-fg">{q.title}</p>
      <p className="text-sm text-dim">{q.description}</p>
      <ul className="mt-1 text-xs text-faint">
        {q.objectives.map((o, i) => (
          <li key={i}>
            · {o.title} ({ACTIVITY_BY_TYPE[o.activity]?.name}: {o.target} {o.measure === "minutes" ? "min" : o.measure === "count" ? "×" : ""})
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        className="mt-2"
        disabled={done || cmd.isPending}
        onClick={() =>
          cmd.mutate(
            {
              type: "create_custom_quest",
              title: q.title,
              description: q.description,
              attribute: q.attribute,
              difficulty: q.difficulty,
              deadline: null,
              idempotencyKey: newKey("aiq"),
              objectives: q.objectives.map((o) => ({ title: o.title, target: o.target, tracker: { type: o.measure === "minutes" ? "activity_minutes" : o.measure === "count" ? "activity_count" : "activity_quantity", activities: [o.activity] } })),
            },
            { onSuccess: () => setDone(true) },
          )
        }
      >
        <Plus /> {done ? "Accepted" : "Accept quest"}
      </Button>
    </div>
  );
}
