import { NextResponse, type NextRequest } from "next/server";
import { supabaseUserClient } from "@/lib/server/db";
import { supabaseConfig } from "@/lib/server/env";

/** Supabase email-confirmation landing: exchanges the one-time code for a session cookie. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const dest = req.nextUrl.clone();
  dest.search = "";
  dest.pathname = "/awakening";
  if (!code || !supabaseConfig()) {
    dest.pathname = "/";
    return NextResponse.redirect(dest);
  }
  const sb = await supabaseUserClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    dest.pathname = "/";
    dest.searchParams.set("confirm_error", "1");
  }
  return NextResponse.redirect(dest);
}
