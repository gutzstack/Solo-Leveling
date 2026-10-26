import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "@/lib/domain/achievements";
import { addDays, ageOn, currentStreak, daysBetween, isISODate, localDate, longestStreak, weekStart } from "@/lib/domain/dates";
import { canClear, creditedMinutes, activeSecondsNow } from "@/lib/domain/dungeons";
import { METRICS } from "@/lib/domain/metrics";
import { optimalRangeScore, rankFromPercentile, standardScore } from "@/lib/domain/ranks";
import { SKILLS, requirementMet } from "@/lib/domain/skills";
import { cmToFeetInches, feetInchesToCm, formatDuration, formatValue, kgToLb, lbToKg, parseDisplayInput, parseDuration } from "@/lib/domain/units";
import { evaluatePersonalRecord, findLikelyDuplicate, levelFromXp, planActivityXp, planMetricLogXp, DEFAULT_XP_CONFIG, sumLedger, totalXpForLevel, xpToNextLevel, type XpTransactionRow } from "@/lib/domain/xp";
import { METRIC_BY_ID } from "@/lib/domain/metrics";
import { vdotFromRace } from "@/lib/game/derived";

describe("rank thresholds", () => {
  it.each([
    [0, "E"],
    [19.99, "E"],
    [20, "D"],
    [39.9, "D"],
    [40, "C"],
    [59.99, "C"],
    [60, "B"],
    [79.9, "B"],
    [80, "A"],
    [94.99, "A"],
    [95, "S"],
    [98.99, "S"],
    [99, "S+"],
    [100, "S+"],
  ])("percentile %s → %s", (p, r) => {
    expect(rankFromPercentile(p)).toBe(r);
  });
  it("clamps out-of-range and rejects non-finite input", () => {
    expect(rankFromPercentile(-5)).toBe("E");
    expect(rankFromPercentile(140)).toBe("S+");
    expect(() => rankFromPercentile(NaN)).toThrow();
  });
  it("game standards map thresholds onto rank band edges", () => {
    const t = [10, 20, 30, 45, 60, 80] as const;
    expect(standardScore(10, t, "higher")).toBe(20);
    expect(standardScore(45, t, "higher")).toBe(80);
    expect(rankFromPercentile(standardScore(80, t, "higher"))).toBe("S+");
    expect(rankFromPercentile(standardScore(9, t, "higher"))).toBe("E");
    // lower-is-better (5K seconds)
    const run = [2100, 1800, 1560, 1350, 1170, 1020] as const;
    expect(rankFromPercentile(standardScore(1294, run, "lower"))).toBe("A");
    expect(standardScore(1000, run, "lower")).toBeGreaterThan(standardScore(1100, run, "lower"));
    expect(() => standardScore(5, [1, 2, 3, 3, 5, 6], "higher")).toThrow();
  });
  it("optimal ranges reward the range, not 'more'", () => {
    expect(optimalRangeScore(8, 7, 9, 35)).toBe(100);
    expect(optimalRangeScore(10, 7, 9, 35)).toBe(65);
    expect(optimalRangeScore(5, 7, 9, 35)).toBe(30);
    expect(optimalRangeScore(12, 7, 9, 35)).toBe(0);
  });
});

describe("units", () => {
  it("converts mass, height and durations accurately", () => {
    expect(lbToKg(205)).toBeCloseTo(92.986, 3);
    expect(kgToLb(lbToKg(145))).toBeCloseTo(145, 9);
    expect(feetInchesToCm(5, 9)).toBeCloseTo(175.26, 2);
    expect(cmToFeetInches(175.3)).toEqual({ feet: 5, inches: 9 });
    expect(parseDuration("5:40")).toBe(340);
    expect(parseDuration("21:34")).toBe(1294);
    expect(parseDuration("1:32:10")).toBe(5530);
    expect(parseDuration("5:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(formatDuration(1294)).toBe("21:34");
    expect(formatDuration(5530)).toBe("1:32:10");
  });
  it("round-trips display input in both systems", () => {
    expect(parseDisplayInput("mass", "205", "imperial")).toBeCloseTo(92.986, 3);
    expect(formatValue("mass", lbToKg(205), "imperial")).toBe("205 lb");
    expect(formatValue("distance", 49.8897, "imperial")).toBe("31 mi");
    expect(parseDisplayInput("currency", "$1,250", "imperial")).toBe(1250);
    expect(parseDisplayInput("mass", "", "metric")).toBeNull();
  });
});

describe("dates", () => {
  it("handles local days, weeks, ages and leap years", () => {
    // 03:30 UTC on Oct 26 is still Oct 25 in New York
    expect(localDate(new Date("2026-10-26T03:30:00Z"), "America/New_York")).toBe("2026-10-25");
    expect(localDate(new Date("2026-10-26T03:30:00Z"), "Not/AZone")).toBe("2026-10-26");
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday → Monday
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // across US DST change
    expect(ageOn("2005-10-27", "2026-10-26")).toBe(20);
    expect(ageOn("2005-10-26", "2026-10-26")).toBe(21);
    expect(ageOn("2004-02-29", "2025-02-28")).toBe(20);
    expect(ageOn("2004-02-29", "2025-03-01")).toBe(21);
    expect(isISODate("2026-02-30")).toBe(false);
  });
  it("computes streaks without breaking before today is over", () => {
    const days = new Set(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(currentStreak(days, "2026-10-26")).toBe(4);
    expect(currentStreak(days, "2026-10-27")).toBe(0);
    expect(longestStreak(new Set(["2026-01-01", "2026-01-02", "2026-01-05"]))).toBe(2);
  });
});

describe("XP system", () => {
  it("uses round(100 × level^1.35) and inverts correctly", () => {
    expect(xpToNextLevel(1)).toBe(100);
    expect(xpToNextLevel(2)).toBe(Math.round(100 * 2 ** 1.35));
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    const at10 = totalXpForLevel(10);
    expect(levelFromXp(at10).level).toBe(10);
    expect(levelFromXp(at10 - 1).level).toBe(9);
    expect(levelFromXp(at10, 50, 1.2).level).toBeGreaterThan(10);
  });
  it("sums the ledger, applying reversals to the original bucket", () => {
    const row = (o: Partial<XpTransactionRow>): XpTransactionRow => ({ id: "x", amount: 0, kind: "effort", attribute_code: null, source_type: "t", source_id: null, reason: "", reverses_id: null, idempotency_key: Math.random().toString(), awarded_on: "2026-10-26", created_at: "", ...o });
    const t = sumLedger([row({ id: "a", amount: 50, attribute_code: "STR" }), row({ id: "b", amount: 200, kind: "performance", attribute_code: "END" }), row({ id: "c", amount: -200, kind: "reversal", reverses_id: "b" })]);
    expect(t.total).toBe(50);
    expect(t.performance).toBe(0);
    expect(t.byAttribute).toEqual({ STR: 50, END: 0 });
  });
  it("requires meaningful completion and enforces daily caps", () => {
    expect(planActivityXp({ type: "study", duration_min: 10, quantity: null, occurred_on: "2026-10-26" }, 0, DEFAULT_XP_CONFIG).amount).toBe(0);
    expect(planActivityXp({ type: "study", duration_min: 30, quantity: null, occurred_on: "2026-10-26" }, 0, DEFAULT_XP_CONFIG).amount).toBe(30);
    expect(planActivityXp({ type: "study", duration_min: 30, quantity: null, occurred_on: "2026-10-26" }, 6, DEFAULT_XP_CONFIG).amount).toBe(0);
    // run qualifies by distance OR time
    expect(planActivityXp({ type: "run", duration_min: 8, quantity: 2, occurred_on: "2026-10-26" }, 0, DEFAULT_XP_CONFIG).amount).toBe(40);
    expect(planActivityXp({ type: "run", duration_min: 5, quantity: 0.5, occurred_on: "2026-10-26" }, 0, DEFAULT_XP_CONFIG).amount).toBe(0);
    expect(planActivityXp({ type: "study", duration_min: 30, quantity: null, occurred_on: "2026-10-26" }, 0, { ...DEFAULT_XP_CONFIG, activityOverrides: { study: 45 } }).amount).toBe(45);
    expect(planMetricLogXp("historical", 0, DEFAULT_XP_CONFIG).amount).toBe(0);
    expect(planMetricLogXp("current", 10, DEFAULT_XP_CONFIG).amount).toBe(0);
  });
  it("flags likely duplicate activity logs", () => {
    const now = new Date("2026-10-26T15:00:00Z");
    const existing = [{ type: "run", duration_min: 30, quantity: 5, occurred_on: "2026-10-26", created_at: "2026-10-26T14:55:00Z" }];
    expect(findLikelyDuplicate({ type: "run", duration_min: 30.5, quantity: 5, occurred_on: "2026-10-26" }, existing, now)).not.toBeNull();
    expect(findLikelyDuplicate({ type: "run", duration_min: 45, quantity: 5, occurred_on: "2026-10-26" }, existing, now)).toBeNull();
    expect(findLikelyDuplicate({ type: "run", duration_min: 30, quantity: 5, occurred_on: "2026-10-26" }, existing, new Date("2026-10-26T18:00:00Z"))).toBeNull();
  });
  it("personal records: baseline, min delta, cooldown, historical", () => {
    const def = METRIC_BY_ID.run_5k;
    const cfg = DEFAULT_XP_CONFIG;
    expect(evaluatePersonalRecord(def, { value: 1294, context: "current", recorded_on: "2026-10-26" }, [], null, "2026-10-26", cfg)).toMatchObject({ isBaseline: true, amount: 0 });
    expect(evaluatePersonalRecord(def, { value: 1280, context: "current", recorded_on: "2026-10-26" }, [{ value: 1294 }], null, "2026-10-26", cfg)).toMatchObject({ isRecord: true, amount: 200 });
    expect(evaluatePersonalRecord(def, { value: 1293, context: "current", recorded_on: "2026-10-26" }, [{ value: 1294 }], null, "2026-10-26", cfg).isRecord).toBe(false);
    expect(evaluatePersonalRecord(def, { value: 1200, context: "current", recorded_on: "2026-10-26" }, [{ value: 1294 }], "2026-10-22", "2026-10-26", cfg)).toMatchObject({ isRecord: true, amount: 0 });
    expect(evaluatePersonalRecord(def, { value: 1100, context: "historical", recorded_on: "2026-10-26" }, [{ value: 1294 }], null, "2026-10-26", cfg).amount).toBe(0);
  });
});

describe("dungeon timing", () => {
  it("counts only active time and credits pomodoro focus minutes", () => {
    const now = new Date("2026-10-26T15:00:00Z");
    expect(activeSecondsNow({ status: "active", active_seconds: 600, last_resumed_at: "2026-10-26T14:50:00Z" }, now)).toBe(1200);
    expect(activeSecondsNow({ status: "paused", active_seconds: 600, last_resumed_at: null }, now)).toBe(600);
    expect(creditedMinutes("focus", 90 * 60)).toBe(90);
    expect(creditedMinutes("pomodoro", 60 * 60)).toBe(50);
    expect(canClear(90, 81 * 60)).toBe(true);
    expect(canClear(90, 80 * 60)).toBe(false);
  });
});

describe("catalog requirements", () => {
  it("has 60+ metrics, 100+ achievements and well-formed skill trees", () => {
    expect(METRICS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(METRICS.map((m) => m.id)).size).toBe(METRICS.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ACHIEVEMENTS.map((a) => a.code)).size).toBe(ACHIEVEMENTS.length);
    expect(SKILLS.length).toBe(75);
    for (const s of SKILLS) if (s.requires) expect(SKILLS.some((x) => x.code === s.requires)).toBe(true);
    expect(requirementMet({ stat: "x", op: "lte", value: 1200, label: "" }, { x: 1199 })).toBe(true);
    expect(requirementMet({ stat: "x", op: "lte", value: 1200, label: "" }, { x: Number.POSITIVE_INFINITY })).toBe(false);
  });
  it("estimates VO2 (VDOT) from race times with the Daniels–Gilbert model", () => {
    expect(vdotFromRace(5000, 1294)).toBeCloseTo(45.6, 0);
    expect(vdotFromRace(5000, 1170)).toBeGreaterThan(vdotFromRace(5000, 1294));
  });
});
