import type { SupabaseClient } from "@supabase/supabase-js";
import { assertIdent, assertTable, PermissionError, PRIMARY_KEY, UniqueViolationError, type DataClient, type Database, type Row, type Scalar, type SelectQuery, type Table } from "./types";

/**
 * Supabase adapter. The user client carries the signed-in user's JWT (from cookies), so PostgREST
 * applies the RLS policies from the migration; the service client uses the service-role key and is
 * only constructed on the server.
 */

type PgrstError = { code?: string; message?: string } | null;

function check<T>(res: { data: T | null; error: PgrstError }): T {
  if (res.error) {
    if (res.error.code === "23505") throw new UniqueViolationError(res.error.message);
    if (res.error.code === "42501") throw new PermissionError(res.error.message);
    throw new Error(`Supabase: ${res.error.message ?? "unknown error"}`);
  }
  return res.data as T;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the PostgREST builder is typed per schema; this adapter is schema-agnostic */
function applyFilters(builder: any, q: SelectQuery | undefined): any {
  let b = builder;
  for (const [k, v] of Object.entries(q?.eq ?? {})) b = v === null ? b.is(assertIdent(k), null) : b.eq(assertIdent(k), v);
  for (const [k, vs] of Object.entries(q?.in ?? {})) b = b.in(assertIdent(k), vs);
  for (const [k, v] of Object.entries(q?.gte ?? {})) b = b.gte(assertIdent(k), v);
  return b;
}

class SupabaseDataClient implements DataClient {
  constructor(private readonly sb: SupabaseClient) {}

  async select<T = Row>(table: Table, q?: SelectQuery): Promise<T[]> {
    const build = () => {
      let b: any = applyFilters(this.sb.from(assertTable(table)).select("*"), q);
      for (const o of q?.order ?? []) b = b.order(assertIdent(o.column), { ascending: o.ascending !== false });
      // Stable paging needs a deterministic order.
      if (!q?.order?.length) b = b.order(PRIMARY_KEY[table], { ascending: true });
      return b;
    };
    if (q?.limit) return check<T[]>(await build().limit(q.limit));
    // PostgREST caps responses (1000 rows by default on Supabase); page through full-history tables.
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const page = check<T[]>(await build().range(from, from + 999));
      out.push(...page);
      if (page.length < 1000) break;
    }
    return out;
  }

  async insert<T = Row>(table: Table, rows: Row | Row[]): Promise<T[]> {
    return check<T[]>(await (this.sb.from(assertTable(table)) as any).insert(rows).select("*"));
  }

  async insertIgnore<T = Row>(table: Table, rows: Row | Row[], conflict: string[]): Promise<T[]> {
    return check<T[]>(await (this.sb.from(assertTable(table)) as any).upsert(rows, { onConflict: conflict.map(assertIdent).join(","), ignoreDuplicates: true }).select("*"));
  }

  async upsert<T = Row>(table: Table, rows: Row | Row[], conflict: string[]): Promise<T[]> {
    return check<T[]>(await (this.sb.from(assertTable(table)) as any).upsert(rows, { onConflict: conflict.map(assertIdent).join(",") }).select("*"));
  }

  async update<T = Row>(table: Table, eq: Record<string, Scalar>, patch: Row): Promise<T[]> {
    if (!Object.keys(eq).length) throw new Error("refusing unscoped update");
    return check<T[]>(await applyFilters((this.sb.from(assertTable(table)) as any).update(patch), { eq }).select("*"));
  }

  async delete(table: Table, eq: Record<string, Scalar>): Promise<number> {
    if (!Object.keys(eq).length) throw new Error("refusing unscoped delete");
    const data = check<unknown[]>(await applyFilters((this.sb.from(assertTable(table)) as any).delete(), { eq }).select("*"));
    return data.length;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class SupabaseDatabase implements Database {
  readonly kind = "supabase" as const;
  constructor(
    private readonly userClient: SupabaseClient,
    private readonly serviceClient: SupabaseClient,
  ) {}

  user(): DataClient {
    // The user's identity comes from the JWT in the request cookies; RLS uses it via auth.uid().
    return new SupabaseDataClient(this.userClient);
  }

  service(): DataClient {
    return new SupabaseDataClient(this.serviceClient);
  }
}
