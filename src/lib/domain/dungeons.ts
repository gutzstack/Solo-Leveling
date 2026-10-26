/** Dungeons: real-world focus sessions and challenges with a server-tracked timer. */

export type DungeonDifficulty = "E" | "D" | "C" | "B" | "A" | "S";

export interface DungeonDef {
  code: string;
  name: string;
  subtitle: string;
  kind: "study" | "physical" | "boss" | "endurance" | "recovery" | "reading" | "deep" | "custom";
  difficulty: DungeonDifficulty;
  defaultMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  /** activity created when the dungeon is cleared */
  activity: string;
  objective: string;
  modes: ("focus" | "pomodoro")[];
  /** ask for distance / score when clearing */
  completionInput?: "distance" | "score";
  boss?: string;
}

export const DUNGEON_CLEAR_XP: Record<DungeonDifficulty, number> = { E: 20, D: 40, C: 60, B: 90, A: 130, S: 200 };
export const DUNGEON_DAILY_BONUS_CAP = 4;
/** fraction of planned time that must be completed to clear */
export const CLEAR_THRESHOLD = 0.9;
/** minimum active minutes for a retreat to keep partial credit */
export const RETREAT_CREDIT_MINUTES = 15;
export const POMODORO = { work: 25, rest: 5 };

export const DUNGEONS: DungeonDef[] = [
  { code: "study_gate", name: "Study Dungeon", subtitle: "The Archive of Silent Pages", kind: "study", difficulty: "C", defaultMinutes: 90, minMinutes: 25, maxMinutes: 240, activity: "study", objective: "Complete an uninterrupted block of focused study.", modes: ["focus", "pomodoro"] },
  { code: "deep_focus", name: "Deep Work Gate", subtitle: "Chamber of the Unbroken Mind", kind: "deep", difficulty: "B", defaultMinutes: 50, minMinutes: 30, maxMinutes: 180, activity: "study", objective: "One block with zero pauses. Pausing is allowed but forfeits the Unbroken bonus.", modes: ["focus"] },
  { code: "physical_dungeon", name: "Physical Dungeon", subtitle: "The Iron Crucible", kind: "physical", difficulty: "C", defaultMinutes: 60, minMinutes: 20, maxMinutes: 180, activity: "workout", objective: "Complete your planned strength workout.", modes: ["focus"] },
  { code: "endurance_dungeon", name: "Endurance Dungeon", subtitle: "The Endless Road", kind: "endurance", difficulty: "B", defaultMinutes: 60, minMinutes: 15, maxMinutes: 360, activity: "run", objective: "Complete a long run at a conversational pace.", modes: ["focus"], completionInput: "distance" },
  { code: "boss_exam", name: "Boss Dungeon", subtitle: "The Examiner Awaits", kind: "boss", difficulty: "A", defaultMinutes: 120, minMinutes: 30, maxMinutes: 300, activity: "practice_exam", objective: "Sit a full practice examination under exam conditions.", modes: ["focus"], completionInput: "score", boss: "THE EXAMINER" },
  { code: "reading_archive", name: "Reading Archive", subtitle: "Stacks of the Forgotten", kind: "reading", difficulty: "D", defaultMinutes: 45, minMinutes: 15, maxMinutes: 180, activity: "reading", objective: "Read with intent and take one note per section.", modes: ["focus", "pomodoro"] },
  { code: "recovery_sanctum", name: "Recovery Sanctum", subtitle: "The Still Water", kind: "recovery", difficulty: "E", defaultMinutes: 20, minMinutes: 10, maxMinutes: 60, activity: "mobility", objective: "Mobility, stretching or breathing work. Recovery is part of training.", modes: ["focus"] },
  { code: "custom_gate", name: "Custom Gate", subtitle: "A Gate of Your Own Design", kind: "custom", difficulty: "C", defaultMinutes: 45, minMinutes: 10, maxMinutes: 300, activity: "study", objective: "Set your own objective.", modes: ["focus", "pomodoro"] },
];

export const DUNGEON_BY_CODE: Record<string, DungeonDef> = Object.fromEntries(DUNGEONS.map((d) => [d.code, d]));

export interface SessionClock {
  status: "active" | "paused" | "cleared" | "retreated";
  active_seconds: number;
  last_resumed_at: string | null;
}

/** Server-authoritative active time: stored seconds plus the running segment. */
export function activeSecondsNow(s: SessionClock, now: Date): number {
  if (s.status === "active" && s.last_resumed_at) {
    return s.active_seconds + Math.max(0, Math.floor((now.getTime() - Date.parse(s.last_resumed_at)) / 1000));
  }
  return s.active_seconds;
}

/** Minutes credited as study/work. Pomodoro mode excludes the 5-minute breaks. */
export function creditedMinutes(mode: "focus" | "pomodoro", activeSeconds: number): number {
  const mins = activeSeconds / 60;
  if (mode === "focus") return Math.floor(mins);
  const cycle = POMODORO.work + POMODORO.rest;
  const full = Math.floor(mins / cycle);
  const rem = mins - full * cycle;
  return Math.floor(full * POMODORO.work + Math.min(rem, POMODORO.work));
}

export function canClear(planned: number, activeSeconds: number): boolean {
  return activeSeconds >= planned * 60 * CLEAR_THRESHOLD;
}
