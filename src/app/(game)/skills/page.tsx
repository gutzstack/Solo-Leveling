"use client";
import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";
import { useState } from "react";
import { PageHeader, Panel, XpBar } from "@/components/system/primitives";
import { useSnapshot } from "@/lib/client/use-game";
import { SKILL_TREES } from "@/lib/domain/skills";
import type { SkillView } from "@/lib/game/evaluate";
import { cn } from "@/lib/utils";

const ROMAN = ["I", "II", "III", "IV", "V"];

export default function SkillsPage() {
  const { data } = useSnapshot();
  const [selected, setSelected] = useState<string | null>(null);
  if (!data) return null;
  const sel = data.skills.find((s) => s.code === selected) ?? data.skills.find((s) => s.available) ?? data.skills[0];
  const unlocked = data.skills.filter((s) => s.unlocked).length;
  return (
    <div>
      <PageHeader title="Skill Trees" kicker={`${unlocked} / ${data.skills.length} nodes unlocked`} />
      <p className="mb-5 max-w-3xl text-sm text-dim">Skills unlock automatically when you hit measurable milestones in your logs. Nothing here can be bought or clicked open.</p>
      <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          {SKILL_TREES.map((tree) => {
            const lines = [...new Set(data.skills.filter((s) => s.tree === tree.tree).map((s) => s.line))];
            return (
              <Panel key={tree.tree} title={tree.name} subtitle={tree.description}>
                <div className="space-y-5">
                  {lines.map((line) => {
                    const nodes = data.skills.filter((s) => s.line === line).sort((a, b) => a.tier - b.tier);
                    return (
                      <div key={line}>
                        <p className="mb-2 font-display text-[10px] tracking-[0.2em] text-dim">{nodes[0].lineName}</p>
                        <div className="no-scrollbar flex items-center overflow-x-auto pb-1">
                          {nodes.map((n, i) => (
                            <div key={n.code} className="flex items-center">
                              {i > 0 ? <Connector lit={n.unlocked} half={nodes[i - 1].unlocked && !n.unlocked} /> : null}
                              <Node n={n} active={sel?.code === n.code} onClick={() => setSelected(n.code)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            );
          })}
        </div>
        {sel ? (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <Panel title="Skill Detail" glow>
              <p className="font-display text-[10px] tracking-[0.2em] text-accent-2">{sel.tree.toUpperCase()} TREE · TIER {ROMAN[sel.tier - 1]}</p>
              <h3 className="mt-1 text-xl font-bold text-fg">{sel.name}</h3>
              <p className="mt-2 text-sm text-dim">{sel.effect}</p>
              <div className="mt-4 rounded-lg border border-line/60 p-3">
                <p className="font-display text-[9px] tracking-[0.18em] text-faint">UNLOCK REQUIREMENT</p>
                <p className="mt-1 text-sm text-fg">{sel.requirement.label}</p>
                {sel.requires ? <p className="mt-1 text-xs text-faint">Requires {data.skills.find((s) => s.code === sel.requires)?.name}</p> : null}
                <div className="mt-3">
                  <XpBar value={sel.progress * 100} max={100} label="Requirement progress" />
                  <p className="mt-1 font-mono text-xs text-dim">
                    {sel.unlocked
                      ? `Unlocked ${sel.unlockedAt?.slice(0, 10)}`
                      : `${Math.floor(sel.progress * 100)}%${sel.current !== null && sel.requirement.op === "gte" ? ` · ${Math.round(sel.current * 10) / 10} / ${sel.requirement.value}` : ""}`}
                  </p>
                </div>
              </div>
              <p className="mt-3 font-mono text-xs text-accent">Reward: +{sel.xp} XP</p>
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Connector({ lit, half }: { lit: boolean; half: boolean }) {
  return (
    <div className="relative h-1 w-6 shrink-0 sm:w-10" aria-hidden="true">
      <div className="absolute inset-0 rounded-full bg-line/40" />
      {lit || half ? (
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: "linear-gradient(90deg,#38bdf8,#a78bfa)", boxShadow: "0 0 10px rgba(56,189,248,0.8)" }} initial={{ width: 0 }} animate={{ width: lit ? "100%" : "50%" }} transition={{ duration: 0.8 }} />
      ) : null}
    </div>
  );
}

function Node({ n, active, onClick }: { n: SkillView; active: boolean; onClick: () => void }) {
  const r = 22;
  const C = 2 * Math.PI * r;
  return (
    <button
      onClick={onClick}
      aria-label={`${n.name}: ${n.unlocked ? "unlocked" : n.available ? `${Math.floor(n.progress * 100)}% toward unlock` : "locked"}`}
      aria-pressed={active}
      className={cn("relative flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105", active && "scale-110")}
    >
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill={n.unlocked ? "rgba(56,189,248,0.18)" : "rgba(10,18,40,0.6)"} stroke={n.unlocked ? "#38bdf8" : "var(--border)"} strokeWidth="2" style={n.unlocked ? { filter: "drop-shadow(0 0 8px rgba(56,189,248,0.9))" } : undefined} />
        {!n.unlocked && n.progress > 0 ? <circle cx="28" cy="28" r={r} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeDasharray={C} strokeDashoffset={C * (1 - n.progress)} strokeLinecap="round" /> : null}
      </svg>
      <span className={cn("relative font-display text-xs font-bold", n.unlocked ? "text-sky-200 light:text-sky-800" : n.available ? "text-dim" : "text-faint")}>
        {n.unlocked ? <Check className="size-4" /> : !n.available ? <Lock className="size-3.5" /> : ROMAN[n.tier - 1]}
      </span>
      {active ? <span className="absolute -inset-1 rounded-full border border-line-strong" /> : null}
    </button>
  );
}
