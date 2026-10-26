/**
 * Date helpers. "Days" are calendar dates (YYYY-MM-DD strings) in the player's own time zone,
 * so a study session at 11:30pm in New York counts toward that New York day.
 */

export type ISODate = string; // YYYY-MM-DD

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date of `instant` in time zone `tz`. */
export function localDate(instant: Date, tz: string): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidTimeZone(tz) ? tz : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** ISO weekday 1 (Mon) … 7 (Sun). */
export function isoWeekday(date: ISODate): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday of the week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date));
}

/** Inclusive list of dates. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Age in whole years on `onDate`. Handles Feb-29 birthdays (birthday treated as Mar 1 in non-leap years). */
export function ageOn(dateOfBirth: ISODate, onDate: ISODate): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  let age = y - by;
  const isLeap = (yr: number) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
  let bMonth = bm;
  let bDay = bd;
  if (bm === 2 && bd === 29 && !isLeap(y)) {
    bMonth = 3;
    bDay = 1;
  }
  if (m < bMonth || (m === bMonth && d < bDay)) age -= 1;
  return age;
}

/**
 * Current streak: consecutive active days ending today (or yesterday, so the streak isn't shown as
 * broken before the player has had a chance to act today).
 */
export function currentStreak(activeDays: Set<ISODate>, today: ISODate): number {
  let cursor = activeDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (activeDays.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak(activeDays: Set<ISODate>): number {
  const sorted = [...activeDays].sort();
  let best = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
