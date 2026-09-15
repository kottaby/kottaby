/**
 * `getServerUserContext` unit test suite.
 *
 * Tests:
 *  - Anonymous access when access_token cookie is missing or empty.
 *  - Anonymous access when access token is invalid or expired.
 *  - Anonymous access when user row is not found in DB.
 *  - Fail-closed behavior for governed accounts (deleted, blocked, suspended) with domain error logging.
 *  - Anonymous access when token payload role is unknown or tampered.
 *  - Happy path for valid authenticated user: returns verified userId, role, and user object with passwordHash omitted.
 *  - Defensive error handling when cookie reading or DB queries fail unexpectedly.
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { UserRepository } from "@/backend/db/repo";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { AUTH_COOKIE_NAMES } from "@/backend/lib/auth/cookies";
import { resetJwtSecretCache, signAccessToken } from "@/backend/lib/auth/jwt";
import { resetEnvironmentCache } from "@/backend/lib/env";
import { logger } from "@/backend/lib/logger";
import type { UserSelectType } from "@/backend/types";

// ----------------------------------------------------------------------------
// Controlled cookie store state
// ----------------------------------------------------------------------------

let mockCookieValue: string | undefined;
let cookiesShouldThrow = false;

void mock.module("next/headers", () => ({
  cookies: async () => {
    if (cookiesShouldThrow) {
      throw new Error("Cookie read failed");
    }
    return {
      get: (name: string) =>
        name === AUTH_COOKIE_NAMES.accessToken && mockCookieValue !== undefined
          ? { value: mockCookieValue }
          : undefined,
    };
  },
}));

// Bypass react.cache memoization in unit tests so each call executes freshly.
void mock.module("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

// Dynamically import getServerUserContext after registering module mocks
const { getServerUserContext } = await import("@/backend/lib/auth/server-auth");

// ----------------------------------------------------------------------------
// Helpers & Fixtures
// ----------------------------------------------------------------------------

const ENV_KEYS = ["DATABASE_ENCRYPTION_KEY", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const;
const savedEnv: Record<string, string | undefined> = {};

function mockUserRow(overrides: Partial<UserSelectType> = {}): UserSelectType {
  return {
    id: 100,
    email: "user@example.com",
    fullName: "John Doe",
    passwordHash: "hash",
    role: UserRole.Student,
    isDeleted: false,
    isBlocked: false,
    suspended: false,
    suspendedAt: null,
    suspendedPeriodDays: null,
    locale: "en",
    phone: "+123456789",
    gender: "male",
    country: "EG",
    dateOfBirth: "1995-05-15",
    deletedAt: null,
    blockedAt: null,
    lastActiveAt: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Test Suite
// ----------------------------------------------------------------------------

describe("getServerUserContext — SSR Auth", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    process.env.DATABASE_ENCRYPTION_KEY = "cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234cafef00dcafe1234";
    resetJwtSecretCache();
    resetEnvironmentCache();

    mockCookieValue = undefined;
    cookiesShouldThrow = false;
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
    mockCookieValue = undefined;
    cookiesShouldThrow = false;
  });

  test("returns anonymous context when access_token cookie is missing", async () => {
    mockCookieValue = undefined;

    const context = await getServerUserContext();

    expect(context).toEqual({ userId: null, user: null, role: null });
  });

  test("returns anonymous context when access_token cookie is empty string", async () => {
    mockCookieValue = "";

    const context = await getServerUserContext();

    expect(context).toEqual({ userId: null, user: null, role: null });
  });

  test("returns anonymous context when token signature or payload is invalid", async () => {
    mockCookieValue = "invalid.jwt.token";

    const context = await getServerUserContext();

    expect(context).toEqual({ userId: null, user: null, role: null });
  });

  test("returns anonymous context when user is not found in database", async () => {
    const validToken = await signAccessToken({ userId: 999, role: UserRole.Student });
    mockCookieValue = validToken;

    const findSpy = spyOn(UserRepository, "findById").mockResolvedValue(null);

    const context = await getServerUserContext();

    expect(findSpy).toHaveBeenCalledWith(999);
    expect(context).toEqual({ userId: null, user: null, role: null });
  });

  test("returns anonymous context and logs domain error for deleted user (fail-closed)", async () => {
    const validToken = await signAccessToken({ userId: 100, role: UserRole.Student });
    mockCookieValue = validToken;

    const deletedUser = mockUserRow({ isDeleted: true });
    spyOn(UserRepository, "findById").mockResolvedValue(deletedUser);
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});

    const context = await getServerUserContext();

    expect(context).toEqual({ userId: null, user: null, role: null });
    expect(logSpy).toHaveBeenCalledWith("SSR auth: governed account denied", {
      code: "SSR_GOVERNED_ACCOUNT",
      entity: "users",
      entityId: 100,
    });
  });

  test("returns anonymous context and logs domain error for blocked user (fail-closed)", async () => {
    const validToken = await signAccessToken({ userId: 100, role: UserRole.Teacher });
    mockCookieValue = validToken;

    const blockedUser = mockUserRow({ role: UserRole.Teacher, isBlocked: true });
    spyOn(UserRepository, "findById").mockResolvedValue(blockedUser);
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});

    const context = await getServerUserContext();

    expect(context).toEqual({ userId: null, user: null, role: null });
    expect(logSpy).toHaveBeenCalledWith("SSR auth: governed account denied", {
      code: "SSR_GOVERNED_ACCOUNT",
      entity: "users",
      entityId: 100,
    });
  });

  test("returns anonymous context and logs domain error for actively suspended user", async () => {
    const validToken = await signAccessToken({ userId: 100, role: UserRole.Student });
    mockCookieValue = validToken;

    const now = new Date();
    const suspendedUser = mockUserRow({
      suspended: true,
      suspendedAt: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
      suspendedPeriodDays: 7, // 7-day suspension
    });
    spyOn(UserRepository, "findById").mockResolvedValue(suspendedUser);
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});

    const context = await getServerUserContext();

    expect(context).toEqual({ userId: null, user: null, role: null });
    expect(logSpy).toHaveBeenCalledWith("SSR auth: governed account denied", {
      code: "SSR_GOVERNED_ACCOUNT",
      entity: "users",
      entityId: 100,
    });
  });

  test("returns anonymous context when token role claim is invalid or untrusted", async () => {
    const tamperedToken = await signAccessToken({ userId: 100, role: "superadmin_hacker" });
    mockCookieValue = tamperedToken;

    const activeUser = mockUserRow();
    spyOn(UserRepository, "findById").mockResolvedValue(activeUser);

    const context = await getServerUserContext();

    expect(context).toEqual({ userId: null, user: null, role: null });
  });

  test("returns authenticated context with stripped password for active valid caller", async () => {
    const validToken = await signAccessToken({ userId: 100, role: UserRole.Parent });
    mockCookieValue = validToken;

    const parentUser = mockUserRow({ id: 100, role: UserRole.Parent });
    spyOn(UserRepository, "findById").mockResolvedValue(parentUser);

    const context = await getServerUserContext();

    expect(context.userId).toBe(100);
    expect(context.role).toBe(UserRole.Parent);
    expect(context.user).toBeDefined();
    expect(context.user).not.toBeNull();
    if (context.user) {
      expect("passwordHash" in context.user).toBe(false);
      expect(context.user.preferredRecitation).toBeNull();
      expect(context.user.email).toBe("user@example.com");
      expect(context.user.fullName).toBe("John Doe");
    }
  });

  test("defensive catch: handles unexpected errors gracefully without throwing 500", async () => {
    cookiesShouldThrow = true;
    const logSpy = spyOn(logger, "logDomainError").mockImplementation(() => {});

    const context = await getServerUserContext();

    expect(context).toEqual({ userId: null, user: null, role: null });
    expect(logSpy).toHaveBeenCalledWith("SSR auth: unexpected error", {
      code: "SSR_AUTH_ERROR",
      errorName: "Error",
    });
  });
});
