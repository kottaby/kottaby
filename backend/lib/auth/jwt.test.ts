/**
 * `backend/lib/auth/jwt.ts` — unit test suite.
 *
 * Tests:
 *  - Access token signing and verification (`signAccessToken`, `verifyAccessToken`).
 *  - Refresh token signing and verification (`signRefreshToken`, `verifyRefreshToken`).
 *  - Invalid/tampered/expired/cross-type token verification failures.
 *  - Security fix validation: missing `DATABASE_ENCRYPTION_KEY` throws required env error when explicit secrets are unset (no hardcoded fallback).
 *  - Explicit JWT secret override vs dev fallback secret derivation.
 *  - Utility getters and dev fallback status checker.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  generateSessionId,
  getAccessTokenTtlSeconds,
  getRefreshTokenTtlSeconds,
  isUsingDevFallbackSecret,
  resetJwtSecretCache,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "@/backend/lib/auth/jwt";
import { resetEnvironmentCache } from "@/backend/lib/env";

const ENV_KEYS = ["DATABASE_ENCRYPTION_KEY", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "NODE_ENV"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  resetJwtSecretCache();
  resetEnvironmentCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      (process.env as Record<string, string | undefined>)[key] = savedEnv[key];
    }
  }
  resetJwtSecretCache();
  resetEnvironmentCache();
});

describe("JWT Auth Utilities — Signing & Verification", () => {
  test("signs and verifies access token payload correctly", async () => {
    process.env.DATABASE_ENCRYPTION_KEY = "cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234";
    resetJwtSecretCache();
    resetEnvironmentCache();

    const token = await signAccessToken({ userId: 42, role: "teacher" });
    expect(typeof token).toBe("string");

    const verified = await verifyAccessToken(token);
    expect(verified).toEqual({ userId: 42, role: "teacher" });
  });

  test("signs and verifies refresh token payload correctly", async () => {
    process.env.DATABASE_ENCRYPTION_KEY = "cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234";
    resetJwtSecretCache();
    resetEnvironmentCache();

    const sessionId = generateSessionId();
    const token = await signRefreshToken({ userId: 42, sessionId });
    expect(typeof token).toBe("string");

    const verified = await verifyRefreshToken(token);
    expect(verified).toEqual({ userId: 42, sessionId });
  });

  test("returns null when verifying a tampered token", async () => {
    process.env.DATABASE_ENCRYPTION_KEY = "cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234";
    resetJwtSecretCache();
    resetEnvironmentCache();

    const token = await signAccessToken({ userId: 42, role: "teacher" });
    const tampered = `${token.slice(0, -4)}XXXX`;

    const verified = await verifyAccessToken(tampered);
    expect(verified).toBeNull();
  });

  test("cross-type token replay rejection: access token is rejected by verifyRefreshToken and vice versa", async () => {
    process.env.DATABASE_ENCRYPTION_KEY = "cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234";
    resetJwtSecretCache();
    resetEnvironmentCache();

    const accessToken = await signAccessToken({ userId: 42, role: "teacher" });
    const refreshToken = await signRefreshToken({ userId: 42, sessionId: generateSessionId() });

    expect(await verifyRefreshToken(accessToken)).toBeNull();
    expect(await verifyAccessToken(refreshToken)).toBeNull();
  });

  test("returns null for malformed tokens", async () => {
    expect(await verifyAccessToken("not.a.valid.jwt")).toBeNull();
    expect(await verifyRefreshToken("bogus")).toBeNull();
  });
});

describe("Security Vulnerability Fix — No Hardcoded Fallback Secret", () => {
  test("throws Error when DATABASE_ENCRYPTION_KEY and explicit JWT secrets are missing", async () => {
    delete process.env.DATABASE_ENCRYPTION_KEY;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    resetJwtSecretCache();
    resetEnvironmentCache();

    let accessError: Error | null = null;
    try {
      await signAccessToken({ userId: 1, role: "student" });
    } catch (err) {
      accessError = err instanceof Error ? err : new Error(String(err));
    }
    expect(accessError?.message).toContain('Required environment variable "DATABASE_ENCRYPTION_KEY" is not set.');

    let refreshError: Error | null = null;
    try {
      await signRefreshToken({ userId: 1, sessionId: "session-1" });
    } catch (err) {
      refreshError = err instanceof Error ? err : new Error(String(err));
    }
    expect(refreshError?.message).toContain('Required environment variable "DATABASE_ENCRYPTION_KEY" is not set.');
  });

  test("uses explicit JWT_ACCESS_SECRET and JWT_REFRESH_SECRET when provided", async () => {
    delete process.env.DATABASE_ENCRYPTION_KEY;
    process.env.JWT_ACCESS_SECRET = "explicit-access-secret-32-bytes-long!!";
    process.env.JWT_REFRESH_SECRET = "explicit-refresh-secret-32-bytes-long!";
    resetJwtSecretCache();
    resetEnvironmentCache();

    const accessToken = await signAccessToken({ userId: 99, role: "admin" });
    const verifiedAccess = await verifyAccessToken(accessToken);
    expect(verifiedAccess).toEqual({ userId: 99, role: "admin" });

    const sessionId = generateSessionId();
    const refreshToken = await signRefreshToken({ userId: 99, sessionId });
    const verifiedRefresh = await verifyRefreshToken(refreshToken);
    expect(verifiedRefresh).toEqual({ userId: 99, sessionId });
  });
});

describe("JWT Helper Utilities", () => {
  test("generateSessionId returns a valid UUID string", () => {
    const id = generateSessionId();
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test("getAccessTokenTtlSeconds and getRefreshTokenTtlSeconds return expected TTLs", () => {
    expect(getAccessTokenTtlSeconds()).toBe(900); // 15 min
    expect(getRefreshTokenTtlSeconds()).toBe(604800); // 7 days
  });

  test("isUsingDevFallbackSecret returns correct state based on env", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    resetJwtSecretCache();
    resetEnvironmentCache();
    expect(isUsingDevFallbackSecret()).toBe(true);

    process.env.JWT_ACCESS_SECRET = "access-secret";
    process.env.JWT_REFRESH_SECRET = "refresh-secret";
    resetJwtSecretCache();
    resetEnvironmentCache();
    expect(isUsingDevFallbackSecret()).toBe(false);

    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    resetJwtSecretCache();
    resetEnvironmentCache();
    expect(isUsingDevFallbackSecret()).toBe(false);
  });
});
