import { z } from "zod";
import { GameError } from "@/lib/server/game/service";
import { runGuide } from "@/lib/server/guide-llm";
import { assertSameOrigin, handle, requireGame } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/auth";

const Body = z.object({
  kind: z.enum(["daily_briefing", "weekly_summary", "neglected", "milestones", "explain_stats", "study_plan", "recovery"]),
  question: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new GameError("Invalid guide request.");
    const { user, game } = await requireGame();
    rateLimit(`guide:${user.id}`, 20, 60 * 60_000);
    const snapshot = await game.snapshot();
    return runGuide(parsed.data.kind, snapshot, parsed.data.question);
  });
}
