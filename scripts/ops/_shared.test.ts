import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodeUrlSegment,
  POSTGRES_PROTOCOLS,
  REDACTED_DSN,
  rawDsnHasFragment,
  redactDsn,
  resolveEnvFilePath,
  scrubDsnSecrets,
} from "@/scripts/ops/_shared";

const FIXTURE_DSN = "postgresql://ops_owner:supersecret-pw@db.internal.example:5432/ops_db?sslmode=require";

describe("shared URL helpers", () => {
  it("exposes the Postgres protocol set both tools share", () => {
    expect([...POSTGRES_PROTOCOLS].toSorted((a, b) => a.localeCompare(b))).toEqual(["postgres:", "postgresql:"]);
  });

  it("decodes a percent-encoded segment and degrades on malformed escapes", () => {
    expect(decodeUrlSegment("my%20db")).toBe("my db");
    expect(decodeUrlSegment("%31%32%37")).toBe("127");
    expect(decodeUrlSegment("plain")).toBe("plain");
    expect(decodeUrlSegment("%ZZ")).toBe("%ZZ");
  });
});

describe("rawDsnHasFragment", () => {
  it("refuses a raw # in the authority span (pathed, pathless, and mid-span ?)", () => {
    expect(rawDsnHasFragment("postgresql://ops_owner#k:pw@host.example:5432/app_db")).toBe(true);
    expect(rawDsnHasFragment("postgresql://db#x")).toBe(true);
    expect(rawDsnHasFragment("postgresql://host.example?user=a@b#f")).toBe(true);
  });

  it("refuses a raw # in the raw path span", () => {
    expect(rawDsnHasFragment("postgresql://u:p@host.example:5432/pt9b#k")).toBe(true);
    expect(rawDsnHasFragment("postgresql://u:p@host.example:5432/pt9b#k?x=1")).toBe(true);
  });

  it("refuses a raw # in the raw query string", () => {
    expect(rawDsnHasFragment("postgresql://u:p@host.example:5432/?dbname=app_db#k")).toBe(true);
    expect(rawDsnHasFragment("postgresql://host.example:5432?dbname=app_db#k")).toBe(true);
  });

  it("allows percent-encoded fragments and benign DSNs", () => {
    expect(rawDsnHasFragment("postgresql://u:p@host.example:5432/app%23db")).toBe(false);
    expect(rawDsnHasFragment("postgresql://u:p@host.example:5432/?dbname=app%23db")).toBe(false);
    expect(rawDsnHasFragment("postgresql://host.example:5432?sslmode=disable")).toBe(false);
    expect(rawDsnHasFragment("postgresql://u:p@host.example:5432/app_db?sslmode=require")).toBe(false);
  });
});

describe("resolveEnvFilePath", () => {
  it("passes an absolute --env value through as-is", () => {
    const scratchEnv = join(tmpdir(), "ops", "scratch.env");
    const resolved = resolveEnvFilePath(scratchEnv);
    expect(resolved).toEqual({ fileName: "scratch.env", rootDir: join(tmpdir(), "ops") });
  });

  it("resolves a relative --env value against the process cwd", () => {
    const resolved = resolveEnvFilePath("nested/dir/.env");
    expect(resolved).toEqual({ fileName: ".env", rootDir: join(process.cwd(), "nested/dir") });
  });
});

describe("redactDsn", () => {
  it("renders the full contract shape: dbName@host(redacted-user)", () => {
    expect(redactDsn(FIXTURE_DSN)).toBe("ops_db@db.internal.example:5432(redacted-user)");
  });

  it("keeps the port when present and drops query parameters", () => {
    expect(redactDsn("postgres://u:p@host.example:5433/db?sslmode=require&application_name=x")).toBe(
      "db@host.example:5433(redacted-user)"
    );
  });

  it("omits the port when absent", () => {
    expect(redactDsn("postgresql://u:p@host.example/db")).toBe("db@host.example(redacted-user)");
  });

  it("marks password-only userinfo as redacted", () => {
    expect(redactDsn("postgresql://:pw@host.example/db")).toBe("db@host.example(redacted-user)");
  });

  it("marks a DSN without userinfo as no-user", () => {
    expect(redactDsn("postgresql://host.example/db")).toBe("db@host.example(no-user)");
  });

  it("renders host only when the database name is missing", () => {
    expect(redactDsn("postgresql://u:p@host.example")).toBe("host.example(redacted-user)");
  });

  it("decodes a percent-encoded database name", () => {
    expect(redactDsn("postgresql://u:p@host.example/my%20db")).toBe("my db@host.example(redacted-user)");
  });

  it("renders the query dbname= as the effective database (libpq override channel)", () => {
    expect(redactDsn("postgresql://u:p@h.example:5432/pathdb?dbname=querydb")).toBe(
      "querydb@h.example:5432(redacted-user)"
    );
    expect(redactDsn("postgresql://u:p@h.example/?dbname=querydb")).toBe("querydb@h.example(redacted-user)");
    // Other keys and an EMPTY dbname= keep the path database.
    expect(redactDsn("postgresql://u:p@h.example/pathdb?sslmode=require")).toBe("pathdb@h.example(redacted-user)");
    expect(redactDsn("postgresql://u:p@h.example/pathdb?dbname=")).toBe("pathdb@h.example(redacted-user)");
  });

  it("keeps IPv6 host literals", () => {
    expect(redactDsn("postgresql://u:p@[2001:db8::1]:5432/db")).toBe("db@[2001:db8::1]:5432(redacted-user)");
  });

  it("falls back to the placeholder for empty, malformed, and non-Postgres values", () => {
    expect(redactDsn(undefined)).toBe(REDACTED_DSN);
    expect(redactDsn("")).toBe(REDACTED_DSN);
    expect(redactDsn("   ")).toBe(REDACTED_DSN);
    expect(redactDsn("not a dsn")).toBe(REDACTED_DSN);
    expect(redactDsn("file:./dev.db")).toBe(REDACTED_DSN);
    expect(redactDsn("mysql://u:p@host/db")).toBe(REDACTED_DSN);
    expect(redactDsn("postgresql:///db")).toBe(REDACTED_DSN);
  });
});

describe("scrubDsnSecrets", () => {
  it("replaces the exact DSN with its redacted rendering", () => {
    const scrubbed = scrubDsnSecrets(`connection failed for ${FIXTURE_DSN}`, FIXTURE_DSN);
    expect(scrubbed).toBe("connection failed for ops_db@db.internal.example:5432(redacted-user)");
  });

  it("replaces the decoded password substring with ***", () => {
    const scrubbed = scrubDsnSecrets("password supersecret-pw was rejected", FIXTURE_DSN);
    expect(scrubbed).toBe("password *** was rejected");
  });

  it("replaces the decoded username substring with ***", () => {
    const scrubbed = scrubDsnSecrets("role ops_owner has no permission", FIXTURE_DSN);
    expect(scrubbed).toBe("role *** has no permission");
  });

  it("handles percent-encoded credentials in the DSN", () => {
    const dsn = "postgresql://ops%5Fowner:super%40secret@host.example/db";
    const scrubbed = scrubDsnSecrets("auth failed for ops_owner with super@secret", dsn);
    expect(scrubbed).toBe("auth failed for *** with ***");
  });

  it("sweeps generic scheme://user:password@ occurrences from foreign output", () => {
    const scrubbed = scrubDsnSecrets("echo: postgresql://someone:hunter2@elsewhere.example/db");
    expect(scrubbed).toBe("echo: postgresql://***:***@elsewhere.example/db");
  });

  it("is a no-op for text without credentials when the DSN password is empty", () => {
    const text = "server 17.11 listening on 127.0.0.1:5432";
    expect(scrubDsnSecrets(text, "postgresql://postgres@127.0.0.1:5432/app_db")).toBe(text);
  });

  it("degrades gracefully on malformed DSNs via the generic sweep", () => {
    const scrubbed = scrubDsnSecrets("bad: postgresql://u:p@h/db and not-a-url at all", "not a dsn");
    expect(scrubbed).toBe("bad: postgresql://***:***@h/db and not-a-url at all");
  });

  it("never leaks credentials when scrubbing tool stderr containing the whole DSN", () => {
    const stderr = `pg_dump: error: connection to server failed: ${FIXTURE_DSN}\npassword supersecret-pw incorrect`;
    const scrubbed = scrubDsnSecrets(stderr, FIXTURE_DSN);
    expect(scrubbed).not.toContain("supersecret-pw");
    expect(scrubbed).not.toContain("ops_owner");
    expect(scrubbed).not.toContain("postgresql://");
    expect(scrubbed).toContain("***");
  });
});
