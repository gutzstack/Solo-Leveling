"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Brain, Coins, DoorOpen, Gauge, Gem, Hexagon, LineChart, Loader2, Medal, Network, ScrollText, Settings, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ParticleField } from "@/components/system/particles";
import { RankBadge, XpBar } from "@/components/system/primitives";
import { NotificationsDialog } from "@/components/game/notifications";
import { ApiError } from "@/lib/client/api";
import { setSoundEnabled } from "@/lib/client/sound";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { cn } from "@/lib/utils";
import type { GameEvent } from "@/lib/game/commands";

const NAV = [
  { href: "/status", label: "Status", icon: Gauge },
  { href: "/attributes", label: "Attributes", icon: Hexagon },
  { href: "/quests", label: "Quests", icon: ScrollText },
  { href: "/rewards", label: "Rewards", icon: Gem },
  { href: "/dungeons", label: "Dungeons", icon: DoorOpen },
  { href: "/trials", label: "Trials", icon: Brain },
  { href: "/skills", label: "Skills", icon: Network },
  { href: "/achievements", label: "Achievements", icon: Trophy },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/rankings", label: "Rankings", icon: Medal },
  { href: "/system", label: "System", icon: Settings },
];

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const { data, error, isLoading } = useSnapshot();
  const router = useRouter();
  const pathname = usePathname();
  const login = useCommand({ silent: true });
  const [daily, setDaily] = useState<Extract<GameEvent, { type: "daily_login" }> | null>(null);
  const loginSent = useRef(false);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace(`/?next=${encodeURIComponent(pathname)}`);
  }, [error, router, pathname]);

  const onboarded = Boolean(data?.profile.onboarded_at);
  useEffect(() => {
    if (data && !onboarded) router.replace("/awakening");
  }, [data, onboarded, router]);

  // Theme, motion and sound preferences
  useEffect(() => {
    if (!data) return;
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.dataset.reducedMotion = String(data.settings.reduced_motion);
    setSoundEnabled(data.settings.sound_enabled);
  }, [data]);

  // Daily login sequence (once per app load; the server decides whether it's the first today)
  useEffect(() => {
    if (!onboarded || loginSent.current) return;
    loginSent.current = true;
    login.mutate(
      { type: "daily_login" },
      {
        onSuccess: (r) => {
          const e = r.events.find((x): x is Extract<GameEvent, { type: "daily_login" }> => x.type === "daily_login");
          if (e?.firstToday) setDaily(e);
        },
      },
    );
  }, [onboarded, login]);

  if (isLoading || !data || !onboarded) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ParticleField />
        <div className="flex flex-col items-center gap-3 text-dim">
          <Loader2 className="size-6 animate-spin text-accent" />
          <p className="sys-title text-[11px]">{error && !(error instanceof ApiError && error.status === 401) ? `System error: ${(error as Error).message}` : "Synchronizing with the System…"}</p>
        </div>
      </div>
    );
  }

  const unread = data.notifications.filter((n) => !n.read_at).length;

  return (
    <div className="min-h-dvh">
      <ParticleField reduced={data.settings.reduced_motion} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded focus:bg-panel-solid focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line/70 bg-bg/70 backdrop-blur-xl lg:flex">
        <Link href="/status" className="px-6 pb-4 pt-6">
          <span className="sys-title text-lg font-black text-fg text-glow">SYSTEM</span>
          <span className="ml-1 font-display text-xs text-accent-2">IRL</span>
        </Link>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            const I = n.icon;
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("group flex items-center gap-3 rounded-lg px-3 py-2.5 font-display text-[11px] uppercase tracking-[0.18em] transition-all", active ? "bg-accent/15 text-accent shadow-[0_0_18px_-8px_var(--glow)]" : "text-dim hover:bg-accent/5 hover:text-fg")}>
                <I className={cn("size-4", active && "drop-shadow-[0_0_6px_var(--glow)]")} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line/70 p-4">
          <PlayerChip compact={false} />
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/70 backdrop-blur-xl lg:pl-60">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/status" className="lg:hidden">
            <span className="sys-title text-sm font-black text-fg text-glow">SYSTEM</span>
          </Link>
          <div className="hidden flex-1 lg:block" />
          <div className="flex flex-1 items-center justify-end gap-3 lg:flex-none">
            <div className="hidden min-w-48 sm:block">
              <div className="mb-1 flex justify-between font-mono text-[10px] text-dim">
                <span>LV {data.player.level.level}</span>
                <span>
                  {data.player.level.xpIntoLevel.toLocaleString()} / {data.player.level.xpForNext.toLocaleString()} XP
                </span>
              </div>
              <XpBar value={data.player.level.xpIntoLevel} max={data.player.level.xpForNext} thin label="Experience toward next level" />
            </div>
            {data.rewards.enabled ? (
              <Link href="/rewards" className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 px-2.5 py-1.5 font-mono text-xs text-amber-300 hover:bg-amber-400/10 light:text-amber-800" aria-label={`${data.rewards.balance} gold`}>
                <Coins className="size-3.5" />
                {data.rewards.balance.toLocaleString()}
                {data.rewards.multiplier > 1 ? <span className="text-[10px] text-amber-200/80 light:text-amber-700">×{data.rewards.multiplier}</span> : null}
              </Link>
            ) : null}
            <RankBadge rank={data.hunter.rank} size="sm" label={`Hunter rank ${data.hunter.rank ?? "unranked"}`} />
            <NotificationsDialog>
              <button className="relative rounded-lg border border-line p-2 text-dim hover:text-fg" aria-label={`Notifications (${unread} unread)`}>
                <Bell className="size-4" />
                {unread ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 font-mono text-[10px] leading-4 text-bg">{unread > 9 ? "9+" : unread}</span> : null}
              </button>
            </NotificationsDialog>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pl-[calc(15rem+1.5rem)]">
        <AnimatePresence mode="wait">
          <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: data.settings.reduced_motion ? 0 : 0.25 }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Main">
        <div className="no-scrollbar flex overflow-x-auto px-1">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            const I = n.icon;
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex min-w-[4.4rem] flex-1 flex-col items-center gap-1 px-1 py-2 font-display text-[8.5px] uppercase tracking-[0.12em]", active ? "text-accent" : "text-faint")}>
                <I className={cn("size-5", active && "drop-shadow-[0_0_6px_var(--glow)]")} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>{daily ? <DailyLogin event={daily} name={data.profile.display_name} onClose={() => setDaily(null)} /> : null}</AnimatePresence>
    </div>
  );

  function PlayerChip({ compact }: { compact: boolean }) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-line-strong bg-accent/10 font-display text-sm font-bold text-accent">{data!.player.level.level}</div>
        {!compact && (
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{data!.profile.display_name}</p>
            <p className="truncate text-xs text-accent-2">{data!.player.equippedTitle?.name ?? "No title equipped"}</p>
          </div>
        )}
      </div>
    );
  }
}

function DailyLogin({ event, name, onClose }: { event: Extract<GameEvent, { type: "daily_login" }>; name: string; onClose: () => void }) {
  const pen = event.penalties;
  useEffect(() => {
    const t = setTimeout(onClose, pen ? 12000 : 6500);
    return () => clearTimeout(t);
  }, [onClose, pen]);
  return (
    <motion.div className="fixed inset-0 z-[75] flex cursor-pointer items-center justify-center bg-black/70 p-6 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-label="Daily login">
      <motion.div className="sys-panel sys-panel-glow scanlines relative w-full max-w-sm overflow-hidden p-6 text-center" initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }}>
        <div className="holo-sheen" />
        <p className="font-display text-[10px] tracking-[0.35em] text-accent text-glow">[DAILY LOGIN]</p>
        <p className="mt-4 text-lg text-fg">Welcome back, {name}.</p>
        <p className="mt-1 font-display text-5xl font-black text-sky-300 text-glow">{event.streak}</p>
        <p className="font-display text-[10px] tracking-[0.25em] text-dim">DAY LOGIN STREAK</p>
        <p className="mt-4 text-sm text-dim">{event.newQuests ? `${event.newQuests} new daily quests have appeared.` : "Your quest board is ready."}</p>
        {pen ? (
          <div className="mt-4 rounded-lg border border-red-500/60 bg-red-950/40 p-3 text-left light:bg-red-50">
            <p className="font-display text-[10px] tracking-[0.3em] text-red-400">[PENALTY]</p>
            {pen.failed.length ? <p className="mt-1 text-sm text-fg">{pen.failed.length} quest{pen.failed.length === 1 ? "" : "s"} failed: {pen.failed.slice(0, 4).join(", ")}{pen.failed.length > 4 ? "…" : ""}</p> : null}
            {pen.zoneFailed ? <p className="mt-1 text-sm text-fg">You failed the Penalty Zone.</p> : null}
            {pen.xp ? <p className="mt-1 font-mono text-sm text-red-300 light:text-red-700">−{pen.xp} XP</p> : null}
            {pen.zone ? <p className="mt-2 text-sm text-red-300 light:text-red-700">The Penalty Zone is open. Finish yesterday&apos;s work before midnight.</p> : null}
          </div>
        ) : null}
        <p className="mt-4 text-xs text-faint">Tap to continue</p>
      </motion.div>
    </motion.div>
  );
}
