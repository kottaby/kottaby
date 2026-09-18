import { beforeEach, describe, expect, it } from "bun:test";
import {
  checkRateLimit,
  getClientIdentifier,
  type RateLimiterConfig,
  resetRateLimitWindows,
} from "@/backend/lib/ratelimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimitWindows();
  });

  it("allows requests up to the limit and blocks exceeding requests", async () => {
    const testLimiter: RateLimiterConfig = {
      name: "test-limiter",
      limit: 2,
      windowMs: 60_000,
    };

    const res1 = await checkRateLimit("client-a", testLimiter);
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(1);

    const res2 = await checkRateLimit("client-a", testLimiter);
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(0);

    const res3 = await checkRateLimit("client-a", testLimiter);
    expect(res3.success).toBe(false);
    expect(res3.remaining).toBe(0);
  });

  it("isolates rate limits by limiter name for the same identifier", async () => {
    const limiterA: RateLimiterConfig = {
      name: "limiter-a",
      limit: 1,
      windowMs: 60_000,
    };
    const limiterB: RateLimiterConfig = {
      name: "limiter-b",
      limit: 5,
      windowMs: 60_000,
    };

    const client = "client-b";

    const a1 = await checkRateLimit(client, limiterA);
    expect(a1.success).toBe(true);

    const a2 = await checkRateLimit(client, limiterA);
    expect(a2.success).toBe(false);

    // Requests under limiterB should not be blocked by limiterA's usage
    const b1 = await checkRateLimit(client, limiterB);
    expect(b1.success).toBe(true);
    expect(b1.remaining).toBe(4);
  });

  it("clears windows when resetRateLimitWindows is called", async () => {
    const testLimiter: RateLimiterConfig = {
      name: "reset-test",
      limit: 1,
      windowMs: 60_000,
    };

    const res1 = await checkRateLimit("client-c", testLimiter);
    expect(res1.success).toBe(true);

    const res2 = await checkRateLimit("client-c", testLimiter);
    expect(res2.success).toBe(false);

    resetRateLimitWindows();

    const res3 = await checkRateLimit("client-c", testLimiter);
    expect(res3.success).toBe(true);
  });

  it("extracts client IP from x-forwarded-for or x-real-ip headers", () => {
    const reqWithXff = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18" },
    });
    expect(getClientIdentifier(reqWithXff)).toBe("203.0.113.195");

    const reqWithRealIp = new Request("http://localhost", {
      headers: { "x-real-ip": "198.51.100.1" },
    });
    expect(getClientIdentifier(reqWithRealIp)).toBe("198.51.100.1");

    const plainReq = new Request("http://localhost");
    expect(getClientIdentifier(plainReq)).toBe("local");
  });
});
