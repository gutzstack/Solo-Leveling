import "server-only";

/**
 * Backend selection. Supabase is used only when all three variables are present; otherwise the app
 * runs the local demo backend (PGlite + signed-cookie auth) with no external services.
 */
export function supabaseConfig(): { url: string; anonKey: string; serviceKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && anonKey && serviceKey) return { url, anonKey, serviceKey };
  return null;
}

export function backendKind(): "supabase" | "local" {
  return supabaseConfig() ? "supabase" : "local";
}

/** Serverless hosts (Vercel, Netlify, AWS Lambda) only allow writes under /tmp, which is ephemeral. */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function localDataDir(): string {
  if (process.env.LOCAL_DB_DIR) return process.env.LOCAL_DB_DIR;
  return isServerless() ? "/tmp/system-irl/pglite" : ".data/pglite";
}

/** True when the local backend can't keep data between restarts (serverless /tmp storage). */
export function storageIsEphemeral(): boolean {
  return !supabaseConfig() && isServerless() && !process.env.LOCAL_DB_DIR;
}

export function aiConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return { apiKey, model: process.env.AI_MODEL ?? "claude-opus-5-5" };
}
