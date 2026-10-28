import { getSessionUser } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/db";
import { backendKind, storageIsEphemeral } from "@/lib/server/env";
import { friendsEnabled } from "@/lib/server/game/penalty";
import { handle } from "@/lib/server/http";

export async function GET() {
  // `usernames`: username sign-up needs migration 0005; until then the gate falls back to email.
  return handle(async () => ({ user: await getSessionUser(), backend: backendKind(), ephemeral: storageIsEphemeral(), usernames: await friendsEnabled(await getDatabase()) }));
}
