import { GameError } from "@/lib/server/game/service";
import { TrialRequestSchema, TrialService } from "@/lib/server/game/trials";
import { getDatabase } from "@/lib/server/db";
import { assertSameOrigin, handle, requireGame } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const parsed = TrialRequestSchema.safeParse(await req.json());
    if (!parsed.success) throw new GameError("Invalid trial request.");
    const { user, game } = await requireGame();
    const trials = new TrialService(await getDatabase(), user.id);
    const { view, completedId } = await trials.handle(parsed.data);
    // A finished trial is logged as an activity and runs the normal progression (XP, quests, achievements).
    const progress = completedId ? await game.execute({ type: "trial_completed", sessionId: completedId }) : null;
    return { view, events: progress?.events ?? [], snapshot: progress?.snapshot ?? null };
  });
}
