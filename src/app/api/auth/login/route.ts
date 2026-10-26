import { headers } from "next/headers";
import { rateLimit, signIn } from "@/lib/server/auth";
import { assertSameOrigin, handle } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const body = await req.json();
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    rateLimit(`login:${ip}:${String(body?.email ?? "").toLowerCase()}`, 8, 60_000);
    const user = await signIn(body?.email, body?.password);
    return { ok: true, email: user.email };
  });
}
