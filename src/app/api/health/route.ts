import { NextResponse } from "next/server";
import { aiConfig, backendKind } from "@/lib/server/env";

export async function GET() {
  return NextResponse.json({ ok: true, backend: backendKind(), ai: aiConfig() ? "configured" : "deterministic" });
}
