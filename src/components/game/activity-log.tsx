"use client";
import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Pill } from "@/components/system/primitives";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { ACTIVITY_BY_TYPE } from "@/lib/domain/activities";
import { displayUnit } from "@/lib/domain/units";

/** Full activity history with the XP each entry earned; deleting reverses that XP in the ledger. */
export function ActivityLogDialog() {
  const { data } = useSnapshot();
  const cmd = useCommand();
  if (!data) return null;
  const xpBySource = new Map<string, number>();
  for (const x of data.xpLedger) if (x.source_id && !x.reversed && x.kind !== "reversal") xpBySource.set(x.source_id, (xpBySource.get(x.source_id) ?? 0) + x.amount);
  const units = data.settings.unit_system;
  const list = [...data.activities].reverse();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <History /> Full log
        </Button>
      </DialogTrigger>
      <DialogContent title="Activity log" description="Everything you've logged. Deleting an entry reverses any XP it earned (recorded in the ledger); quests and achievements already earned stay earned." className="max-w-2xl">
        <ul className="max-h-[65dvh] divide-y divide-line/50 overflow-y-auto">
          {list.length === 0 ? <li className="py-2 text-sm text-faint">Nothing logged yet.</li> : null}
          {list.map((a) => {
            const def = ACTIVITY_BY_TYPE[a.type];
            const q = def?.quantity;
            const qty =
              a.quantity && q
                ? q.kind === "distance"
                  ? `${Math.round(displayUnit("distance", units).toDisplay(a.quantity) * 100) / 100} ${displayUnit("distance", units).label}`
                  : q.kind === "volume_kg"
                    ? `${Math.round(displayUnit("mass", units).toDisplay(a.quantity))} ${displayUnit("mass", units).label} vol.`
                    : `${a.quantity} ${q.label.toLowerCase()}`
                : null;
            const xp = xpBySource.get(a.id) ?? 0;
            const note = typeof a.details?.note === "string" ? a.details.note : null;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="w-24 font-mono text-xs text-faint">{a.occurred_on}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-fg">{def?.name ?? a.type}</span>
                  <span className="block text-xs text-dim">
                    {[a.duration_min ? `${Math.round(a.duration_min)} min` : null, qty, note].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {a.source !== "manual" ? <Pill>{a.source}</Pill> : null}
                <span className="w-14 text-right font-mono text-xs text-accent">{xp ? `+${xp}` : "0 XP"}</span>
                <Button size="icon" variant="ghost" aria-label={`Delete ${def?.name ?? a.type} on ${a.occurred_on}`} disabled={cmd.isPending} onClick={() => confirm("Delete this activity? Its XP will be reversed.") && cmd.mutate({ type: "delete_activity", activityId: a.id })}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
