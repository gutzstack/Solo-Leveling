import "server-only";
import type { AttributeCode } from "../../domain/types";
import type { ISODate } from "../../domain/dates";
import type { Database, DataClient } from "../db/types";

interface Applied {
  penalties: boolean;
  rewards: boolean;
}
let cache: Applied = { penalties: false, rewards: false };

/**
 * Which optional migrations are applied (markers in system_meta). Features that need them stay off
 * until they run, so a deploy that lands first doesn't break the site. Only "applied" is cached.
 */
async function applied(db: Database): Promise<Applied> {
  if (cache.penalties && cache.rewards) return cache;
  try {
    const rows = await db.service().select<{ key: string; value: string }>("system_meta", { in: { key: ["schema_version", "migration_0004"] } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    cache = { penalties: cache.penalties || Number(get("schema_version") ?? 0) >= 3, rewards: cache.rewards || get("migration_0004") === "applied" };
  } catch {
    // keep what we knew
  }
  return cache;
}

/** Penalties need migration 0003 (penalty XP rows, failed quests). */
export async function penaltiesEnabled(db: Database): Promise<boolean> {
  return (await applied(db)).penalties;
}

/** Gold, chests, items and the reward shop need migration 0004. */
export async function rewardsEnabled(db: Database): Promise<boolean> {
  return (await applied(db)).rewards;
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
