import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-0123456789";
});

describe("session cookies", () => {
  it("are Secure only for HTTPS requests (plain-HTTP LAN/IP access must still sign in)", async () => {
    const { shouldUseSecureCookie } = await import("@/lib/server/auth");
    expect(shouldUseSecureCookie("https", undefined)).toBe(true);
    expect(shouldUseSecureCookie("https,http", undefined)).toBe(true);
    expect(shouldUseSecureCookie("http", undefined)).toBe(false);
    expect(shouldUseSecureCookie(null, undefined)).toBe(false);
    expect(shouldUseSecureCookie("http", "always")).toBe(true);
    expect(shouldUseSecureCookie("https", "never")).toBe(false);
  });

  it("signed tokens verify, and tampered or expired tokens are rejected", async () => {
    const { makeSessionToken, verifySessionToken } = await import("@/lib/server/auth");
    const uid = "d06e1b0a-b0bf-402c-a702-cb9012a5bdad";
    const t = makeSessionToken(uid);
    expect(verifySessionToken(t)).toBe(uid);
    const [, exp, sig] = t.split(".");
    expect(verifySessionToken(`00000000-0000-0000-0000-000000000000.${exp}.${sig}`)).toBeNull();
    expect(verifySessionToken(t, Date.now() + 31 * 86_400_000)).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });
});
