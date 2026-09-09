# Phase 0 Baseline — Task 0.1 (DEV2-021 Audit Trail Completeness Verification)

- **Task**: 0.1 — Record baseline (tsgo / biome / lint / git) + anchor probe (G-05..G-13) + deferred ledger confirmation
- **Date**: 2026-09-09
- **Executor**: Phase 0 Baseline Subagent
- **Repo**: /home/z/my-project (kottaby, Bun 1.3.14 monorepo)
- **Raw snapshots**: /tmp/baseline-tsgo.txt · /tmp/baseline-biome.txt · /tmp/baseline-lint.txt · /tmp/baseline-files.txt

---

## 1. Tool Baselines

### tsgo (`bun tsgo`)
- **Exit code: 0 — total error count: 0** (zero `error TS` lines in output).
- Example errors: none (baseline is clean).

### Biome (`bun biome:check`)
- **Exit code: 0 — errors: 0, warnings: 0.**
- Summary line: `Checked 1586 files in 12s. No fixes applied.`
- Note: the repo's `biome:check` script runs `biome check --write --unsafe .`; no fixes were applied at baseline, i.e. the tree is already format/lint-clean and the script will not mutate files on a clean tree.

### Lint (`bun lint` — scripts/lint-service.ts)
- **Exit code: 0 — no findings, no output.** Lint is clean.

**Baseline verdict**: green across tsgo / biome / lint. Any tsgo, biome, or lint finding appearing after implementation is attributable to the new code (see §6).

---

## 2. Git Baseline

| Item | Value |
|---|---|
| Current branch | **`main`** — ⚠️ task context expected `feat/dev2-021-audit-trail-completeness`; the working tree is on `main`. Branch was NOT switched (per constraints). Flagged for the orchestrator: either the feature branch has not been cut yet, or work is expected to continue on `main`. |
| `git stash list` | empty (0 stashes) |
| `git diff --name-only` | `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/tasks.md` |
| `git status --porcelain` | ` M ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/tasks.md` (the `- [-]` in-progress checkbox on task 0.1) |

Modified-file baseline matches expectation: **only plan-dir task checkbox edits**. No `.env` untracked entry appears (gitignored). No source files modified.

---

## 3. Deferred Ledger Confirmation (`deferred-items.md`)

| ID | Item | Status | Blocking? |
|---|---|---|---|
| D-001 | Subscription management audit producer (extend/renew/cancel/upgrade) | 📅 Forward (owner: DEV3-026 launch checklist review) | Non-blocking |
| D-002 | Financial adjustment producer (wallet credit/debit, withdrawal approve/reject — `Adjust` verb) | 📅 Forward | Non-blocking |
| D-003 | Admin password reset audit | 📅 Forward | Non-blocking |
| D-004 | Session governance extensions (reschedule, reassign, join-live) | 📅 Forward (DEV3-021 follow-on) | Non-blocking |

**Confirmed**: rows D-001..D-004 exist, all 📅 Forward. **No ❌ or ⚠️ rows present.** Ledger is pre-seeded correctly; verified at 2026-09-09.

---

## 4. Anchor Probe Table (G-05..G-13 census anchors, verified 2026-09-09)

Legend: ✅ = anchor verified (line may have drifted from citation; actual recorded). ❌ = missing.

| Anchor (specs.md citation) | Verified | Actual current line |
|---|---|---|
| `plan-catalog.service.ts:229` createPlan | ✅ | `export async function createPlan` at **229** (exact) |
| `plan-catalog.service.ts:229` `// DEV3-020 audit hook seam` (createPlan) | ✅ | seam comment at **247** |
| `plan-catalog.service.ts:264` updatePlan | ✅ | `updatePlan` at **264** (exact) |
| `plan-catalog.service.ts` seam (updatePlan) | ✅ | seam comment at **297** |
| `plan-catalog.service.ts:314` setPlanActiveStatus | ✅ | `setPlanActiveStatus` at **314** (exact) |
| `plan-catalog.service.ts` seam (setPlanActiveStatus) | ✅ | seam comment at **328** |
| `plan-catalog.mutation.ts` createPlan/updatePlan/setPlanActiveStatus resolvers, `authScopes: { role: [UserRole.Admin] }` | ✅ | mutationFields at **17 / 38 / 76**; `role: [UserRole.Admin]` at **22 / 43 / 81** |
| `session-lifecycle.service.ts:418` `resolveSessionDispute` | ✅ (drifted) | function at **529**; `adminId: number` param at **530**; `assertAdminGovernanceClean` at 555; `withTransaction(outerTx, …)` body at **557**. Line 418 today is an unrelated `withTransaction` return. |
| `session-lifecycle.mutation.ts` admin-gated `resolveSessionDispute` (`$all` + `role: [UserRole.Admin]`) | ✅ | mutationField at **255**; `$all` authScopes at **270–273**; service call at 281 |
| `backend/services/admin/audit.service.ts` `AuditService.createAuditLog` | ✅ | **82** |
| `admin-audit.contract.types.ts:22` `AuditLogWriteContract` | ✅ | real path is **`backend/types/contracts/admin-audit.contract.types.ts`** (dot form; the dash form `admin-audit.contract-types.ts` does NOT exist); interface at **22** (exact) |
| `user-management.service.ts:313` Create emission | ✅ (drifted) | `createAuditLog(buildAuditContract(actorId, AuditActionType.Create, …))` at **331–333** |
| `user-management.service.ts:374` Update emission | ✅ (drifted) | at **393** |
| `user-management.service.ts:438` Delete/Reactivate emission | ✅ (drifted) | at **456–457** |
| `user-management.helpers.ts:334-348` `buildAuditContract` | ✅ | function at **334** (exact); `entityType: AUDIT_ENTITY_TYPE` at 344 |
| `cold-start-certification.service.ts:204` Override, entityType `"teacher"` | ✅ | `createAuditLog` at 201, `AuditActionType.Override` at **204** (exact), `entityType: "teacher"` at 205 |
| `admin-broadcast.service.ts:397` Create, `"notification_broadcast"` | ✅ | `AuditActionType.Create` at **397** (exact); `createAuditLog` at 394; `AUDIT_ENTITY_TYPE = "notification_broadcast"` at 79 |
| `admin-gate.helpers.ts:29-39` `toAuditActionType` 7-case switch | ✅ (drifted) | function at **25**, switch cases **26–40** cover all 7 verbs (create/update/delete/override/adjust/suspend/reactivate), `default → null` at 41–42 |
| `audit-immutability.test.ts:150-220` corpus walk + regex scanners + ≥250 guard | ✅ | `listSourceFiles` walk ends ~130–156; `productionSources` at 159; Drizzle/raw-SQL scanners at 172–192; `toBeGreaterThanOrEqual(250)` guard at **198** |
| `test/workflows/admin/` dir + `audit-trail.journey.test.ts` (647 lines) | ✅ | dir exists with 6 journeys (`account-governance`, `admin-user-denials`, `admin-user-lifecycle`, `audit-trail`, `cold-start-certification`, `platform-analytics`); audit-trail journey is **647 lines** (exact) |
| Helper `rawActionType` | ✅ | **`test/workflows/admin/audit-trail.journey.test.ts:112`** (file-local helper) |
| Helper `withAuditDeleteTriggersSuspended` | ✅ | defined **`test/helpers/db-cleanup.ts:83`**; used by journeys incl. `audit-trail.journey.test.ts:52` (import) / `:193` (use) and `test/workflows/helpers/journey-cleanup.ts:77` |
| Helper `provisionAdminActor` | ✅ | defined **`test/workflows/helpers/actor-context.ts:136`**; `TrackedFixtures` support lives in **`test/workflows/helpers/tracked-fixtures.ts`** (barrel: `test/workflows/helpers/index.ts`) |
| `backend/graphql/mutation/` corpus dir (drift-test walk target) | ✅ | exists: `admin/`, `auth.mutation.ts`, `billing/`, `classes/`, `notifications/`, `parents/`, `plan-catalog.mutation.ts`, `user.mutation.ts`, `index.ts`, `AGENTS.md` |
| G-09 negative anchors (no admin subscription / financial-adjustment / password-reset / reschedule / reassign mutations) | ✅ | grep for `adminExtendSubscription|adminCancelSubscription|adminRenewSubscription|adminUpgradeSubscription|adminResetPassword|passwordReset|rescheduleSession|reassignSession|joinLive|adminAdjustWallet|approveWithdrawal|rejectWithdrawal` over `backend/graphql/mutation/**` → 0 matches; `billing/wallet.mutation.ts` has only student-facing `requestWithdrawal` (no admin scope) |

**Anchor probe verdict: 0 ❌.** All G-05..G-13 citations verified; line drift is minor (session-lifecycle 418→529, user-management 313/374/438→331/393/456, admin-gate 29-39→25-42) and does not change any plan disposition.

---

## 5. ⚠️ Drift Findings (tree moved since spec authoring 2026-09-05 — do NOT treat as plan blockers, but census must absorb)

1. **G-08 census count is stale (9 → 11 admin mutations).** A NEW file `backend/graphql/mutation/admin/admin-governance.mutation.ts` (commit `b01d21d` "feat(admin): DEV3-017 account governance (suspend/block windows) (#54)") adds `adminSetUserSuspended` (mutationField at :45) and `adminSetUserBlocked` (:75), both `role: [UserRole.Admin]`-gated. Current `role: [UserRole.Admin]` inventory over `backend/graphql/mutation/**`: admin-governance (2), admin-users (3), admin-teachers (1), admin-broadcast (1), plan-catalog (3), session-lifecycle (1) = **11 admin-gated fields**. The census (task 2.1) and drift-test corpus sanity (task 2.2, currently "≥9") must account for these two extra wired rows or the bijection will fail.
2. **G-10 claim "Suspend has no shipped producer" is stale.** DEV3-017 shipped suspend/reactivate emissions: `user-management.service.ts:566-570` (adminSetUserSuspended → `AuditActionType.Suspend`/`Reactivate`) and `:650-654` (adminSetUserBlocked → `Suspend`/`Reactivate`), entityType `"user"`. `Suspend` therefore HAS producers today (user governance); only `Adjust` remains without a shipped producer. REQ-042 accounting (task 5.1 census-driven assertions) should treat Suspend as covered-by-user-governance, not as plan-catalog-only.
3. **Branch state**: working tree is on `main`, not `feat/dev2-021-audit-trail-completeness` (see §2). No branch switch performed.

These findings are recorded, not fixed (constraint: no source modifications in Phase 0).

---

## 6. Pre-existing Issues to Ignore During Review

**None.** Baseline is fully clean:

| Check | Baseline count | Post-impl review rule |
|---|---|---|
| tsgo errors | 0 | Any `error TS` after implementation = introduced by this plan's changes → must be fixed, not waived |
| Biome errors/warnings | 0 / 0 (1586 files checked) | Any biome diagnostic after implementation = introduced by this plan → must be fixed |
| `bun lint` findings | 0 (exit 0, silent) | Any lint finding after implementation = introduced by this plan → must be fixed |

(There is no historical error inventory to filter — the pre-implementation tree compiles, lints, and format-checks clean. Task 7.2's `bun quality-gate` comparison against this baseline is therefore a strict "must stay at zero" gate.)

---

## 7. Snapshot Locations

- `/tmp/baseline-tsgo.txt` — full `bun tsgo` output (exit 0)
- `/tmp/baseline-biome.txt` — full `bun biome:check` output (exit 0, 1586 files, no fixes applied)
- `/tmp/baseline-lint.txt` — full `bun lint` output (exit 0)
- `/tmp/baseline-files.txt` — branch + stash list + `git diff --name-only` + `git status --porcelain`
