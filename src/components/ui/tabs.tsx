"use client";
import { Tabs as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel/50 p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "shrink-0 cursor-pointer rounded-lg px-3 py-2 font-display text-[10px] uppercase tracking-[0.16em] text-dim transition-all hover:text-fg data-[state=active]:bg-accent/15 data-[state=active]:text-accent data-[state=active]:shadow-[0_0_14px_-6px_var(--glow)]",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = T.Content;
