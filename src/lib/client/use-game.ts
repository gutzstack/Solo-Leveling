"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Command, GameEvent } from "@/lib/game/commands";
import type { PlayerSnapshot } from "@/lib/server/game/snapshot";
import { api, ApiError } from "./api";
import { pushEvents } from "./events";
import { play } from "./sound";

export const SNAPSHOT_KEY = ["snapshot"] as const;

export function useSnapshot() {
  return useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: () => api<PlayerSnapshot>("/api/state"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 401 || err.status === 403)) && count < 2,
  });
}

export interface CommandResult {
  events: GameEvent[];
  snapshot: PlayerSnapshot;
}

/** Sends a command; the server's snapshot replaces the cache and its events drive the overlays. */
export function useCommand(opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cmd: Command) => api<CommandResult>("/api/command", { json: cmd }),
    onSuccess: (res) => {
      qc.setQueryData(SNAPSHOT_KEY, res.snapshot);
      if (!opts.silent) pushEvents(res.events);
    },
    onError: () => play("error"),
  });
}
