/**
 * System Trials: tests the System administers itself, used to rank INT instead of GPA.
 * All items are generated procedurally (original content, unlimited, not memorisable) from a seed,
 * so the server can regenerate and check them. None of these is an IQ test, and none is presented
 * as a population percentile; scores are ranked against game standards.
 */

export type TrialKind = "reasoning" | "memory" | "speed" | "knowledge";

export const TRIAL_INFO: Record<TrialKind, { name: string; subtitle: string; description: string; minutes: number }> = {
  reasoning: { name: "Reasoning Trial", subtitle: "Pattern & logic", description: "Number-series and 3×3 number-grid puzzles. Difficulty adapts to your answers; 12 items, 60 s each.", minutes: 10 },
  memory: { name: "Memory Trial", subtitle: "Working memory", description: "Digit span: repeat a growing string of digits forward, then backward. Two misses at a length ends each half.", minutes: 5 },
  speed: { name: "Speed Trial", subtitle: "Processing speed", description: "Mental arithmetic sprint: solve as many problems as you can in 60 seconds.", minutes: 2 },
  knowledge: { name: "Knowledge Trial", subtitle: "Mastery of your material", description: "10 multiple-choice questions from your question sets, chosen to focus on what you know least. Scored with a rating where hard questions count more.", minutes: 10 },
};

// ───────────────────────────── Seeded RNG ─────────────────────────────

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
function shuffle<T>(r: () => number, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────────────────────── Rating (Elo-style) ─────────────────────────────

export const START_RATING = 1000;

/** Probability of answering an item of rating `item` correctly at ability `player`. */
export function expected(player: number, item: number): number {
  return 1 / (1 + Math.pow(10, (item - player) / 400));
}

/** Replays attempts in order; K is larger early so a new player converges quickly. */
export function replayRating(attempts: readonly { itemRating: number; correct: boolean }[], start = START_RATING): number {
  let r = start;
  attempts.forEach((a, i) => {
    const k = i < 30 ? 40 : 20;
    r += k * ((a.correct ? 1 : 0) - expected(r, a.itemRating));
  });
  return Math.round(r);
}

// ───────────────────────────── Reasoning items ─────────────────────────────

export const REASONING_ITEMS = 12;
export const REASONING_MIN_LEVEL = 1;
export const REASONING_MAX_LEVEL = 10;
export const reasoningItemRating = (level: number) => 600 + level * 100;

export interface ReasoningItem {
  level: number;
  format: "series" | "grid";
  prompt: string;
  /** series: the visible terms; grid: 9 cells (row-major) with null for the missing one */
  series?: (number | null)[];
  grid?: (number | null)[];
  choices: number[];
  answer: number; // index into choices (never sent to the client)
}

function distractors(r: () => number, answer: number, near: number[]): number[] {
  const set = new Set<number>();
  for (const n of near) if (n !== answer && Number.isFinite(n)) set.add(n);
  let spread = Math.max(3, Math.round(Math.abs(answer) * 0.15));
  // Widen the range whenever it runs out of fresh values, so this always terminates.
  for (let tries = 0; set.size < 6; tries++) {
    if (tries > 0 && tries % 20 === 0) spread *= 2;
    const d = answer + (r() < 0.5 ? -1 : 1) * int(r, 1, spread);
    if (d !== answer) set.add(d);
  }
  return shuffle(r, [...set]).slice(0, 3);
}

function finish(r: () => number, base: Omit<ReasoningItem, "choices" | "answer">, answer: number, near: number[]): ReasoningItem {
  const choices = shuffle(r, [answer, ...distractors(r, answer, near)]);
  return { ...base, choices, answer: choices.indexOf(answer) };
}

/** Deterministic: the same (seed, level) always yields the same item. */
export function reasoningItem(seed: number, level: number): ReasoningItem {
  const r = rng(seed * 7919 + level * 104729);
  const L = Math.max(REASONING_MIN_LEVEL, Math.min(REASONING_MAX_LEVEL, Math.round(level)));
  const useGrid = L >= 4 && r() < 0.4;
  if (useGrid) {
    // 3×3 grid; each row follows a rule, rows relate to each other.
    const kind = L >= 8 ? int(r, 0, 2) : L >= 6 ? int(r, 0, 1) : 0;
    const cells: number[] = [];
    if (kind === 0) {
      // each row is an arithmetic progression with its own step; step grows by a constant down the rows
      const s0 = int(r, 1, 4 + L);
      const ds = int(r, 1, 3);
      for (let row = 0; row < 3; row++) {
        const start = int(r, 1, 10 + L * 2);
        const step = s0 + row * ds;
        cells.push(start, start + step, start + 2 * step);
      }
    } else if (kind === 1) {
      // third column = first × second
      for (let row = 0; row < 3; row++) {
        const a = int(r, 2, 3 + Math.floor(L / 2));
        const b = int(r, 2, 4 + Math.floor(L / 2));
        cells.push(a, b, a * b);
      }
    } else {
      // third column = (first + second) × row number
      for (let row = 0; row < 3; row++) {
        const a = int(r, 1, 9);
        const b = int(r, 1, 9);
        cells.push(a, b, (a + b) * (row + 1));
      }
    }
    const answer = cells[8];
    const grid: (number | null)[] = [...cells.slice(0, 8), null];
    return finish(r, { level: L, format: "grid", prompt: "Which number completes the grid? Find the rule that links the rows and columns.", grid }, answer, [cells[7] + (cells[7] - cells[6]), cells[5], answer + 1, answer - 1]);
  }
  const visible = 5;
  let terms: number[] = [];
  const t = L <= 2 ? 0 : L <= 3 ? int(r, 0, 1) : L <= 5 ? int(r, 1, 3) : L <= 7 ? int(r, 2, 5) : int(r, 3, 6);
  switch (t) {
    case 0: {
      const a = int(r, 1, 20);
      const d = int(r, 2, 4 + L * 2) * (r() < 0.25 ? -1 : 1);
      terms = Array.from({ length: visible + 1 }, (_, i) => a + i * d);
      break;
    }
    case 1: {
      const a = int(r, 1, 5);
      const q = int(r, 2, 3);
      terms = Array.from({ length: visible + 1 }, (_, i) => a * q ** i);
      break;
    }
    case 2: {
      // second differences constant
      const a = int(r, 1, 10);
      const d = int(r, 1, 5);
      const dd = int(r, 1, 3 + Math.floor(L / 3));
      terms = [a];
      for (let i = 1; i <= visible; i++) terms.push(terms[i - 1] + d + (i - 1) * dd);
      break;
    }
    case 3: {
      // alternating operations: +a, ×b
      const add = int(r, 1, 6);
      const mul = 2;
      terms = [int(r, 1, 6)];
      for (let i = 1; i <= visible; i++) terms.push(i % 2 ? terms[i - 1] + add : terms[i - 1] * mul);
      break;
    }
    case 4: {
      // each term = sum of previous two (custom seeds)
      terms = [int(r, 1, 6), int(r, 2, 9)];
      while (terms.length < visible + 1) terms.push(terms[terms.length - 1] + terms[terms.length - 2]);
      break;
    }
    case 5: {
      // interleaved sequences
      const a = int(r, 1, 10);
      const da = int(r, 2, 6);
      const b = int(r, 20, 40);
      const db = -int(r, 1, 5);
      terms = Array.from({ length: visible + 1 }, (_, i) => (i % 2 === 0 ? a + (i / 2) * da : b + ((i - 1) / 2) * db));
      break;
    }
    default: {
      // n² + c·n style
      const c = int(r, 1, 5);
      const off = int(r, 0, 6);
      terms = Array.from({ length: visible + 1 }, (_, i) => (i + 1) ** 2 + c * (i + 1) + off);
    }
  }
  const answer = terms[visible];
  const shown = terms.slice(0, visible);
  const last = shown[visible - 1];
  const prevDiff = last - shown[visible - 2];
  return finish(r, { level: L, format: "series", prompt: "Which number comes next?", series: shown }, answer, [last + prevDiff, last * 2, answer + prevDiff]);
}

export function nextReasoningLevel(level: number, correct: boolean): number {
  return Math.max(REASONING_MIN_LEVEL, Math.min(REASONING_MAX_LEVEL, level + (correct ? 1 : -1)));
}

// ───────────────────────────── Memory (digit span) ─────────────────────────────

export const SPAN_START = 3;
export const SPAN_MAX = 12;

export function digitSequence(seed: number, length: number, attempt: number, backward: boolean): number[] {
  const r = rng(seed * 31 + length * 977 + attempt * 13 + (backward ? 50021 : 0));
  const out: number[] = [];
  while (out.length < length) {
    const d = int(r, 0, 9);
    if (out.length && out[out.length - 1] === d) continue; // no immediate repeats
    out.push(d);
  }
  return out;
}

// ───────────────────────────── Speed (arithmetic) ─────────────────────────────

export const SPEED_SECONDS = 60;
export const SPEED_PROBLEMS = 60;

export interface SpeedProblem {
  text: string;
  answer: number;
}

export function speedProblems(seed: number): SpeedProblem[] {
  const r = rng(seed * 2654435761);
  return Array.from({ length: SPEED_PROBLEMS }, () => {
    const op = int(r, 0, 3);
    if (op === 0) {
      const a = int(r, 2, 49);
      const b = int(r, 2, 49);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    if (op === 1) {
      const a = int(r, 10, 60);
      const b = int(r, 2, a - 1);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    if (op === 2) {
      const a = int(r, 2, 12);
      const b = int(r, 2, 12);
      return { text: `${a} × ${b}`, answer: a * b };
    }
    const b = int(r, 2, 12);
    const q = int(r, 2, 12);
    return { text: `${b * q} ÷ ${b}`, answer: q };
  });
}

// ───────────────────────────── Knowledge items ─────────────────────────────

export const KNOWLEDGE_ITEMS = 10;
export const KNOWLEDGE_RATING: Record<"easy" | "medium" | "hard", number> = { easy: 900, medium: 1050, hard: 1200 };
