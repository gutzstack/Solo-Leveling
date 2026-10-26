"use client";
import { addDays, isoWeekday } from "@/lib/domain/dates";
import { Tip } from "@/components/ui/switch";

/** Activity heatmap: one cell per day, weeks as columns (Mon–Sun rows). */
export function StreakCalendar({ activeDays, today, weeks = 16, xpByDay }: { activeDays: string[]; today: string; weeks?: number; xpByDay?: Record<string, number> }) {
  const set = new Set(activeDays);
  const end = addDays(today, 7 - isoWeekday(today));
  const start = addDays(end, -(weeks * 7 - 1));
  const cols: string[][] = [];
  for (let w = 0; w < weeks; w++) cols.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const max = Math.max(1, ...Object.values(xpByDay ?? {}));
  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex gap-[3px]" role="grid" aria-label={`Activity calendar, last ${weeks} weeks`}>
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]" role="row">
            {col.map((d) => {
              const future = d > today;
              const active = set.has(d);
              const xp = xpByDay?.[d] ?? 0;
              const intensity = active ? 0.35 + 0.65 * Math.min(1, xp / max) : 0;
              return (
                <Tip key={d} content={`${d}: ${active ? `active${xp ? ` · ${xp} XP` : ""}` : future ? "upcoming" : "no qualifying activity"}`}>
                  <span
                    role="gridcell"
                    aria-label={`${d} ${active ? "active" : "inactive"}`}
                    tabIndex={-1}
                    className="block size-3.5 rounded-[3px] border sm:size-4"
                    style={{
                      borderColor: d === today ? "var(--border-strong)" : "var(--border)",
                      background: future ? "transparent" : active ? `rgba(56, 189, 248, ${intensity})` : "rgba(93, 107, 140, 0.12)",
                      boxShadow: active && intensity > 0.7 ? "0 0 8px rgba(56,189,248,0.6)" : undefined,
                    }}
                  />
                </Tip>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">Filled = a day with at least one qualifying action. Brighter = more XP.</p>
    </div>
  );
}
