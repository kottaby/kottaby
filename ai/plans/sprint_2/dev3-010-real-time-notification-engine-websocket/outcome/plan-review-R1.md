# Plan Review Report — DEV3-010 Real-Time Notification Engine (WebSocket)

## Review Round: 1
## Date: 2026-08-29
## Subagents Dispatched: single gate executor (Task-0.3), full-read review of `specs.md` (381 ln), `plan.md` (628 ln), `tasks.md` (544 ln) + codebase feasibility spot-checks

---

## Summary

- **Total issues found:** 9 (advisories A1–A6 + observations O7–O9)
- **Blocking (BLOCKER):** 0
- **Advisory (executor-binding notes):** 6
- **Observations (no action needed):** 3

## VERDICT: **PASS — plan.md ↔ specs.md are consistent; the plan is executable. Phase 1 is GREEN-LIT.**

Gate rule applied: ZERO blockers ⇒ PASS. All advisories carry binding dispositions below and are surfaced to every executor via (a) this file (read mandatorily under the Non-Negotiable Execution Protocol §1) and (b) the EXECUTOR PATH NOTE prepended at the top of `tasks.md`.

---

## Findings by Dimension

| Dimension | Reviewer | Issues Found | Status |
|---|---|---|---|
| 1. REQ coverage (specs ↔ tasks) | gate executor | 0 blockers, 1 observation (implicit tags) | ✅ Verified |
| 2. Decision coverage (D1–D12 ↔ tasks) | gate executor | 0 | ✅ Verified (12/12) |
| 3. Scope creep | gate executor | 0 | ✅ Verified (clean) |
| 4. Internal consistency (zero-drift, 4 ops, close codes, no-store, journeys, contracts) | gate executor | 0 blockers, 2 advisories (A5, A6) + 1 observation (O7) | ✅ Verified |
| 5. Contract consistency (plan §2.2 ↔ task 1.1) | gate executor | 0 | ✅ Verified (7/7 types) |
| 6. Path discrepancy | gate executor | 1 advisory (A1) | ✅ Dispositioned (accepted administrative note) |
| 7. Feasibility (files/anchors exist) | gate executor | 3 advisories (A2, A3, A4) + 1 observation (O9) | ✅ Dispositioned |

---

## Detailed Findings

### A1 — [ADVISORY] Outcome/plan path discrepancy (accepted administrative note — NOT a blocker)

- **Location:** `specs.md` header + REQ-001/REQ-083 + closing line; `plan.md` header; `tasks.md` header + Execution Protocol §5 + Task 6.2 grep gate
- **Expected:** the actual plan directory
- **Actual:** docs reference `ai/plans/dev3-010realtime-notification-engine/` (and `…/outcome/`, `…/deferred-items.md`); the real directory is `ai/plans/sprint_2/dev3-010-real-time-notification-engine-websocket/` (confirmed by worklog 0.1 and by the existence of `deferred-items.md`, `outcome/phase0-baseline-outcome.md` there)
- **Disposition (binding):** all executors, outcome files, the ledger, and the REQ-083 final `grep -c "❌\|⚠️"` gate use the **sprint_2 path**. A EXECUTOR PATH NOTE was prepended at the top of `tasks.md` (after the header quote block — no restructuring of plan content).

### A2 — [ADVISORY] `backend/db/repo/notifications/` does NOT pre-exist ("extend additively" premise is stale)

- **Location:** `specs.md` REQ-004(c) ("pre-existing `NotificationRepository` namespace"); `plan.md` §4.2 ("EXISTING namespace, additive only"); `tasks.md` 0.2 ("Verify the existing … repository surface") and 2.4 ("Extend … additive methods only")
- **Expected (per docs):** an existing notifications repository namespace to catalogue and extend
- **Actual (codebase):** no `backend/db/repo/notifications/` directory, no `NotificationRepository` symbol anywhere under `backend/` (verified by grep). Sibling pattern exists: `backend/db/repo/{users,students,teachers,parents,admin}/<name>.repository.ts` + `index.ts`
- **Disposition (binding):** this is NOT a DEV1-001-owned structure (that clause protects the schema/table/pgEnum, which all exist and are verified green) — the repository layer is this ticket's own deliverable. **Task 0.2** records the observation (⚠️ ledger/outcome note) but does **NOT** block Phase 2. **Task 2.4** executes as **CREATE** of `backend/db/repo/notifications/notification.repository.ts` + `index.ts` following the sibling repo conventions; the "reuse-any-existing-method audit" resolves to "none exist — all seven listed methods are new"; every signature/convention in 2.4 and plan §4.2 stands unchanged. The REQ-048 zero-drift invariant is unaffected (repo layer ≠ `backend/db/schema/**`).

### A3 — [ADVISORY] `test/workflows/` partially exists (REQ-077's "layer does not exist" premise is stale for AGENTS.md)

- **Location:** `specs.md` REQ-077; `tasks.md` 2.1 ("Scaffold … layer does not exist", "Create `test/workflows/AGENTS.md`")
- **Expected (per docs):** the whole layer (rules file + helpers) to be scaffolded from zero
- **Actual (codebase):** `test/workflows/AGENTS.md` ALREADY EXISTS (57 lines, well-formed) and already codifies every mandated rule — no `runInRollback`, committed fixtures + tracked hard-delete cleanup, honest authorization (never monkey-patched), spied side effects (assert dispatch + targeted userIds), translated-substring assertions, `bun:test` + `@/` aliases, `entity-setup.ts`-built fixtures — plus additional compatible rules (per-run UUID prefixes, organization/barrel layout) and the exact canonical runner command. The helpers (`tracked-fixtures.ts`, `actor-context.ts`, `spied-transport.ts`) and `test/workflows/notifications/` do NOT exist.
- **Disposition (binding):** **Task 2.1** treats AGENTS.md as **verify-and-extend** (retain its existing rules — they satisfy and exceed REQ-077's mandated content; only reconcile if a mandated rule is absent) and **creates** the three helpers + the notifications subdirectory. Do not overwrite the existing rules file. The scaffolded helpers must honor the existing AGENTS.md extras (UUID prefixes, spy mechanism, `export *` barrel).

### A4 — [ADVISORY] i18n "`Translation` enum" vocabulary does not exist in the codebase

- **Location:** `specs.md` REQ-002/REQ-052/REQ-063 ("`useAppTranslation(Translation.<Namespace>)` with the `Translation` enum"); `plan.md` §2.4(b)/§5.4 component tree; `tasks.md` 1.4 consumers line + 4.3
- **Expected (per docs):** a `Translation` enum consumed as `Translation.Notifications`
- **Actual (codebase):** there is no `Translation` enum (grep: zero `Translation.<X>` usages). The real convention is an exported **namespace handle const** created via `defineNamespace` (`shared/locale/namespaces/<ns>/<ns>.namespace.ts`, e.g. `export const Dashboard = defineNamespace<DashboardLabels>("dashboard.dashboard", …)`) consumed as `useAppTranslation(Dashboard)`. Property access (`t.propertyName`) IS the real convention and stands.
- **Disposition (binding):** `plan.md` §2.4(b) and `tasks.md` 1.4 Step 4 already name the correct mechanism (`defineNamespace("notifications", …)` handle + full 5-step `shared/locale/AGENTS.md` procedure — procedure doc verified to exist). Executors export a `Notifications` handle (following `errors.namespace.ts`/`dashboard.namespace.ts` precedent) and consume `useAppTranslation(Notifications)`. **Do NOT create a `Translation` enum** (that would be scope creep and a conventions violation). The `Translation.<Namespace>` phrasing in specs/plan is shorthand for the namespace handle.

### A5 — [ADVISORY] Test-runner path inconsistency (plan/specs reference a non-existent script path)

- **Location:** `specs.md` REQ-071; `plan.md` §6.8 — both say `bun run scripts/run-test/run-test.ts <path>`
- **Actual:** `scripts/run-test/run-test.ts` does not exist; the real runner is `test/scripts/run-test.ts` (exists; also the runner named in `tasks.md` protocol §3 + tasks 2.2/2.3/2.4/2.7/5.1, in `test/workflows/AGENTS.md`, and in worklog 0-setup)
- **Disposition (binding):** the canonical DB/journey suite invocation is **`bun run test/scripts/run-test.ts <path>`** (tasks.md form). Treat plan/specs references to `scripts/run-test/…` as stale aliases of the same script. `bun run scripts/health/sub-loop.ts`, `bun run generate:gqlSchema`, `bun codegen`, `bun db seed` verified to exist in `package.json`.

### A6 — [ADVISORY] WS close-code vocabulary: plan/task 2.8 are a one-code superset of specs REQ-053

- **Location:** `specs.md` REQ-053 lists `4401/4429/4009/1001` (no `1013`); `plan.md` §1.3/§3.3/§6.6 and `tasks.md` 2.8 use `4401/4429/4009/1013/1001`
- **Analysis:** `1013` is the close code for the **global connection cap**, which IS spec'd (REQ-023(a)); specs simply never assigned it a code. Plan §3.3 documents it; task 2.8.SR pins the exact 5-code contract ("close-code vocabulary matches doc contract exactly (4401/4429/4009/1013/1001)").
- **Disposition:** accepted as a documented design refinement of a spec'd behavior (no new behavior ⇒ no scope creep). Task 7.1's canonical doc documents the full 5-code vocabulary. No doc change required.

### O7 — [OBSERVATION] Journey J2 step-table presentation: plan 9 steps vs tasks/specs 8 steps

- **Location:** `plan.md` §4.5 J2 table (steps 7–8 split same-key vs different-key replay) vs `tasks.md` 2.3 (step 7 merges both) vs `specs.md` §2.9 J2 (8 steps, also merged)
- **Analysis:** tasks 2.3 mirrors the SPECS journey (authoritative requirements source) exactly; content parity with plan §4.5 is complete (every assertion present, order preserved). J1 matches 9/9 steps 1:1 across all three docs.
- **Disposition:** none needed — no content gap.

### O8 — [OBSERVATION] Four REQs are covered implicitly (no explicit `_Requirements:` tag)

- **Location:** REQ-055 (no silent paths), REQ-071 (DB test discipline), REQ-072 (repo & service test tiers), REQ-075 (component test tier)
- **Analysis:** the Coverage Note itself maps these to "all backend `.SR`/`.SEC` subtasks" and "per-task `.TE`"; substance verified present: REQ-055 → 2.6.SR ("zero swallowed errors outside the documented degradation path") + 2.6.TE; REQ-071 → 2.4.TE verbatim (runInRollback, `tx` to every call, entity-setup fixtures, `expectRepoError`, runner); REQ-072 → 2.4.TE/2.6.TE/2.7.TE (idempotent doubles, foreign→NOT_FOUND, single-tx batch, forced-rollback ghost-push); REQ-075 → 4.3.TE (Happy DOM + translation-preload tier).
- **Disposition:** none needed — covered per the Coverage Note's declared convention.

### O9 — [OBSERVATION] Task 2.1 references `test/AGENTS.md`, which does not exist

- **Actual:** the operative rules live in `test/workflows/AGENTS.md` (subject of A3) and `test/integration/AGENTS.md` / `test/ui/AGENTS.md`. Trivial stale "applicable instructions" pointer; no execution impact.

---

## REQ Coverage Verification Summary

**Method:** extracted all 39 explicit `_Requirements: REQ-*` tags across `tasks.md` (33 task/subtask groups) and cross-checked the Coverage Note's 8 group mappings against actual tags; verified the mandated 15-REQ sample across all ranges.

**Sample verification (15/15 confirmed at claimed locations):**

| REQ | Claimed task(s) | Verified at |
|---|---|---|
| REQ-001 | 0.1/0.3/5.4/6.2/7.4 | 0.1 ✓ |
| REQ-013 | 2.5/2.6 (+J1/J2) | 2.6 ✓ |
| REQ-022 | 2.5/2.8/4.2/5.2 | 2.8 ✓ |
| REQ-030 | 2.4/2.7/3.2/3.3/5.1 | 2.7, 3.3, 5.1 ✓ |
| REQ-042 | 2.5/2.6 | 2.6 ✓ |
| REQ-048 | 1.5/2.M/5.4 | 2.M, 5.4, 6.2 ✓ |
| REQ-052 | 1.3/1.4 | 1.4 ✓ |
| REQ-060 | 3.1–3.4/4.1 | 3.1, 3.2, 3.3, 3.4 ✓ |
| REQ-063 | 4.2/4.3/4.4 | 4.2, 4.3, 4.4 ✓ |
| REQ-067 | 4.2/4.3/4.4 | 4.2, 4.4 ✓ |
| REQ-070 | per-task .TE + 5.1–5.4 | 2.M, 5.4 ✓ |
| REQ-077 | 2.1/2.2/2.3 | 2.1, 2.2, 2.3 ✓ |
| REQ-080 | 7 | 7.1 ✓ |
| REQ-082 | 7 | 7.3 ✓ |
| REQ-083 | 0.1/0.3/5.4/6.2/7.4 | 0.3, 6.2, 7.4 ✓ |

**Full-group sweep:** every defined REQ group maps to ≥1 task — REQ-001–004 (0.1/0.2/1.1/1.2), REQ-010–029 (2.4–2.8, 4.2, 4.3, 5.1–5.3), REQ-030–039 (2.6–2.8, 3.2–3.4, 5.1, 6.1), REQ-040–049 (1.5, 2.4–2.6, 2.M, 5.3, 5.4), REQ-050–056 (1.3, 1.4, 2.7, 5.1, 5.4), REQ-060–069 (3.1–3.4, 4.1–4.4), REQ-070–079 (per-task .TE, 2.M, 5.1–5.4), REQ-080–083 (0.3, 6.2, 7.1–7.4), REQ-J1–J5 (2.1–2.3). REQ numbering is non-contiguous by design (005–009, 057–059 do not exist in specs). **Coverage: COMPLETE** (4 REQs implicit — see O8).

## Decision Coverage Summary (D1–D12 → tasks)

| Decision | Reflected in task(s) |
|---|---|
| D1 — Bun-native WS sidecar process | 2.8 (+0.2.IV, 2.8.IV topology ruling; plan §1.1) |
| D2 — Persist-first, push-second; durable inbox truth | 2.6 (REQ-011), 5.2 (degradation) |
| D3 — Publish-after-commit + receipt pattern | 2.6 (`publishReceipts`, forced-outer-tx-rollback test), 7.1 |
| D4 — Transport port + Redis/in-process adapters | 2.5 |
| D5 — Fail-open emit idempotency | 2.6 (cache-outage fail-open + warn), 7.1, 7.2 |
| D6 — Self-scope by construction (ctx.user.id only) | 2.7, 3.2, 3.3, 5.1 |
| D7 — Offset pagination + totalCount/hasMore, cap 50 | 2.4, 2.7 |
| D8 — No DataLoader / no subscriptions / no SSE | structural: 2.4 (flat single-SELECT reads), 3.4 (REQ-069 flat/capped posture documented) |
| D9 — Bounded module state only in sidecar | 2.8 (cap constants + bounds assertions), 2.5 (no module state in adapters) |
| D10 — Engine never translates; emitters own copy | 2.6 (verbatim storage), 7.1 |
| D11 — Apollo cache + refetch truth; WS merges only | 4.2, 4.3 |
| D12 — `test/workflows/` journey layer scaffold | 2.1, 2.2, 2.3 (+7.3 verification) |

**Decision coverage: 12/12.**

## Internal Consistency & Scope Checks (all verified)

- **Schema zero-drift (REQ-048):** no task modifies `backend/db/schema/**` or `backend/db/migration/**` — every schema reference is verify-only (0.2, 1.2 parity test) or an empty-`git diff` assertion (Phase-1 invariant banner, 2.M, 5.4, 6.2). `db push` never run; no new enums (guard only, inside `backend/enum/**`, spec'd by plan §2.3/REQ-014).
- **Exactly 4 GraphQL ops:** 3.2 defines `myNotifications` + `myUnreadNotificationCount`; 3.3 defines `markNotificationRead` + `markAllNotificationsRead`; 3.4 structurally asserts all four present + zero notification-CUD ops; public-operation allowlist byte-unchanged. plan §3.1 SDL ≡ specs REQ-060 SDL (field-by-field).
- **WS close codes:** plan §3.3/§6.6 `4401/4429/4009/1013/1001` ≡ task 2.8 vocabulary incl. 2.8.SR pin (see A6 for the specs-REQ-053 superset note).
- **No new Zustand store (REQ-063):** Phase 4 header bans it; 4.2 mandates "Local React state/refs ONLY (no stores, no persist)"; 4.1/4.3/4.4 create documents/views/nav only. Zero `createStore`/store-creation work anywhere.
- **Journey tables:** J1 = 9/9 steps 1:1 (plan §4.5 ↔ tasks 2.2 ↔ specs §2.9); J2 content parity complete (see O7).
- **Contract types:** plan §2.2 NEW types ≡ task 1.1 list, exactly 7: `NotificationReturnType`, `NotificationEmitInput`, `NotificationEmitBatchInput`, `NotificationDeliveryReceipt`, `NotificationListFilterInput`, `NotificationListPageReturnType`, `RealtimeNotificationPayload`.
- **No scope creep:** no new tables/columns/enums/indexes; no admin broadcast surface (emit primitives server-internal only, REQ-027; BFLA scans wired in 3.2/3.4/6.1); every new surface (WS sidecar, transports, env keys, i18n namespaces, `test/workflows` scaffolding, canonical doc, `bun run ws` script) is spec-mandated.

## Feasibility Spot-Check (codebase anchors)

Mandated 5/5 EXIST: `backend/db/schema/notifications/notifications.ts` ✓ · `backend/enum/notifications/notification-type.enum.ts` ✓ · `backend/types/contracts/session-notification.contract.types.ts` ✓ · `backend/lib/gateway/public-operations.ts` ✓ · `backend/db/test/entity-setup.ts` ✓ (with all five `createTest{User,Student,Parent,Applicant,Admin}` helpers).

Additional anchors verified: `notificationType` pgEnum ↔ `NotificationType` TS mirror — both exactly the 7 sanctioned values ✓; `NotificationSelectType`/`NotificationInsertType` present in `backend/types/notifications/notification.types.ts` ✓; `SessionEventNotificationContract/Type/EntityRef` exported ✓; `verifyAccessToken` (`backend/lib/auth/jwt.ts`) ✓; `authScopes`/`authenticated` ✓; `gqlSchemaBuilder` + `backend/graphql/pothos/shared/enum.pothos.ts` ✓; `withPageAuth`, `PermissionDeniedFallback`, `NOTIFICATION_COUNT_POLL_INTERVAL_MS`, `mapGraphQLErrorByCode` ✓; `setupTestServerLifecycle`/`testClient`/`expectRepoError`/`runInRollback`/`queryDb`/`withTransaction`/`isApplicantStatus` ✓; `logger.logDomainError` ✓; `getServerTranslations`/`useAppTranslation`/`defineNamespace` ✓; `scripts/health/sub-loop.ts`, `scripts/lint-service.ts`, `generate:gqlSchema`, `codegen`, `db seed` ✓; all referenced canonical docs exist (`docs/IDEMPOTENCY.md`, `docs/DATABASE_MIGRATIONS.md`, `docs/specs/*`, `docs/workflows/02/03/04-*`, `docs/graphql/*`, `docs/auth/*`, `docs/backend/cross-stream-contracts.md`, `docs/drizzle/prepared-statements.md`, `docs/testing/workflow-journey-tests.md`) ✓; `deferred-items.md` pre-seeded D1–D4 non-blocking ✓. Deviations found and dispositioned: A2 (notifications repo absent — CREATE at 2.4), A3 (`test/workflows/AGENTS.md` pre-exists — verify-and-extend at 2.1), A4 (Translation enum absent — use namespace handle), A5 (runner path), O9 (`test/AGENTS.md` absent). Nothing in the plan is unimplementable.

---

## Fix Subagents Dispatched

None required (0 blockers). One trivial administrative fix applied directly by the gate executor: **EXECUTOR PATH NOTE prepended to the top of `tasks.md`** (after the header quote block) covering A1 + pointers to A2–A5 dispositions. No plan content was restructured; no `tasks.md` checkboxes were flipped (orchestrator owns checkbox state).

## Post-Fix Verification

- [x] REQ traceability complete (sample 15/15 + full-group sweep)
- [x] D1–D12 decision traceability complete (12/12)
- [x] Path discrepancy dispositioned and surfaced to executors (tasks.md note + this report)
- [x] Feasibility anchors verified against the codebase (5/5 mandated + ~25 additional)
- [x] No blockers outstanding

## Lessons for Future Plans

- Plan docs authored against a template lineage can carry vocabulary that drifts from the repo's actual machinery (e.g., `Translation` enum vs `defineNamespace` handles; `scripts/run-test/` vs `test/scripts/run-test.ts`) — the plan-review gate should always grep the codebase for every named mechanism, not just file paths.
- "Verify-and-extend" dependency guards should distinguish **DEV1-001-owned structures** (missing ⇒ ❌ + block) from **this-ticket deliverables assumed pre-existing** (missing ⇒ create per sibling conventions) — otherwise a literal reading can stall Phase 2.
- Journey step tables should keep one canonical step numbering (specs) when mirrored into plan/tasks to avoid 9-vs-8 presentational drift.

## Traceability

**Plan files modified:**
- `tasks.md` — EXECUTOR PATH NOTE prepended after the header quote block (administrative only; A1–A5 dispositions surfaced to executors)
- `specs.md`, `plan.md` — unchanged (no restructuring permitted/needed; dispositions recorded here)

**Outcome knowledge base updated:**
- This report saved as: `ai/plans/sprint_2/dev3-010-real-time-notification-engine-websocket/outcome/plan-review-R1.md`

## Next Steps

- [x] **GREEN-LIGHT Phase 1** (Tasks 1.1–1.5: canonical types, enum guard + parity test, errors namespace, notifications UI namespace, env-config registry) — executable immediately, honoring advisories A1–A5
- [ ] Task 0.2 (dependency-guard audit) executes with the A2/A3 dispositions
- [ ] Orchestrator flips the 0.3 checkbox after accepting this report

---

**End of Plan Review R1 — VERDICT: PASS. Implementation may begin.**
