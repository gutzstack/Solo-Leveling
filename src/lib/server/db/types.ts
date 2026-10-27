export const TABLES = [
  "users",
  "profiles",
  "settings",
  "system_meta",
  "attributes",
  "metrics",
  "benchmark_sources",
  "benchmark_distributions",
  "dungeons",
  "skills",
  "titles",
  "achievements",
  "metric_entries",
  "activity_logs",
  "quests",
  "quest_objectives",
  "quest_completions",
  "dungeon_sessions",
  "player_xp",
  "player_levels",
  "percentile_results",
  "skill_unlocks",
  "achievement_unlocks",
  "title_unlocks",
  "equipped_titles",
  "notifications",
  "question_items",
  "trial_sessions",
  "gold_ledger",
  "inventory_items",
  "shop_rewards",
  "friendships",
] as const;
export type Table = (typeof TABLES)[number];

export type Scalar = string | number | boolean | null;
export type Row = Record<string, unknown>;

export interface SelectQuery {
  eq?: Record<string, Scalar>;
  in?: Record<string, Scalar[]>;
  gte?: Record<string, Scalar>;
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
}

/** A table-level client. `user` clients run under RLS as that user; `service` clients bypass RLS. */
export interface DataClient {
  select<T = Row>(table: Table, q?: SelectQuery): Promise<T[]>;
  /** Plain insert; throws UniqueViolationError on conflicts. */
  insert<T = Row>(table: Table, rows: Row | Row[]): Promise<T[]>;
  /** Insert, silently skipping rows that hit the unique constraint on `conflict`. Returns only inserted rows. */
  insertIgnore<T = Row>(table: Table, rows: Row | Row[], conflict: string[]): Promise<T[]>;
  upsert<T = Row>(table: Table, rows: Row | Row[], conflict: string[]): Promise<T[]>;
  update<T = Row>(table: Table, eq: Record<string, Scalar>, patch: Row): Promise<T[]>;
  delete(table: Table, eq: Record<string, Scalar>): Promise<number>;
}

export interface Database {
  kind: "local" | "supabase";
  /** RLS-scoped client acting as `userId`. */
  user(userId: string): DataClient;
  /** Privileged server-only client (service role). Callers must scope by user_id themselves. */
  service(): DataClient;
}

export class UniqueViolationError extends Error {
  constructor(message = "duplicate") {
    super(message);
    this.name = "UniqueViolationError";
  }
}

export class PermissionError extends Error {
  constructor(message = "permission denied") {
    super(message);
    this.name = "PermissionError";
  }
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
export function assertIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`invalid identifier: ${name}`);
  return name;
}
export function assertTable(t: string): Table {
  if (!(TABLES as readonly string[]).includes(t)) throw new Error(`unknown table: ${t}`);
  return t as Table;
}

/** Primary-key column per table (used for stable ordering when paging). */
export const PRIMARY_KEY: Record<Table, string> = {
  users: "id",
  profiles: "user_id",
  settings: "user_id",
  system_meta: "key",
  attributes: "code",
  metrics: "id",
  benchmark_sources: "id",
  benchmark_distributions: "id",
  dungeons: "code",
  skills: "code",
  titles: "code",
  achievements: "code",
  metric_entries: "id",
  activity_logs: "id",
  quests: "id",
  quest_objectives: "id",
  quest_completions: "id",
  dungeon_sessions: "id",
  player_xp: "id",
  player_levels: "user_id",
  percentile_results: "id",
  skill_unlocks: "id",
  achievement_unlocks: "id",
  title_unlocks: "id",
  equipped_titles: "user_id",
  notifications: "id",
  question_items: "id",
  trial_sessions: "id",
  gold_ledger: "id",
  inventory_items: "id",
  shop_rewards: "id",
  friendships: "id",
};
