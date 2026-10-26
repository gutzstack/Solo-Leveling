"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCommand } from "@/lib/client/use-game";
import { ATTRIBUTES } from "@/lib/domain/attributes";
import type { AttributeCode } from "@/lib/domain/types";

const UNITS = [
  ["count", "Count"],
  ["reps", "Reps"],
  ["mass", "Weight (lb/kg)"],
  ["duration", "Time (m:ss)"],
  ["distance", "Distance (mi/km)"],
  ["percent", "Percent"],
  ["hours", "Hours"],
  ["minutes", "Minutes"],
  ["currency", "Money (USD)"],
  ["rating", "Rating 1–10"],
  ["score", "Score / points"],
] as const;

export function CustomStatDialog({ children, attribute }: { children: React.ReactNode; attribute?: AttributeCode }) {
  const [open, setOpen] = useState(false);
  const cmd = useCommand();
  const [name, setName] = useState("");
  const [attr, setAttr] = useState<AttributeCode>(attribute ?? "STR");
  const [unit, setUnit] = useState<(typeof UNITS)[number][0]>("count");
  const [direction, setDirection] = useState<"higher" | "lower" | "neutral">("higher");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Create custom stat" description="Track anything measurable. Custom stats track personal progression and records, with no population ranking.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            cmd.mutate({ type: "create_custom_metric", name, attribute: attr, unit, direction, description }, { onSuccess: () => { setOpen(false); setName(""); setDescription(""); }, onError: (err) => setError(err.message) });
          }}
        >
          <Field label="Name" htmlFor="cs-name">
            <Input id="cs-name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Box jump height" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Attribute" htmlFor="cs-attr">
              <Select id="cs-attr" value={attr} onChange={(e) => setAttr(e.target.value as AttributeCode)}>
                {ATTRIBUTES.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit" htmlFor="cs-unit">
              <Select id="cs-unit" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                {UNITS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Better is" htmlFor="cs-dir">
            <Select id="cs-dir" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
              <option value="higher">Higher</option>
              <option value="lower">Lower (e.g. times)</option>
              <option value="neutral">Neither (descriptive)</option>
            </Select>
          </Field>
          <Field label="Description" htmlFor="cs-desc">
            <Textarea id="cs-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-red-300 light:text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={cmd.isPending}>
            Create stat
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
