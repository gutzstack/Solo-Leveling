import { signOut } from "@/lib/server/auth";
import { assertSameOrigin, handle } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    await signOut();
    return { ok: true };
  });
}
