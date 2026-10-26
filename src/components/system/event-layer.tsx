"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Award, BookMarked, ChevronsUp, Crown, Info, Network, ScrollText, Skull, Sparkles, Swords, Zap } from "lucide-react";
import { useEffect, useMemo } from "react";
import { ATTRIBUTE_BY_CODE } from "@/lib/domain/attributes";
import type { AttributeCode } from "@/lib/domain/types";
import type { GameEvent } from "@/lib/game/commands";
import { dismissEvent, useEventQueue, type QueuedEvent } from "@/lib/client/events";
import { play } from "@/lib/client/sound";
import { cn } from "@/lib/utils";
import { RankBadge } from "./primitives";

const OVERLAY_TYPES = new Set(["level_up", "chapter_complete"]);
function isOverlay(e: GameEvent): boolean {
  if (OVERLAY_TYPES.has(e.type)) return true;
  if (e.type === "rank_up" && e.scope === "hunter") return true;
  if (e.type === "dungeon_clear" && e.boss) return true;
  if (e.type === "achievement" && (e.rarity === "legendary" || e.rarity === "mythic")) return true;
  if (e.type === "penalty" && e.zone) return true;
  return false;
}

function sfxFor(e: GameEvent) {
  switch (e.type) {
    case "level_up":
      return "levelup" as const;
    case "rank_up":
      return "rankup" as const;
    case "achievement":
    case "title_unlocked":
    case "skill":
      return "achievement" as const;
    case "dungeon_clear":
      return "clear" as const;
    case "xp":
    case "quest_complete":
      return "xp" as const;
    case "duplicate_warning":
    case "penalty":
      return "error" as const;
    default:
      return "notify" as const;
  }
}

export function EventLayer() {
  const queue = useEventQueue();
  const overlay = useMemo(() => queue.find((q) => isOverlay(q.event)) ?? null, [queue]);
  const toasts = useMemo(() => queue.filter((q) => !isOverlay(q.event) && q.event.type !== "daily_login").slice(0, 5), [queue]);

  // Daily-login events are handled by the DailyLogin overlay; drop them here once rendered.
  useEffect(() => {
    for (const q of queue) if (q.event.type === "daily_login") setTimeout(() => dismissEvent(q.id), 50);
  }, [queue]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-96" aria-live="polite" role="status">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <Toast key={t.id} item={t} />
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>{overlay ? <Overlay key={overlay.id} item={overlay} /> : null}</AnimatePresence>
    </>
  );
}

function toastContent(e: GameEvent): { tag: string; title: string; body?: string; icon: React.ElementType; tone: string } | null {
  switch (e.type) {
    case "xp":
      return { tag: "[EXPERIENCE]", title: `+${e.amount} XP`, body: e.reason + (e.attribute ? ` · ${e.attribute}` : ""), icon: Zap, tone: "text-sky-300" };
    case "xp_withheld":
      return { tag: "[SYSTEM]", title: "Recorded", body: e.reason, icon: Info, tone: "text-dim" };
    case "personal_record":
      return { tag: "[NEW PERSONAL RECORD]", title: e.name, body: "You have surpassed your previous limit.", icon: Sparkles, tone: "text-amber-300" };
    case "baseline":
      return { tag: "[BASELINE ESTABLISHED]", title: e.name, body: "Future entries will be measured against this.", icon: Info, tone: "text-sky-300" };
    case "achievement":
      return { tag: "[ACHIEVEMENT UNLOCKED]", title: e.name, body: `${e.description} +${e.xp} XP`, icon: Award, tone: "text-violet-300" };
    case "skill":
      return { tag: "[SKILL ACQUIRED]", title: e.name, body: `+${e.xp} XP`, icon: Network, tone: "text-cyan-300" };
    case "quest_complete":
      return { tag: "[QUEST COMPLETE]", title: e.title, body: `+${e.xp} XP`, icon: ScrollText, tone: "text-emerald-300" };
    case "title_unlocked":
      return { tag: "[TITLE ACQUIRED]", title: e.name, body: "Equip it in ACHIEVEMENTS → Titles.", icon: Crown, tone: "text-amber-300" };
    case "attribute_level_up":
      return { tag: "[ATTRIBUTE INCREASE]", title: `${ATTRIBUTE_BY_CODE[e.attribute as AttributeCode]?.name ?? e.attribute}: Lv ${e.to}`, body: "Your growth has been recorded.", icon: ChevronsUp, tone: "text-sky-300" };
    case "rank_up":
      return { tag: "[RANK UP]", title: `${e.name}: ${e.from ?? "–"} → ${e.to}`, body: e.scope === "metric" ? "Your ranking has risen." : "Attribute rank increased.", icon: ChevronsUp, tone: "text-fuchsia-300" };
    case "dungeon_clear":
      return { tag: "[DUNGEON CLEARED]", title: e.name, body: e.xp ? `Clear bonus +${e.xp} XP${e.uninterrupted ? " · Unbroken" : ""}` : undefined, icon: Swords, tone: "text-emerald-300" };
    case "dungeon_retreat":
      return {
        tag: "[RETREAT]",
        title: e.name,
        body: [e.creditedMinutes ? `${e.creditedMinutes} minutes credited.` : "No minutes credited.", e.penalty ? `Retreat penalty −${e.penalty} XP.` : ""].filter(Boolean).join(" "),
        icon: Info,
        tone: e.penalty ? "text-red-300" : "text-sky-300",
      };
    case "penalty":
      return { tag: "[PENALTY]", title: e.xp ? `${e.title}: −${e.xp} XP` : e.title, body: e.body, icon: Skull, tone: "text-red-300" };
    case "duplicate_warning":
      return { tag: "[WARNING]", title: "Possible duplicate", body: e.message, icon: AlertTriangle, tone: "text-amber-300" };
    case "info":
      return { tag: "[SYSTEM]", title: e.title, body: e.body, icon: Info, tone: "text-sky-300" };
    default:
      return null;
  }
}

function Toast({ item }: { item: QueuedEvent }) {
  const reduce = useReducedMotion();
  const c = toastContent(item.event);
  useEffect(() => {
    play(sfxFor(item.event));
    const t = setTimeout(() => dismissEvent(item.id), item.event.type === "xp" ? 3500 : 6000);
    return () => clearTimeout(t);
  }, [item]);
  if (!c) return null;
  const I = c.icon;
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40 }}
      className="sys-panel sys-panel-glow pointer-events-auto w-full cursor-pointer px-3.5 py-3"
      onClick={() => dismissEvent(item.id)}
    >
      <div className="flex gap-3">
        <I className={cn("mt-0.5 size-5 shrink-0", c.tone)} />
        <div className="min-w-0">
          <p className={cn("font-display text-[9px] tracking-[0.2em]", c.tone)}>{c.tag}</p>
          <p className="truncate font-semibold text-fg">{c.title}</p>
          {c.body ? <p className="text-sm text-dim">{c.body}</p> : null}
        </div>
      </div>
    </motion.div>
  );
}

function Overlay({ item }: { item: QueuedEvent }) {
  const reduce = useReducedMotion();
  const e = item.event;
  useEffect(() => {
    play(e.type === "dungeon_clear" ? "boss" : sfxFor(e));
    const t = setTimeout(() => dismissEvent(item.id), 5200);
    return () => clearTimeout(t);
  }, [item, e]);

  let tag = "";
  let big: React.ReactNode = null;
  let line = "";
  switch (e.type) {
    case "level_up":
      tag = "[LEVEL UP]";
      big = (
        <div className="flex items-baseline gap-4 font-display font-black">
          <span className="text-4xl text-faint">{e.from}</span>
          <span className="text-3xl text-dim">→</span>
          <span className="text-7xl text-sky-300 text-glow sm:text-8xl">{e.to}</span>
        </div>
      );
      line = "Your strength has grown. New limits await.";
      break;
    case "rank_up":
      tag = "[HUNTER RANK UP]";
      big = (
        <div className="flex items-center gap-5">
          <RankBadge rank={e.from} size="lg" dim />
          <span className="font-display text-3xl text-dim">→</span>
          <RankBadge rank={e.to} size="xl" />
        </div>
      );
      line = "The System has re-evaluated you.";
      break;
    case "chapter_complete":
      tag = e.final ? "[STORY ARC COMPLETE]" : "[MAIN QUEST UPDATED]";
      big = <BookMarked className="size-20 text-violet-300" />;
      line = `${e.questTitle}: ${e.chapter}${e.final ? ". The arc is complete." : ". The next chapter is unlocked."}`;
      break;
    case "dungeon_clear":
      tag = "[BOSS DEFEATED]";
      big = <Skull className="size-24 text-red-300" />;
      line = `${e.boss ?? e.name} has fallen.${e.xp ? ` +${e.xp} XP` : ""}`;
      break;
    case "penalty":
      tag = "[PENALTY ZONE]";
      big = <Skull className="size-24 text-red-400" />;
      line = e.body;
      break;
    case "achievement":
      tag = `[${e.rarity.toUpperCase()} ACHIEVEMENT]`;
      big = <Award className="size-24 text-amber-300" />;
      line = `${e.name}: ${e.description}`;
      break;
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex cursor-pointer items-center justify-center bg-black/75 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => dismissEvent(item.id)}
      role="dialog"
      aria-label={tag}
    >
      {!reduce && (
        <motion.div
          className="pointer-events-none absolute size-[70vmin] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.35), rgba(139,92,246,0.15) 45%, transparent 70%)" }}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 1.2, 1], opacity: [0, 1, 0.7] }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />
      )}
      <motion.div
        className="sys-panel sys-panel-glow relative flex w-full max-w-md flex-col items-center gap-5 px-6 py-8 text-center"
        initial={reduce ? false : { scale: 0.7, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 16 }}
      >
        <p className="font-display text-xs tracking-[0.35em] text-accent text-glow">{tag}</p>
        {big}
        <p className="text-lg text-fg">{line}</p>
        <p className="text-xs text-faint">Tap to continue</p>
      </motion.div>
    </motion.div>
  );
}
