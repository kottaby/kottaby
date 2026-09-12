import { describe, expect, test } from "bun:test";
import { sanitizeUrlCredentials } from "@/backend/lib/utils/url";

describe("sanitizeUrlCredentials", () => {
  test("returns empty string for undefined or empty string", () => {
    expect(sanitizeUrlCredentials(undefined)).toBe("");
    expect(sanitizeUrlCredentials("")).toBe("");
  });

  test("redacts username and password in valid URLs", () => {
    const sanitized = sanitizeUrlCredentials("postgresql://admin_user:secret_pass@localhost:5432/kottaby");
    expect(sanitized).toBe("postgresql://***@localhost:5432/kottaby");
    expect(sanitized).not.toContain("secret_pass");
    expect(sanitized).not.toContain("admin_user");
  });

  test("leaves URLs without credentials untouched", () => {
    expect(sanitizeUrlCredentials("http://localhost:3000/path")).toBe("http://localhost:3000/path");
  });

  test("redacts credentials in unparseable/malformed URLs via fallback", () => {
    const malformed = "postgresql://user:secret-pw@localhost:port_invalid/db";
    const sanitized = sanitizeUrlCredentials(malformed);
    expect(sanitized).toBe("postgresql://***@localhost:port_invalid/db");
    expect(sanitized).not.toContain("secret-pw");
    expect(sanitized).not.toContain("user:");
  });
});
