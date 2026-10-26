import { assertSameOrigin, handle, requireGame } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const body = await req.json();
    const { game } = await requireGame();
    return game.execute(body);
  });
}
