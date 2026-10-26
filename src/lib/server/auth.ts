import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getLocalDb, supabaseUserClient } from "./db";
import { localDataDir, supabaseConfig } from "./env";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

export interface SessionUser {
  id: string;
  email: string | null;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const LOCAL_COOKIE = "sirl_session";
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1 };

// ───────────────────────── Local (demo) auth ─────────────────────────

let cachedSecret: string | null = null;
function sessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const dir = path.dirname(path.resolve(localDataDir()));
  const file = path.join(dir, "session-secret");
  if (existsSync(file)) cachedSecret = readFileSync(file, "utf8").trim();
  else {
    mkdirSync(dir, { recursive: true });
    cachedSecret = randomBytes(48).toString("base64url");
    writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function makeSessionToken(userId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  const expected = Buffer.from(sign(`${uid}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < now) return null;
  return uid;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, SCRYPT);
  return timingSafeEqual(expected, actual);
}

async function setLocalCookie(userId: string) {
  (await cookies()).set(LOCAL_COOKIE, makeSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

// ───────────────────────── Rate limiting ─────────────────────────

const attempts = new Map<string, number[]>();
export function rateLimit(key: string, max = 8, windowMs = 60_000) {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new AuthError("Too many attempts. Wait a minute and try again.", 429);
  list.push(now);
  attempts.set(key, list);
}

// ───────────────────────── Public API ─────────────────────────

export function validateCredentials(email: unknown, password: unknown): { email: string; password: string } {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) throw new AuthError("Enter a valid email address.");
  if (typeof password !== "string" || password.length < 8 || password.length > 128) throw new AuthError("Password must be 8–128 characters.");
  return { email: email.trim().toLowerCase(), password };
}

export async function signUp(emailRaw: unknown, passwordRaw: unknown): Promise<{ user: SessionUser | null; needsConfirmation: boolean }> {
  const { email, password } = validateCredentials(emailRaw, passwordRaw);
  if (supabaseConfig()) {
    const sb = await supabaseUserClient();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw new AuthError(error.message);
    return { user: data.session && data.user ? { id: data.user.id, email: data.user.email ?? email } : null, needsConfirmation: !data.session };
  }
  const db = await getLocalDb();
  const existing = await db.raw<{ id: string }>("select id from auth.users where email = $1", [email]);
  if (existing.length) throw new AuthError("An account with that email already exists.", 409);
  const rows = await db.raw<{ id: string }>("insert into auth.users (email, encrypted_password) values ($1, $2) returning id", [email, await hashPassword(password)]);
  await setLocalCookie(rows[0].id);
  return { user: { id: rows[0].id, email }, needsConfirmation: false };
}

export async function signIn(emailRaw: unknown, passwordRaw: unknown): Promise<SessionUser> {
  const { email, password } = validateCredentials(emailRaw, passwordRaw);
  if (supabaseConfig()) {
    const sb = await supabaseUserClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new AuthError("Invalid email or password.", 401);
    return { id: data.user.id, email: data.user.email ?? email };
  }
  const db = await getLocalDb();
  const rows = await db.raw<{ id: string; encrypted_password: string }>("select id, encrypted_password from auth.users where email = $1", [email]);
  // Verify against a dummy hash when the user is missing so timing doesn't reveal which emails exist.
  const ok = await verifyPassword(password, rows[0]?.encrypted_password ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64"));
  if (!rows[0] || !ok) throw new AuthError("Invalid email or password.", 401);
  await db.raw("update auth.users set last_sign_in_at = now() where id = $1", [rows[0].id]);
  await setLocalCookie(rows[0].id);
  return { id: rows[0].id, email };
}

export async function signOut(): Promise<void> {
  if (supabaseConfig()) {
    const sb = await supabaseUserClient();
    await sb.auth.signOut();
    return;
  }
  (await cookies()).delete(LOCAL_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (supabaseConfig()) {
    const sb = await supabaseUserClient();
    const { data } = await sb.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }
  const uid = verifySessionToken((await cookies()).get(LOCAL_COOKIE)?.value);
  if (!uid) return null;
  const db = await getLocalDb();
  const rows = await db.raw<{ id: string; email: string }>("select id, email from auth.users where id = $1", [uid]);
  return rows[0] ? { id: rows[0].id, email: rows[0].email } : null;
}
