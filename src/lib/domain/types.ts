export const ATTRIBUTE_CODES = ["STR", "END", "PHY", "INT", "DIS", "WLT", "CHA", "WIS"] as const;
export type AttributeCode = (typeof ATTRIBUTE_CODES)[number];

export const RANKS = ["E", "D", "C", "B", "A", "S", "S+"] as const;
export type Rank = (typeof RANKS)[number];

export type Direction = "higher" | "lower" | "optimal" | "neutral";

/**
 * Canonical storage units (all values are stored in these, converted only for display/input):
 * mass=kg, duration=seconds, distance=km, length=cm, currency=USD, percent=0..100,
 * hours=hours, minutes=minutes, everything else is a plain number.
 */
export type UnitKind =
  | "mass"
  | "duration"
  | "distance"
  | "length"
  | "count"
  | "reps"
  | "percent"
  | "bpm"
  | "ratio"
  | "currency"
  | "hours"
  | "minutes"
  | "gpa"
  | "score"
  | "rating"
  | "vo2"
  | "wkg"
  | "bmi"
  | "kg_per_week"
  | "months";

/** Evidence level of a rank. */
export type Evidence = "verified" | "estimated" | "personal";

export type EntryContext = "current" | "historical" | "test";

export type UnitSystem = "imperial" | "metric";

export type Sex = "male" | "female";
