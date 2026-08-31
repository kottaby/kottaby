# Worklog — DEV3-004 Session Creation & Lifecycle

> Orchestrator-side execution log. Entries append-only, newest last. Format follows the sprint_0 convention (Task ID + date + facts).

---

## Task ID: 5.1-5.3 — Phase 5 consolidation (2026-08-31, 01:34 UTC)

**Scope:** fresh re-run of all Phase-5 evidence; no feature code touched. Two test files edited (lint debt), three outcomes written, checkboxes 5.1/5.1.SR/5.2/5.2.SR/5.3 flipped.

**5.1 (chaos & differential):** `backend/services/classes/session-lifecycle.service.test.ts` ×2 consecutive → **37 pass / 0 fail / 362 expects** both runs. Anchors recorded (all assert final committed DB state): REQ-043(a):1272 (b):1295 (c):1334 (d):1359 (e):1388; REQ-040 rollback+key-reuse :1094; REQ-042 refund-once :1154; REQ-072 trial-first :409. 5.1.SR: zero sleeps; all five races synchronize via `Promise.allSettled` (:1276/:1299/:1339/:1368/:1400). → outcome/5.1-outcome.md.

**5.2 (GraphQL matrix):** mutations grid **35/0** (102 expect, post-fix), queries grid **14/0** (53 expect, post-fix), SDL parity **10/0**, schema surface **12/0**, backend public-operations **26/0**, frontend allowlist-coverage **8/0** → **105/0** total. B3/B4 ruling cells re-proven. 5.2.SR: fixtures via `buildSessionJourneyCast` (entity-setup factories); message-layer localization via error-contract-matrix tEn/tAr (35/36 — see findings). → outcome/5.2-outcome.md.

**5.3 (final gates):** `bun tsgo` 0 · `bunx @biomejs/biome check .` 570 files 0 diagnostics · sandbox-safe eslint (`--concurrency=1`, ts6 patch) **0/0** · journeys ×2 **16/0/272 each** · 10-suite battery **201/0** (counts match the 2.M list; expect-count growth only on 2 suites from later Phase-1/2 edits) · `git diff b0ca09e --stat -- backend/db/schema/ backend/db/migration/` = exactly REQ-013's two artifacts + barrel (session.ts +10−2, session-request-idempotency.ts +39 new, classes/index.ts +1; **migration/ zero diff**). Baseline delta = **0 statements**. → outcome/5.3-outcome.md.

**In-gate code fix (ours):** full-repo eslint exposed **31 `sonarjs/assertions-in-tests` errors** (29 mutations-grid + 2 queries-grid tests asserting only through `expectMutationError`, whose internal expects SonarJS can't see). Fixed code-side: added the suites' own conventional `expect(<result>.error).toBeDefined();` before each helper call (29+2 sites, zero behavior change; sub-loop `--lifecycle duplicates` exit 0 both files; suites re-run green, expect totals +31 exactly). This was a real delta vs b0ca09e introduced by Phase 3/4 test files that no full-repo eslint had covered until now (2.M ran before those files existed; Phase 3/4 gates ran file-scoped sub-loops).

**Environment fixes (env-side):**
1. Stale interactive `next dev` on :3000 (PID 18077/18089, ~31 min, from the Phase-4 browser loops) held Next's dev-dir lock → test-tier server on :3066 aborted ("Another next dev server is already running") → first matrix run 0/1. Fixed via `bash scripts/stop-next.sh`; re-run green.
2. Orphaned test-tier `next-server` child on :3066 survived a suite `afterAll` SIGTERM (wrapper-only kill) → next run's hooks timed out 0/1 at 240 s. Fixed by killing stale PIDs directly.

**Findings reported (out-of-slice, owner assigned, NOT fixed here):**
- F1 (DEV3-003-owned): `backend/graphql/test/error-contract-matrix.test.ts:514-521` red since before b0ca09e — its bare `{ _health }` wire probe predates the `_health: HealthCheck!` retype (suite + health.pothos.ts are byte-identical to b0ca09e; helpers already poll `{ _health { status } }` per test-lifecycle.ts:12-14). One-line fix candidate for the owning wave: probe `_health { status }`.
- F2 (test-infra): `test/scripts/kill-test-servers.ts` checks only `TEST_SERVER_PORT=3099` (port-helpers.ts:3) while the GraphQL suites bind **3066** (graphql-test-helpers TEST_PORT) — the repo's kill script never cleans the port the suites actually use.
- F3 (process note): `tasks.md` 5.3's `bun test --coverage` clause was subsumed per orchestrator's gate list by the fresh 10/10 battery; coverage archive deferred to 7.4 final synthesis.

**Totals this task:** 18 suite executions across 16 suites; all green except the pre-existing F1 (out of gate lists). Gate commands captured in /tmp logs + logs/<timestamp>/ harness logs.
