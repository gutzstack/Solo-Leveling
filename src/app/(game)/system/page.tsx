"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LogOut, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Slider, Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Panel, Pill } from "@/components/system/primitives";
import { api } from "@/lib/client/api";
import { pushInfo } from "@/lib/client/events";
import { SNAPSHOT_KEY, useCommand, useSnapshot } from "@/lib/client/use-game";
import { ACTIVITIES } from "@/lib/domain/activities";
import { ATTRIBUTES } from "@/lib/domain/attributes";
import { CATEGORY_INFO, PENALTY_MULTIPLIER, QUEST_CATEGORIES, questPenalty, resolveRegimen, WEEKDAY_NAMES, type Regimen } from "@/lib/domain/regimen";
import { ATTRIBUTE_CODES, type AttributeCode } from "@/lib/domain/types";
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from "@/lib/domain/units";
import { totalXpForLevel, xpToNextLevel } from "@/lib/domain/xp";
import type { PlayerSnapshot } from "@/lib/server/game/snapshot";

export default function SystemPage() {
  const { data } = useSnapshot();
  if (!data) return null;
  return (
    <div>
      <PageHeader title="System" kicker="Settings & profile" />
      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="regimen">Regimen</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileForm s={data} />
        </TabsContent>
        <TabsContent value="regimen">
          <RegimenForm s={data} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsForm s={data} />
        </TabsContent>
        <TabsContent value="scoring">
          <ScoringForm s={data} />
        </TabsContent>
        <TabsContent value="data">
          <DataPanel />
        </TabsContent>
        <TabsContent value="integrations">
          <Integrations />
        </TabsContent>
        <TabsContent value="account">
          <Account s={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileForm({ s }: { s: PlayerSnapshot }) {
  const cmd = useCommand();
  const p = s.profile;
  const imperial = s.settings.unit_system === "imperial";
  const fi = p.height_cm ? cmToFeetInches(p.height_cm) : { feet: 0, inches: 0 };
  const [f, setF] = useState({
    display_name: p.display_name,
    date_of_birth: p.date_of_birth ?? "",
    age_years: p.age_years ? String(p.age_years) : "",
    sex: p.sex ?? "",
    country: p.country,
    timezone: p.timezone,
    ft: String(fi.feet || ""),
    inch: String(Math.round(fi.inches) || ""),
    cm: p.height_cm ? String(p.height_cm) : "",
    weight: p.weight_kg ? String(Math.round((imperial ? kgToLb(p.weight_kg) : p.weight_kg) * 10) / 10) : "",
    education_level: p.education_level ?? "",
    occupation: p.occupation ?? "",
    fitness_experience: p.fitness_experience ?? "",
    goals: p.goals.join("\n"),
    program: p.academic_info?.program ?? "",
    year: p.academic_info?.year ?? "",
    nextExamDate: p.academic_info?.nextExamDate ?? "",
    nextExamName: p.academic_info?.nextExamName ?? "",
    ef: String(p.financial_info?.emergencyFundTargetMonths ?? 6),
    difficulty: p.difficulty,
    tracked: p.tracked_categories,
  });
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  function save(e: React.FormEvent) {
    e.preventDefault();
    const h = imperial ? (f.ft ? feetInchesToCm(Number(f.ft), Number(f.inch) || 0) : null) : f.cm ? Number(f.cm) : null;
    const w = f.weight ? (imperial ? lbToKg(Number(f.weight)) : Number(f.weight)) : null;
    cmd.mutate(
      {
        type: "update_profile",
        profile: {
          display_name: f.display_name,
          date_of_birth: f.date_of_birth || null,
          age_years: f.date_of_birth ? null : f.age_years ? Number(f.age_years) : null,
          sex: (f.sex || null) as "male" | "female" | null,
          country: f.country,
          timezone: f.timezone,
          height_cm: h ? Math.round(h * 10) / 10 : null,
          weight_kg: w ? Math.round(w * 1000) / 1000 : null,
          education_level: f.education_level || null,
          occupation: f.occupation || null,
          fitness_experience: f.fitness_experience || null,
          goals: f.goals.split("\n").map((g) => g.trim()).filter(Boolean).slice(0, 12),
          academic_info: { program: f.program || undefined, year: f.year || undefined, nextExamDate: f.nextExamDate || null, nextExamName: f.nextExamName || null },
          financial_info: { ...p.financial_info, emergencyFundTargetMonths: Number(f.ef) || 6 },
          difficulty: f.difficulty,
          tracked_categories: f.tracked,
        },
      },
      { onSuccess: () => pushInfo("Profile updated", "The System has recorded your changes.") },
    );
  }
  return (
    <Panel title="Player profile" subtitle="Everything is editable. Only age (or date of birth) is needed for age-matched comparisons.">
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Player name" htmlFor="p-name">
          <Input id="p-name" value={f.display_name} onChange={(e) => set("display_name", e.target.value)} maxLength={40} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth" htmlFor="p-dob">
            <Input id="p-dob" type="date" value={f.date_of_birth} max={s.today} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
          <Field label="or Age" htmlFor="p-age">
            <Input id="p-age" type="number" min={13} max={120} value={f.age_years} disabled={Boolean(f.date_of_birth)} onChange={(e) => set("age_years", e.target.value)} />
          </Field>
        </div>
        <Field label="Sex (optional, for physical benchmarks)" htmlFor="p-sex">
          <Select id="p-sex" value={f.sex} onChange={(e) => set("sex", e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country" htmlFor="p-country">
            <Input id="p-country" value={f.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="Time zone" htmlFor="p-tz">
            <Input id="p-tz" value={f.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </Field>
        </div>
        {imperial ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Height ft" htmlFor="p-ft">
              <Input id="p-ft" type="number" value={f.ft} onChange={(e) => set("ft", e.target.value)} />
            </Field>
            <Field label="in" htmlFor="p-in">
              <Input id="p-in" type="number" value={f.inch} onChange={(e) => set("inch", e.target.value)} />
            </Field>
            <Field label="Weight lb" htmlFor="p-wt">
              <Input id="p-wt" type="number" step="0.1" value={f.weight} onChange={(e) => set("weight", e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Height cm" htmlFor="p-cm">
              <Input id="p-cm" type="number" step="0.1" value={f.cm} onChange={(e) => set("cm", e.target.value)} />
            </Field>
            <Field label="Weight kg" htmlFor="p-wt">
              <Input id="p-wt" type="number" step="0.1" value={f.weight} onChange={(e) => set("weight", e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Education level" htmlFor="p-edu">
          <Input id="p-edu" value={f.education_level} onChange={(e) => set("education_level", e.target.value)} />
        </Field>
        <Field label="Occupation / student status" htmlFor="p-occ">
          <Input id="p-occ" value={f.occupation} onChange={(e) => set("occupation", e.target.value)} />
        </Field>
        <Field label="Program" htmlFor="p-prog">
          <Input id="p-prog" value={f.program} onChange={(e) => set("program", e.target.value)} />
        </Field>
        <Field label="Year / phase" htmlFor="p-year">
          <Input id="p-year" value={f.year} onChange={(e) => set("year", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Next exam date" htmlFor="p-exd">
            <Input id="p-exd" type="date" value={f.nextExamDate} onChange={(e) => set("nextExamDate", e.target.value)} />
          </Field>
          <Field label="Exam name" htmlFor="p-exn">
            <Input id="p-exn" value={f.nextExamName} onChange={(e) => set("nextExamName", e.target.value)} />
          </Field>
        </div>
        <Field label="Fitness experience" htmlFor="p-fit">
          <Input id="p-fit" value={f.fitness_experience} onChange={(e) => set("fitness_experience", e.target.value)} />
        </Field>
        <Field label="Goals (one per line)" htmlFor="p-goals">
          <Textarea id="p-goals" rows={5} value={f.goals} onChange={(e) => set("goals", e.target.value)} />
        </Field>
        <div className="space-y-3">
          <Field label="Difficulty" htmlFor="p-diff">
            <Select id="p-diff" value={f.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
              <option value="casual">Casual</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
              <option value="nightmare">Nightmare</option>
            </Select>
          </Field>
          <Field label="Emergency-fund goal (months)" htmlFor="p-ef">
            <Input id="p-ef" type="number" min={1} max={24} value={f.ef} onChange={(e) => set("ef", e.target.value)} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <p className="mb-2 font-display text-[10px] tracking-[0.18em] text-dim">TRACKED CATEGORIES</p>
          <div className="flex flex-wrap gap-2">
            {ATTRIBUTES.map((a) => {
              const on = f.tracked.includes(a.code);
              return (
                <Button key={a.code} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => set("tracked", on ? f.tracked.filter((x) => x !== a.code) : [...f.tracked, a.code])}>
                  {a.code}
                </Button>
              );
            })}
          </div>
        </div>
        {cmd.error ? <p className="text-sm text-red-300 light:text-red-700 md:col-span-2">{cmd.error.message}</p> : null}
        <div className="md:col-span-2">
          <Button type="submit" disabled={cmd.isPending}>
            Save profile
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/40 py-3 last:border-0">
      <div>
        <p className="text-fg">{label}</p>
        {hint ? <p className="text-xs text-faint">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function RegimenForm({ s }: { s: PlayerSnapshot }) {
  const cmd = useCommand({ silent: true });
  const [r, setR] = useState<Regimen>(() => resolveRegimen(s.settings.regimen));
  const [saved, setSaved] = useState(false);
  const imperial = s.settings.unit_system === "imperial";
  const unit = imperial ? "mi" : "km";
  const toDisp = (km: number) => Math.round((imperial ? km / 1.609344 : km) * 100) / 100;
  const fromDisp = (v: number) => Math.round((imperial ? v * 1.609344 : v) * 100) / 100;
  const num = (k: "pushups" | "situps" | "squats" | "dips" | "pullups", label: string) => (
    <Field label={label} htmlFor={`rg-${k}`}>
      <Input id={`rg-${k}`} type="number" min={0} max={1000} value={r[k]} onChange={(e) => setR((x) => ({ ...x, [k]: Math.max(0, Math.round(Number(e.target.value))) }))} />
    </Field>
  );
  const pr = r.progression;
  const setPr = (patch: Partial<Regimen["progression"]>) => setR((x) => ({ ...x, progression: { ...x.progression, ...patch } }));
  const setGoal = (patch: Partial<Regimen["progression"]["goal"]>) => setPr({ goal: { ...pr.goal, ...patch } });
  // This week so far, judged the way Monday's progression will judge it.
  const ws = (() => {
    const d = new Date(`${s.today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const week = s.quests.filter((q) => q.template_code === "daily_regimen" && q.period_start >= ws && q.status !== "exempt");
  const trainingDays = 7 - r.restDays.length;
  const mult = PENALTY_MULTIPLIER[s.profile.difficulty];
  const physicalObjectives = [r.pushups, r.situps, r.squats, r.dips, r.pullups, r.runKm].filter((v) => v > 0).length;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Daily regimen" subtitle="The targets behind your daily quests. Changes apply from tomorrow's board; today's quests keep their targets.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            cmd.mutate({ type: "update_settings", settings: { regimen: r } }, { onSuccess: () => setSaved(true) });
          }}
        >
          <p className="font-display text-[10px] tracking-[0.18em] text-dim">PHYSICAL · PREPARATIONS TO BECOME POWERFUL</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {num("pushups", "Push-ups")}
            {num("situps", "Sit-ups")}
            {num("squats", "Squats")}
            {num("dips", "Dips")}
            {num("pullups", "Pull-ups")}
            <Field label={`Run (${unit})`} htmlFor="rg-run">
              <Input id="rg-run" type="number" min={0} step={0.05} value={toDisp(r.runKm)} onChange={(e) => setR((x) => ({ ...x, runKm: Math.max(0, fromDisp(Number(e.target.value))) }))} />
            </Field>
          </div>
          <p className="text-xs text-faint">Today&apos;s targets. Set any to 0 to drop it. Log reps in as many sets as you like from the quest card.</p>
          <Field label="Rest days" hint="No training regimen on these days, just a recovery quest (rest, mobility or an easy walk).">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {WEEKDAY_NAMES.map((name, i) => {
                const day = i + 1;
                const on = r.restDays.includes(day);
                return (
                  <Button key={name} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on} disabled={!on && r.restDays.length >= 4} onClick={() => setR((x) => ({ ...x, restDays: on ? x.restDays.filter((d) => d !== day) : [...x.restDays, day].sort() }))}>
                    {name}
                  </Button>
                );
              })}
            </div>
          </Field>
          <p className="font-display text-[10px] tracking-[0.18em] text-dim">WEEKLY PROGRESSION</p>
          <Toggle label="Scale up automatically" hint={`Every Monday: clear the regimen on all but ${pr.allowedMisses} of last week's training days and every target rises one step; clear fewer than half and it steps back. Stops at the goal.`} checked={pr.enabled} onChange={(v) => setPr({ enabled: v })} />
          {pr.enabled ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Push-up/sit-up/squat step" htmlFor="pg-rep">
                  <Input id="pg-rep" type="number" min={0} max={50} value={pr.repStep} onChange={(e) => setPr({ repStep: Math.max(0, Math.round(Number(e.target.value))) })} />
                </Field>
                <Field label="Pull-up/dip step" htmlFor="pg-pull">
                  <Input id="pg-pull" type="number" min={0} max={50} value={pr.pullupStep} onChange={(e) => setPr({ pullupStep: Math.max(0, Math.round(Number(e.target.value))) })} />
                </Field>
                <Field label={`Run step (${unit})`} htmlFor="pg-run">
                  <Input id="pg-run" type="number" min={0} step={0.05} value={toDisp(pr.runStepKm)} onChange={(e) => setPr({ runStepKm: Math.max(0, fromDisp(Number(e.target.value))) })} />
                </Field>
                <Field label="Misses allowed" htmlFor="pg-miss">
                  <Input id="pg-miss" type="number" min={0} max={5} value={pr.allowedMisses} onChange={(e) => setPr({ allowedMisses: Math.max(0, Math.round(Number(e.target.value))) })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Goal: push-ups" htmlFor="pg-gpu">
                  <Input id="pg-gpu" type="number" min={0} max={1000} value={pr.goal.pushups} onChange={(e) => setGoal({ pushups: Math.max(0, Math.round(Number(e.target.value))) })} />
                </Field>
                <Field label="Goal: sit-ups" htmlFor="pg-gsu">
                  <Input id="pg-gsu" type="number" min={0} max={1000} value={pr.goal.situps} onChange={(e) => setGoal({ situps: Math.max(0, Math.round(Number(e.target.value))) })} />
                </Field>
                <Field label="Goal: squats" htmlFor="pg-gsq">
                  <Input id="pg-gsq" type="number" min={0} max={1000} value={pr.goal.squats} onChange={(e) => setGoal({ squats: Math.max(0, Math.round(Number(e.target.value))) })} />
                </Field>
                <Field label="Goal: dips" htmlFor="pg-gdp">
                  <Input id="pg-gdp" type="number" min={0} max={1000} value={pr.goal.dips} onChange={(e) => setGoal({ dips: Math.max(0, Math.round(Number(e.target.value))) })} />
                </Field>
                <Field label="Goal: pull-ups" htmlFor="pg-gpl">
                  <Input id="pg-gpl" type="number" min={0} max={1000} value={pr.goal.pullups} onChange={(e) => setGoal({ pullups: Math.max(0, Math.round(Number(e.target.value))) })} />
                </Field>
                <Field label={`Goal: run (${unit})`} htmlFor="pg-grun">
                  <Input id="pg-grun" type="number" min={0} step={0.05} value={toDisp(pr.goal.runKm)} onChange={(e) => setGoal({ runKm: Math.max(0, fromDisp(Number(e.target.value))) })} />
                </Field>
              </div>
              <p className="text-xs text-dim">
                This week: cleared {week.filter((q) => q.status === "completed").length} of {week.length} training days so far ({trainingDays} scheduled). Level up needs {Math.max(0, trainingDays - pr.allowedMisses)}.
              </p>
            </>
          ) : null}
          <p className="font-display text-[10px] tracking-[0.18em] text-dim">INTELLECTUAL</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Study minutes per day" htmlFor="rg-study" hint="Blank scales 90 minutes by difficulty.">
              <Input id="rg-study" type="number" min={0} max={600} step={15} placeholder="auto" value={r.studyMinutes ?? ""} onChange={(e) => setR((x) => ({ ...x, studyMinutes: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }))} />
            </Field>
            <Field label="Daily System Trial" htmlFor="rg-trial">
              <div className="pt-2">
                <Switch id="rg-trial" checked={r.dailyTrial} onCheckedChange={(v) => setR((x) => ({ ...x, dailyTrial: v }))} aria-label="Daily System Trial" />
              </div>
            </Field>
          </div>
          <p className="font-display text-[10px] tracking-[0.18em] text-dim">CATEGORIES</p>
          <div>
            {QUEST_CATEGORIES.map((c) => (
              <Toggle key={c} label={CATEGORY_INFO[c].name} hint={CATEGORY_INFO[c].blurb} checked={r.categories[c]} onChange={(v) => setR((x) => ({ ...x, categories: { ...x.categories, [c]: v } }))} />
            ))}
          </div>
          <Field label={`Recovery passes per week: ${r.recoveryPassesPerWeek}`} hint="On top of rest days: a pass waives one training day's physical quests with no penalty, for illness or injury. A waived day doesn't count against progression.">
            <Slider min={0} max={2} step={1} value={[r.recoveryPassesPerWeek]} onValueChange={([v]) => setR((x) => ({ ...x, recoveryPassesPerWeek: v }))} aria-label="Recovery passes per week" />
          </Field>
          {cmd.error ? <p className="text-sm text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
          {saved ? <p className="text-sm text-success">Saved. Tomorrow&apos;s board will use the new regimen.</p> : null}
          <Button type="submit" disabled={cmd.isPending}>
            Save regimen
          </Button>
        </form>
      </Panel>
      <Panel title="Penalties" subtitle={`Severity follows your difficulty (${s.profile.difficulty}: ×${mult}). Change it under Profile.`}>
        <ul className="space-y-2 text-sm text-dim">
          <li>
            <span className="text-fg">Failed daily quest:</span> lose the XP it would have paid (×{mult}). The training regimen is worth {s.xpConfig.dailyQuest * physicalObjectives} XP, so failing it costs {physicalObjectives ? questPenalty(s.xpConfig.dailyQuest * physicalObjectives, s.profile.difficulty) : 0} XP.
          </li>
          <li>
            <span className="text-fg">Penalty Zone:</span> the day after you fail daily quests, finish the unfinished reps, distance and minutes on top of the new day&apos;s quests. Failing it costs double.
          </li>
          <li>
            <span className="text-fg">Missed days:</span> days you don&apos;t open the app still count as failed (up to 7 days back).
          </li>
          <li>
            <span className="text-fg">Weekly quests, accepted emergency gates and custom quests:</span> failing or abandoning them costs their XP reward (×{mult}). Declining an emergency offer is free.
          </li>
          <li>
            <span className="text-fg">Dungeon retreat:</span> −{Math.max(1, Math.round(15 * mult))} XP. <span className="text-fg">Abandoned System Trial:</span> −{Math.max(1, Math.round(10 * mult))} XP.
          </li>
          <li>Penalties never take XP below zero. Main story quests have no deadline and no penalty.</li>
        </ul>
      </Panel>
    </div>
  );
}

function SettingsForm({ s }: { s: PlayerSnapshot }) {
  const cmd = useCommand({ silent: true });
  const st = s.settings;
  const upd = (settings: Parameters<typeof cmd.mutate>[0] extends infer C ? (C extends { type: "update_settings"; settings: infer X } ? X : never) : never) => cmd.mutate({ type: "update_settings", settings });
  return (
    <Panel title="Preferences">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-fg">Units</span>
        {(["imperial", "metric"] as const).map((u) => (
          <Button key={u} size="sm" variant={st.unit_system === u ? "default" : "outline"} aria-pressed={st.unit_system === u} onClick={() => upd({ unit_system: u })}>
            {u}
          </Button>
        ))}
      </div>
      <Toggle label="Light theme (high contrast)" hint="Accessibility alternative to the dark System interface." checked={st.theme === "light"} onChange={(v) => upd({ theme: v ? "light" : "dark" })} />
      <Toggle label="Reduced motion" hint="Disables particles, animated transitions and celebrations (your OS setting is also respected)." checked={st.reduced_motion} onChange={(v) => upd({ reduced_motion: v })} />
      <Toggle label="Sound effects" hint="Synthesized System notification sounds." checked={st.sound_enabled} onChange={(v) => upd({ sound_enabled: v })} />
      <Toggle label="AI System Guide" hint="Uses the configured LLM when available; otherwise the built-in deterministic guide." checked={st.ai_enabled} onChange={(v) => upd({ ai_enabled: v })} />
      <Toggle label="Sex-matched comparisons" hint="When off, compares you with all adults in your age band." checked={st.comparison_preference === "sex_matched"} onChange={(v) => upd({ comparison_preference: v ? "sex_matched" : "all" })} />
      <Toggle label="Public profile (future leaderboards)" hint="Private by default. No leaderboard exists yet, so turning this on only records your consent." checked={st.profile_public} onChange={(v) => upd({ profile_public: v })} />
    </Panel>
  );
}

function ScoringForm({ s }: { s: PlayerSnapshot }) {
  const cmd = useCommand();
  const x = s.xpConfig;
  const [base, setBase] = useState(x.levelBase);
  const [exp, setExp] = useState(x.levelExponent);
  const [rewards, setRewards] = useState({ metricLog: x.metricLog, personalRecord: x.personalRecord, dailyQuest: x.dailyQuest, dailyAllComplete: x.dailyAllComplete, weeklyQuest: x.weeklyQuest, mainChapter: x.mainChapter, emergencyQuest: x.emergencyQuest, prCooldownDays: x.prCooldownDays });
  const [overrides, setOverrides] = useState<Record<string, number>>(x.activityOverrides);
  const [weights, setWeights] = useState<Record<AttributeCode, number>>({ ...s.hunter.weights });
  const labels: Record<keyof typeof rewards, string> = { metricLog: "Measurement logged", personalRecord: "Personal record", dailyQuest: "Daily quest", dailyAllComplete: "All daily quests bonus", weeklyQuest: "Weekly quest", mainChapter: "Main-story chapter", emergencyQuest: "Emergency quest", prCooldownDays: "PR XP cooldown (days)" };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Level formula" subtitle="XP to next level = round(base × level^exponent)">
        <div className="space-y-4">
          <Field label={`Base: ${base}`}>
            <Slider min={25} max={400} step={5} value={[base]} onValueChange={([v]) => setBase(v)} aria-label="Level base" />
          </Field>
          <Field label={`Exponent: ${exp.toFixed(2)}`}>
            <Slider min={1} max={2.2} step={0.05} value={[exp]} onValueChange={([v]) => setExp(Math.round(v * 100) / 100)} aria-label="Level exponent" />
          </Field>
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-dim">
              <tr>
                <th className="py-1">Level</th>
                <th>To next</th>
                <th>Total to reach</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 5, 10, 20, 50, 100].map((l) => (
                <tr key={l} className="border-t border-line/40">
                  <td className="py-1">{l}</td>
                  <td>{xpToNextLevel(l, base, exp).toLocaleString()}</td>
                  <td>{totalXpForLevel(l, base, exp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-faint">Changing the formula recalculates levels from the same XP ledger. No XP is created or removed.</p>
        </div>
      </Panel>
      <Panel title="Rewards" subtitle="Configurable XP (effort is capped per day; performance requires real improvement)">
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(rewards) as (keyof typeof rewards)[]).map((k) => (
            <Field key={k} label={labels[k]} htmlFor={`rw-${k}`}>
              <Input id={`rw-${k}`} type="number" min={0} max={2000} value={rewards[k]} onChange={(e) => setRewards((r) => ({ ...r, [k]: Number(e.target.value) }))} />
            </Field>
          ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-dim">Activity XP overrides</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ACTIVITIES.map((a) => (
              <Field key={a.type} label={`${a.name} (default ${a.xp})`} htmlFor={`ov-${a.type}`}>
                <Input id={`ov-${a.type}`} type="number" min={0} max={500} placeholder={String(a.xp)} value={overrides[a.type] ?? ""} onChange={(e) => setOverrides((o) => { const n = { ...o }; if (e.target.value === "") delete n[a.type]; else n[a.type] = Number(e.target.value); return n; })} />
              </Field>
            ))}
          </div>
        </details>
      </Panel>
      <Panel title="Hunter Rank weights" subtitle="Relative weight of each attribute in the game-defined Hunter Rank (0 excludes it)" className="lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ATTRIBUTE_CODES.map((c) => (
            <Field key={c} label={`${c}: ${weights[c]}`}>
              <Slider min={0} max={5} step={0.5} value={[weights[c]]} onValueChange={([v]) => setWeights((w) => ({ ...w, [c]: v }))} aria-label={`${c} weight`} />
            </Field>
          ))}
        </div>
      </Panel>
      <div className="lg:col-span-2">
        <Button
          disabled={cmd.isPending}
          onClick={() =>
            cmd.mutate(
              { type: "update_settings", settings: { xp_config: { ...x, levelBase: base, levelExponent: exp, ...rewards, activityOverrides: overrides }, hunter_weights: weights } },
              { onSuccess: () => pushInfo("Scoring updated", "Levels and ranks were recalculated.") },
            )
          }
        >
          Save scoring
        </Button>
        {cmd.error ? <p className="mt-2 text-sm text-red-300 light:text-red-700">{cmd.error.message}</p> : null}
      </div>
    </div>
  );
}

function DataPanel() {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onImport(f: File) {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ imported: Record<string, number>; snapshot: PlayerSnapshot }>("/api/import", { method: "POST", body: await f.text(), headers: { "Content-Type": "application/json" } });
      qc.setQueryData(SNAPSHOT_KEY, r.snapshot);
      setResult(`Imported ${r.imported.metricEntries} measurements, ${r.imported.activities} activities and ${r.imported.customMetrics} custom stats. Duplicates were skipped.`);
    } catch (e) {
      setResult(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Export" subtitle="Download all of your data as JSON">
        <p className="mb-3 text-sm text-dim">Includes profile, settings, measurements, activities, quests, dungeon sessions, the XP ledger and unlocks.</p>
        <Button asChild>
          <a href="/api/export" download>
            <Download /> Export data
          </a>
        </Button>
      </Panel>
      <Panel title="Import" subtitle="Restore from a SYSTEM IRL export">
        <p className="mb-3 text-sm text-dim">Imports measurements, activities and custom stats. XP, unlocks and quest history are re-derived by the server and never imported, so they can&apos;t be forged. Imported activities earn no activity XP.</p>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        <Button variant="outline" disabled={busy} onClick={() => file.current?.click()}>
          <Upload /> {busy ? "Importing…" : "Choose file"}
        </Button>
        {result ? <p className="mt-3 text-sm text-dim">{result}</p> : null}
      </Panel>
    </div>
  );
}

const INTEGRATIONS = [
  { name: "Apple Health", need: "Apple HealthKit is only available to native iOS apps. A companion iOS app (or a Shortcuts automation that exports JSON) is required, then data can be imported here.", env: "N/A (native app required)" },
  { name: "Strava", need: "Register an API application at strava.com/settings/api and set STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET. The OAuth flow and activity sync are not built yet.", env: "STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET" },
  { name: "Google Calendar", need: "Create OAuth credentials in Google Cloud Console (Calendar API, read-only scope) to turn scheduled study blocks into quests. Not built yet.", env: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET" },
  { name: "Academic systems (Canvas, Blackboard, ExamSoft)", need: "Requires an institution-issued API token or LTI registration. Grades can currently be logged manually or imported via JSON.", env: "Institution-specific" },
];

function Integrations() {
  return (
    <Panel title="Integrations" subtitle="All optional. None are connected, and no data leaves this server without your authorization.">
      <ul className="space-y-3">
        {INTEGRATIONS.map((i) => (
          <li key={i.name} className="rounded-lg border border-line/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-fg">{i.name}</p>
              <Pill>Not connected: requires configuration</Pill>
            </div>
            <p className="mt-1 text-sm text-dim">{i.need}</p>
            <p className="mt-1 font-mono text-[11px] text-faint">Credentials: {i.env}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-faint">Until an integration is configured, the JSON import under Data is the supported way to bring in records from other tools.</p>
    </Panel>
  );
}

function Account({ s }: { s: PlayerSnapshot }) {
  const router = useRouter();
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<{ backend: string; ai: string }>("/api/health") });
  return (
    <Panel title="Account & backend">
      <ul className="space-y-2 text-sm">
        <li>
          <span className="text-dim">Storage backend:</span> <span className="text-fg">{s.backend === "local" ? "Local PostgreSQL (PGlite) on this server" : "Supabase (PostgreSQL + Auth, row-level security)"}</span>
        </li>
        <li>
          <span className="text-dim">AI guide:</span> <span className="text-fg">{health.data?.ai === "configured" ? "LLM configured (server-side key)" : "Deterministic guide (no API key configured)"}</span>
        </li>
        <li>
          <span className="text-dim">Profile visibility:</span> <span className="text-fg">{s.settings.profile_public ? "Public (consent recorded)" : "Private"}</span>
        </li>
      </ul>
      <Button
        className="mt-4"
        variant="danger"
        onClick={async () => {
          await api("/api/auth/logout", { json: {} });
          qc.clear();
          router.replace("/");
        }}
      >
        <LogOut /> Sign out
      </Button>
    </Panel>
  );
}
