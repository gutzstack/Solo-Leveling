"use client";
import { useSyncExternalStore } from "react";
import type { GameEvent } from "@/lib/game/commands";

/** Tiny event bus feeding the overlay/toast layer with server-confirmed game events. */
export interface QueuedEvent {
  id: number;
  event: GameEvent;
}

let queue: QueuedEvent[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushEvents(events: GameEvent[]) {
  if (!events.length) return;
  queue = [...queue, ...events.map((event) => ({ id: ++seq, event }))];
  emit();
}

export function pushInfo(title: string, body: string) {
  pushEvents([{ type: "info", title, body }]);
}

export function dismissEvent(id: number) {
  queue = queue.filter((q) => q.id !== id);
  emit();
}

export function useEventQueue(): QueuedEvent[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => queue,
    () => queue,
  );
}
