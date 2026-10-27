import { getDatabase } from "@/lib/server/db";
import { FriendRequestSchema, FriendsService } from "@/lib/server/friends";
import { GameError } from "@/lib/server/game/service";
import { assertSameOrigin, handle, requireGame } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const parsed = FriendRequestSchema.safeParse(await req.json());
    if (!parsed.success) throw new GameError(parsed.error.issues.map((i) => i.message).join("; "));
    const { user } = await requireGame();
    return new FriendsService(await getDatabase(), user.id).handle(parsed.data);
  });
}
