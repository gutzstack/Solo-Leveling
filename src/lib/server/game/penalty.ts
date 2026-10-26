import "server-only";
import type { AttributeCode } from "../../domain/types";
import type { ISODate } from "../../domain/dates";
import type { Database, DataClient } from "../db/types";

let enabledCache: boolean | null = null;

/**
 * Penalties need migration 0003 (penalty XP rows, failed quests). Until it is applied the game keeps
 * working without them, so a deploy that lands before the migration doesn't break the site.
 */
export async function penaltiesEnabled(db: Database): Promise<boolean> {
  if (enabledCache) return true;
  try {
    const rows = await db.service().select<{ value: string }>("system_meta", { eq: { key: "schema_version" } });
    enabledCache = Number(rows[0]?.value ?? 0) >= 3;
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

/** Idempotent XP deduction. Returns true only if this call recorded it. */
export async function applyPenalty(
  svc: DataClient,
  userId: string,
  p: { amount: number; attribute: AttributeCode | null; sourceType: string; sourceId: string | null; reason: string; key: string; day: ISODate },
): Promise<boolean> {
  const amount = Math.round(Math.abs(p.amount));
  if (amount <= 0) return false;
  const rows = await svc.insertIgnore(
    "player_xp",
    { user_id: userId, amount: -amount, kind: "penalty", attribute_code: p.attribute, source_type: p.sourceType, source_id: p.sourceId, reason: p.reason, idempotency_key: p.key, awarded_on: p.day },
    ["user_id", "idempotency_key"],
  );
  return rows.length > 0;
}
