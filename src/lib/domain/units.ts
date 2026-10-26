import type { UnitKind, UnitSystem } from "./types";

export const LB_PER_KG = 2.20462262185;
export const KM_PER_MILE = 1.609344;
export const CM_PER_INCH = 2.54;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const kmToMi = (km: number) => km / KM_PER_MILE;
export const miToKm = (mi: number) => mi * KM_PER_MILE;
export const cmToIn = (cm: number) => cm / CM_PER_INCH;
export const inToCm = (inch: number) => inch * CM_PER_INCH;

export function feetInchesToCm(feet: number, inches: number): number {
  return inToCm(feet * 12 + inches);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalIn = cmToIn(cm);
  let feet = Math.floor(totalIn / 12);
  let inches = Math.round((totalIn - feet * 12) * 10) / 10;
  if (inches >= 12) {
    feet += 1;
    inches -= 12;
  }
  return { feet, inches };
}

/**
 * Parse a time string into seconds. Accepts "ss", "mm:ss", "h:mm:ss" and decimals ("5:40.5").
 * Returns null for malformed input.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(s)) return null;
  const parts = s.split(":");
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  // Minutes/seconds components after the first must be < 60.
  for (let i = 1; i < nums.length; i++) if (nums[i] >= 60) return null;
  let total = 0;
  for (const n of nums) total = total * 60 + n;
  return total;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "—";
  const rounded = Math.round(totalSeconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export interface DisplayUnit {
  /** short label, e.g. "lb" */
  label: string;
  /** canonical -> display */
  toDisplay: (v: number) => number;
  /** display -> canonical */
  fromDisplay: (v: number) => number;
  decimals: number;
}

const identity = (v: number) => v;

export function displayUnit(kind: UnitKind, system: UnitSystem): DisplayUnit {
  const imperial = system === "imperial";
  switch (kind) {
    case "mass":
      return imperial
        ? { label: "lb", toDisplay: kgToLb, fromDisplay: lbToKg, decimals: 1 }
        : { label: "kg", toDisplay: identity, fromDisplay: identity, decimals: 1 };
    case "kg_per_week":
      return imperial
        ? { label: "lb/wk", toDisplay: kgToLb, fromDisplay: lbToKg, decimals: 2 }
        : { label: "kg/wk", toDisplay: identity, fromDisplay: identity, decimals: 2 };
    case "distance":
      return imperial
        ? { label: "mi", toDisplay: kmToMi, fromDisplay: miToKm, decimals: 2 }
        : { label: "km", toDisplay: identity, fromDisplay: identity, decimals: 2 };
    case "length":
      return imperial
        ? { label: "in", toDisplay: cmToIn, fromDisplay: inToCm, decimals: 1 }
        : { label: "cm", toDisplay: identity, fromDisplay: identity, decimals: 1 };
    case "duration":
      return { label: "", toDisplay: identity, fromDisplay: identity, decimals: 0 };
    case "currency":
      return { label: "USD", toDisplay: identity, fromDisplay: identity, decimals: 0 };
    case "percent":
      return { label: "%", toDisplay: identity, fromDisplay: identity, decimals: 1 };
    case "bpm":
      return { label: "bpm", toDisplay: identity, fromDisplay: identity, decimals: 0 };
    case "hours":
      return { label: "h", toDisplay: identity, fromDisplay: identity, decimals: 1 };
    case "minutes":
      return { label: "min", toDisplay: identity, fromDisplay: identity, decimals: 0 };
    case "gpa":
      return { label: "GPA", toDisplay: identity, fromDisplay: identity, decimals: 2 };
    case "ratio":
      return { label: "×BW", toDisplay: identity, fromDisplay: identity, decimals: 2 };
    case "vo2":
      return { label: "ml/kg/min", toDisplay: identity, fromDisplay: identity, decimals: 1 };
    case "wkg":
      return { label: "W/kg", toDisplay: identity, fromDisplay: identity, decimals: 2 };
    case "bmi":
      return { label: "kg/m²", toDisplay: identity, fromDisplay: identity, decimals: 1 };
    case "reps":
      return { label: "reps", toDisplay: identity, fromDisplay: identity, decimals: 0 };
    case "rating":
      return { label: "/10", toDisplay: identity, fromDisplay: identity, decimals: 0 };
    case "score":
      return { label: "pts", toDisplay: identity, fromDisplay: identity, decimals: 0 };
    case "months":
      return { label: "mo", toDisplay: identity, fromDisplay: identity, decimals: 1 };
    case "count":
    default:
      return { label: "", toDisplay: identity, fromDisplay: identity, decimals: 0 };
  }
}

export function formatValue(kind: UnitKind, canonical: number | null | undefined, system: UnitSystem): string {
  if (canonical === null || canonical === undefined || !Number.isFinite(canonical)) return "—";
  if (kind === "duration") return formatDuration(canonical);
  const u = displayUnit(kind, system);
  const v = u.toDisplay(canonical);
  if (kind === "currency") {
    return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  const fixed = roundTo(v, u.decimals);
  const str = fixed.toLocaleString("en-US", { maximumFractionDigits: u.decimals, minimumFractionDigits: 0 });
  if (!u.label) return str;
  if (u.label === "%") return `${str}%`;
  return `${str} ${u.label}`;
}

/** Convert user-entered display text into a canonical value. */
export function parseDisplayInput(kind: UnitKind, raw: string, system: UnitSystem): number | null {
  if (kind === "duration") return parseDuration(raw);
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return displayUnit(kind, system).fromDisplay(n);
}

export function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
