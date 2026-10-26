"use client";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCommand, useSnapshot } from "@/lib/client/use-game";
import { cn } from "@/lib/utils";

export function NotificationsDialog({ children }: { children: React.ReactNode }) {
  const { data } = useSnapshot();
  const cmd = useCommand({ silent: true });
  const list = data?.notifications ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="System Notifications" description="Messages from the System about your progression.">
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="outline" disabled={!unread || cmd.isPending} onClick={() => cmd.mutate({ type: "mark_notifications_read" })}>
            Mark all read
          </Button>
        </div>
        <ul className="max-h-[60dvh] space-y-2 overflow-y-auto pr-1">
          {list.length === 0 ? <li className="text-sm text-faint">No notifications yet.</li> : null}
          {list.map((n) => (
            <li key={n.id} className={cn("rounded-lg border px-3 py-2", n.read_at ? "border-line/50 opacity-70" : "border-line-strong bg-accent/5")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[10px] tracking-[0.18em] text-accent">{n.title}</span>
                <time className="shrink-0 font-mono text-[10px] text-faint" dateTime={n.created_at}>
                  {new Date(n.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </time>
              </div>
              <p className="text-sm text-fg">{n.body}</p>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
