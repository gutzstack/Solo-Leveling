import { NextResponse } from "next/server";
import { handle, requireGame } from "@/lib/server/http";

export async function GET() {
  try {
    const { game } = await requireGame();
    const data = await game.exportData();
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="system-irl-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handle(async () => {
      throw e;
    });
  }
}
