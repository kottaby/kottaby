# R1 Implementation Review Wave — Aggregate Outcome

## Plan
`ai/plans/sprint_1/subscription-validity-window-expiry` — Subscription Validity Window & Expiry (implementation review wave R1)

## Review Wave Aggregate

Four reviewers ran against the implemented tree (`feat/subscription-validity-window-expiry` @ `76f68a6`):

| Reviewer | Raw findings | Breakdown |
|---|---|---|
| Types | 0 | — |
| Backend | 1 | 1 LOW |
| Frontend | 0 | — |
| Pentester | 3 | 3 LOW |

**Dedupe:** 5 raw → **3 unique** findings. The pentester's two sandbox-recovery-debris reports (committed `scripts/recover-branch.sh` + untracked `scripts/one-shot-*.sh` session files) describe the same root cause and merge into one finding (F3). No reviewer overlaps across surfaces.

| Unique ID | Severity | Source | Title |
|---|---|---|---|
| F1 | LOW | Backend | `abortSweep` throws `ConflictError` → cron internal failures surface as HTTP 409 CONFLICT instead of the contracted masked 500 |
| F2 | LOW | Pentester | 401 timing asymmetry on the unconfigured-secret branch of the cron bearer gate |
| F3 | LOW | Pentester | Sandbox-session recovery debris (`scripts/recover-branch.sh`) committed in the branch diff |

---

## Adjudication

| ID | Adjudication | Rationale |
|---|---|---|
| F1 | **FIX** | plan.md §4.4 error contract ("Cron internal failure → masked via `apiErrorResponse` → `INTERNAL_SERVER_ERROR` → 500") and the route docblock both specify a masked 500; the route's catch masks non-domain throws but a domain `ConflictError` passes through its own code (409). Sibling precedent for unreachable sweep states is a raw throw → masked 500 (`backend/services/classes/session-lifecycle.transitions.ts:234`). |
| F2 | **NEITHER (adjudicated)** | Adjudicated as fix-both-or-neither together with the out-of-scope sibling route (`app/api/cron/sweep-sessions`): hardening only `expire-subscriptions` would create an asymmetric 401 contract across the two cron surfaces, and the sibling is outside this plan's diff. Decision: change neither here; defer to a cross-cutting cron-auth hardening change. |
| F3 | **REMOVE — delegated to orchestrator** | Sandbox-session recovery debris, not plan work: hardcoded `/home/z/my-project`, destroys branch state if run elsewhere. Fix subagent has no git-write authority → tracked-status verification only; the orchestrator performs the `git rm` + commit. |

---

## Fix Record

### F1 — FIXED (`backend/services/billing/subscription-expiry.service.ts`)

- `abortSweep` now throws a **non-domain `Error`** with the same client-safe generic copy (`SWEEP_ABORTED_MESSAGE` = "Subscription expiry could not be completed." — masked anyway at the route boundary); the correlated service-side `logger.error` (bounded diagnostic, ids/counts only) is kept verbatim. The route's catch now masks every sweep failure to 500 `INTERNAL_SERVER_ERROR`, matching plan.md §4.4, the route docblock, and the `session-lifecycle.transitions.ts` raw-throw sibling precedent.
- The `abortSweep` docblock now records the deliberate non-domain choice (domain class would pass its own code through `apiErrorResponse`).
- The now-unused `import { ConflictError } from "@/backend/lib/errors"` was removed (grep-verified zero remaining references in the file).
- **Test audit (both suites verified, neither needed changes):**
  - `subscription-expiry.service.test.ts` — NO ConflictError/409 pins existed. Its `expectSweepFailure` helper already pins the new service-level contract (`instanceof Error`; throws, cohort rolled back — proven by the Tier-3 rollback probe "an induced mid-cohort zeroing failure rolls the WHOLE cohort back").
  - `expire-subscriptions-route.test.ts` — the masked-500 test already mocks a plain `Error` ("zeroing statement unreadable (simulated driver failure)"), not a `ConflictError`; kept green as-is.
- **Route docblock re-verified:** the `route.ts` failure row already reads "a THROWN sweep failure … caught and masked through `apiErrorResponse` (500 `INTERNAL_SERVER_ERROR` + one correlated log line)" — accurate as-is under the new contract; no wording change required, and `sweep-sessions` was NOT touched. The canonical doc (`docs/billing/subscription-validity-window-expiry.md`) already specifies the masked 500 everywhere (§ envelope, § error table, § invariants) — the code now matches it.

### F2 — NO CHANGE (adjudicated)

- No code change made, per the fix-both-or-neither ruling above. Recorded so a future cron-auth hardening ticket picks up both routes together.

### F3 — REPORTED (removal delegated to orchestrator)

Tracked-status verification at HEAD `76f68a6` (`git ls-files scripts/`, cross-checked against the `main...HEAD` branch diff):

| Path | Tracked in HEAD? | In branch diff? | Disposition |
|---|---|---|---|
| `scripts/recover-branch.sh` | **YES** (added in commit `5f88744`) | YES | Orchestrator: `git rm scripts/recover-branch.sh` + commit |
| `scripts/one-shot-5.2.sh` | NO (untracked, `??`) | NO (working tree only) | Working-tree debris; safe to delete from disk |
| `scripts/one-shot-6.1.sh` | NO (untracked, `??`) | NO (working tree only) | Working-tree debris; safe to delete from disk |

Per instructions the fix subagent performed no git writes and deleted nothing.

---

## Fix Verification Results

| Check | Command | Result |
|---|---|---|
| Service suite | `bun run test/scripts/run-test.ts backend/services/billing/subscription-expiry.service.test.ts` | **8 pass / 0 fail**, exit 0 |
| Route suite | `bun run test/scripts/run-test.ts app/api/cron/expire-subscriptions/test/expire-subscriptions-route.test.ts` | **11 pass / 0 fail**, exit 0 (masked-500 pin green against the new plain-`Error` throw) |
| Journey suite | `bun run test/scripts/run-test.ts test/workflows/billing/subscription-expiry.journey.test.ts` | **7 pass / 0 fail**, exit 0 |
| Sub-loop duplicates | `bun run scripts/health/sub-loop.ts backend/services/billing/subscription-expiry.service.ts --lifecycle duplicates` | tsgo ✅ / oxlint ✅ / biome:check ✅ / lint:type-aware ✅ / check:duplicates ✅ — **exit 0** |

Files changed by this wave: `backend/services/billing/subscription-expiry.service.ts` (F1 fix), `worklog.md` (R1-FIX section), this outcome file. Nothing committed — per orchestrator instruction, changes remain in the working tree for orchestrator review/commit together with the F3 removal.

## Environment Notes

- The sandbox exhibited repeated HEAD drift to `main@2bdea32` during the session (same failure mode previous waves recorded in `worklog.md`); countered each time with the authorized STEP-0 recovery, a dirty-tree guard, and `/tmp` copies: pre-edit backups at `/tmp/r1fix-backup-*`, post-edit finals at `/tmp/r1fix-final-*`.
- All suites and the sub-loop check ran with HEAD verified at `76f68a6` immediately before execution.
