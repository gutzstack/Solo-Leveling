"use client";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ACTIVITIES, ACTIVITY_BY_TYPE } from "@/lib/domain/activities";
import { ATTRIBUTES } from "@/lib/domain/attributes";
import { displayUnit, formatValue, parseDisplayInput } from "@/lib/domain/units";
import type { EntryContext, UnitKind } from "@/lib/domain/types";
import { ApiError, newKey } from "@/lib/client/api";
import { useCommand, useSnapshot } from "@/lib/client/use-game";

const GROUPS: Record<string, string> = { training: "Training", study: "Study", wellness: "Wellness", social: "Social", finance: "Finance", life: "Life" };

export function LogActivityDialog({ children, defaultType }: { children: React.ReactNode; defaultType?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Log activity" description="Record something you actually did. Effort XP follows the System's completion rules and daily caps.">
        {open ? <ActivityForm defaultType={defaultType} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ActivityForm({ defaultType, onDone }: { defaultType?: string; onDone: () => void }) {
  const { data } = useSnapshot();
  const cmd = useCommand();
  const units = data?.settings.unit_system ?? "imperial";
  const [type, setType] = useState(defaultType ?? "study");
  const [date, setDate] = useState(data?.today ?? "");
  const [minutes, setMinutes] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [key] = useState(() => newKey("act"));
  const [dupKey, setDupKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const def = ACTIVITY_BY_TYPE[type];
  const qkind = def.quantity?.kind;
  const qUnit = qkind === "distance" ? displayUnit("distance", units) : qkind === "volume_kg" ? displayUnit("mass", units) : null;

  function submit(confirmDuplicate = false) {
    setError(null);
    const durationMin = minutes ? Number(minutes) : null;
    if (def.requiresDuration && !(durationMin && durationMin > 0)) return setError("Enter the duration in minutes.");
    let quantity: number | null = null;
    if (qty) {
      const n = Number(qty);
      if (!Number.isFinite(n) || n < 0) return setError("Quantity must be a positive number.");
      quantity = qUnit ? qUnit.fromDisplay(n) : n;
    }
    const idempotencyKey = confirmDuplicate ? (dupKey ?? newKey("act")) : key;
    cmd.mutate(
      { type: "log_activity", activity: type, durationMin, quantity, occurredOn: date, note: note || undefined, idempotencyKey, confirmDuplicate },
      {
        onSuccess: onDone,
        onError: (e) => {
          if (e instanceof ApiError && e.message.startsWith("DUPLICATE")) {
            setDupKey(newKey("act"));
            setError(e.message.replace("DUPLICATE: ", ""));
          } else setError(e.message);
        },
      },
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <Field label="Activity" htmlFor="act-type">
        <Select id="act-type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(GROUPS).map(([g, label]) => (
            <optgroup key={g} label={label}>
              {ACTIVITIES.filter((a) => a.group === g).map((a) => (
                <option key={a.type} value={a.type}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="act-date">
          <Input id="act-date" type="date" value={date} max={data?.today} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label={`Minutes${def.requiresDuration ? "" : " (optional)"}`} htmlFor="act-min">
          <Input id="act-min" inputMode="decimal" type="number" min={0} max={1440} step="any" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      {def.quantity ? (
        <Field label={`${def.quantity.label}${qUnit ? ` (${qUnit.label})` : ""}`} htmlFor="act-qty" hint={qkind === "volume_kg" ? "Optional: Σ sets × reps × load. Feeds weekly training volume." : undefined}>
          <Input id="act-qty" inputMode="decimal" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Note (optional)" htmlFor="act-note">
        <Textarea id="act-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="text-xs text-faint">
        Counts for XP when it meets the bar
        {def.minMinutes ? ` (≥ ${def.minMinutes} min${def.minQuantity ? ` or ≥ ${def.minQuantity} ${qkind === "distance" ? "km" : ""}` : ""})` : def.minQuantity ? ` (≥ ${def.minQuantity})` : ""}. Up to {def.dailyCap} XP-earning log{def.dailyCap === 1 ? "" : "s"} per day; extra logs still count toward your stats and quests.
      </p>
      {error ? (
        <div role="alert" className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100 light:text-amber-900">
          <p>{error}</p>
          {dupKey ? (
            <Button type="button" size="sm" variant="outline" onClick={() => submit(true)}>
              It&apos;s a separate session, log it anyway
            </Button>
          ) : null}
        </div>
      ) : null}
      <Button type="submit" className="w-full" disabled={cmd.isPending}>
        {cmd.isPending ? <Loader2 className="animate-spin" /> : null}Record
      </Button>
    </form>
  );
}

export function LogMetricDialog({ children, metricId }: { children: React.ReactNode; metricId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Log measurement" description="Record a measured value. Past personal bests should be marked historical so they aren't treated as current ability.">
        {open ? <MetricForm metricId={metricId} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MetricForm({ metricId, onDone }: { metricId?: string; onDone: () => void }) {
  const { data } = useSnapshot();
  const cmd = useCommand();
  const units = data?.settings.unit_system ?? "imperial";
  const manual = useMemo(() => (data?.metrics ?? []).filter((m) => m.input === "manual"), [data]);
  const [id, setId] = useState(metricId ?? manual[0]?.id ?? "");
  const m = manual.find((x) => x.id === id);
  const [raw, setRaw] = useState("");
  const [date, setDate] = useState(data?.today ?? "");
  const [context, setContext] = useState<EntryContext>("current");
  const [note, setNote] = useState("");
  const [key] = useState(() => newKey("met"));
  const [error, setError] = useState<string | null>(null);
  if (!m) return <p className="text-sm text-dim">No manual metrics available.</p>;
  const unit = displayUnit(m.unit as UnitKind, units);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = parseDisplayInput(m!.unit as UnitKind, raw, units);
    if (value === null) return setError(m!.unit === "duration" ? "Enter a time like 25:00 or 1:32:10." : "Enter a number.");
    cmd.mutate({ type: "log_metric", metricId: m!.id, value, recordedOn: date, context, note: note || undefined, idempotencyKey: key }, { onSuccess: onDone, onError: (err) => setError(err.message) });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field label="Metric" htmlFor="met-id">
        <Select id="met-id" value={id} onChange={(e) => setId(e.target.value)} disabled={Boolean(metricId)}>
          {ATTRIBUTES.map((a) => (
            <optgroup key={a.code} label={a.name}>
              {manual
                .filter((x) => x.attribute === a.code)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-faint">{m.description}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Value${m.unit === "duration" ? " (m:ss / h:mm:ss)" : unit.label ? ` (${unit.label})` : ""}`} htmlFor="met-val">
          <Input id="met-val" inputMode={m.unit === "duration" ? "text" : "decimal"} placeholder={m.unit === "duration" ? "25:00" : ""} value={raw} onChange={(e) => setRaw(e.target.value)} required autoFocus />
        </Field>
        <Field label="Date" htmlFor="met-date">
          <Input id="met-date" type="date" value={date} max={data?.today} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Type of entry" htmlFor="met-ctx" hint={context === "historical" ? "Historical bests are kept as records but never ranked as current ability or awarded XP." : context === "test" ? "A formal test or race." : "Your current, recent measurement."}>
        <Select id="met-ctx" value={context} onChange={(e) => setContext(e.target.value as EntryContext)}>
          <option value="current">Current measurement</option>
          <option value="test">Test / race / official result</option>
          <option value="historical">Historical best (past)</option>
        </Select>
      </Field>
      <Field label="Note (optional)" htmlFor="met-note">
        <Input id="met-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {m.current ? <p className="text-xs text-dim">Current: {formatValue(m.unit as UnitKind, m.current.value, units)}</p> : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-sm text-red-200 light:text-red-800">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={cmd.isPending}>
        {cmd.isPending ? <Loader2 className="animate-spin" /> : null}Record
      </Button>
    </form>
  );
}
