/**
 * UI test environment bootstrap — preloaded by `test/scripts/run-server-tests.ts`
 * in `--e2e` mode, which the Paymob live checkout runner
 * (`bun run test:ui:e2e:paymob` — see `package.json` scripts and the adopted
 * `test/ui/AGENTS.md`) uses.
 *
 * Responsibilities (intentionally tiny — the heavy lifting is already done by
 * the bunfig.toml global preloads, which run BEFORE this file):
 *
 * 1. `test/scripts/test-runner-guard.ts` has already verified this process was
 *    started by an approved runner (`run-locked-cmd.ts`, …).
 * 2. `backend/db/test/ensure-env.ts` has already validated DATABASE_URL /
 *    DATABASE_ENCRYPTION_KEY / DB_PROVIDER via `backend/lib/env.ts`.
 *
 * This preload adds only the UI-test posture:
 * - CI/test-server markers are normalized into the exact string shape
 *   understood by `backend/lib/test-ci-env.ts` (`isTestCi()`), and a run that
 *   reaches UI tests without any sanctioned marker fails fast
 *   instead of silently exercising production-ish assumptions.
 * - `TEST_SERVER_MODE` defaults to `dev` per `test/ui/AGENTS.md`; the
 *   E2E production-mode flow overrides it to `production` (after
 *   `bun run build:test`).
 */

import { isTestCi } from "@/backend/lib/test-ci-env";

// `.env.test.ci` carries `TEST_CI=1` (dotenv-friendly), while isTestCi()
// compares against the canonical `"true"`. Normalize truthy shapes so local
// `--env-file=.env.test` runs behave identically to GitHub Actions runs.
if (process.env.TEST_CI === "1") {
  process.env.TEST_CI = "true";
}

if (!isTestCi()) {
  throw new Error(
    "[test-env] UI tests require a sanctioned test environment: run through " +
      "`bun run test:ui:e2e:paymob` with .env.test materialized (TEST_CI=1) or under real CI."
  );
}

// Test-posture flags mirrored from .env.test.ci so preloads alone can't be
// bypassed by removing the env file (defense in depth, idempotent).
process.env.TEST_SERVER ??= "1";

// NODE_ENV is typed read-only in Bun's process types; same intentional cast as
// backend/db/test/ensure-env.ts.
(process.env as { NODE_ENV?: string }).NODE_ENV ??= "test";

// The runner defaults the server to dev-mode semantics per AGENTS.md;
// the E2E production-mode flow forces TEST_SERVER_MODE=production (after
// `bun run build:test`).
process.env.TEST_SERVER_MODE ??= "dev";
