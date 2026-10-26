import { getSessionUser } from "@/lib/server/auth";
import { backendKind, storageIsEphemeral } from "@/lib/server/env";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => ({ user: await getSessionUser(), backend: backendKind(), ephemeral: storageIsEphemeral() }));
}
