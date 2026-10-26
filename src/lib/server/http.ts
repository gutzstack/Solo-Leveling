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
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AuthError("Cross-origin request blocked.", 403);
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError("Bad origin.", 403);
  }
}
