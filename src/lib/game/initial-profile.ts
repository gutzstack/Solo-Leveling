import { feetInchesToCm, lbToKg, miToKm } from "../domain/units";
import type { EntryContext } from "../domain/types";

/**
 * Suggested starting values for the first player. They pre-fill the onboarding form as editable
 * suggestions, never as facts. Anything not listed stays blank.
 */
export const INITIAL_PROFILE = {
  display_name: "Player",
  age_years: 21,
  country: "United States",
  height_cm: Math.round(feetInchesToCm(5, 9) * 10) / 10, // 175.3 cm
  weight_kg: lbToKg(145),
  sex: null as "male" | "female" | null,
  education_level: "Graduate student",
  occupation: "Physician Assistant graduate student",
  goals: [
    "Excel academically in PA school",
    "Build muscle",
    "Improve athletic performance",
    "Develop financial independence",
    "Become exceptionally disciplined",
  ],
  fitness_experience: "Intermediate",
  difficulty: "normal" as const,
};

export interface InitialMetric {
  metricId: string;
  value: number;
  context: EntryContext;
  note: string;
}

export const INITIAL_METRICS: InitialMetric[] = [
  { metricId: "bench_press_1rm", value: lbToKg(205), context: "current", note: "Starting value from onboarding" },
  { metricId: "mile_time", value: 5 * 60 + 40, context: "historical", note: "Historical personal best (not current ability)" },
  { metricId: "run_5k", value: 19 * 60 + 30, context: "historical", note: "Historical personal best (not current ability)" },
  { metricId: "run_5k", value: 21 * 60 + 34, context: "current", note: "Recent 5K" },
  { metricId: "longest_run", value: miToKm(31), context: "historical", note: "Lifetime longest run (31 mi)" },
  { metricId: "undergrad_gpa", value: 3.68, context: "current", note: "Final overall undergraduate GPA" },
  { metricId: "undergrad_science_gpa", value: 3.5, context: "current", note: "Undergraduate science GPA" },
];
