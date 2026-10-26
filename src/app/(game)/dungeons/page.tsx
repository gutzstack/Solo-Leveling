"use client";
import { AnimatePresence, motion } from "framer-motion";
import { DoorOpen, Pause, Play, Skull, Swords, Volume2, VolumeX, LogOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel, Pill, RankBadge } from "@/components/system/primitives";
import { newKey } from "@/lib/client/api";
import { play, startAmbient, stopAmbient } from "@/lib/client/sound";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { ACTIVITIES, ACTIVITY_BY_TYPE } from "@/lib/domain/activities";
import { CLEAR_THRESHOLD, DUNGEONS, DUNGEON_BY_CODE, DUNGEON_CLEAR_XP, POMODORO, type DungeonDef } from "@/lib/domain/dungeons";
import { displayUnit, formatDuration } from "@/lib/domain/units";

export default function DungeonsPage() {
  const { data } = useSnapshot();
  if (!data) return null;
  const active = data.activeSession;
  return (
    <div>
      <PageHeader title="Dungeons" kicker="Focus sessions & challenges" />
      {active ? <ActiveDungeon /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DUNGEONS.map((d) => (
          <DungeonCard key={d.code} d={d} disabled={Boolean(active)} />
        ))}
      </div>
      <Panel title="Recent Runs" className="mt-6">
        {data.recentSessions.filter((s) => s.status === "cleared" || s.status === "retreated").length ? (
          <ul className="divide-y divide-line/50">
            {data.recentSessions
              .filter((s) => s.status === "cleared" || s.status === "retreated")
              .slice(0, 12)
              .map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="flex-1 text-fg">{DUNGEON_BY_CODE[s.dungeon_code]?.name}</span>
                  <Pill>{s.status === "cleared" ? "cleared" : "retreated safely"}</Pill>
                  <span className="font-mono text-xs text-dim">{Math.floor(s.active_seconds / 60)} min</span>
                  <span className="font-mono text-xs text-faint">{s.ended_at?.slice(0, 10)}</span>
                  {s.xp_awarded ? <span className="font-mono text-xs text-accent">+{s.xp_awarded}</span> : null}
                </li>
              ))}
          </ul>
        ) : (
          <EmptyState icon={DoorOpen} title="No dungeons attempted yet" />
        )}
      </Panel>
    </div>
  );
}

function DungeonCard({ d, disabled }: { d: DungeonDef; disabled: boolean }) {
  const cmd = useCommand({ silent: true });
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(String(d.defaultMinutes));
  const [mode, setMode] = useState<"focus" | "pomodoro">(d.modes[0]);
  const [objective, setObjective] = useState("");
  const [activity, setActivity] = useState(d.activity);
  const [key] = useState(() => newKey("dg"));
  return (
    <Panel bodyClassName="flex h-full flex-col gap-3" className="flex flex-col">
      <div className="flex items-start gap-3">
        <RankBadge rank={d.difficulty} label={`Difficulty ${d.difficulty}`} />
        <div>
          <h3 className="font-semibold text-fg">{d.name}</h3>
          <p className="text-xs italic text-accent-2">{d.subtitle}</p>
        </div>
      </div>
      <p className="flex-1 text-sm text-dim">{d.objective}</p>
      <div className="flex flex-wrap gap-1.5">
        <Pill>{d.defaultMinutes} min</Pill>
        <Pill>clear +{DUNGEON_CLEAR_XP[d.difficulty]} XP</Pill>
        <Pill>{ACTIVITY_BY_TYPE[d.activity].name}</Pill>
        {d.modes.includes("pomodoro") ? <Pill>Pomodoro</Pill> : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button disabled={disabled}>
            <Swords /> Enter
          </Button>
        </DialogTrigger>
        <DialogContent title={`Enter: ${d.name}`} description={`Clear by completing at least ${Math.round(CLEAR_THRESHOLD * 100)}% of the planned time. You may pause at any time. Retreating keeps credit for 15+ focused minutes but costs XP.`}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              cmd.mutate(
                { type: "start_dungeon", code: d.code, minutes: Number(minutes), mode, objective, activity: d.code === "custom_gate" ? activity : undefined, idempotencyKey: key },
                {
                  onSuccess: () => {
                    setOpen(false);
                    play(d.kind === "boss" ? "boss" : "notify");
                  },
                },
              );
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minutes" htmlFor={`m-${d.code}`} hint={`${d.minMinutes}–${d.maxMinutes}`}>
                <Input id={`m-${d.code}`} type="number" min={d.minMinutes} max={d.maxMinutes} value={minutes} onChange={(e) => setMinutes(e.target.value)} required />
              </Field>
              <Field label="Mode" htmlFor={`mode-${d.code}`}>
                <Select id={`mode-${d.code}`} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  {d.modes.map((m) => (
                    <option key={m} value={m}>
                      {m === "focus" ? "Uninterrupted focus" : `Pomodoro (${POMODORO.work}/${POMODORO.rest})`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {d.code === "custom_gate" ? (
              <Field label="Counts as" htmlFor="cg-act">
                <Select id="cg-act" value={activity} onChange={(e) => setActivity(e.target.value)}>
                  {ACTIVITIES.filter((a) => a.requiresDuration).map((a) => (
                    <option key={a.type} value={a.type}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Objective (optional)" htmlFor={`o-${d.code}`}>
              <Input id={`o-${d.code}`} maxLength={180} placeholder={d.objective} value={objective} onChange={(e) => setObjective(e.target.value)} />
            </Field>
            {mode === "pomodoro" ? <p className="text-xs text-faint">Pomodoro: {POMODORO.work} min focus + {POMODORO.rest} min break cycles. Only focus minutes are credited.</p> : null}
            {cmd.error ? <p className="text-sm text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
            <Button type="submit" className="w-full" disabled={cmd.isPending}>
              Open the gate
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function ActiveDungeon() {
  const { data, dataUpdatedAt } = useSnapshot();
  const cmd = useCommand();
  const s = data!.activeSession!;
  const d = DUNGEON_BY_CODE[s.dungeon_code];
  const [now, setNow] = useState(() => Date.now());
  const [ambient, setAmbient] = useState(false);
  const [bossIntro, setBossIntro] = useState(() => d.kind === "boss" && Date.now() - Date.parse(s.started_at) < 15_000);
  const [finish, setFinish] = useState(false);
  const [distance, setDistance] = useState("");
  const [score, setScore] = useState("");
  const [volume, setVolume] = useState("");
  const units = data!.settings.unit_system;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => stopAmbient(), []);
  useEffect(() => {
    if (bossIntro) {
      const t = setTimeout(() => setBossIntro(false), 3200);
      return () => clearTimeout(t);
    }
  }, [bossIntro]);

  // Server reports activeSecondsNow at fetch time; extrapolate locally while running.
  const elapsed = s.status === "active" ? s.activeSecondsNow + Math.max(0, (now - dataUpdatedAt) / 1000) : s.activeSecondsNow;
  const planned = s.planned_minutes * 60;
  const remaining = Math.max(0, planned - elapsed);
  const pct = Math.min(1, elapsed / planned);
  const clearable = elapsed >= planned * CLEAR_THRESHOLD;
  const phase = useMemo(() => {
    if (s.mode !== "pomodoro") return null;
    const cycle = (POMODORO.work + POMODORO.rest) * 60;
    const into = elapsed % cycle;
    const n = Math.floor(elapsed / cycle) + 1;
    return into < POMODORO.work * 60 ? { label: `FOCUS · cycle ${n}`, left: POMODORO.work * 60 - into } : { label: `BREAK · cycle ${n}`, left: cycle - into };
  }, [elapsed, s.mode]);

  useEffect(() => {
    if (remaining === 0 && s.status === "active") play("clear");
  }, [remaining, s.status]);

  const R = 88;
  const C = 2 * Math.PI * R;
  const dist = displayUnit("distance", units);
  const mass = displayUnit("mass", units);

  return (
    <section className="sys-panel sys-panel-glow scanlines relative mb-6 overflow-hidden p-5 sm:p-7">
      <div className="holo-sheen" />
      <AnimatePresence>
        {bossIntro ? (
          <motion.div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/85" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBossIntro(false)}>
            <motion.div initial={{ scale: 0.3, rotate: -8 }} animate={{ scale: [0.3, 1.2, 1], rotate: 0 }} transition={{ duration: 1.2 }}>
              <Skull className="size-24 text-red-400 drop-shadow-[0_0_24px_rgba(248,113,113,0.8)]" />
            </motion.div>
            <p className="mt-4 font-display text-sm tracking-[0.4em] text-red-300">[WARNING] BOSS ENCOUNTER</p>
            <p className="mt-1 font-display text-2xl font-black text-fg">{d.boss}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr]">
        <div className="relative mx-auto size-52">
          <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="100" cy="100" r={R} fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle cx="100" cy="100" r={R} fill="none" stroke="url(#dg)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset 0.5s linear", filter: "drop-shadow(0 0 6px var(--glow))" }} />
            <defs>
              <linearGradient id="dg" x1="0" x2="1">
                <stop offset="0" stopColor="#38bdf8" />
                <stop offset="1" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center" role="timer" aria-live="off" aria-label={`Time remaining ${formatDuration(remaining)}`}>
            <span className="font-mono text-4xl font-semibold text-fg">{formatDuration(remaining)}</span>
            <span className="font-display text-[9px] tracking-[0.2em] text-dim">{s.status === "paused" ? "PAUSED" : remaining === 0 ? "TIME REACHED" : "REMAINING"}</span>
            {phase ? <span className="mt-1 font-display text-[9px] tracking-[0.18em] text-accent-2">{phase.label} · {formatDuration(phase.left)}</span> : null}
          </div>
        </div>
        <div>
          <p className="font-display text-[10px] tracking-[0.3em] text-accent text-glow">[DUNGEON IN PROGRESS]</p>
          <h2 className="mt-1 text-2xl font-bold text-fg">{d.name}</h2>
          <p className="text-sm italic text-accent-2">{d.subtitle}</p>
          <p className="mt-2 text-sm text-dim">Objective: {s.objective || d.objective}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <RankBadge rank={d.difficulty} size="sm" />
            <Pill>{formatDuration(elapsed)} active of {s.planned_minutes} min</Pill>
            <Pill>{s.mode === "pomodoro" ? "Pomodoro" : "Uninterrupted"}</Pill>
            {s.pause_count ? <Pill>{s.pause_count} pause{s.pause_count === 1 ? "" : "s"}</Pill> : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {s.status === "active" ? (
              <Button variant="outline" onClick={() => cmd.mutate({ type: "pause_dungeon", sessionId: s.id })} disabled={cmd.isPending}>
                <Pause /> Pause
              </Button>
            ) : (
              <Button onClick={() => cmd.mutate({ type: "resume_dungeon", sessionId: s.id })} disabled={cmd.isPending}>
                <Play /> Resume
              </Button>
            )}
            <Button variant="success" disabled={!clearable || cmd.isPending} onClick={() => (d.completionInput || d.activity === "workout" ? setFinish(true) : cmd.mutate({ type: "complete_dungeon", sessionId: s.id }))}>
              <Swords /> {clearable ? "Clear dungeon" : `Clear at ${Math.round(CLEAR_THRESHOLD * 100)}%`}
            </Button>
            <Button variant="ghost" onClick={() => confirm("Retreat? You keep credit for focused time of 15+ minutes, but retreating costs XP.") && cmd.mutate({ type: "retreat_dungeon", sessionId: s.id })} disabled={cmd.isPending}>
              <LogOut /> Retreat
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={ambient ? "Stop ambient soundtrack" : "Play ambient soundtrack"}
              aria-pressed={ambient}
              onClick={() => {
                if (ambient) stopAmbient();
                else startAmbient();
                setAmbient(!ambient);
              }}
            >
              {ambient ? <Volume2 /> : <VolumeX />}
            </Button>
          </div>
          {cmd.error ? <p className="mt-2 text-sm text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
        </div>
      </div>
      <Dialog open={finish} onOpenChange={setFinish}>
        <DialogContent title="Dungeon clear report" description="Optional details for your stats.">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              cmd.mutate(
                {
                  type: "complete_dungeon",
                  sessionId: s.id,
                  distanceKm: distance ? dist.fromDisplay(Number(distance)) : null,
                  scorePct: score ? Number(score) : null,
                  volumeKg: volume ? mass.fromDisplay(Number(volume)) : null,
                },
                { onSuccess: () => setFinish(false) },
              );
            }}
          >
            {d.completionInput === "distance" ? (
              <Field label={`Distance (${dist.label})`} htmlFor="fin-d">
                <Input id="fin-d" type="number" step="any" min={0} value={distance} onChange={(e) => setDistance(e.target.value)} />
              </Field>
            ) : null}
            {d.completionInput === "score" ? (
              <Field label="Practice exam score (%)" htmlFor="fin-s" hint="Saved as a knowledge-assessment entry.">
                <Input id="fin-s" type="number" min={0} max={100} step="any" value={score} onChange={(e) => setScore(e.target.value)} />
              </Field>
            ) : null}
            {d.activity === "workout" ? (
              <Field label={`Training volume (${mass.label}, optional)`} htmlFor="fin-v">
                <Input id="fin-v" type="number" min={0} step="any" value={volume} onChange={(e) => setVolume(e.target.value)} />
              </Field>
            ) : null}
            <Button type="submit" className="w-full" disabled={cmd.isPending}>
              Claim clear
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
