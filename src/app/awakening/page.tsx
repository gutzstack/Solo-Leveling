"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ParticleField } from "@/components/system/particles";
import { ApiError } from "@/lib/client/api";
import { play } from "@/lib/client/sound";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { ATTRIBUTES } from "@/lib/domain/attributes";
import { localDate } from "@/lib/domain/dates";
import { METRICS, METRIC_BY_ID } from "@/lib/domain/metrics";
import { ATTRIBUTE_CODES, type AttributeCode, type EntryContext, type UnitKind, type UnitSystem } from "@/lib/domain/types";
import { cmToFeetInches, displayUnit, feetInchesToCm, formatValue, kgToLb, lbToKg, parseDisplayInput } from "@/lib/domain/units";
import { cn } from "@/lib/utils";

const LINES = ["[SYSTEM] Scanning…", "Player candidate detected.", "Qualifications confirmed.", "Initializing status window…", "You have been selected."];
const STEPS = ["Identity", "Body", "Path", "Goals", "Records", "Confirm"];

interface RecordDraft {
  id: number;
  metricId: string;
  raw: string;
  context: EntryContext;
  note: string;
}

export default function Awakening() {
  const router = useRouter();
  const { data, error } = useSnapshot();
  const cmd = useCommand();
  const [phase, setPhase] = useState<"sequence" | "form">("sequence");
  const [line, setLine] = useState(0);
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state: every new player starts from a blank slate
  const [units, setUnits] = useState<UnitSystem>("imperial");
  const [name, setName] = useState("");
  const [useDob, setUseDob] = useState(false);
  const [dob, setDob] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | "male" | "female">("");
  const [country, setCountry] = useState("");
  const [tz, setTz] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  });
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  const [cm, setCm] = useState("");
  const [weight, setWeight] = useState("");
  const [fitness, setFitness] = useState("");
  const [education, setEducation] = useState("");
  const [occupation, setOccupation] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examName, setExamName] = useState("");
  const [goals, setGoals] = useState("");
  const [difficulty, setDifficulty] = useState<"casual" | "normal" | "hard" | "nightmare">("normal");
  const [tracked, setTracked] = useState<AttributeCode[]>([...ATTRIBUTE_CODES]);
  const [efMonths, setEfMonths] = useState("6");
  const [records, setRecords] = useState<RecordDraft[]>([]);
  const [addMetric, setAddMetric] = useState("squat_1rm");

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace("/");
    if (data?.profile.onboarded_at) router.replace("/status");
  }, [data, error, router]);

  useEffect(() => {
    if (phase !== "sequence") return;
    if (line >= LINES.length) {
      const t = setTimeout(() => setPhase("form"), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setLine((l) => l + 1);
      play("click");
    }, line === 0 ? 700 : 950);
    return () => clearTimeout(t);
  }, [line, phase]);

  const today = useMemo(() => localDate(new Date(), tz), [tz]);
  const manualMetrics = METRICS.filter((m) => m.input === "manual");

  function switchUnits(next: UnitSystem) {
    // Convert existing body inputs so values aren't silently reinterpreted.
    if (next === units) return;
    if (next === "metric") {
      const c = feetInchesToCm(Number(ft) || 0, Number(inch) || 0);
      setCm(String(Math.round(c * 10) / 10));
      setWeight(String(Math.round(lbToKg(Number(weight) || 0) * 10) / 10));
    } else {
      const f = cmToFeetInches(Number(cm) || 0);
      setFt(String(f.feet));
      setInch(String(Math.round(f.inches)));
      setWeight(String(Math.round(kgToLb(Number(weight) || 0))));
    }
    setRecords((rs) =>
      rs.map((r) => {
        const def = METRIC_BY_ID[r.metricId];
        if (def.unit === "duration") return r;
        const v = parseDisplayInput(def.unit, r.raw, units);
        if (v === null) return r;
        return { ...r, raw: String(Math.round(displayUnit(def.unit, next).toDisplay(v) * 100) / 100) };
      }),
    );
    setUnits(next);
  }

  function heightCm(): number | null {
    const v = units === "imperial" ? feetInchesToCm(Number(ft) || 0, Number(inch) || 0) : Number(cm);
    return v > 0 ? Math.round(v * 10) / 10 : null;
  }
  function weightKg(): number | null {
    const v = Number(weight);
    if (!(v > 0)) return null;
    return units === "imperial" ? lbToKg(v) : v;
  }

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!name.trim()) return "Choose a player name.";
      if (useDob ? !dob : !(Number(age) >= 13 && Number(age) <= 120)) return useDob ? "Enter your date of birth." : "Enter an age between 13 and 120.";
    }
    if (s === 1) {
      const h = heightCm();
      const w = weightKg();
      if (h !== null && (h < 100 || h > 250)) return "Height looks out of range.";
      if (w !== null && (w < 25 || w > 350)) return "Weight looks out of range.";
    }
    if (s === 3 && tracked.length === 0) return "Track at least one category.";
    if (s === 4) {
      for (const r of records) {
        const def = METRIC_BY_ID[r.metricId];
        if (parseDisplayInput(def.unit, r.raw, units) === null) return `Check the value for ${def.name}.`;
      }
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    setFormError(err);
    if (!err) {
      play("click");
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
    }
  }

  function submit() {
    for (let s = 0; s < STEPS.length - 1; s++) {
      const err = validateStep(s);
      if (err) {
        setStep(s);
        setFormError(err);
        return;
      }
    }
    const metrics = records.map((r) => {
      const def = METRIC_BY_ID[r.metricId];
      return { metricId: r.metricId, value: parseDisplayInput(def.unit, r.raw, units) as number, context: r.context, recordedOn: today, note: r.note || undefined };
    });
    cmd.mutate(
      {
        type: "complete_onboarding",
        unit_system: units,
        metrics,
        profile: {
          display_name: name.trim(),
          date_of_birth: useDob ? dob : null,
          age_years: useDob ? null : Number(age),
          country: country.trim() || "Not specified",
          height_cm: heightCm(),
          weight_kg: weightKg() ? Math.round((weightKg() as number) * 1000) / 1000 : null,
          sex: sex || null,
          education_level: education.trim() || null,
          occupation: occupation.trim() || null,
          goals: goals.split("\n").map((g) => g.trim()).filter(Boolean).slice(0, 12),
          fitness_experience: fitness || null,
          academic_info: { program: program.trim() || undefined, year: year.trim() || undefined, nextExamDate: examDate || null, nextExamName: examName.trim() || null },
          financial_info: { emergencyFundTargetMonths: Number(efMonths) || 6, trackFinances: tracked.includes("WLT") },
          difficulty,
          tracked_categories: tracked,
          timezone: tz,
        },
      },
      {
        onSuccess: () => {
          play("levelup");
          router.replace("/status");
        },
        onError: (e) => setFormError(e.message),
      },
    );
  }

  return (
    <main className="relative min-h-dvh px-4 py-8">
      <ParticleField density={0.00008} />
      <AnimatePresence mode="wait">
        {phase === "sequence" ? (
          <motion.div key="seq" className="flex min-h-[80dvh] cursor-pointer flex-col items-center justify-center" exit={{ opacity: 0, scale: 1.04 }} onClick={() => setPhase("form")}>
            <div className="sys-panel sys-panel-glow scanlines relative w-full max-w-md overflow-hidden p-6">
              <div className="holo-sheen" />
              {LINES.slice(0, line).map((l, i) => (
                <motion.p key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className={cn("font-mono text-sm", i === LINES.length - 1 ? "mt-3 font-display text-base tracking-[0.25em] text-accent text-glow" : "text-dim")}>
                  {l}
                </motion.p>
              ))}
              <span className="inline-block h-4 w-2 animate-pulse bg-accent align-middle" />
            </div>
            <p className="mt-4 text-xs text-faint">Tap to skip</p>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-2xl">
            <p className="text-center font-display text-[10px] tracking-[0.35em] text-accent-2">[PLAYER INITIALIZATION]</p>
            <h1 className="sys-title mt-1 text-center text-xl font-bold text-fg text-glow">The Awakening</h1>
            <ol className="no-scrollbar mt-5 flex gap-1 overflow-x-auto" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} className={cn("flex-1 shrink-0 rounded-md border px-2 py-1.5 text-center font-display text-[9px] tracking-[0.15em]", i === step ? "border-line-strong bg-accent/15 text-accent" : i < step ? "border-line text-dim" : "border-line/50 text-faint")} aria-current={i === step ? "step" : undefined}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>

            <section className="sys-panel relative mt-4 space-y-4 p-5 sm:p-6">
              {step === 0 && (
                <>
                  <Field label="Player name" htmlFor="name">
                    <Input id="name" maxLength={40} placeholder="Choose your player name" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-line/60 p-3">
                    <div>
                      <p className="text-sm text-fg">Use date of birth</p>
                      <p className="text-xs text-faint">Exact age matching. Otherwise just enter your age.</p>
                    </div>
                    <Switch checked={useDob} onCheckedChange={setUseDob} aria-label="Use date of birth" />
                  </div>
                  {useDob ? (
                    <Field label="Date of birth" htmlFor="dob">
                      <Input id="dob" type="date" value={dob} max={today} onChange={(e) => setDob(e.target.value)} />
                    </Field>
                  ) : (
                    <Field label="Age" htmlFor="age">
                      <Input id="age" type="number" min={13} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
                    </Field>
                  )}
                  <Field label="Sex (optional)" htmlFor="sex" hint="Used only to choose sex-matched physical benchmarks (e.g. NHANES body measures and pulse). Leave blank to compare with all adults your age.">
                    <Select id="sex" value={sex} onChange={(e) => setSex(e.target.value as typeof sex)}>
                      <option value="">Prefer not to say</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </Select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Country" htmlFor="country" hint="Population benchmarks are U.S.-based.">
                      <Input id="country" placeholder="e.g. United States" value={country} onChange={(e) => setCountry(e.target.value)} />
                    </Field>
                    <Field label="Time zone" htmlFor="tz" hint="Defines when your day starts.">
                      <Input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} />
                    </Field>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="flex gap-2" role="radiogroup" aria-label="Units">
                    {(["imperial", "metric"] as const).map((u) => (
                      <Button key={u} type="button" variant={units === u ? "default" : "outline"} size="sm" onClick={() => switchUnits(u)} aria-pressed={units === u}>
                        {u === "imperial" ? "Imperial (lb, ft, mi)" : "Metric (kg, cm, km)"}
                      </Button>
                    ))}
                  </div>
                  {units === "imperial" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Height (ft)" htmlFor="ft">
                        <Input id="ft" type="number" min={3} max={8} value={ft} onChange={(e) => setFt(e.target.value)} />
                      </Field>
                      <Field label="Height (in)" htmlFor="in">
                        <Input id="in" type="number" min={0} max={11} value={inch} onChange={(e) => setInch(e.target.value)} />
                      </Field>
                    </div>
                  ) : (
                    <Field label="Height (cm)" htmlFor="cm">
                      <Input id="cm" type="number" step="0.1" value={cm} onChange={(e) => setCm(e.target.value)} />
                    </Field>
                  )}
                  <Field label={`Weight (${units === "imperial" ? "lb" : "kg"}), approximate is fine`} htmlFor="wt">
                    <Input id="wt" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </Field>
                  <Field label="Fitness experience" htmlFor="fit">
                    <Select id="fit" value={fitness} onChange={(e) => setFitness(e.target.value)}>
                      <option value="">Prefer not to say</option>
                      {["Beginner", "Novice", "Intermediate", "Advanced", "Competitive athlete"].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Education level" htmlFor="edu">
                      <Input id="edu" placeholder="e.g. High school, Bachelor's, Graduate" value={education} onChange={(e) => setEducation(e.target.value)} />
                    </Field>
                    <Field label="Occupation / student status" htmlFor="occ">
                      <Input id="occ" placeholder="e.g. Student, Engineer" value={occupation} onChange={(e) => setOccupation(e.target.value)} />
                    </Field>
                    <Field label="Program" htmlFor="prog">
                      <Input id="prog" placeholder="e.g. Computer Science (optional)" value={program} onChange={(e) => setProgram(e.target.value)} />
                    </Field>
                    <Field label="Year / phase (optional)" htmlFor="year">
                      <Input id="year" placeholder="e.g. Year 2" value={year} onChange={(e) => setYear(e.target.value)} />
                    </Field>
                    <Field label="Next exam date (optional)" htmlFor="exd" hint="Unlocks exam-prep emergency quests.">
                      <Input id="exd" type="date" min={today} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                    </Field>
                    <Field label="Next exam name" htmlFor="exn">
                      <Input id="exn" placeholder="e.g. Biology midterm" value={examName} onChange={(e) => setExamName(e.target.value)} />
                    </Field>
                  </div>
                  <p className="text-xs text-faint">GPA and exam results are tracked as academic performance, never as IQ.</p>
                </>
              )}

              {step === 3 && (
                <>
                  <Field label="Personal goals (one per line)" htmlFor="goals">
                    <Textarea id="goals" rows={5} placeholder={"e.g. Run a faster 5K\nRaise my exam average\nSave an emergency fund"} value={goals} onChange={(e) => setGoals(e.target.value)} />
                  </Field>
                  <Field label="Difficulty" htmlFor="diff" hint="Scales daily and weekly quest targets. Never punishes missed days.">
                    <Select id="diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                      <option value="casual">Casual (lighter targets)</option>
                      <option value="normal">Normal</option>
                      <option value="hard">Hard</option>
                      <option value="nightmare">Nightmare</option>
                    </Select>
                  </Field>
                  <div>
                    <p className="mb-2 font-display text-[10px] tracking-[0.18em] text-dim">CATEGORIES TO TRACK</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {ATTRIBUTES.map((a) => {
                        const on = tracked.includes(a.code);
                        return (
                          <button key={a.code} type="button" aria-pressed={on} onClick={() => setTracked((t) => (on ? t.filter((x) => x !== a.code) : [...t, a.code]))} className={cn("cursor-pointer rounded-lg border px-3 py-2 text-left transition-all", on ? "border-line-strong bg-accent/10" : "border-line/50 opacity-60")}>
                            <span className="font-display text-xs" style={{ color: a.color }}>
                              {a.code}
                            </span>
                            <span className="block text-xs text-dim">{a.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {tracked.includes("WLT") ? (
                    <Field label="Emergency-fund goal (months of expenses)" htmlFor="ef" hint="Financial data is optional and stays private. Figures are individual, not household.">
                      <Input id="ef" type="number" min={1} max={24} value={efMonths} onChange={(e) => setEfMonths(e.target.value)} />
                    </Field>
                  ) : null}
                </>
              )}

              {step === 4 && (
                <>
                  <p className="text-sm text-dim">Optional: add any personal records you already have, or skip this and log them later. Mark past bests as <b>historical</b> so they aren&apos;t treated as current ability.</p>
                  <ul className="space-y-2">
                    {records.map((r) => {
                      const def = METRIC_BY_ID[r.metricId];
                      const u = displayUnit(def.unit as UnitKind, units);
                      return (
                        <li key={r.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-line/60 p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
                          <div className="col-span-2 sm:col-span-1">
                            <p className="text-sm text-fg">{def.name}</p>
                            <p className="text-xs text-faint">{r.note}</p>
                          </div>
                          <Field label={def.unit === "duration" ? "Time" : u.label || "Value"}>
                            <Input aria-label={`${def.name} value`} value={r.raw} onChange={(e) => setRecords((rs) => rs.map((x) => (x.id === r.id ? { ...x, raw: e.target.value } : x)))} />
                          </Field>
                          <Field label="Entry type">
                            <Select aria-label={`${def.name} entry type`} value={r.context} onChange={(e) => setRecords((rs) => rs.map((x) => (x.id === r.id ? { ...x, context: e.target.value as EntryContext } : x)))}>
                              <option value="current">Current</option>
                              <option value="test">Test / race</option>
                              <option value="historical">Historical</option>
                            </Select>
                          </Field>
                          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${def.name}`} onClick={() => setRecords((rs) => rs.filter((x) => x.id !== r.id))}>
                            <Trash2 />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex gap-2">
                    <Select aria-label="Add a record" value={addMetric} onChange={(e) => setAddMetric(e.target.value)}>
                      {manualMetrics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.attribute} · {m.name}
                        </option>
                      ))}
                    </Select>
                    <Button type="button" variant="outline" onClick={() => setRecords((rs) => [...rs, { id: Date.now(), metricId: addMetric, raw: "", context: "current", note: "" }])}>
                      <Plus /> Add
                    </Button>
                  </div>
                </>
              )}

              {step === 5 && (
                <div className="space-y-2 text-sm">
                  <p className="font-display text-[10px] tracking-[0.25em] text-accent">[CONFIRM PLAYER DATA]</p>
                  <p>
                    <span className="text-dim">Player:</span> {[name, useDob ? (dob ? `born ${dob}` : "") : age ? `age ${age}` : "", sex, country.trim()].filter(Boolean).join(" · ")}
                  </p>
                  <p>
                    <span className="text-dim">Body:</span> {[heightCm() ? formatValue("length", heightCm(), units) : "", weightKg() ? formatValue("mass", weightKg(), units) : ""].filter(Boolean).join(" · ") || "not provided"}
                  </p>
                  <p>
                    <span className="text-dim">Path:</span> {[education.trim(), occupation.trim(), program.trim()].filter(Boolean).join(" · ") || "not provided"}
                  </p>
                  <p>
                    <span className="text-dim">Tracking:</span> {tracked.join(" · ")} · difficulty {difficulty}
                  </p>
                  <p>
                    <span className="text-dim">Records:</span> {records.length} entries ({records.filter((r) => r.context === "historical").length} historical)
                  </p>
                  <p className="text-xs text-faint">Your profile is private by default. You can edit everything later in SYSTEM.</p>
                </div>
              )}

              {formError ? (
                <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-sm text-red-200 light:text-red-800">
                  {formError}
                </p>
              ) : null}

              <div className="flex justify-between gap-2 pt-2">
                <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                  <ArrowLeft /> Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={next}>
                    Next <ArrowRight />
                  </Button>
                ) : (
                  <Button type="button" onClick={submit} disabled={cmd.isPending}>
                    {cmd.isPending ? <Loader2 className="animate-spin" /> : null} Accept the System
                  </Button>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
