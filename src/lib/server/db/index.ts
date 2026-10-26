import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ensureCatalogs } from "../catalog";
import { localDataDir, supabaseConfig } from "../env";
import { LocalDatabase } from "./local";
import { SupabaseDatabase } from "./supabase";
import type { Database } from "./types";

const g = globalThis as unknown as { __sirlLocalDb?: Promise<LocalDatabase>; __sirlService?: SupabaseClient };

/** One PGlite instance per server process (it holds an exclusive lock on its data directory). */
export function getLocalDb(): Promise<LocalDatabase> {
  if (!g.__sirlLocalDb) {
    g.__sirlLocalDb = LocalDatabase.open(localDataDir()).then(async (db) => {
      await ensureCatalogs(db.service(), db);
      return db;
    });
    g.__sirlLocalDb.catch(() => {
      g.__sirlLocalDb = undefined;
    });
  }
  return g.__sirlLocalDb;
}

/** Supabase client bound to the request's auth cookies (subject to RLS). */
export async function supabaseUserClient(): Promise<SupabaseClient> {
  const cfg = supabaseConfig()!;
  const store = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Called from a Server Component render, where cookies are read-only; the proxy refreshes them.
        }
      },
    },
  });
}

function serviceClient(): SupabaseClient {
  const cfg = supabaseConfig()!;
  g.__sirlService ??= createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return g.__sirlService;
}

const supabaseCatalogKey = {};

export async function getDatabase(): Promise<Database> {
  if (!supabaseConfig()) return getLocalDb();
  const db = new SupabaseDatabase(await supabaseUserClient(), serviceClient());
  await ensureCatalogs(db.service(), supabaseCatalogKey);
  return db;
}
