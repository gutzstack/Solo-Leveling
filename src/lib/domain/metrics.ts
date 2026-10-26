import type { AttributeCode, Direction, UnitKind } from "./types";

export interface MetricStandards {
  /** Values needed to reach D, C, B, A, S, S+ (game-defined, NOT population data). */
  thresholds: [number, number, number, number, number, number];
  /** "bodyweight_ratio" compares value / body weight (both kg) against the thresholds. */
  basis: "absolute" | "bodyweight_ratio";
  note: string;
}

export interface MetricDef {
  id: string;
  name: string;
  attribute: AttributeCode;
  unit: UnitKind;
  direction: Direction;
  description: string;
  input: "manual" | "derived";
  /** Game-defined thresholds used for PERSONAL ranks when no population benchmark applies. */
  standards?: MetricStandards;
  /** Evidence-based optimal range used for goal-attainment scoring. */
  optimal?: { min: number; max: number; penaltyPerUnit: number; source: string };
  /** Entries older than this many days aren't treated as current ability. */
  currentWindowDays: number;
  /** Smallest improvement that counts as a personal record (canonical units). */
  prMinDelta?: number;
  /** Individual vs household figure (wealth). */
  scope?: "individual";
  /** Excluded from attribute scoring (e.g. validated cognitive tests, descriptive body measures). */
  excludeFromScore?: boolean;
  /** Short helper shown in the input form. */
  inputHint?: string;
  tags?: string[];
}

const GAME_NOTE = "Game-defined standard, not population data.";

function std(
  thresholds: [number, number, number, number, number, number],
  basis: MetricStandards["basis"] = "absolute",
  note = GAME_NOTE,
): MetricStandards {
  return { thresholds, basis, note };
}

const Y = 365;
const SLEEP_SOURCE =
  "Hirshkowitz M, et al. National Sleep Foundation's sleep time duration recommendations. Sleep Health. 2015;1(1):40-43 (young adults 18–25: 7–9 h).";

export const METRICS: MetricDef[] = [
  // ───────────────────────── STRENGTH ─────────────────────────
  { id: "bench_press_1rm", name: "Bench press 1RM", attribute: "STR", unit: "mass", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Heaviest single bench-press repetition (tested or estimated from a heavy set).", standards: std([0.5, 0.75, 1.0, 1.25, 1.5, 1.75], "bodyweight_ratio", "Game-defined bodyweight-ratio standard, not population data."), tags: ["big3"] },
  { id: "squat_1rm", name: "Back squat 1RM", attribute: "STR", unit: "mass", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Heaviest full-depth back-squat single.", standards: std([0.75, 1.0, 1.25, 1.5, 2.0, 2.5], "bodyweight_ratio", "Game-defined bodyweight-ratio standard, not population data."), tags: ["big3"] },
  { id: "deadlift_1rm", name: "Deadlift 1RM", attribute: "STR", unit: "mass", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Heaviest conventional or sumo deadlift single.", standards: std([1.0, 1.25, 1.5, 2.0, 2.5, 3.0], "bodyweight_ratio", "Game-defined bodyweight-ratio standard, not population data."), tags: ["big3"] },
  { id: "overhead_press_1rm", name: "Overhead press 1RM", attribute: "STR", unit: "mass", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 0.5, description: "Strict standing overhead press single.", standards: std([0.35, 0.5, 0.65, 0.8, 1.0, 1.2], "bodyweight_ratio", "Game-defined bodyweight-ratio standard, not population data.") },
  { id: "pullups_max", name: "Pull-ups (max reps)", attribute: "STR", unit: "reps", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Strict dead-hang pull-ups in one set.", standards: std([3, 6, 10, 15, 20, 25]) },
  { id: "weighted_pullup_1rm", name: "Weighted pull-up (added load)", attribute: "STR", unit: "mass", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Extra load for one strict pull-up.", standards: std([0.1, 0.2, 0.35, 0.5, 0.75, 1.0], "bodyweight_ratio", "Game-defined bodyweight-ratio standard, not population data.") },
  { id: "dips_max", name: "Dips (max reps)", attribute: "STR", unit: "reps", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Full-range parallel-bar dips in one set.", standards: std([5, 10, 15, 25, 35, 45]) },
  { id: "pushups_max", name: "Push-ups (max reps)", attribute: "STR", unit: "reps", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Strict push-ups in one set, chest to fist height.", standards: std([10, 20, 30, 45, 60, 80]) },
  { id: "grip_strength", name: "Grip strength (best hand)", attribute: "STR", unit: "mass", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Best reading on a hand dynamometer (kg-force).", standards: std([30, 38, 45, 52, 60, 70]), inputHint: "Dynamometer reading" },
  { id: "strength_bw_ratio", name: "Strength-to-bodyweight ratio", attribute: "STR", unit: "ratio", direction: "higher", input: "derived", currentWindowDays: Y, description: "Current (bench + squat + deadlift) ÷ body weight. Needs all three lifts and a recent body weight.", standards: std([2.5, 3.5, 4.5, 5.5, 6.5, 7.5]) },
  { id: "strength_total", name: "Estimated muscular strength (big-3 total)", attribute: "STR", unit: "mass", direction: "higher", input: "derived", currentWindowDays: Y, description: "Sum of current bench, squat and deadlift 1RMs." },
  { id: "weekly_training_volume", name: "Weekly resistance-training volume", attribute: "STR", unit: "mass", direction: "higher", input: "derived", currentWindowDays: 7, description: "Total load moved (sets × reps × load) in strength workouts over the last 7 days." },

  // ───────────────────────── ENDURANCE ─────────────────────────
  { id: "mile_time", name: "One-mile run", attribute: "END", unit: "duration", direction: "lower", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "Fastest 1-mile (1609 m) time.", standards: std([600, 510, 450, 390, 345, 300]), inputHint: "m:ss" },
  { id: "run_5k", name: "5K run", attribute: "END", unit: "duration", direction: "lower", input: "manual", currentWindowDays: Y, prMinDelta: 2, description: "5-kilometre race or time-trial time.", standards: std([2100, 1800, 1560, 1350, 1170, 1020]), inputHint: "mm:ss" },
  { id: "run_10k", name: "10K run", attribute: "END", unit: "duration", direction: "lower", input: "manual", currentWindowDays: Y, prMinDelta: 3, description: "10-kilometre race or time-trial time.", standards: std([4500, 3900, 3300, 2850, 2460, 2160]), inputHint: "mm:ss" },
  { id: "half_marathon", name: "Half marathon", attribute: "END", unit: "duration", direction: "lower", input: "manual", currentWindowDays: Y, prMinDelta: 10, description: "21.0975 km race time.", standards: std([9000, 8100, 7200, 6300, 5520, 4800]), inputHint: "h:mm:ss" },
  { id: "longest_run", name: "Longest run", attribute: "END", unit: "distance", direction: "higher", input: "manual", currentWindowDays: 36500, prMinDelta: 0.1, description: "Longest single continuous run ever completed (lifetime feat).", standards: std([3, 5, 10, 21.1, 42.2, 80]) },
  { id: "weekly_mileage", name: "Weekly running distance", attribute: "END", unit: "distance", direction: "higher", input: "derived", currentWindowDays: 7, description: "Distance from runs logged in the last 7 days.", standards: std([5, 10, 20, 35, 55, 80]) },
  { id: "resting_hr", name: "Resting heart rate", attribute: "END", unit: "bpm", direction: "lower", input: "manual", currentWindowDays: 90, description: "Seated or morning resting pulse (beats per minute). Lower generally reflects aerobic fitness; unusually low values in non-athletes, or any symptoms, deserve a clinician's review.", standards: std([85, 75, 68, 60, 52, 45]) },
  { id: "vo2max_measured", name: "VO₂max (measured / device)", attribute: "END", unit: "vo2", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 0.5, description: "From a lab test or a wearable estimate (note which in the entry).", standards: std([30, 36, 42, 48, 55, 62]) },
  { id: "vdot_estimate", name: "Estimated VO₂max (race-derived VDOT)", attribute: "END", unit: "vo2", direction: "higher", input: "derived", currentWindowDays: Y, description: "Daniels & Gilbert VDOT from your best current race (mile–half). An oxygen-cost model estimate, not a lab measurement.", standards: std([30, 36, 42, 48, 55, 62]) },
  { id: "recovery_hr", name: "Heart-rate recovery (1 min)", attribute: "END", unit: "bpm", direction: "higher", input: "manual", currentWindowDays: 180, description: "Drop in heart rate one minute after stopping hard exercise.", standards: std([12, 18, 25, 32, 40, 50]) },
  { id: "cardio_sessions_week", name: "Cardiorespiratory sessions / week", attribute: "END", unit: "count", direction: "higher", input: "derived", currentWindowDays: 7, description: "Runs, rides and swims in the last 7 days.", standards: std([1, 2, 3, 4, 5, 7]) },
  { id: "cycling_ftp", name: "Cycling FTP", attribute: "END", unit: "wkg", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 0.05, description: "Functional threshold power per kg.", standards: std([1.5, 2.0, 2.5, 3.2, 4.0, 4.8]) },
  { id: "swim_100m", name: "100 m swim", attribute: "END", unit: "duration", direction: "lower", input: "manual", currentWindowDays: Y, prMinDelta: 1, description: "100 m freestyle time.", standards: std([180, 150, 125, 105, 85, 70]), inputHint: "m:ss" },

  // ───────────────────────── PHYSICAL DEVELOPMENT ─────────────────────────
  { id: "body_weight", name: "Body weight", attribute: "PHY", unit: "mass", direction: "neutral", input: "manual", currentWindowDays: 60, description: "Body weight. Descriptive only: heavier or lighter isn't 'better'.", excludeFromScore: true },
  { id: "height", name: "Height", attribute: "PHY", unit: "length", direction: "neutral", input: "manual", currentWindowDays: 36500, description: "Standing height. Descriptive only.", excludeFromScore: true },
  { id: "body_fat_pct", name: "Estimated body-fat %", attribute: "PHY", unit: "percent", direction: "neutral", input: "manual", currentWindowDays: 90, description: "From DXA, BIA, calipers or a validated estimate (note method). Descriptive only. Extreme leanness is never rewarded.", excludeFromScore: true },
  { id: "lean_mass", name: "Lean body mass", attribute: "PHY", unit: "mass", direction: "higher", input: "derived", currentWindowDays: 90, description: "Body weight × (1 − body-fat %) using your most recent entries." },
  { id: "muscle_gain", name: "Lean mass change", attribute: "PHY", unit: "mass", direction: "higher", input: "derived", currentWindowDays: 3650, description: "Change in lean body mass since your first body-composition entry." },
  { id: "waist_circumference", name: "Waist circumference", attribute: "PHY", unit: "length", direction: "neutral", input: "manual", currentWindowDays: 90, description: "Measured at the iliac crest (NHANES protocol). Descriptive.", excludeFromScore: true },
  { id: "bmi", name: "Body-mass index", attribute: "PHY", unit: "bmi", direction: "neutral", input: "derived", currentWindowDays: 60, description: "Weight ÷ height². A crude population screening measure; muscular people often read high.", excludeFromScore: true },
  { id: "bodyweight_trend", name: "Body-weight trend (30 d)", attribute: "PHY", unit: "kg_per_week", direction: "neutral", input: "derived", currentWindowDays: 30, description: "Least-squares slope of body weight over the last 30 days.", excludeFromScore: true },
  { id: "training_frequency", name: "Training frequency", attribute: "PHY", unit: "count", direction: "higher", input: "derived", currentWindowDays: 28, description: "Average training sessions per week over 4 weeks (strength, cardio, mobility).", standards: std([1, 2, 3, 4, 5, 6]) },
  { id: "sit_and_reach", name: "Flexibility (sit-and-reach)", attribute: "PHY", unit: "length", direction: "higher", input: "manual", currentWindowDays: Y, prMinDelta: 0.5, description: "Sit-and-reach box score (26 cm = toes on a standard box).", standards: std([15, 22, 28, 33, 38, 43]) },
  { id: "mobility_rating", name: "Mobility self-assessment", attribute: "PHY", unit: "rating", direction: "higher", input: "manual", currentWindowDays: 60, description: "1–10 rating of joint range of motion and movement quality.", standards: std([2, 4, 5, 7, 8, 9]) },
  { id: "recovery_rating", name: "Recovery self-assessment", attribute: "PHY", unit: "rating", direction: "higher", input: "manual", currentWindowDays: 14, description: "1–10 rating of soreness, energy and readiness.", standards: std([2, 4, 5, 7, 8, 9]) },
  { id: "sleep_duration", name: "Sleep duration", attribute: "PHY", unit: "hours", direction: "optimal", input: "manual", currentWindowDays: 7, description: "Hours slept last night. Scored by goal attainment of 7–9 h, so more is not always better.", optimal: { min: 7, max: 9, penaltyPerUnit: 35, source: SLEEP_SOURCE } },
  { id: "sleep_consistency", name: "Sleep consistency", attribute: "PHY", unit: "minutes", direction: "lower", input: "derived", currentWindowDays: 14, description: "Standard deviation of nightly sleep duration over the last 14 logged nights (needs ≥ 5).", standards: std([120, 90, 60, 45, 30, 20]) },

  // ───────────────────────── INTELLIGENCE / KNOWLEDGE ─────────────────────────
  { id: "program_gpa", name: "Current GPA", attribute: "INT", unit: "gpa", direction: "higher", input: "manual", currentWindowDays: 3650, description: "Cumulative GPA at your current school or program.", standards: std([2.0, 2.5, 3.0, 3.4, 3.7, 3.9]) },
  { id: "undergrad_gpa", name: "Undergraduate GPA (overall)", attribute: "INT", unit: "gpa", direction: "higher", input: "manual", currentWindowDays: 36500, description: "Cumulative undergraduate GPA (4.0 scale).", standards: std([2.0, 2.5, 3.0, 3.4, 3.7, 3.9]) },
  { id: "undergrad_science_gpa", name: "Undergraduate science GPA", attribute: "INT", unit: "gpa", direction: "higher", input: "manual", currentWindowDays: 36500, description: "Science/BCP GPA as calculated by your application service.", standards: std([2.0, 2.5, 3.0, 3.4, 3.7, 3.9]) },
  { id: "exam_average", name: "Course exam average", attribute: "INT", unit: "percent", direction: "higher", input: "manual", currentWindowDays: 180, description: "Running average of course examinations.", standards: std([60, 70, 78, 85, 92, 97]) },
  { id: "quiz_average", name: "Quiz performance", attribute: "INT", unit: "percent", direction: "higher", input: "manual", currentWindowDays: 120, description: "Recent quiz / question-bank average.", standards: std([60, 70, 78, 85, 92, 97]) },
  { id: "standardized_exam", name: "Standardized examination", attribute: "INT", unit: "score", direction: "higher", input: "manual", currentWindowDays: 1095, description: "Scaled score on a standardized exam (e.g. SAT, ACT, GRE, MCAT, a licensing or board exam). Note the exam in each entry; scales differ, so this tracks personal progression only." },
  { id: "knowledge_assessment", name: "Knowledge assessment", attribute: "INT", unit: "percent", direction: "higher", input: "manual", currentWindowDays: 180, description: "Self-administered or course knowledge checks.", standards: std([60, 70, 78, 85, 92, 97]) },
  { id: "learning_retention", name: "Learning retention", attribute: "INT", unit: "percent", direction: "higher", input: "manual", currentWindowDays: 60, description: "Mature-card retention rate (e.g. Anki statistics).", standards: std([50, 60, 70, 80, 88, 94]) },
  { id: "study_hours_week", name: "Study hours (7 d)", attribute: "INT", unit: "hours", direction: "higher", input: "derived", currentWindowDays: 7, description: "Focused study time logged in the last 7 days.", standards: std([3, 6, 10, 15, 22, 30]) },
  { id: "retrieval_accuracy", name: "Retrieval-practice accuracy", attribute: "INT", unit: "percent", direction: "higher", input: "manual", currentWindowDays: 60, description: "Accuracy on closed-book recall / practice questions.", standards: std([50, 60, 70, 80, 88, 94]) },
  { id: "skill_mastery", name: "Academic skill mastery", attribute: "INT", unit: "count", direction: "higher", input: "derived", currentWindowDays: 36500, description: "Academic skill-tree nodes unlocked.", standards: std([1, 3, 6, 10, 15, 20]) },
  { id: "reading_pages_week", name: "Reading progress (7 d)", attribute: "INT", unit: "count", direction: "higher", input: "derived", currentWindowDays: 7, description: "Pages read in the last 7 days.", standards: std([20, 50, 100, 150, 250, 400]) },
  { id: "educational_milestones", name: "Educational milestones", attribute: "INT", unit: "count", direction: "higher", input: "derived", currentWindowDays: 36500, description: "Milestones logged (passed a block, certification, rotation, graduation…)." },
  { id: "academic_improvement", name: "Academic improvement (90 d)", attribute: "INT", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 90, description: "Change in course-exam average between the earliest and latest entry in the last 90 days (percentage points)." },
  { id: "cognitive_test_validated", name: "Validated cognitive test", attribute: "INT", unit: "score", direction: "neutral", input: "manual", currentWindowDays: 36500, description: "Only for scores from a validated, professionally administered instrument (e.g. WAIS-IV). Name the instrument in the note. Shown separately and never combined with academic metrics.", excludeFromScore: true },

  // ───────────────────────── DISCIPLINE (game-defined) ─────────────────────────
  { id: "daily_quest_rate", name: "Daily quest completion", attribute: "DIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 14, description: "Share of daily quests completed over the last 14 days.", standards: std([20, 40, 60, 75, 90, 97]) },
  { id: "weekly_quest_rate", name: "Weekly quest completion", attribute: "DIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 28, description: "Share of weekly quests completed over the last 4 finished weeks.", standards: std([20, 40, 60, 75, 90, 97]) },
  { id: "study_consistency", name: "Study consistency", attribute: "DIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 14, description: "Days with a qualifying study session in the last 14 days.", standards: std([15, 30, 50, 65, 80, 93]) },
  { id: "workout_consistency", name: "Workout consistency", attribute: "DIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 28, description: "Training days in the last 28 vs. a target of 4 per week (capped at 100%).", standards: std([20, 40, 60, 75, 90, 100]) },
  { id: "habit_adherence", name: "Habit adherence", attribute: "DIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 14, description: "Completion of habit-type daily objectives (sleep, reflection, nutrition) over 14 days.", standards: std([20, 40, 60, 75, 90, 97]) },
  { id: "planned_vs_completed", name: "Planned vs. completed", attribute: "DIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 14, description: "All accepted quests completed ÷ accepted, over 14 days.", standards: std([20, 40, 60, 75, 90, 97]) },
  { id: "on_time_rate", name: "Procrastination reduction (on-time rate)", attribute: "DIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 60, description: "Deadline-based (emergency) quests completed before their deadline.", standards: std([20, 40, 60, 75, 90, 97]) },
  { id: "focus_sessions_week", name: "Focus sessions completed (7 d)", attribute: "DIS", unit: "count", direction: "higher", input: "derived", currentWindowDays: 7, description: "Dungeons cleared in the last 7 days.", standards: std([1, 2, 4, 6, 9, 12]) },
  { id: "goal_adherence", name: "Personal goal adherence", attribute: "DIS", unit: "count", direction: "higher", input: "derived", currentWindowDays: 30, description: "Main-story objectives completed in the last 30 days.", standards: std([1, 2, 4, 6, 9, 12]) },
  { id: "consistency_streak", name: "Consistency streak", attribute: "DIS", unit: "count", direction: "higher", input: "derived", currentWindowDays: 1, description: "Consecutive days with at least one qualifying action.", standards: std([2, 4, 7, 14, 30, 60]) },
  { id: "comeback_rate", name: "Recovery from missed days", attribute: "DIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 60, description: "After a day with no activity, how often you were back the next day (60 d).", standards: std([20, 40, 60, 75, 90, 97]) },

  // ───────────────────────── WEALTH (individual) ─────────────────────────
  { id: "savings", name: "Savings", attribute: "WLT", unit: "currency", direction: "higher", input: "manual", currentWindowDays: 120, scope: "individual", description: "Your cash savings (individual, not household)." },
  { id: "net_worth", name: "Net worth", attribute: "WLT", unit: "currency", direction: "higher", input: "manual", currentWindowDays: 120, scope: "individual", description: "Your assets minus your debts (individual)." },
  { id: "liquid_assets", name: "Liquid assets", attribute: "WLT", unit: "currency", direction: "higher", input: "manual", currentWindowDays: 120, scope: "individual", description: "Cash and cash-equivalents you could access within days." },
  { id: "debt", name: "Debt", attribute: "WLT", unit: "currency", direction: "lower", input: "manual", currentWindowDays: 120, scope: "individual", description: "Total outstanding debt, student loans included." },
  { id: "income_annual", name: "Annual income", attribute: "WLT", unit: "currency", direction: "higher", input: "manual", currentWindowDays: Y, scope: "individual", description: "Your own gross annual income (stipends/assistantships included)." },
  { id: "savings_rate", name: "Savings rate", attribute: "WLT", unit: "percent", direction: "higher", input: "manual", currentWindowDays: 120, scope: "individual", description: "Share of take-home income saved or invested.", standards: std([5, 10, 15, 20, 30, 40]) },
  { id: "monthly_expenses", name: "Monthly expenses", attribute: "WLT", unit: "currency", direction: "neutral", input: "manual", currentWindowDays: 120, scope: "individual", description: "Typical monthly spending.", excludeFromScore: true },
  { id: "emergency_fund_months", name: "Emergency fund", attribute: "WLT", unit: "months", direction: "higher", input: "derived", currentWindowDays: 120, scope: "individual", description: "Liquid assets ÷ monthly expenses.", standards: std([0.5, 1, 2, 3, 6, 9]) },
  { id: "investment_contributions", name: "Investment contributions (month)", attribute: "WLT", unit: "currency", direction: "higher", input: "manual", currentWindowDays: 60, scope: "individual", description: "Amount invested this month (retirement and brokerage)." },
  { id: "financial_goal_completion", name: "Financial goal completion", attribute: "WLT", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 36500, description: "Progress through the Financial Awakening story arc.", standards: std([10, 25, 50, 75, 90, 100]) },
  { id: "debt_reduction", name: "Debt reduction (90 d)", attribute: "WLT", unit: "currency", direction: "higher", input: "derived", currentWindowDays: 90, description: "Decrease in total debt between the earliest and latest entries in the last 90 days." },
  { id: "financial_literacy", name: "Financial-literacy milestones", attribute: "WLT", unit: "count", direction: "higher", input: "derived", currentWindowDays: 36500, description: "Financial-literacy lessons completed.", standards: std([1, 3, 6, 10, 15, 25]) },

  // ───────────────────────── CHARISMA / SOCIAL (personal progression) ─────────────────────────
  { id: "communication_practice", name: "Communication practice (30 d)", attribute: "CHA", unit: "count", direction: "higher", input: "derived", currentWindowDays: 30, description: "Deliberate communication practice sessions in 30 days.", standards: std([1, 2, 4, 8, 12, 20]) },
  { id: "public_speaking_total", name: "Public-speaking experience", attribute: "CHA", unit: "count", direction: "higher", input: "derived", currentWindowDays: 36500, description: "Public-speaking engagements logged (lifetime).", standards: std([1, 3, 5, 10, 20, 40]) },
  { id: "presentations_total", name: "Presentations completed", attribute: "CHA", unit: "count", direction: "higher", input: "derived", currentWindowDays: 36500, description: "Presentations delivered (lifetime, from logs).", standards: std([1, 3, 6, 12, 25, 50]) },
  { id: "leadership_experience", name: "Leadership roles", attribute: "CHA", unit: "count", direction: "higher", input: "manual", currentWindowDays: 36500, description: "Number of leadership roles held (club officer, team lead, chief resident…).", standards: std([1, 2, 3, 4, 6, 8]) },
  { id: "networking_30d", name: "Networking activities (30 d)", attribute: "CHA", unit: "count", direction: "higher", input: "derived", currentWindowDays: 30, description: "Networking events, informational interviews, professional outreach.", standards: std([1, 2, 3, 5, 8, 12]) },
  { id: "social_confidence", name: "Social confidence (self-assessment)", attribute: "CHA", unit: "rating", direction: "higher", input: "manual", currentWindowDays: 60, description: "1–10 self-rating. Personal progression only.", standards: std([2, 4, 5, 7, 8, 9]) },
  { id: "relationship_maintenance", name: "Relationship maintenance (30 d)", attribute: "CHA", unit: "count", direction: "higher", input: "derived", currentWindowDays: 30, description: "Intentional time with friends and family.", standards: std([1, 3, 6, 10, 15, 22]) },
  { id: "volunteering_hours", name: "Volunteering hours", attribute: "CHA", unit: "hours", direction: "higher", input: "derived", currentWindowDays: 36500, description: "Lifetime volunteering hours logged.", standards: std([2, 5, 10, 25, 50, 100]) },
  { id: "mentoring_total", name: "Mentoring sessions", attribute: "CHA", unit: "count", direction: "higher", input: "derived", currentWindowDays: 36500, description: "Mentoring sessions given (lifetime).", standards: std([1, 3, 6, 12, 25, 50]) },
  { id: "interpersonal_development", name: "Interpersonal skill development (30 d)", attribute: "CHA", unit: "count", direction: "higher", input: "derived", currentWindowDays: 30, description: "Practice sessions for listening, empathy, conflict resolution.", standards: std([1, 2, 4, 6, 9, 12]) },

  // ───────────────────────── WISDOM / WELLNESS ─────────────────────────
  { id: "sleep_regularity", name: "Sleep regularity", attribute: "WIS", unit: "percent", direction: "higher", input: "derived", currentWindowDays: 14, description: "Logged nights in the 7–9 h range over the last 14 days.", standards: std([20, 40, 60, 75, 85, 95]) },
  { id: "stress_management_7d", name: "Stress-management habits (7 d)", attribute: "WIS", unit: "count", direction: "higher", input: "derived", currentWindowDays: 7, description: "Stress-management practices in 7 days.", standards: std([1, 2, 3, 4, 5, 6]) },
  { id: "journaling_7d", name: "Reflection & journaling (7 d)", attribute: "WIS", unit: "count", direction: "higher", input: "derived", currentWindowDays: 7, description: "Daily reflections in the last 7 days.", standards: std([1, 2, 3, 4, 5, 7]) },
  { id: "emotional_regulation_7d", name: "Emotional-regulation practice (7 d)", attribute: "WIS", unit: "count", direction: "higher", input: "derived", currentWindowDays: 7, description: "Practices such as reappraisal, breathing, therapy homework.", standards: std([1, 2, 3, 4, 5, 6]) },
  { id: "personal_development_30d", name: "Personal development (30 d)", attribute: "WIS", unit: "count", direction: "higher", input: "derived", currentWindowDays: 30, description: "Sessions on growth goals, values, new skills.", standards: std([1, 2, 4, 6, 9, 12]) },
  { id: "mindfulness_minutes_week", name: "Mindfulness minutes (7 d)", attribute: "WIS", unit: "minutes", direction: "higher", input: "derived", currentWindowDays: 7, description: "Meditation / mindfulness minutes in the last 7 days.", standards: std([10, 30, 60, 90, 140, 200]) },
  { id: "recovery_days_7d", name: "Recovery days (7 d)", attribute: "WIS", unit: "count", direction: "optimal", input: "derived", currentWindowDays: 7, description: "Days in the last 7 with no training logged. 1–3 recovery days a week is rewarded; training through exhaustion is not.", optimal: { min: 1, max: 3, penaltyPerUnit: 30, source: "General training-periodization guidance (e.g. ACSM position stand on resistance training progression, 2009): plan regular recovery between hard sessions." } },
  { id: "work_life_balance", name: "Work-life balance (self-assessment)", attribute: "WIS", unit: "rating", direction: "higher", input: "manual", currentWindowDays: 30, description: "1–10 self-rating.", standards: std([2, 4, 5, 7, 8, 9]) },
  { id: "decision_reflections_30d", name: "Decision-making reflections (30 d)", attribute: "WIS", unit: "count", direction: "higher", input: "derived", currentWindowDays: 30, description: "Structured reflections on important decisions.", standards: std([1, 2, 3, 5, 8, 12]) },
];

export const METRIC_BY_ID: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export function metricsForAttribute(code: AttributeCode): MetricDef[] {
  return METRICS.filter((m) => m.attribute === code);
}

export function isBetter(direction: Direction, a: number, b: number): boolean {
  if (direction === "higher") return a > b;
  if (direction === "lower") return a < b;
  return false;
}
