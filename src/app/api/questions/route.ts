import { getDatabase } from "@/lib/server/db";
import { aiConfig } from "@/lib/server/env";
import { assertSameOrigin, handle, requireGame } from "@/lib/server/http";
import { handleQuestions } from "@/lib/server/questions";

export async function GET() {
  return handle(async () => {
    const { user } = await requireGame();
    const db = await getDatabase();
    const items = await db.user(user.id).select("question_items", { eq: { user_id: user.id }, order: [{ column: "created_at", ascending: false }] });
    return { items, aiAvailable: Boolean(aiConfig()) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const body = await req.json();
    const { user } = await requireGame();
    return handleQuestions(await getDatabase(), user.id, body);
  });
}
