import { assertSameOrigin, handle, requireGame } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const text = await req.text();
    if (text.length > 15_000_000) throw new SyntaxError("Import file too large (15 MB max).");
    const { game } = await requireGame();
    return game.importData(JSON.parse(text));
  });
}
