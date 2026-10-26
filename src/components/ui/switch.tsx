"use client";
import { Switch as S, Slider as Sl, Tooltip as Tt } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root className={cn("relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-line bg-bg/70 transition-colors data-[state=checked]:bg-accent/40 data-[state=checked]:border-line-strong", className)} {...props}>
      <S.Thumb className="block size-4 translate-x-1 rounded-full bg-dim shadow transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-white data-[state=checked]:shadow-[0_0_10px_var(--glow)]" />
    </S.Root>
  );
}

export function Slider({ className, ...props }: React.ComponentProps<typeof Sl.Root>) {
  return (
    <Sl.Root className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} {...props}>
      <Sl.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-bg/80 border border-line">
        <Sl.Range className="absolute h-full xp-fill" />
      </Sl.Track>
      <Sl.Thumb className="block size-4 rounded-full border border-line-strong bg-white shadow-[0_0_10px_var(--glow)] focus:outline-none" aria-label={props["aria-label"]} />
    </Sl.Root>
  );
}

export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tt.Provider delayDuration={200}>
      <Tt.Root>
        <Tt.Trigger asChild>{children}</Tt.Trigger>
        <Tt.Portal>
          <Tt.Content sideOffset={6} className="z-[70] max-w-xs rounded-lg border border-line bg-panel-solid px-3 py-2 text-xs text-fg shadow-xl">
            {content}
          </Tt.Content>
        </Tt.Portal>
      </Tt.Root>
    </Tt.Provider>
  );
}
