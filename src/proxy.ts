import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection. A cheap presence check on the session cookie: the API layer re-validates
 * every request (signature or Supabase JWT) before touching data.
 */
const PUBLIC = new Set(["/", "/login", "/auth/callback"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.has(pathname)) return NextResponse.next();
  const hasLocal = request.cookies.has("sirl_session");
  const hasSupabase = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasLocal && !hasSupabase) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|manifest.webmanifest|sw.js|favicon.ico).*)"],
};
