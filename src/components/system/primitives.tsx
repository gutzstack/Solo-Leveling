"use client";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, FlaskConical, Gamepad2, HelpCircle } from "lucide-react";
import * as React from "react";
import type { Evidence, Rank } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/switch";

export function Panel({ title, subtitle, actions, children, className, glow, bodyClassName, id }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; glow?: boolean; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={cn("sys-panel scanlines overflow-hidden", glow && "sys-panel-glow", className)}>
      <div className="holo-sheen" />
      {(title || actions) && (
        <header className="relative flex flex-wrap items-start justify-between gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="sys-title text-[11px] text-accent text-glow sm:text-xs">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-dim">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className={cn("relative p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function rankClass(rank: string | null | undefined): string {
  if (!rank) return "rank-E";
  return rank === "S+" ? "rank-Splus" : `rank-${rank}`;
}

export function RankBadge({ rank, size = "md", label, dim }: { rank: Rank | string | null; size?: "sm" | "md" | "lg" | "xl"; label?: string; dim?: boolean }) {
  const sizes = { sm: "size-7 text-xs", md: "size-10 text-base", lg: "size-16 text-2xl", xl: "size-28 text-5xl" };
  if (!rank) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg border border-dashed border-line font-display text-faint", sizes[size])} aria-label={label ?? "Unranked"} title="Unranked">
        –
      </span>
    );
  }
  return (
    <span
      className={cn(rankClass(rank), "relative inline-flex shrink-0 items-center justify-center rounded-lg border font-display font-black", sizes[size], dim && "opacity-60")}
      style={{ color: "var(--rank)", borderColor: "color-mix(in srgb, var(--rank) 60%, transparent)", background: "color-mix(in srgb, var(--rank) 12%, transparent)", boxShadow: "0 0 18px -6px var(--rank), inset 0 0 12px -6px var(--rank)", textShadow: "0 0 10px var(--rank)" }}
      aria-label={label ?? `Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

const EVIDENCE: Record<Evidence, { label: string; icon: React.ElementType; cls: string; tip: string }> = {
  verified: { label: "VERIFIED", icon: BadgeCheck, cls: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10 light:text-emerald-800", tip: "Derived from appropriate population data (survey-weighted microdata)." },
  estimated: { label: "ESTIMATED", icon: FlaskConical, cls: "text-amber-300 border-amber-400/40 bg-amber-500/10 light:text-amber-800", tip: "Based on explicitly disclosed statistical assumptions (e.g. interpolation between published percentiles)." },
  personal: { label: "PERSONAL", icon: Gamepad2, cls: "text-violet-300 border-violet-400/40 bg-violet-500/10 light:text-violet-800", tip: "Game-defined standard or goal attainment. Not a population percentile." },
};

export function EvidenceBadge({ evidence }: { evidence: Evidence | null }) {
  if (!evidence)
    return (
      <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 font-display text-[9px] tracking-[0.14em] text-faint">
        <HelpCircle className="size-3" /> NO RANK
      </span>
    );
  const e = EVIDENCE[evidence];
  const I = e.icon;
  return (
    <Tip content={e.tip}>
      <span tabIndex={0} className={cn("inline-flex cursor-help items-center gap-1 rounded border px-1.5 py-0.5 font-display text-[9px] tracking-[0.14em]", e.cls)}>
        <I className="size-3" /> {e.label}
      </span>
    </Tip>
  );
}

export function XpBar({ value, max, className, label, thin, color }: { value: number; max: number; className?: string; label?: string; thin?: boolean; color?: string }) {
  const reduce = useReducedMotion();
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn("relative w-full overflow-hidden rounded-full border border-line bg-bg/80", thin ? "h-1.5" : "h-3")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        aria-label={label ?? "Progress"}
      >
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", color ? "" : "xp-fill")}
          style={color ? { background: color, boxShadow: `0 0 12px ${color}` } : undefined}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        {!thin && <div className="xp-fill-shimmer absolute inset-0" />}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line/70 bg-bg/40 px-3 py-2.5", className)}>
      <div className="font-display text-[9px] uppercase tracking-[0.18em] text-faint">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold text-fg">{value}</div>
      {sub ? <div className="text-xs text-dim">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: I, title, children }: { icon?: React.ElementType; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-4 py-8 text-center">
      {I ? <I className="mb-2 size-7 text-faint" /> : null}
      <p className="sys-title text-[11px] text-dim">{title}</p>
      {children ? <div className="mt-2 max-w-md text-sm text-faint">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, kicker, children }: { title: string; kicker?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker ? <p className="font-display text-[10px] uppercase tracking-[0.3em] text-accent-2">{kicker}</p> : null}
        <h1 className="sys-title text-xl font-bold text-fg text-glow sm:text-2xl">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border border-line bg-bg/50 px-2 py-0.5 text-[11px] text-dim", className)}>{children}</span>;
}
