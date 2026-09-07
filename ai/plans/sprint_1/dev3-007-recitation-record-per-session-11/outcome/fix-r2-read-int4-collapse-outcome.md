# Fix R2 — Read-path int4 ceiling guard verification outcome

Branch: `feat/dev3-007-recitation-record-per-session-11` (verified via `git branch --show-current`; no commits made)

## Finding

`getSessionRecitation` is the oracle-safe read: a malformed id, an unknown session, and a
non-participant caller must all collapse to the same `null`. However, a **positive safe
integer beyond the `session.id` int4 ceiling (2^31 − 1 = 2147483647)** passed the existing
`isPositiveSafeSessionId` shape check and was sent to Postgres. Since `session.id` is an
int4 primary key, such a query dies as a **driver-level out-of-range failure** instead of
returning `null` — breaking the oracle-safe null-collapse contract on the read path and
leaking an INTERNAL_SERVER_ERROR where a participant read would answer `null`.

## Fix (diff summary — `backend/services/classes/recitation.service.ts` only)

- Added module-scoped constant `SESSION_ID_INT4_CEILING = 2_147_483_647` with a doc comment
  explaining the int4 PK ceiling and the driver-level failure a query carrying such an id
  would hit.
- In `getSessionRecitation` (READ PATH ONLY), the pre-DB guard became:
  `if (!isPositiveSafeSessionId(sessionId) || sessionId > SESSION_ID_INT4_CEILING) { return null; }`
  — so ids beyond the ceiling collapse to `null` BEFORE any database read, on the same
  malformed-id channel.
- Doc comments updated (header oracle-safe contract, `getSessionRecitation` JSDoc).
- **Write path (`setSessionRecitation`) untouched** — `git diff` confirms the only
  behavioral hunk is inside `getSessionRecitation`. The write path correctly surfaces the
  driver-level failure as the masked INTERNAL_SERVER_ERROR (covered by existing wire tests).

`git status --porcelain` shows exactly 3 modified files, all expected:
- `backend/services/classes/recitation.service.ts` (the fix)
- `backend/services/classes/recitation.service.test.ts` (test cells)
- `backend/graphql/test/recitation-record.wire.test.ts` (test cells)

No other source files changed.

## Verification evidence

| # | Check | Result |
|---|-------|--------|
| 1 | `git diff backend/services/classes/recitation.service.ts` + `git status --porcelain` | Guard only in `getSessionRecitation`, pre-DB, uses int4 ceiling; write path unchanged; only 3 expected files modified |
| 2 | `sub-loop.ts backend/services/classes/recitation.service.ts --lifecycle duplicates` | EXIT=0 (tsgo, oxlint, biome, lint:type-aware, check:duplicates all passed) |
| 3 | `sub-loop.ts backend/services/classes/recitation.service.test.ts --lifecycle duplicates` | EXIT=0 (all checks passed; jscpd skipped — outside scan scope) |
| 4 | `sub-loop.ts backend/graphql/test/recitation-record.wire.test.ts --lifecycle duplicates` | EXIT=0 (all checks passed; jscpd skipped — outside scan scope) |
| 5 | `run-test.ts backend/services/classes/recitation.service.test.ts` | EXIT=0 — **23 pass / 0 fail**, 363 expect() calls (incl. new "int4-overflow session id collapses the READ to null before any database read") |
| 6 | `run-test.ts backend/graphql/test/recitation-record.wire.test.ts` (live stack, postgres 127.0.0.1:5432 kottaby_test accepting connections via `/tmp/pg-root` pg_isready) | EXIT=0 — **26 pass / 0 fail**, 206 expect() calls (incl. new "an id beyond the int4 session-id ceiling collapses to the same null (no error channel)"; write-path masking tests still pass with `params: 2147483648` failing at the driver as designed) |
| 7 | `bun tsgo` | EXIT=0 — 0 errors |

No fixes were required during the sub-loop checks (all passed on first run).

## Conclusion

The read-collapse fix is verified: read-path int4-overflow ids now collapse to `null`
pre-DB in `getSessionRecitation` only; the write path and all other behavior are unchanged.
All health checks, both test suites (service-level and live wire), and the project-wide
type check are green. Ready for review/commit by the orchestrator (no commits made here).
