/**
 * Skill trees. Every node unlocks from a measurable milestone computed from real logs. Nothing
 * unlocks by clicking. Tier N needs tier N-1.
 */

export type SkillTree = "academic" | "physical" | "discipline";

export interface SkillRequirement {
  /** key into the stats context (see game/skills-eval.ts) */
  stat: string;
  /** for "lte" stats (times) the value must be at or below the threshold */
  op: "gte" | "lte";
  value: number;
  label: string;
}

export interface SkillDef {
  code: string;
  tree: SkillTree;
  line: string;
  lineName: string;
  name: string;
  tier: number;
  requires: string | null;
  requirement: SkillRequirement;
  effect: string;
  xp: number;
}

const ROMAN = ["I", "II", "III", "IV", "V"];

interface LineSpec {
  tree: SkillTree;
  line: string;
  name: string;
  stat: string;
  op: "gte" | "lte";
  values: [number, number, number, number, number];
  label: (v: number) => string;
  effect: string;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const LINES: LineSpec[] = [
  // Academic
  { tree: "academic", line: "active_recall", name: "Active Recall", stat: "flashcards_total", op: "gte", values: [100, 500, 1500, 4000, 10000], label: (v) => `Review ${v.toLocaleString()} flashcards`, effect: "Retrieval practice strengthens memory more than rereading." },
  { tree: "academic", line: "spaced_repetition", name: "Spaced Repetition", stat: "flashcard_days", op: "gte", values: [3, 10, 30, 60, 120], label: (v) => `Review flashcards on ${v} different days`, effect: "Spacing reviews out over time beats cramming." },
  { tree: "academic", line: "clinical_reasoning", name: "Applied Reasoning", stat: "clinical_practice_total", op: "gte", values: [3, 10, 25, 50, 100], label: (v) => `Complete ${v} quiz / practice-exam blocks`, effect: "Working problems and practice questions turns facts into usable knowledge." },
  { tree: "academic", line: "diagnostic_knowledge", name: "Deep Knowledge", stat: "study_hours_total", op: "gte", values: [10, 50, 150, 300, 600], label: (v) => `Log ${v} focused study hours`, effect: "Depth of knowledge accumulates hour by hour." },
  { tree: "academic", line: "examination_mastery", name: "Examination Mastery", stat: "practice_exams_and_bosses", op: "gte", values: [1, 3, 6, 10, 15], label: (v) => `Clear ${v} practice exams or boss dungeons`, effect: "Full-length rehearsal builds stamina and pacing." },
  // Physical
  { tree: "physical", line: "strength_foundation", name: "Strength Foundation", stat: "workouts_total", op: "gte", values: [5, 20, 50, 100, 200], label: (v) => `Complete ${v} strength workouts`, effect: "Consistent lifting builds the base for everything else." },
  { tree: "physical", line: "progressive_overload", name: "Progressive Overload", stat: "strength_prs", op: "gte", values: [1, 3, 6, 10, 20], label: (v) => `Set ${v} strength personal records`, effect: "Adding load over time drives adaptation." },
  { tree: "physical", line: "running_endurance", name: "Running Endurance", stat: "run_km_total", op: "gte", values: [10, 50, 150, 400, 1000], label: (v) => `Run ${v} km in total`, effect: "Aerobic volume builds capillaries and mitochondria." },
  { tree: "physical", line: "speed_development", name: "Speed Development", stat: "current_5k_seconds", op: "lte", values: [1800, 1500, 1320, 1200, 1080], label: (v) => `Run a current 5K at or under ${fmtTime(v)}`, effect: "Speed is earned through intervals, tempo and patience." },
  { tree: "physical", line: "mobility_mastery", name: "Mobility Mastery", stat: "mobility_total", op: "gte", values: [3, 10, 25, 50, 100], label: (v) => `Complete ${v} mobility sessions`, effect: "Range of motion protects joints and improves lifts." },
  // Discipline
  { tree: "discipline", line: "consistency", name: "Consistency", stat: "longest_streak", op: "gte", values: [3, 7, 14, 30, 60], label: (v) => `Reach a ${v}-day activity streak`, effect: "Showing up is the skill under every other skill." },
  { tree: "discipline", line: "deep_work", name: "Deep Work", stat: "dungeons_cleared", op: "gte", values: [1, 5, 15, 40, 100], label: (v) => `Clear ${v} dungeons (focus sessions)`, effect: "Undistracted blocks produce the highest-quality work." },
  { tree: "discipline", line: "planning", name: "Planning", stat: "quests_completed", op: "gte", values: [5, 20, 50, 120, 300], label: (v) => `Complete ${v} quests`, effect: "Turning goals into concrete daily actions." },
  { tree: "discipline", line: "time_management", name: "Time Management", stat: "emergency_on_time", op: "gte", values: [1, 3, 6, 12, 25], label: (v) => `Finish ${v} deadline quests on time`, effect: "Beating deadlines without last-minute panic." },
  { tree: "discipline", line: "habit_automation", name: "Habit Automation", stat: "perfect_days", op: "gte", values: [1, 5, 15, 30, 60], label: (v) => `Complete every daily quest on ${v} days`, effect: "When habits run on autopilot, willpower is freed up." },
];

export const SKILLS: SkillDef[] = LINES.flatMap((l) =>
  l.values.map((v, i) => ({
    code: `${l.line}_${i + 1}`,
    tree: l.tree,
    line: l.line,
    lineName: l.name,
    name: `${l.name} ${ROMAN[i]}`,
    tier: i + 1,
    requires: i === 0 ? null : `${l.line}_${i}`,
    requirement: { stat: l.stat, op: l.op, value: v, label: l.label(v) },
    effect: l.effect,
    xp: (i + 1) * 40,
  })),
);

export const SKILL_BY_CODE: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.code, s]));

export const SKILL_TREES: { tree: SkillTree; name: string; description: string }[] = [
  { tree: "academic", name: "Academic Tree", description: "Mastery of learning, reasoning and examinations." },
  { tree: "physical", name: "Physical Tree", description: "Strength, endurance, speed and mobility." },
  { tree: "discipline", name: "Discipline Tree", description: "Consistency, focus and self-direction." },
];

export function requirementMet(req: SkillRequirement, stats: Record<string, number | null | undefined>): boolean {
  const v = stats[req.stat];
  if (v === null || v === undefined || !Number.isFinite(v)) return false;
  return req.op === "gte" ? v >= req.value : v <= req.value;
}

export function requirementProgress(req: SkillRequirement, stats: Record<string, number | null | undefined>): number {
  const v = stats[req.stat];
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  if (req.op === "gte") return Math.max(0, Math.min(1, v / req.value));
  // lte: progress measured from 2× the target down to the target
  return Math.max(0, Math.min(1, (2 * req.value - v) / req.value));
}
