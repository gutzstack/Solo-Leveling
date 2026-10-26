import { PGlite, types, type Transaction } from "@electric-sql/pglite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { assertIdent, assertTable, PermissionError, UniqueViolationError, type DataClient, type Database, type Row, type Scalar, type SelectQuery, type Table } from "./types";

/**
 * Local demo database: a real PostgreSQL (PGlite/WASM) persisted under .data/pglite, running the
 * same migration as Supabase plus a small auth shim. RLS is enforced by switching to the
 * `authenticated` role with the user's id as the JWT subject, the same way Supabase does it.
 */

type PgError = { code?: string; message?: string };

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const SHIM = path.join(process.cwd(), "supabase", "local", "auth_shim.sql");

function encode(v: unknown): unknown {
  if (v === undefined) return null;
  if (v === null || typeof v !== "object" || v instanceof Date) return v instanceof Date ? v.toISOString() : v;
  return JSON.stringify(v);
}

function mapError(e: unknown): never {
  const err = e as PgError;
  if (err?.code === "23505") throw new UniqueViolationError(err.message);
  if (err?.code === "42501") throw new PermissionError(err.message);
  throw e;
}

type Exec = Pick<Transaction, "query">;

function buildWhere(q: SelectQuery | undefined, params: unknown[]): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q?.eq ?? {})) {
    if (v === null) parts.push(`${assertIdent(k)} is null`);
    else {
      params.push(v);
      parts.push(`${assertIdent(k)} = $${params.length}`);
    }
  }
  for (const [k, vs] of Object.entries(q?.in ?? {})) {
    if (!vs.length) {
      parts.push("false");
      continue;
    }
    const ph = vs.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    parts.push(`${assertIdent(k)} in (${ph.join(", ")})`);
  }
  for (const [k, v] of Object.entries(q?.gte ?? {})) {
    params.push(v);
    parts.push(`${assertIdent(k)} >= $${params.length}`);
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}

function insertSql(table: Table, rows: Row[], params: unknown[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].map(assertIdent);
  const values = rows.map((r) => `(${cols.map((c) => {
    if (!(c in r)) return "default";
    params.push(encode(r[c]));
    return `$${params.length}`;
  }).join(", ")})`);
  return `insert into public.${assertTable(table)} (${cols.join(", ")}) values ${values.join(", ")}`;
}

class LocalClient implements DataClient {
  constructor(private readonly run: <T>(fn: (tx: Exec) => Promise<T>) => Promise<T>) {}

  async select<T = Row>(table: Table, q?: SelectQuery): Promise<T[]> {
    const params: unknown[] = [];
    let sql = `select * from public.${assertTable(table)}${buildWhere(q, params)}`;
    if (q?.order?.length) sql += ` order by ${q.order.map((o) => `${assertIdent(o.column)} ${o.ascending === false ? "desc" : "asc"}`).join(", ")}`;
    if (q?.limit) sql += ` limit ${Math.max(1, Math.floor(q.limit))}`;
    return this.run(async (tx) => (await tx.query<T>(sql, params).catch(mapError)).rows);
  }

  async insert<T = Row>(table: Table, rows: Row | Row[]): Promise<T[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return [];
    const params: unknown[] = [];
    const sql = `${insertSql(table, list, params)} returning *`;
    return this.run(async (tx) => (await tx.query<T>(sql, params).catch(mapError)).rows);
  }

  async insertIgnore<T = Row>(table: Table, rows: Row | Row[], conflict: string[]): Promise<T[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return [];
    const params: unknown[] = [];
    const sql = `${insertSql(table, list, params)} on conflict (${conflict.map(assertIdent).join(", ")}) do nothing returning *`;
    return this.run(async (tx) => (await tx.query<T>(sql, params).catch(mapError)).rows);
  }

  async upsert<T = Row>(table: Table, rows: Row | Row[], conflict: string[]): Promise<T[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return [];
    const params: unknown[] = [];
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))].map(assertIdent).filter((c) => !conflict.includes(c));
    const set = cols.length ? cols.map((c) => `${c} = excluded.${c}`).join(", ") : `${assertIdent(conflict[0])} = excluded.${assertIdent(conflict[0])}`;
    const sql = `${insertSql(table, list, params)} on conflict (${conflict.map(assertIdent).join(", ")}) do update set ${set} returning *`;
    return this.run(async (tx) => (await tx.query<T>(sql, params).catch(mapError)).rows);
  }

  async update<T = Row>(table: Table, eq: Record<string, Scalar>, patch: Row): Promise<T[]> {
    const keys = Object.keys(patch);
    if (!keys.length) return [];
    const params: unknown[] = [];
    const set = keys.map((k) => {
      params.push(encode(patch[k]));
      return `${assertIdent(k)} = $${params.length}`;
    });
    const where = buildWhere({ eq }, params);
    if (!where) throw new Error("refusing unscoped update");
    const sql = `update public.${assertTable(table)} set ${set.join(", ")}${where} returning *`;
    return this.run(async (tx) => (await tx.query<T>(sql, params).catch(mapError)).rows);
  }

  async delete(table: Table, eq: Record<string, Scalar>): Promise<number> {
    const params: unknown[] = [];
    const where = buildWhere({ eq }, params);
    if (!where) throw new Error("refusing unscoped delete");
    const sql = `delete from public.${assertTable(table)}${where}`;
    return this.run(async (tx) => (await tx.query(sql, params).catch(mapError)).affectedRows ?? 0);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LocalDatabase implements Database {
  readonly kind = "local" as const;
  private constructor(readonly pg: PGlite) {}

  static async open(dataDir?: string): Promise<LocalDatabase> {
    if (dataDir && !dataDir.startsWith("memory://")) mkdirSync(dataDir, { recursive: true });
    const pg = new PGlite(dataDir ?? "memory://", {
      parsers: {
        [types.DATE]: (v: string) => v,
        [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
        [types.TIMESTAMP]: (v: string) => new Date(v + "Z").toISOString(),
      },
    });
    await pg.waitReady;
    const db = new LocalDatabase(pg);
    await db.migrate();
    return db;
  }

  private async migrate() {
    const hasMeta = (await this.pg.query<{ t: string | null }>("select to_regclass('public.system_meta') as t")).rows[0]?.t;
    const applied = new Set<string>();
    if (hasMeta) {
      for (const r of (await this.pg.query<{ key: string }>("select key from public.system_meta where key like 'migration:%'")).rows) applied.add(r.key.slice(10));
    } else {
      await this.pg.exec(readFileSync(SHIM, "utf8"));
    }
    const files = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort() : [];
    for (const f of files) {
      if (applied.has(f)) continue;
      await this.pg.transaction(async (tx) => {
        await tx.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
        await tx.query("insert into public.system_meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [`migration:${f}`, new Date().toISOString()]);
      });
    }
    await this.pg.exec("grant usage on schema auth to service_role; grant select, insert, update, delete on auth.users to service_role;");
  }

  user(userId: string): DataClient {
    if (!UUID.test(userId)) throw new Error("invalid user id");
    return new LocalClient((fn) =>
      this.pg.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        await tx.exec("set local role authenticated");
        return fn(tx);
      }),
    );
  }

  service(): DataClient {
    return new LocalClient((fn) =>
      this.pg.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        return fn(tx);
      }),
    );
  }

  /** Raw superuser access, used only by the local auth provider (auth.users) and tests. */
  async raw<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params).catch(mapError)).rows;
  }

  async close() {
    await this.pg.close();
  }
}
