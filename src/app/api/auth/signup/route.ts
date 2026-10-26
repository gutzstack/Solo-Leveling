import { headers } from "next/headers";
import { rateLimit, signUp } from "@/lib/server/auth";
import { assertSameOrigin, handle } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    rateLimit(`signup:${ip}`, 5, 10 * 60_000);
    const body = await req.json();
    const res = await signUp(body?.email, body?.password);
    return { ok: true, needsConfirmation: res.needsConfirmation };
  });
}
