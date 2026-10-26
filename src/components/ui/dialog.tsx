"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "sys-panel sys-panel-glow fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 focus:outline-none sm:p-6",
          className,
        )}
        {...props}
      >
        <D.Title className="sys-title pr-8 text-sm text-accent text-glow">{title}</D.Title>
        {description ? <D.Description className="mt-1 text-sm text-dim">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        <div className="mt-4">{children}</div>
        <D.Close className="absolute right-3 top-3 rounded-md p-1.5 text-dim hover:bg-accent/10 hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
