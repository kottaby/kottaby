# Round-R10 Fixes — Outcome (Task R10-verify)

**Date:** 2026-09-08 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

All six R10 items present in the working tree and verified end-to-end. The prior incarnation died after applying the file edits and (as discovered below) after the F2 migrate had already applied — before any verification. This round completed F2 verification, fixed the one gate failure the F1 edit introduced (oxlint max-lines), and ran the full gate suite. Touched files: 9 modified + 1 untracked drizzle delta folder + this outcome + worklog. NO COMMITS.

## 1. Per-Fix Status

### F1 — purchase sessionCount ceiling gate + test ✅

`backend/services/billing/subscription-purchase.service.ts` — `assertPurchasablePlan` gained the SESSION-COUNT ceiling gate after the interval gate: `sessionCount > MAX_SESSION_COUNT` (imported from `plan-catalog.helpers` alongside `MAX_INTERVAL_DAYS`) → `logDomainError` (entity `plans` + entityId) + `ValidationError` with machine code `PLAN_SESSION_COUNT_OUT_OF_RANGE`, the `{field: "planId"}` payload, and the generic validation label — the symmetric fail-closed posture (the DB check enforces only `> 0`; the activation credit would overflow the lane's int4 balance). Module docblock stage-3 list and the helper docblock cohered ("Two fail-closed gates" → "Three fail-closed gates").
`subscription-purchase.service.test.ts` — +1 test `plan sessionCount past the catalog ceiling fails the purchase closed — zero writes`: direct-DB over-ceiling active+Hifz-lane fixture inside `runInRollback`, pins denial code + field code + localized message, and asserts the in-transaction gate fired BEFORE any write (`{subs: 0, payments: 0, claims: 0}`). Suite: **20 pass / 1 skip / 0 fail** (141 expect calls).

### F2 — sidecar re-bundle (completed + verified) ✅ — resolution detail in §2

The comment-edited `4-student-payments-status-transition.sql` is re-bundled as the new delta folder `backend/drizzle/20260908103411_custom_4-student-payments-status-transition/` and the sidecar `backend/drizzle/.custom-migrations.json` is consistent with it; the delta is applied to the database exactly once and re-running migrate is a no-op. Final state: **sidecar hash == file hash**, proven by two consecutive migrate runs.

### F3 — webhook route docblock move ✅

`app/api/payments/webhook/route.ts` — the `BodyChunkRead` type alias was wedged between `readChunkWithDeadline`'s JSDoc and the function it documents (severing the docblock-function association). The alias now sits ABOVE the docblock, so the JSDoc attaches directly to `readChunkWithDeadline`. Pure placement move (type alias + comments); zero runtime change. Webhook suite green at 34/0.

### F4 — backend/services/AGENTS.md purchase bullet ✅

The subscription-purchase bullet's ack semantics corrected to the contract reality: "ack replays/quarantines `200 { processed: false }`" → "acks replays `200 { processed: true, replayed: true }` and quarantines unknown/mismatched/unconfigurable events `200 { processed: false }` instead of throwing". Docs-consumer accuracy fix only.

### F5 — ar lane label "حفظ القرآن" ✅

`shared/locale/ar/plans/index.ts` — `balanceLaneHifz` completed from the bare "حفظ" to "حفظ القرآن" (the Qur'an-hifz lane label). Plans-namespace parity green at 4/0.

### F6 — client price regex ✅

`frontend/views/admin/plans/hooks/usePlanForm.ts` — `priceRegex` tightened from `/^\d+(\.\d{1,2})?$/` to `/^\d{1,8}(\.\d{1,2})?$/`, mirroring the server's `PRICE_REGEX` integer-part cap. Docblock states the literal is deliberately DUPLICATED, never imported (backend runtime modules must not ride into the client bundle — the same posture as the `MAX_INTERVAL_DAYS` / `MAX_SESSION_COUNT` mirrors), and that the server check remains the authority. UI PlanCatalogContainer suite green at 7/0.

### Carried scope note (en/ar/types sessionCount copy)

The working tree also carries the completion of the R9 client-ceiling copy that the R9 commit omitted: `shared/locale/en/plans/index.ts` + `ar` + `types/plans/index.ts` — `validationSessionCountMessage` updated to the intervalDays range pattern ("whole number between 1 and 1000000" / "عددًا صحيحًا بين 1 و1000000") + types docblock naming the mirrored ceiling. HEAD had the `usePlanForm` mirror committed but the stale "positive integer" copy; this diff makes the two consistent again (parity test covers the en/ar/types triad).

## 2. F2 Resolution — Sidecar State (full detail)

**Lock audit (stale-lock check):** the repo's process-lock uses `LOCK_BASE_DIR = resolve(PROJECT_ROOT, ".quality-gate-lock")` (`scripts/lib/process-lock-helpers.ts:74`) with per-namespace `active.json` + `queue/`. Present namespaces: `biome, default, duplicates, lint, oxlint, test, tsgo` — **none contains an `active.json`** and every queue is empty → zero stale locks. No `migrate`/`db` lock namespace exists (the migrate path is not process-lock-wrapped). Nothing to clean.

**Discovery:** the killed run had already progressed F2 FURTHER than expected — the re-bundle AND the drizzle apply both completed before it died (folder timestamp 10:34:11; lock activity stops ~10:03; sidecar updated + PGlite migration recorded). On-disk evidence:
- `backend/drizzle/20260908103411_custom_4-student-payments-status-transition/migration.sql` (3,881 B, `-- Source: 4-student-payments-status-transition.sql` header, statement-breakpoint-wrapped) — **untracked**, awaiting orchestrator commit;
- sidecar updated: `manifestHash baa730ac… → c8b72d40…`, manifest entry for file 4 = `c5d41b4d…`, `appliedFolders` = [2-functions, 3-immutability-triggers, old 4-folder `20260907182426_custom_4-…`, new 4-folder `20260908103411_custom_4-…`] (incremental folders are kept by design).

**Hash proof (no manual reconciliation needed):**
- `sha256sum backend/db/migration/4-student-payments-status-transition.sql` = `c5d41b4d406064759e25edbd309c4186d9b5b077fd60feb1f6131fe6c823446c` — **equals** the sidecar's recorded `sha256`.
- Python recompute over ALL manifest entries: `2-functions.sql` MATCH · `3-immutability-triggers.sql` MATCH · `4-student-payments-status-transition.sql` MATCH.

**Migrate runs (PGlite provider):**
1. Run #1 (`bun --no-env-file run scripts/dbActions/cli-entry.ts --env-file=.env migrate`) → **✓ Success**, "No pending Drizzle migrations." — the delta folder is already recorded as applied (the killed run's apply landed); bundler consistent.
2. Run #2 (idempotency proof) → `Custom migrations: no new or changed custom SQL files detected.` + `No pending Drizzle migrations.` + `Ensure Idempotent Migrations: All migration files already idempotent` + **✓ Success**.

**Final state:** sidecar hash == file hash; manifestHash matches the current manifest; nothing pending; the committed state is self-consistent and the folder-churn path never triggered.

## 3. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ EXIT 0 / 0 errors (re-run after the gate fix below — clean) |
| `backend/services/billing/subscription-purchase.service.test.ts` | ✅ **20 pass / 1 skip (real-PG-gated concurrency) / 0 fail** (141 expect calls) — F1's +1 test; re-run ×2 (before + after the max-lines fold), stable |
| `backend/db/test/logic/billing/plan-catalog.service.test.ts` | ✅ **26 pass / 0 fail** (86 expect calls) |
| `backend/services/billing/subscription-activation.service.test.ts` | ✅ **16 pass / 1 skip / 0 fail** (150 expect calls) |
| `test/workflows/billing/subscription-purchase.journey.test.ts` | ✅ **11 pass / 0 fail** (107 expect calls) — REQUIRED gate |
| `app/api/payments/webhook/test/payments-webhook-route.test.ts` | ✅ **34 pass / 0 fail** (142 expect calls) |
| `backend/db/test/logic/billing/plan-catalog.repository.test.ts` | ✅ **16 pass / 0 fail** (91 expect calls) |
| `shared/locale/plans-namespace.parity.test.ts` | ✅ **4 pass / 0 fail** (266 expect calls) |
| `test/ui/components/admin/PlanCatalogContainer.test.tsx` (scoped: `test:ui:components` runner env + `.env.test.ci` + the four UI preloads, single file) | ✅ **7 pass / 0 fail** (60 expect calls) |
| Sub-loop `--lifecycle duplicates` | ✅ EXIT 0 on all **7** touched TS files: `route.ts`, `subscription-purchase.service.ts`, `subscription-purchase.service.test.ts`, `usePlanForm.ts`, `shared/locale/{ar,en,types}/plans/index.ts` (true exit codes captured per file) |
| Sub-loop `--lifecycle tsgo` (the .md convention) | ✅ EXIT 0 on `backend/services/AGENTS.md` |
| `bun run check:duplicates` | ✅ EXIT 0 / **0 clones** |
| `bun run biome:check` | ✅ EXIT 0 / 1456 files checked, "No fixes applied" — clean |
| Artifact grep (case-insensitive, over `git diff` + the new delta folder): `cpf_redacted`, `redacted`, `dev1-006`, `claude`, `anthropic`, `placeholder`, `lorem` | ✅ **0 hits everywhere** |

## 4. Gate Fix Performed by R10-verify (root fix, no suppressions)

The F1 edit pushed `subscription-purchase.service.ts` to **309** oxlint-counted lines (`max-lines: 300`, skipBlankLines+skipComments) — the file's sub-loop failed at the oxlint stage. Fixed at root per the R8 precedent: `subscriptionStatusOf`'s six 3-line `if { return; }` blocks folded to six single-line `if (…) return …;` statements — formatting-only, behavior-identical, count **309 → 297**, no `oxlint-disable` comments. Fallout re-verified: tsgo EXIT 0, purchase suite re-run 20/1skip/0, sub-loop `duplicates` EXIT 0, biome:check clean (formatter accepts the fold).

## 5. Notes & Carry-forward

- F2's new delta folder `backend/drizzle/20260908103411_custom_4-student-payments-status-transition/` is **untracked** and MUST ride the orchestrator's R10 commit (the sidecar references it; committing the sidecar without the folder would desync the tree even though the DB is applied).
- The pre-existing old folder `20260907182426_custom_4-student-payments-status-transition` stays (incremental-bundler design keeps applied folders; it remains in `appliedFolders`).
- Pre-existing carries unchanged (QG-4 lint-service heap, B-1 snapshot.json gate-sanctioned formatting commit, PRE-1 plan-catalog anonymous-leg 401/403 split, sub-loop markdown oxlint limitation).
- Scope: `git status` = 9 modified files + 1 untracked drizzle delta folder + this outcome + worklog. **NO COMMITS** (orchestrator owns commits).
