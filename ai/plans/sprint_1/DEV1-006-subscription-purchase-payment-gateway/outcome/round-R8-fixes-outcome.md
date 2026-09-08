# Round-R8 Fixes — Outcome (Task R8-fixes)

**Date:** 2026-09-08 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

All four R8 items implemented, pinned with tests, and verified. (Retry round — the prior incarnation died before writing anything; this round owns the full scope.) Touched files: 6 code/test files + 1 migration-SQL comment + 1 docs-consistency repair + this outcome + worklog. NO COMMITS.

**F3 first-check finding: the users table DOES have a locale column** — `backend/db/schema/users/users.ts` line 29: `locale: appLocale("locale")` (nullable per-user app locale; the column docblock already names the notification-emitter contract). The code change was therefore IN scope and was implemented; no skip.

## 1. Per-Fix Summary

### F1 (MEDIUM) — purchase-time interval-ceiling gate (fail-closed)

`backend/services/billing/subscription-purchase.service.ts` — `assertPurchasablePlan` (the authoritative in-transaction re-validation) fail-closed NULL lanes but not over-ceiling `intervalDays`, leaving an over-ceiling plan purchasable with a settlement guaranteed to quarantine at activation.

- New gate after the lane gate: `activePlan.intervalDays > MAX_INTERVAL_DAYS` → one `logger.logDomainError("Subscription purchase rejected: plan interval days exceeds the catalog ceiling", { code: "PLAN_INTERVAL_DAYS_OUT_OF_RANGE", entity: "plans", entityId })` + `ValidationError("PLAN_INTERVAL_DAYS_OUT_OF_RANGE", t.validation, undefined, [{ field: "planId", code: "PLAN_INTERVAL_DAYS_OUT_OF_RANGE", message: t.validation }])` — machine code on the error, field payload on `planId`, generic validation label (`"Invalid input."`), mirroring the lane-gate shape.
- `MAX_INTERVAL_DAYS` imported from `@/backend/services/billing/plan-catalog.helpers` (already exported there). Module docblock stage 3 + the `assertPurchasablePlan` docblock (now "Two fail-closed gates") updated coherently.
- **Test** (`subscription-purchase.service.test.ts`, +1): `plan intervalDays past the catalog ceiling fails the purchase closed — zero writes` — direct-DB active + lane-configured fixture at `MAX_INTERVAL_DAYS + 1` (`createTestPlan` override inside `runInRollback`; the rollback IS the tracked cleanup — the suite's own convention "nothing escapes the transaction", matching the R7 interval-quarantine fixture style; a committed fixture would violate the suite docblock and poison the shared DB). Pins code + translated message + the `planId` field payload + `{ subs: 0, payments: 0, claims: 0 }`.

### F2 — contradictory "set to NULL on subscription deletion" comments (2 files)

Reality (per the trigger guards): `subscription_id` is FROZEN identity on ledger rows; deleting a subscription that still has ledger rows raises the immutable-ledger guard (the FK's `set null` action would have to UPDATE those rows); the FK set-null action is therefore unreachable for ledger rows — schema metadata only.

- `backend/db/schema/billing/student-payments.ts` docblock: the "`subscription_id` is nullable and set to NULL on subscription deletion — the payment history survives" claim replaced with the frozen-identity domain language (why the guard fires, why the nullable column + `set null` FK action are metadata-only, and that the payment history never loses its subscription pointer).
- `backend/db/migration/4-student-payments-status-transition.sql` (~line 49): the guard comment now states frozen identity + the delete-raises-the-guard reality, while keeping the correct technical justification for `IS NOT DISTINCT FROM` (a plain `=` would silently allow NULL swaps in either direction). The SQLite parity file carries no such claim (checked — no change needed).

### F3 — activation notification composed in the RECIPIENT's persisted locale

`backend/services/billing/subscription-activation.service.ts` — the confirmation copy was composed in the deployment-default caller locale (`confirmPayment`'s `locale` arg) instead of the recipient's stored preference.

- Inside `confirmPayment`'s in-tx body, immediately before the emit: `const recipientLocale = (await UserRepository.findById(subscription.userId, tx))?.locale ?? defaultLocale;` then `emitConfirmationNotification(subscription, plan.title, recipientLocale, tx)` — the exact `recipient.locale ?? defaultLocale` convention of `session-request-notification.service.ts` (`defaultLocale` from `@/shared/locale/AppLocale`, which is `"ar"` in this codebase — the task brief's `"en"` guess was superseded by the repo's actual constant).
- The caller-supplied `locale` stays for what it legitimately owns: log/error attribution and the post-commit `publishReceipts` hand-off (the publish's `locale` param is log-attribution only — the realtime payload is built from the persisted row).
- Docblocks updated coherently: file header ("copy composed in the RECIPIENT's persisted locale" replaces the old "no per-recipient locale resolution" paragraph), `emitConfirmationNotification`, and the `@param locale` contract.
- **Test** (`subscription-activation.service.test.ts`, +1): `notification copy is composed in the RECIPIENT's persisted locale — not the deployment default` — recipient user carries a stored NON-default locale (`"en"`; platform default is `"ar"`), caller locale `"ar"`; premise guard asserts the two bundles' titles genuinely differ; pins the persisted emit input's `title`/`body` to the EN bundle, and the publish attribution staying `"ar"`. `provisionPendingPair` gained an optional `userOverrides` param (default `= {}` — zero call-site churn). The happy-path fixture user was also pinned to `locale: "en"` so its EN copy assertions compose against the recipient preference (the new contract's fixture expression). Fallout caught and fixed at the root: without it the happy path received the platform-default AR copy.
- **Journey fallout repaired** (`test/workflows/billing/subscription-purchase.journey.test.ts`): step 3's `NOTIFS_EN` copy assertion failed for the same root cause (journey cast members carried no stored locale → platform-default AR copy). `provisionStudent` now stamps `locale: "en"` on each student user row (fixture preference matching the journey's EN copy bundle); the `NOTIFS_EN` comment corrected. Journey back to **11/0**.

### F4 — sessionCount unbounded → int4 overflow at credit

- `backend/services/billing/plan-catalog.helpers.ts`: `export const MAX_SESSION_COUNT = 1_000_000` next to `MAX_INTERVAL_DAYS` (docblock: the activation credit adds the full sessionCount onto the lane's int4 balance; shared with the activation service because legacy/non-catalog rows can sit past it — the DB check only enforces `> 0`). `validateSessionCountField` gained the over-ceiling leg → `{ field: "sessionCount", code: "PLAN_SESSION_COUNT_OUT_OF_RANGE", message: tErrors.validation }` — one validator, so BOTH the create leg (`validatePlanInput`) and the update leg (`validateAndExtractPlanPatch`) are guarded; same machine-code pattern as the interval ceiling.
- Re-guard at activation (`readActivationPlan`, immediately after the R7 interval guard, pre-write): `plan.sessionCount > MAX_SESSION_COUNT` → one correlated `logger.error("Payment webhook quarantined: plan session count exceeds the credit ceiling — nothing mutated", { reference, subscriptionId, planId, sessionCount })` + `null` → `{ processed: false }` — the identical quarantine posture, zero writes (the guard sits before `activatePendingOnce`/`markPaidOnce`/credit).
- **Tests**: plan-catalog service suite +2 (`createPlan and updatePlan reject sessionCount past the credit ceiling (1_000_001 → out of range)` — create AND update legs, code + generic label pinned, stored row unchanged on the update leg; `sessionCount at the credit ceiling (1_000_000) is accepted on the boundary`); activation suite +1 (`legacy plan row past the session-count credit ceiling quarantines — processed:false, zero writes, error logged` — direct-DB `sessionCount: MAX_SESSION_COUNT + 1` fixture, one quarantined error with correlation ids, pending pair + all lanes 0 + no notification/publish).

### Docs consistency (same standard as R6/R7)

`docs/billing/subscription-purchase.md`: §3 purchase flow gained the interval-days ceiling gate leg; §7 step 3's QUARANTINE guards gained the `MAX_SESSION_COUNT` clause and the notification-persist leg now states recipient-locale composition.

## 2. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ EXIT 0 / 0 errors (interim + final) |
| `backend/services/billing/subscription-purchase.service.test.ts` | ✅ **19 pass / 1 skip (real-PG-gated concurrency) / 0 fail** (134 expect calls) — was 18+1skip; **+1 new** (interval-ceiling purchase gate) |
| `backend/services/billing/subscription-activation.service.test.ts` | ✅ **16 pass / 1 skip / 0 fail** (150 expect calls) — was 14+1skip; **+2 new** (recipient locale, session-count quarantine); re-run green after the line-count refactor |
| `backend/db/test/logic/billing/plan-catalog.service.test.ts` | ✅ **26 pass / 0 fail** (86 expect calls) — was 24; **+2 new** (sessionCount create/update ceiling + boundary) |
| `test/workflows/billing/subscription-purchase.journey.test.ts` | ✅ **11 pass / 0 fail** (107 expect calls) — REQUIRED gate; repaired the F3 fallout (recipient-locale fixture) back to green |
| `backend/db/test/logic/billing/plan-catalog.repository.test.ts` | ✅ **16 pass / 0 fail** (91 expect calls) |
| Sub-loop (`scripts/health/sub-loop.ts --lifecycle biome`) | ✅ EXIT 0 on all 8 touched TS files (tsgo → oxlint → biome each). Two first-draft failures fixed at the root, no suppressions: purchase service `max-lines` (301/300 — the fields payload compacted onto a named single-line const) and activation `confirmPayment` `max-lines-per-function` (76/75 — the locale resolution folded into one expression) |
| `bun run check:duplicates` | ✅ 0 clones |
| F2 SQL/schema files | Comment-only edits — no TS surface change; covered by the green full-typecheck + the suites above |

## 3. Notes & Carry-forward

- The F1 test uses `runInRollback` (rollback = tracked cleanup) rather than a committed fixture with manual teardown: the suite's documented convention is "nothing escapes the transaction", and the over-ceiling row is produced via the same direct-DB `createTestPlan` override seam the R7 quarantine test uses. The direct-DB aspect (bypassing catalog validation, legal because the DB check enforces only `> 0`) is what the fixture exercises.
- The task brief's `user.locale ?? "en"` was superseded by the repo's actual convention constant `defaultLocale` (= `"ar"`, from `@/shared/locale/AppLocale`); the test asserts a non-default-locale recipient (`"en"`) winning over the `"ar"` deployment default, which is the sharper proof.
- Pre-existing carries unchanged (QG-4 lint-service heap, B-1 snapshot.json gate-sanctioned formatting commit, PRE-1 plan-catalog anonymous-leg 401/403 split, sub-loop markdown oxlint limitation).
- Scope: `git status` = 6 code/test files + 1 SQL + 1 docs + this outcome + worklog. **NO COMMITS** (orchestrator owns commits).
