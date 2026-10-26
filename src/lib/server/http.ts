import "server-only";
import { NextResponse } from "next/server";
import { AuthError, getSessionUser, type SessionUser } from "./auth";
import { getDatabase } from "./db";
import { GameError, GameService } from "./game/service";

const bootstrapped = new Set<string>();

export async function requireGame(): Promise<{ user: SessionUser; game: GameService }> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Not signed in.", 401);
  const db = await getDatabase();
  const game = new GameService(db, user.id);
  if (!bootstrapped.has(user.id)) {
    await game.ensureBootstrap(user.email);
    bootstrapped.add(user.id);
  }
  return { user, game };
}

/** Uniform JSON error handling for route handlers. Unexpected errors are logged, not leaked. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const result = await fn();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof GameError || e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
    console.error("[SYSTEM IRL]", e);
    return NextResponse.json({ error: "Internal error. The System has logged the failure." }, { status: 500 });
  }
}

/** Basic CSRF defence for cookie-authenticated POSTs: same-origin requests only. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (and same-origin GET-initiated forms in some browsers)
  // Behind proxies (Codespaces, tunnels, load balancers) the public host may arrive in either header.
  const hosts = new Set([req.headers.get("x-forwarded-host"), req.headers.get("host")].flatMap((h) => (h ? h.split(",").map((x) => x.trim().toLowerCase()) : [])));
  for (const extra of (process.env.ALLOWED_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    try {
      hosts.add(new URL(extra).host.toLowerCase());
    } catch {
      /* ignore malformed entries */
    }
  }
  try {
    if (!hosts.has(new URL(origin).host.toLowerCase())) throw new AuthError("Cross-origin request blocked. If you use a proxy or custom domain, add it to ALLOWED_ORIGINS.", 403);
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError("Bad origin.", 403);
  }
}
