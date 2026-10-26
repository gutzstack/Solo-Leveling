import { handle, requireGame } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const { game } = await requireGame();
    return game.snapshot();
  });
}
