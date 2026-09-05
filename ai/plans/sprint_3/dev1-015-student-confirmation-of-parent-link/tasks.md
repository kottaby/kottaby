# `tasks.md` — DEV1-015: Student Confirmation of Parent Link

**Plan directory (verbatim):** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link`
**Specs:** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/specs.md`
**Plan:** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/plan.md`
**Deferred-items ledger:** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/deferred-items.md`
**Outcome directory:** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/`

> **Nature of this ticket:** This is a **closure + discoverability slice** on the already-verified DEV1-014 substrate. It ships **zero new GraphQL root fields, zero schema/migration drift, zero new service write paths, zero new notification types**. Its delta is: (1) the NEW dashboard discoverability card, (2) notification→decision-route deep-link convergence (verify-and-close), (3) nav retargeting (verify-and-fix), (4) a test-first cross-actor journey + regression cells. **Re-implementation of shipped DEV1-014 surfaces is FORBIDDEN.**

---

## Document Information

- **Feature Name**: DEV1-015 — Student Confirmation of Parent Link
- **Target Directory**: `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/`
- **Requirements**: `specs.md` · **Design**: `plan.md` · **Ledger**: `deferred-items.md` · **Outcomes**: `outcome/`
- **Version**: 1.0 · **Date**: 2026-09-05
- **Status**: Ready for execution (Phase 1.5 plan-review gate PASSED via verification sweep; see outcome/)

### Numbering & Traceability Conventions
- Task IDs `X.Y` map to phases; subtask pipelines use suffixes `.QL .TE .SEC .SR .IV` (backend) and `.QL .TE .BF .BS .SR .IV` (frontend).
- Every task declares `_Requirements: REQ-…_` so the specs traceability matrix resolves bidirectionally.
- Outcome files are named `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/<task-id>-outcome.md`.


## Non-Negotiable Execution Protocol

1. **Pre-Execution outcome knowledge read:** Before starting ANY task, read the outcome files of every task it depends on under `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/` (esp. `0.1-outcome.md` and `0.2-outcome.md`). If a dependency outcome is missing or marked ❌/⚠️, STOP and resolve it first.
2. **Post-Edit verification:** After editing any file, run `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` and require exit code 0 before proceeding.
3. **Test files:** Execute via `bun run test/scripts/run-test.ts <test-path>` ONLY — never raw `bun test` (it skips `--env-file=.env.test`).
4. **Semantic review checklist self-review:** Every task's `.SR` subtask requires an explicit self-review pass against the semantic checklist (atomicity, env-config, zero dead code, no cross-layer imports, enums as value imports, no `console.*`).
5. **Outcome documentation:** Every task writes `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/<task-id>-outcome.md` recording: what was verified/changed, evidence (exit codes, test counts, diffs), deviations, and any ledger entries added.
6. **Checkbox tracking:** Mark `[ ]` → `[x]` only after the task's own verification evidence exists in its outcome file.
7. **Verification-first rule:** Any claim that a symbol/file/helper "exists" must be anchored to bundled code (path + symbol). Docs/AGENTS.md prose is NOT existence proof. Items found absent are CREATE tasks, not UPDATE — and must be recorded in the deferred-items ledger if they contradict specs/plan assumptions.
8. **Ledger discipline:** Every unexpected discovery, deviation, or deferred scope item is appended to `deferred-items.md` immediately. Final gate (Phase 6): zero open ❌/⚠️ entries.

---

## Phase 0: Pre-Implementation Baseline

### 0.1 Record Error Baseline & Initialize Deferred-Items Ledger

- [ ] 0.1 Record the pre-implementation error baseline and initialize the ledger
  - Run `bun x tsgo --noEmit` (or the repo's typecheck script), `bun run biome:check`, and the lint-service check; record exact error/warning counts per tool in `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/0.1-outcome.md`.
  - Create `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md` (empty body, headers intact).
  - Verify the `outcome/` directory exists; create it if not.
  - _Requirements: REQ-001_

### 0.2 Verification-First Substrate Inventory (MANDATORY GATE)

- [ ] 0.2 Verify the complete DEV1-014 substrate against bundled code and produce the Reuse/Create classification table
  - Verify by locating (path + exported symbol) — NOT by docs prose:
    1. `ParentLinkRequestService.respondToLinkRequest` and `listMyIncoming` in `backend/services/parents/parent-link-request.service.ts`
    2. `classifyUnclaimableRequest`, `raiseUnclaimableDenial`, `requireActor` in `backend/services/parents/parent-link-request.helpers.ts` — record the EXACT typed-denial vocabulary (codes + error classes + constructor shapes) found; this freezes REQ-041
    3. `respondToPendingForStudent`, `expireSiblingPendingsForStudent`, `markExpiredIfPending`, `listIncomingForStudent`, `findIncomingRowById` in `backend/db/repo/parents/parent-link-request.repository.ts`
    4. `StudentRepository.linkParentIfUnlinked` in `backend/db/repo/students/student.repository.ts` (confirm the fused `parent_id IS NULL` guard predicate)
    5. `respondToParentLinkRequest` mutation (`backend/graphql/mutation/parents/parent-link.mutation.ts`) and `myIncomingParentLinkRequests` query (`backend/graphql/query/parents/parent-link.query.ts`) — record exact field signatures, argument list, and the `authScopes` conjunction shape
    6. `IncomingParentLinkRequestPothosObject` / `OutgoingParentLinkRequestPothosObject` in `backend/graphql/pothos/parents/parent-link-request.pothos.ts` (confirm `DateTime` scalar usage, `id` first)
    7. Canonical types in `backend/types/parents/parent-link-request.types.ts` and `backend/types/students/student.types.ts`
    8. Frontend documents `myIncomingParentLinkRequestsQueryDocument`, `respondToParentLinkRequestMutationDocument` in `frontend/graphql/sharedDocuments/parents/parent-link.documents.ts` (confirm `TypedDocumentNode`, `id` selected first)
    9. Helpers `isLinkRequestActionable`, `displayLinkRequestStatus`, `parentLinkStatusChipSpec` in `frontend/lib/parent-link-request-status.ts`; `resolveParentLinkDenialCopy` in `frontend/lib/parent-link-denials.ts`
    10. Student link-requests view under `frontend/views/students/link-requests/**` and its live route under `app/` (locate via `rg "myIncomingParentLinkRequests" app/ frontend/views/students/`) — record the EXACT route path string; this becomes the shared route constant for the card CTA, nav entry, and notification deep-link
    11. The student link-requests nav entry in `frontend/views/dashboard/nav/navItems.ts` (the file importing `LinkOutlined as LinkChildIcon`) — record whether its `route` targets the real student route or the `[feature]` catch-all ComingSoon page → this decides whether task 4.4 is RETARGET or NO-OP
    12. Notification drawer deep-link resolution in `frontend/components/ui/NotificationDrawerBody.tsx` / `useNotificationDrawerActions.ts` (`handleOpenNotification`) — record whether a `relatedEntityType === "parent_link_request"` branch exists and where it routes → decides whether task 4.1 is PIN-ONLY or CLOSE-GAP
    13. The DEV1-014 journey `test/workflows/parents/parent-link-request.journey.test.ts`, the cast helpers under `test/workflows/helpers/` (including the `SpiedFanoutTransport` seam), and `test/workflows/AGENTS.md`
    14. Existing suites to extend (not rewrite): `backend/services/parents/parent-link-request.service.test.ts`, `parent-link-request.chaos.test.ts`, `parent-link-request.static-locks.test.ts` (same parents dir), `backend/graphql/test/parent-link.wire.test.ts`, `frontend/graphql/sharedDocuments/parents/parent-link.documents.test.ts`, `frontend/views/dashboard/nav/navItems.test.ts`
    15. The `parentLink` i18n namespace handle and label surface (`shared/locale/types/parentLink*` + en/ar sources) — record which card-copy keys already exist vs which must be added
  - For each item: classify **REUSE / UPDATE / CREATE** with the anchor evidence. Any item absent that specs/plan assumed present → CREATE task + ledger entry. Any item where specs/plan diverges from code reality → ledger entry + proceed against CODE truth.
  - _Requirements: REQ-002, REQ-003, REQ-004, REQ-041, REQ-050_
  - **Verify:** outcome file `0.2-outcome.md` contains the full classification table with code anchors; zero unverified "exists" claims.

---

## Phase 1: Types, Enums & i18n Labels (NO Database Schema Work)

> **Scope gate (invariant #3-style):** This ticket adds NO columns, NO tables, NO enums, NO migrations. `bun run db push` is a no-op confirmation only; `git diff -- backend/db/schema/** backend/db/migration/**` MUST be empty at Phase 6. Phase 1 covers ONLY the canonical-type verification and the compile-time i18n label additions required by the new dashboard card.

- [ ] 1.1 Pin canonical types (zero additions) and extend the `parentLink` i18n namespace for dashboard-card copy
  - Confirm (no edits expected): `ParentLinkRequestSelectType`, `IncomingParentLinkRequestReturnType`, `OutgoingParentLinkRequestReturnType` in `backend/types/parents/parent-link-request.types.ts`; `DBTransaction` / `DBQueryExecutor` from `@/backend/types`. Any type gap discovered is a STOP + ledger entry (never a local type).
  - Extend the existing `parentLink` namespace (DO NOT create a new namespace): add dashboard-card keys under the namespace's type surface (`shared/locale/types/parentLink*` per the shape recorded in 0.2) — title, count/plural-safe label(s), "latest requester" line, CTA label, loading/error/retry copy — in BOTH `en` and `ar` sources.
  - Follow the namespace registration checklist in `shared/AGENTS.md` exactly (types → en → ar → export wiring). The namespace handle const (e.g. `ParentLink`) MUST already exist; only label members are added.
  - Run the locale parity suite (en/ar key parity `tsc` + tests) until green.
  - Enum discipline: all enum usages in this ticket (`LinkStatus`, `UserRole`, `NotificationType`) are VALUE imports with enum members — no string literals anywhere.
  - _Requirements: REQ-003, REQ-004, REQ-042, REQ-015 (copy contract)_
  - [ ] 1.1.QL **Quality Loop:** `bun run scripts/health/sub-loop.ts <each edited locale file> --lifecycle duplicates` — exit code 0 for every edited file.
  - [ ] 1.1.TE **Test Engineering:** Locale parity suite green (en/ar bijective keys); a key-access compile check proves every new label resolves through the `Translations` tree (no orphan keys). Tier 1/2: parity of added keys only; Tier 3/4: N/A (pure data).
  - [ ] 1.1.SEC **Security & Tenancy Audit:** No user data embedded in labels; placeholders use ICU args (no template concatenation of names beside localized chrome without `isolateBidi`); no disclosure-bearing copy (card shows parent FULL name — sanctioned; verify copy phrases never leak student identifiers to parents).
  - [ ] 1.1.SR **Semantic Review:** No duplicate keys anywhere in the tree; flat `ErrorsLabels`-style conventions respected; no `next-intl` imports; zero dead keys.
  - [ ] 1.1.IV **Instruction Verification:** Validate against `shared/AGENTS.md` namespace checklist (only instruction corpus applicable here; the ONLY instruction files in repo are `.agents/instructions/{frontend,backend,tests}.instructions.md`).
  - Outcome: `1.1-outcome.md`.

---

## Phase 2: Repositories & Backend Services (Verification + Regression Pinning)

> **Scope gate:** NO backend logic delta is planned. Every symbol in this phase is REUSE. New code in this phase is **tests only** (journey + missing regression cells). If verification forces ANY service/repo edit, it is a deviation → ledger entry + explicit justification.

- [ ] 2.1 **Write the "Student Confirmation of Parent Link" journey test — TEST-FIRST**
  - Create `test/workflows/parents/student-confirmation-of-link.journey.test.ts` — one file for the cross-actor confirmation/rejection workflow (specs §2.9 steps 1–9, J-REQ-01..05).
  - `test/workflows/` already exists (verified in 0.2) — provisioning/cast helpers, `SpiedFanoutTransport`, and `test/workflows/AGENTS.md` are REUSED, not rescaffolded. If 0.2 found any helper missing, scaffold JUST that helper per Architectural Invariant 10 and ledger the gap.
  - Provision the actor cast via the parents-domain cast helper in `test/workflows/helpers/` with REAL permission-group membership rows (NEVER monkey-patch permission resolution): UUID-prefixed fixtures — ≥2 parents, ≥1 unlinked student, 1 already-linked student, 1 governed (suspended) student.
  - Steps as sequential service calls with `actorUserId`:
    1. Parent A creates link request (DEV1-014 `requestLink` surface via service) → assert: `parent_link_requests(pending)` row + exactly ONE `notifications` row (type `parent_link_request`, `relatedEntityType="parent_link_request"`, `relatedEntityId=requestId`) + spied fanout receipt addressed to the student.
    2. Student lists incoming via `listMyIncoming` → assert parent's FULL name present, expiry present (J-REQ-01 service-side truth feeding the dashboard card).
    3. DENIAL: teacher/admin/foreign-student actor calls `respondToLinkRequest` / `listMyIncoming` → honest permission failure (FORBIDDEN class); assert zero rows changed and zero notification rows (J-REQ-04).
    4. DENIAL: student submits foreign/nonexistent `requestId` → constant NOT_FOUND shape, byte-identical across foreign vs absent; zero writes.
    5. DENIAL: governed (suspended) student calls respond → constant `ForbiddenError` copy via `requireActor`; zero side effects (REQ-022).
    6. REJECT leg: student rejects → row `rejected` + `respondedAt`; `students.parent_id` unchanged (assert NULL); sibling pendings untouched; exactly ONE rejection notification to the parent (parent's persisted locale); fanout spied post-commit (J-REQ-03).
    7. CONFIRM leg (fresh pending) → row `confirmed`; `students.parent_id = parentId`; ALL sibling pendings → `expired`; exactly ONE acceptance notification to the parent; INV-P1 probes: parent_id NULL pre-confirm, unchanged post-reject (J-REQ-02 + REQ-065).
    8. Parent-side visibility pin: parent's outgoing row surfaces terminal status while student name stays masked (`maskFullName` contract, R9).
    9. RACE: two distinct parents' committed pendings confirmed concurrently via `Promise.allSettled` on two `respondToLinkRequest` calls (distinct connections/rows) → exactly ONE winner link; loser collapses to already-resolved typed conflict; loser emits ZERO notifications/publishes; exactly one terminal state per row; preserve the `isPgliteProvider` wholesale-skip guard for true-race cells (J-REQ-05, REQ-032).
    10. BOUNDARY: respond with `expiresAt <= now` injected at the boundary instant → deterministic expiry-class denial; render mapping parity asserted via `displayLinkRequestStatus`/`toCanonicalLinkStatus` (REQ-014).
    11. NOTIFICATION deep-link data contract: the persisted notification row carries `relatedEntityType/relatedEntityId` sufficient for the drawer route resolution pinned in task 4.1 (J-REQ-01 half).
  - Committed fixtures in `beforeAll` + tracked hard-delete in `afterAll` (FK-safe order: notifications → parent_link_requests → students → parents → users) — NEVER `runInRollback` (services spawn their own transactions).
  - Spy notification dispatch/fanout via the existing `SpiedFanoutTransport` seam; NEVER hit real email/SMS/push channels.
  - **Run the journey now — it MUST pass against the existing services** (this proves REQ-017/REQ-030..035 closure; a failure here is a DEV1-014 defect → STOP, ledger entry, fix-forward decision).
  - Verify: `bun run test/scripts/run-test.ts test/workflows` green (never raw `bun test` — it skips `--env-file=.env.test`).
  - _Requirements: REQ-062 (J-REQ-01..J-REQ-05), REQ-012, REQ-013, REQ-014, REQ-017, REQ-020, REQ-021, REQ-022, REQ-030–035, REQ-065_

- [ ] 2.2 Audit existing service/repo suites against acceptance criteria; add ONLY genuinely missing regression cells
  - Diff `backend/services/parents/parent-link-request.service.test.ts` and `parent-link-request.chaos.test.ts` coverage against specs §2 acceptance criteria and produce the cell-by-cell coverage table in the outcome.
  - Add ONLY missing cells (expected candidates; each must be justified by the diff audit — no duplicates of DEV1-014 cells):
    - Publish-after-commit spy assertion: a forced mid-transaction failure yields ZERO `publishReceipts` calls and ZERO notification rows (REQ-034), if not already pinned.
    - Double-respond idempotency: second respond on a resolved request → already-resolved conflict; exactly ONE parent notification total (REQ-013 idempotency), if not already pinned.
    - Log-hygiene assertion: denial paths emit at most ONE bounded `logDomainError` with `{ code, entity: "parent_link_requests", entityId, locale }` and NEVER handshake codes or party names; happy paths log NOTHING (REQ-024).
    - Governance pre-tx ordering: `requireActor` fires BEFORE any transaction opens (assert via repo-spy zero invocations on governed actor) — REQ-022/Dev1-014 D9a.
  - All service/repo assertions use `runInRollback` + explicit `tx` propagation + `expectRepoError`-style try/catch (NEVER `expect().rejects.toThrow()` inside a rollback tx).
  - Do NOT modify `respondToLinkRequest`, `listMyIncoming`, helpers, or repositories — REUSE verbatim (plan D1). Any discovered need to edit = STOP + ledger.
  - _Requirements: REQ-060, REQ-061, REQ-024, REQ-025, REQ-022, REQ-031, REQ-033, REQ-034, REQ-035_
  - [ ] 2.2.QL **Quality Loop:** `bun run scripts/health/sub-loop.ts backend/services/parents/parent-link-request.service.test.ts --lifecycle duplicates` (and the chaos file if touched) — exit code 0.
  - [ ] 2.2.TE **Test Engineering:** 4-Tier check on added cells — Tier 1 branch/stmt coverage of the exercised service branches; Tier 2 boundary (expiry instant, zero-row classification); Tier 3 chaos (rollback fanout-zero, double-respond); Tier 4 security (gated/governed denial ordering). `runInRollback` + `tx` propagation verified by inspection; notification engine mocked via the established adapter seam.
  - [ ] 2.2.SEC **Security & Tenancy Audit:** New assertions prove: BOLA identity derives from `actorUserId` only; BOPLA field-by-field writes (verify no new `{ ...input }` spread introduced anywhere); BFLA service-side role check present; constant-denial no-oracle shape.
  - [ ] 2.2.SR **Semantic Review:** Atomicity (single `withTransaction` unit asserted), env-config (no hardcoded URLs/secrets), zero dead test code, no cross-layer imports in tests (tests import services + `@/backend/enum/*` value enums), enums as value imports.
  - [ ] 2.2.IV **Instruction Verification:** Validate against `.agents/instructions/backend.instructions.md` + `.agents/instructions/tests.instructions.md` + `backend/services/parents/AGENTS.md` (if present per 0.2) + `backend/db/repo/parents/AGENTS.md` (if present per 0.2).
  - Outcome: `2.2-outcome.md`.

### Phase 2.M — Mid-Point Review Gate

- [ ] 2.M Mid-point review gate (BLOCKS Phase 3+)
  - Re-run: `bun run test/scripts/run-test.ts backend/services/parents` and `bun run test/scripts/run-test.ts test/workflows` — all green.
  - `bun x tsgo --noEmit` error count ≤ 0.1 baseline (any NEW error = fix now or ledger with justification).
  - Confirm zero production-code edits in `backend/services/**` and `backend/db/repo/**` so far (`git diff --stat`); any diff → ledger + explicit approval trail in outcome.
  - Confirm `deferred-items.md` is up to date with every discovery from 0.2 → 2.2.
  - Outcome: `2.M-outcome.md` containing the gate checklist evidence; Phase 3 MUST NOT start without a green gate.

---

## Phase 3: GraphQL Resolvers & API Surface (Verification + Missing Wire Cells)

> **Scope gate:** ZERO new root fields. `respondToParentLinkRequest` and `myIncomingParentLinkRequests` are verified-and-pinned, not modified. Any Pothos edit forces a same-change update of `backend/graphql/test/schema-surface.test.ts` + a ledger entry.

- [ ] 3.1 Pin the wire surface and add ONLY the genuinely missing decision-leg wire cells
  - Verify against bundled code (anchors from 0.2): exact signatures `myIncomingParentLinkRequests: [IncomingParentLinkRequest!]!` and `respondToParentLinkRequest(requestId: ID!, accept: Boolean!): IncomingParentLinkRequest!`; `authScopes: { $all: { authenticated: true, role: [UserRole.Student] } }` on BOTH fields (plain-map ANY-semantics is FORBIDDEN); `id` exposed first; `DateTime` scalar (no `toISOString()` into `String`); closed input shape `{ requestId, accept }`.
  - Extend `backend/graphql/test/parent-link.wire.test.ts` with ONLY missing decision-leg cells (per REQ-063; each cell justified by diffing existing wire matrix):
    - Expired-claim denial over the wire: respond past `expiresAt` → typed expiry-class denial with correct `extensions.code` and identical envelope key-set as sibling denials (no per-class disclosure).
    - Anonymous → `UNAUTHORIZED` and non-student roles → `FORBIDDEN` at pre-resolver on the MUTATION (if the existing matrix pins these only on the query).
    - Input-shape rejections: non-ID / smuggled extra arg → `GRAPHQL_VALIDATION_FAILED` pre-resolver (REQ-023/REQ-040), if not already present.
  - `bun run generate:gqlSchema && bun codegen` → diff MUST show zero unrelated drift; `backend/graphql/test/schema-surface.test.ts` baseline byte-identical.
  - Denial code inventory emitted by these cells MUST be ⊆ the REQ-041 taxonomy frozen in 0.2; any new `extensions.code` → register per `docs/graphql/domain-error-extensions-code.md` + ledger entry (expected: none).
  - _Requirements: REQ-020, REQ-021, REQ-023, REQ-040, REQ-041, REQ-050, REQ-063_
  - [ ] 3.1.QL **Quality Loop:** `bun run scripts/health/sub-loop.ts backend/graphql/test/parent-link.wire.test.ts --lifecycle duplicates` — exit code 0.
  - [ ] 3.1.TE **Test Engineering:** Wire cells run via `bun run test/scripts/run-test.ts backend/graphql/test/parent-link.wire.test.ts`; each cell asserts status class, `extensions.code`, envelope key-set parity, and zero side effects (row/notification counts unchanged on denials).
  - [ ] 3.1.SEC **Security & Tenancy Audit:** BFLA pre-resolver ordering proven (resolver body spy never invoked on 401/403); BOLA foreign-vs-absent byte-identity re-pinned on the wire; BOPLA smuggled-field rejection; no internal error text surfaces at the boundary for any denial class.
  - [ ] 3.1.SR **Semantic Review:** No local types introduced in resolvers/tests (canonical types only); enum value imports; no `console.*`; no hand-rolled date serialization.
  - [ ] 3.1.IV **Instruction Verification:** Validate against `.agents/instructions/backend.instructions.md` + `backend/graphql/AGENTS.md` (if present per 0.2) + the invariant #11 scalar/schema-surface rules.
  - Outcome: `3.1-outcome.md`.

- [ ] 3.2 Verify frontend documents parity (no edits expected)
  - Confirm `myIncomingParentLinkRequestsQueryDocument` / `respondToParentLinkRequestMutationDocument` remain `TypedDocumentNode`s with `id` selected first; the card consumes the SAME list document (no new document).
  - Run `bun run test/scripts/run-test.ts frontend/graphql/sharedDocuments/parents/parent-link.documents.test.ts` and `documents.contract.test.ts` — green, unchanged.
  - _Requirements: REQ-050, REQ-051_
  - [ ] 3.2.QL **Quality Loop:** sub-loop on any touched document file (expected: none) — record no-op if untouched.
  - [ ] 3.2.TE **Test Engineering:** Contract suites green; codegen types for the documents resolve with zero drift.
  - [ ] 3.2.SEC **Security & Tenancy Audit:** No over-selected fields in the incoming list document beyond the sanctioned incoming disclosure contract (`parentFullName` is sanctioned; nothing student-private leaks parent-side).
  - [ ] 3.2.SR **Semantic Review:** Single normalized-cache truth (one list document consumed by dashboard card + decision page); no duplicate query definitions anywhere.
  - [ ] 3.2.IV **Instruction Verification:** `.agents/instructions/frontend.instructions.md` + `frontend/graphql/AGENTS.md`.
  - Outcome: `3.2-outcome.md`.

---

## Phase 4: Frontend Views, Dashboard Card & Navigation

- [ ] 4.1 Verify/close the notification-drawer deep-link for `parent_link_request` (REQ-011)
  - Input: 0.2 finding for `frontend/components/ui/NotificationDrawerBody.tsx` / `useNotificationDrawerActions.ts` (`handleOpenNotification`).
  - **If the `relatedEntityType === "parent_link_request"` branch already routes to the student decision route:** PIN it with a component/contract test only — no code edit.
  - **If not:** add the minimal mapping inside the drawer's EXISTING route-resolution seam (Record/switch keyed by `relatedEntityType`), exporting ONE shared route constant (e.g. `STUDENT_LINK_REQUESTS_ROUTE`) that task 4.2's CTA and task 4.4's nav entry BOTH consume — three consumers, one constant, zero drift.
  - Add a component test: a `parent_link_request` notification click resolves exactly to the student decision route (both locales; no router errors for unknown entity types — those fall through unchanged).
  - _Requirements: REQ-011, REQ-053_
  - [ ] 4.1.QL **Quality Loop:** `bun run scripts/health/sub-loop.ts <edited drawer/action file> --lifecycle duplicates` — exit code 0.
  - [ ] 4.1.TE **Unit / Component Tests:** Happy DOM tests: notification click → route resolution; unknown entity → unchanged behavior; both locales; no `runInRollback` (UI test).
  - [ ] 4.1.BF **Agent-Browser Functional Self-Loop:**
    • Launch dev server; login as a student with a seeded `parent_link_request` notification.
    • Open the notification drawer; click the link-request notification.
    • Assert navigation lands on the student link-requests decision route; assert the pending row is rendered.
    • Iterative self-loop: on any mis-route/no-op, patch the resolution seam and re-test until clean.
  - [ ] 4.1.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis):**
    • Capture the drawer with the link-request notification at 1440×900 / 768×1024 / 375×812 × en/ar.
    • Inspect: notification row typography/spacing mirrors sibling rows; RTL mirroring correct; no truncation of the entity line; no hardcoded colors.
    • Iterate on `sx` tokens until visually consistent with the drawer baseline.
  - [ ] 4.1.SR **Semantic Review:** Resolution seam edit is minimal and switch-shaped (no re-architecting the drawer); `sx` only; no hardcoded strings/colors; route constant has exactly ONE definition site.
  - [ ] 4.1.IV **Instruction Verification:** `.agents/instructions/frontend.instructions.md` + `frontend/components/ui` layer AGENTS.md ONLY if present per 0.2 (`frontend/components/ui/AGENTS.md` does not exist in known prose — verify, never cite blindly).
  - Outcome: `4.1-outcome.md`.

- [ ] 4.2 Implement the NEW `PendingParentLinkRequestsCard` dashboard discoverability card
  - Create:
    - `frontend/views/students/dashboard/PendingParentLinkRequestsCard.tsx` (client component)
    - `frontend/views/students/dashboard/pending-parent-link-requests.ts` (pure helpers: `deriveActionableIncoming(rows, nowMs)` → `{ count, latestParentFullName } | null`)
  - Data: `useQuery(myIncomingParentLinkRequestsQueryDocument)` — the SAME id-first list document as the decision page (REQ-051); NO new query; NO count endpoint.
  - Derivation: actionability via `displayLinkRequestStatus(row.status, row.expiresAt, nowMs) === LinkStatus.Pending` + `isLinkRequestActionable(...)` from `frontend/lib/parent-link-request-status.ts` — REUSED verbatim, never forked.
  - Render contract (REQ-015/052): zero actionable → return `null`; loading → `aria-busy` Skeleton frame with zero layout-shift target; error → ONE localized inline `Alert` + retry via `refetch` (map codes via `resolveParentLinkDenialCopy`; never render raw server messages for masked classes); N=1 → title + count chip + requester full name + CTA; N>1 → title + count N + MOST RECENT requester + CTA (no per-request list on the dashboard).
  - CTA: single `Button`/link ≥44px target with `focusVisibleRingSx` from `frontend/components/ui/focusRing.ts`, routing to the shared `STUDENT_LINK_REQUESTS_ROUTE` constant from 4.1.
  - i18n: `useAppTranslation(ParentLink)` handle + property access only (labels from 1.1); names rendered with `dir="auto"` + `isolateBidi` where abutting chrome (`shared/lib/isolate-bidi.ts`).
  - MUI v9 discipline: `sx` only (no direct style props), `theme.palette.*` only (no hex/rgb), `*Outlined` icon (e.g. `PendingActionsOutlined`), logical properties only (no physical left/right; RTL via the emotion-cache stylis-plugin-rtl pipeline).
  - _Requirements: REQ-015, REQ-016, REQ-051, REQ-052, REQ-003, REQ-042_
  - [ ] 4.2.QL **Quality Loop:** `bun run scripts/health/sub-loop.ts frontend/views/students/dashboard/PendingParentLinkRequestsCard.tsx --lifecycle duplicates` and the pure-helper file — exit code 0 each.
  - [ ] 4.2.TE **Unit / Component Tests:** New suite `test/ui/components/students/PendingParentLinkRequestsCard.test.tsx` — Happy DOM + Apollo `MockedProvider`. REQ-064 matrix: loading (skeleton, `aria-busy`) / absent (zero actionable → renders nothing) / present-1 (count=1, requester FULL name, CTA href = shared route constant) / present-N (count=N, MOST RECENT requester) / error (localized Alert + retry invokes refetch) / post-decision disappearance (cache write-back → actionable 0 → unmounts) / expired-row exclusion (row with `expiresAt <= now` not counted) — in BOTH en and ar; pure-helper unit tests for the derivation edges (boundary instant, ordering, empty).
  - [ ] 4.2.BF **Agent-Browser Functional Self-Loop:**
    • Launch dev server / connect via agent-browser (Playwright); login as a student with ONE pending incoming request.
    • Navigate to `/student/dashboard`; assert the card renders with correct count, requester name, and CTA.
    • Click the CTA → assert landing on the student link-requests route; Confirm or Reject from the decision page; return to dashboard → assert the card disappears (post-decision convergence, REQ-016).
    • Seed two parents' pendings → assert count=2 + most-recent requester; force a network error (offline toggle / route abort) → assert localized Alert + working retry.
    • Iterative self-loop: on any interaction/assertion failure, patch code and re-run until clean.
  - [ ] 4.2.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis):**
    • Capture high-resolution screenshots at Desktop 1440×900, Tablet 768×1024, Mobile 375×812 × English LTR and Arabic RTL (six cells), covering present-1 and present-N states.
    • Visually inspect: MUI v9 theme palette compliance (no hardcoded hex/rgb), typography hierarchy vs `HandshakeCodeCard`, padding/margin rhythm, count-chip wrapping on mobile (wrap above requester line; full-width CTA at 375px), text truncation/overflow of long Arabic names, RTL mirroring (icon/CTA alignment, logical spacing), `dir="auto"` name isolation, dark/light contrast.
    • Iterative self-loop: inspect screenshot → identify UI defect → patch `sx` tokens → re-capture → repeat until visually polished; attach final six-cell screenshot set to the outcome.
  - [ ] 4.2.SR **Semantic Review:** Zero direct style props (sx only); zero hardcoded colors/strings; `useAppTranslation(ParentLink)` property access; `*Outlined` icons; no Apollo-dispatch spaghetti (single `useQuery`, no bespoke invalidation bus); helper file is pure (no React imports).
  - [ ] 4.2.IV **Instruction Verification:** `.agents/instructions/frontend.instructions.md` + `frontend/views/**` AGENTS.md ONLY if present per 0.2 (`frontend/views/AGENTS.md` is prose-phantom until proven otherwise).
  - Outcome: `4.2-outcome.md`.

- [ ] 4.3 Compose the card into the student dashboard status slot (`RoleDashboardPage`)
  - Edit `frontend/views/dashboard/home/RoleDashboardPage.tsx`: extend the EXISTING `resolveStatusSlot` student branch (which already renders `HandshakeCodeCard` from `@/frontend/views/students/dashboard`) to render `HandshakeCodeCard` + `PendingParentLinkRequestsCard` as siblings inside a `Stack` (plan D6 — no `DashboardView` contract change, no other-role impact).
  - No new props on `DashboardView`; no layout change for other roles.
  - _Requirements: REQ-015, REQ-053_
  - [ ] 4.3.QL **Quality Loop:** `bun run scripts/health/sub-loop.ts frontend/views/dashboard/home/RoleDashboardPage.tsx --lifecycle duplicates` — exit code 0.
  - [ ] 4.3.TE **Unit / Component Tests:** Extend the dashboard home component tests (location per 0.2): student role renders both cards in the status slot; parent/teacher/admin slots unchanged (snapshot/role matrix green); component test for slot ordering.
  - [ ] 4.3.BF **Agent-Browser Functional Self-Loop:**
    • Login as student → dashboard renders both cards; navigate away/back → no duplicate fetches (Apollo cache); logout/login as teacher → teacher dashboard renders with zero student cards and zero console errors.
    • Iterative self-loop until clean for both roles.
  - [ ] 4.3.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis):**
    • Capture the full dashboard at the six viewport/locale cells with BOTH cards present: vertical rhythm between cards, stack spacing matches design tokens, no overflow at 375px, RTL order/alignment correct in ar.
    • Iterate on `sx` spacing tokens until the slot composition is visually seamless; attach screenshots to outcome.
  - [ ] 4.3.SR **Semantic Review:** Single-role diff surface; `sx` only for the wrapper Stack; no hardcoded colors; no conditional-hook violations (hook lives INSIDE the card component, not in the server/route shell).
  - [ ] 4.3.IV **Instruction Verification:** `.agents/instructions/frontend.instructions.md` + dashboard-layer AGENTS.md if present per 0.2.
  - Outcome: `4.3-outcome.md`.

- [ ] 4.4 Nav retargeting (verify-first, retarget-if-needed — plan D5, invariant #12)
  - Per 0.2's finding on `frontend/views/dashboard/nav/navItems.ts` student section:
    - **If the link-requests entry targets the `[feature]` catch-all ComingSoon page:** RETARGET its `route` to the shared `STUDENT_LINK_REQUESTS_ROUTE` constant; update `navItems.test.ts` expectations.
    - **If it already targets the real route:** NO code change; record byte-identity proof; pin/refresh the nav test expectation only if absent.
  - No duplicate entries; no new nav items; NO mobile bottom-nav work (mobile nav = temporary MUI `Drawer`; out of scope).
  - Wrong-role page access MUST redirect via `roleDashboardPath(ctx.role)` — verify the decision-route page guard (`withPageAuth`) conforms; bare `/dashboard` redirect targets are FORBIDDEN.
  - _Requirements: REQ-053_
  - [ ] 4.4.QL **Quality Loop:** `bun run scripts/health/sub-loop.ts frontend/views/dashboard/nav/navItems.ts --lifecycle duplicates` (and its test) — exit code 0.
  - [ ] 4.4.TE **Unit / Component Tests:** `frontend/views/dashboard/nav/navItems.test.ts` — student nav contains exactly ONE link-requests entry targeting the shared route constant; other roles' items untouched; page-guard test: non-student hitting the route redirects to `roleDashboardPath(role)`; anonymous → login redirect.
  - [ ] 4.4.BF **Agent-Browser Functional Self-Loop:**
    • Login as student → click the sidebar link-requests entry → lands on the real decision route (not ComingSoon).
    • Login as parent and teacher → navigate directly to the student link-requests URL → observe role-dashboard redirect; anonymous → login redirect.
    • Iterative self-loop until all four cells behave correctly.
  - [ ] 4.4.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis):**
    • Capture sidebar (desktop drawer expanded + mobile temporary Drawer open) at the six cells; verify the entry label is localized, icon `*Outlined`, active-state highlight on the decision route, RTL drawer mirroring in ar.
    • Iterate styling only if a defect appears; otherwise record parity screenshots.
  - [ ] 4.4.SR **Semantic Review:** Route constant single-sourced; no string duplication across nav/card/drawer; nav item diff is minimal (retarget-only).
  - [ ] 4.4.IV **Instruction Verification:** `.agents/instructions/frontend.instructions.md` + `frontend/views/dashboard` layer AGENTS.md if present per 0.2.
  - Outcome: `4.4-outcome.md`.

- [ ] 4.5 Pin the decision page's existing behavior (regression, no redesign)
  - Run the existing suites for `frontend/views/students/link-requests/**` (located per 0.2) and `parent-link.documents.test.ts`-adjacent component suites — all green, unmodified.
  - If any suite references behavior 4.1–4.4 changed (it should not), reconcile via the shared route constant, never by editing the DEV1-014 view logic.
  - _Requirements: REQ-010, REQ-014, REQ-016, REQ-060_
  - Outcome: `4.5-outcome.md`.

---

## Phase 5: Integration & Differential Testing

- [ ] 5.1 Full integration battery & differential verification
  - Run (each via `bun run test/scripts/run-test.ts <path>`):
    1. `test/workflows` (entire journey layer — new + DEV1-014 journey both green)
    2. `backend/services/parents` (service + chaos + static-locks)
    3. `backend/graphql/test/parent-link.wire.test.ts` + `backend/graphql/test/schema-surface.test.ts` (baseline byte-identical)
    4. `test/ui/components/students/PendingParentLinkRequestsCard.test.tsx` + nav tests + drawer deep-link tests + dashboard-home slot tests
    5. Locale parity suites (en/ar) including 1.1's additions
  - Codegen differential: `bun run generate:gqlSchema && bun codegen` → `git diff` on generated artifacts shows ZERO unrelated drift; SDL unchanged from baseline.
  - Schema differential: `git diff -- backend/db/schema/** backend/db/migration/**` MUST be empty; `bun run db push` is a no-op confirmation only.
  - Typecheck/gate differential: `bun x tsgo --noEmit`, `bun run biome:check`, lint-service — error counts ≤ the 0.1 baseline for every tool.
  - Static locks: `parent-link-request.static-locks.test.ts` green; corpus extended ONLY if a new backend file landed under its scanned roots (expected: none — journey files live outside).
  - Coverage gate: NEW code (card + helpers + drawer seam + nav diff) at 100% statement/branch (REQ-060); existing suites unchanged in shape (extension-only).
  - Record any failure → fix-forward; record any consciously accepted deviation in `deferred-items.md`.
  - _Requirements: REQ-050, REQ-060, REQ-061, REQ-063, REQ-064, REQ-065_
  - Outcome: `5.1-outcome.md` (full command matrix + results).

---

## Phase 6: Post-Implementation Review Waves (Parallel)

> Launch the four review waves in parallel; each produces a findings file under `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/`. All Critical/High findings must be resolved (or ledgered with explicit rationale) before Phase 7.

- [ ] 6.1 Wave: review-types
  - Zero local types in resolvers/components; all imports from `backend/types/**` / `@/backend/types`; `TypedDocumentNode` usage; i18n types complete (no missing key members); enum value imports only.
  - Verify `IncomingParentLinkRequestReturnType` is the card's sole row contract (no re-declared view types).
  - Findings → `6.1-outcome.md` (review-types section).

- [ ] 6.2 Wave: review-backend
  - Confirm zero production-code diff in `backend/services/**` / `backend/db/repo/**` / `backend/graphql/mutation|query|pothos/**` (git diff evidence).
  - Re-audit journey + added test cells for: honest permission resolution (no monkey-patching), `runInRollback` absence in journey files, committed-fixture discipline + complete `afterAll` teardown (FK-safe order), spied (never real) fanout/email/SMS, PGLite skip guard on true races.
  - Re-assert: guarded-claim SQL unchanged; no `SELECT FOR UPDATE`/advisory locks added; log hygiene (no names/codes) in any added logging (expected: none); `console.*` absence.
  - Findings → `6.2-outcome.md` (review-backend section).

- [ ] 6.3 Wave: review-frontend
  - MUI v9 discipline across all new/edited files: `sx` only, `theme.palette.*` only, `*Outlined` icons, ≥44px targets, logical properties, `dir="auto"`/`isolateBidi` on names.
  - i18n: `useAppTranslation(ParentLink)` handle-form; zero hardcoded user-facing strings; both locales rendered in tests.
  - Apollo: single list document shared by card + decision page; id-first selection; no new queries; no bespoke invalidation.
  - Browser evidence review: 4.1/4.2/4.3/4.4 BF+BS artifacts complete (functional flows green; six-cell screenshot sets attached).
  - Findings → `6.3-outcome.md` (review-frontend section).

- [ ] 6.4 Wave: pentester (security)
  - Threat-model pass over the ticket delta: BFLA pre-resolver conjunction (`$all`) intact on both fields; BOLA foreign≡absent byte-identity on wire + service; BOPLA closed input `{ requestId, accept }` + no `{ ...input }` spreads; governance `requireActor` pre-tx ordering (context boundary is NOT fail-closed — service re-check is the defense); no existence oracle in any new UI copy; notification deep-link cannot be abused for IDOR (route is generic, authorization enforced server-side).
  - Attempt abuse cases: expired-id respond, double respond, smuggled fields due-schema validation, governed-student respond — all match frozen denial vocabulary with zero side effects.
  - Findings → `6.4-outcome.md` (pentester section).

- [ ] 6.5 Deferred-items ledger gate (FINAL)
  - Re-read `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/deferred-items.md` in full.
  - Every entry is either ✅ resolved (with evidence link) or explicitly deferred with owner/rationale; ZERO ❌/⚠️ items may remain.
  - Record the ledger verdict in `6.5-outcome.md`; a non-clean ledger BLOCKS Phase 7 closure.

---

## Phase 7: Knowledge Propagation & Documentation

- [ ] 7.1 Amend the canonical parent-link doc (no fork)
  - Edit `docs/parents/parent-link-request.md`: add a **DEV1-015 closure section** recording: the dashboard discoverability card (files, data path, render states), the notification deep-link pin/close result, nav retargeting outcome (or no-op proof), the new journey file + added wire/service cells, and the verified INV-P1 closure statement.
  - Do NOT fork a parallel canonical doc; do NOT edit/renumber `docs/specs/state-machine-invariants.md` or `docs/specs/open-decisions-and-gaps.md` (bind by reference — B.14, INV-P1, A.2/A.4/B.12 — only).
  - _Requirements: REQ-070_

- [ ] 7.2 Layer knowledge propagation (minimal, conditional)
  - Add a layer AGENTS.md line ONLY if a genuinely NEW permanent rule emerged (expected: none — single-writer/expiry/notification rules already documented). Candidates to evaluate: "one shared route constant for all parent-link deep-links" (nav/card/drawer) — if deemed durable, add ONE line to the closest existing layer AGENTS.md verified present in 0.2; otherwise skip and record why.
  - Root AGENTS.md Important References: no additions expected (parents docs already recorded) — verify rather than assume.
  - _Requirements: REQ-071_

- [ ] 7.3 Outcome synthesis & ticket closure
  - Write `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/FINAL-outcome.md` synthesizing: substrate verification results (0.2), every task outcome link, the full test matrix with counts, browser-evidence index (six-cell screenshot sets), security review disposition, ledger verdict, and the explicit acceptance-criteria trace (each Gherkin Given/When/Then → the task + test that proves it, incl. J-REQ-01..05).
  - Confirm every checkbox in this file is `[x]`, every referenced outcome file exists, and the final gate metrics: tsgo/biome/lint ≤ baseline; codegen drift 0; schema diff empty; all suites green; ledger clean.
  - _Requirements: REQ-001, REQ-060, REQ-070, REQ-071_

---

### Acceptance-Criteria Trace (summary)

| Acceptance Criterion | Proven by |
|---|---|
| Student sees pending link request (list + notification + dashboard) | 1.1, 4.1, 4.2, 4.3 + journey steps 1–2 (Task 2.1) + REQ-064 component suite (4.2.TE) |
| Confirm → `students.parent_id` set, sibling expiry, parent notified | Journey step 7 (2.1) + existing service/chaos suites re-pinned (2.2) |
| Reject → no link write, siblings untouched, parent notified | Journey step 6 (2.1) + idempotency cell (2.2) |
| No link without explicit confirmation (INV-P1) | Journey negative probes + governed/foreign denials (2.1) + pentester wave (6.4) |
| B.14 expiry liveness (boundary instant expired, reads pure) | Journey boundary cell (2.1) + wire expired-claim cell (3.1) + card derivation tests (4.2.TE) |
| Two-parent race → exactly one winner | Journey race cell (2.1) + chaos suite pinned (2.2, 6.2) |
| Zero new wire surface / zero schema drift | 3.1, 3.2, 5.1 differential gates |

---

## Task Execution Checklist (applies to every task)

**Before starting each task**
- [ ] Read ALL files in `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/` (prior findings; do not re-research)
- [ ] Requirements (specs.md rows for cited REQs) and design (plan.md sections) reviewed
- [ ] Verification-first rule acknowledged: verify code exists before claiming REUSE/UPDATE

**During implementation**
- [ ] Layer patterns followed (barrels `export *`, canonical types, no local types in Pothos, `tx` propagation)
- [ ] Tests written alongside implementation (Tier 1–4 per task)
- [ ] Error contract: DomainError subclasses with `extensions.code`, localized via `ctx.t`

**Before marking complete**
- [ ] `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exits 0 for every touched file
- [ ] Semantic review checklist clean (race conditions, env-config, enums as values, no cross-layer imports, no dead code)
- [ ] Instruction verification: read every AGENTS.md + `.agents/instructions/*.md` printed by sub-loop.ts
- [ ] Outcome file written; checkbox flipped `[ ]` → `[x]`

## Common Task Patterns (reference)

- **Backend verification task**: verify existence (view/grep) → write verification note in outcome → add only missing regression cells → `sub-loop` → semantic review.
- **Frontend component task**: scaffold component + namespace labels → Tier tests → agent-browser functional (`.BF`) → agent-browser visual (`.BS`) → semantic review (sx-only, no hardcoded colors, `useAppTranslation` handle).
- **GraphQL task**: verify document/resolver shape → run `bun run generate:gqlSchema && bun codegen` if anything touched → testClient cells → sub-loop.
- **Gate task**: STOP condition documented → ledger entry if triggered → orchestrator decision recorded in outcome.

## Quality Gates (phase-boundary)

| Gate | Location | Condition to pass |
|---|---|---|
| Phase 0 gate | after 0.2 | Substrate inventory complete; any missing substrate = STOP |
| Phase 2.M | mid-point review | Zero backend-specific findings across modified backend files |
| Phase 6 review waves | post-implementation | Zero feature-specific findings after fix rounds |
| Phase 7 | knowledge propagation | Doc created + AGENTS.md/instructions references updated + root AGENTS.md reference |

## Estimation Guidelines

- Each `.QL/.TE/.SEC/.SR/.IV` pipeline subtask ≈ 20–40 min per file.
- Verification tasks (0.2) are cheaper than build tasks but BLOCKING — never shortcut.
- Frontend card (Phase 4) is the only net-new UI; budget the browser self-loops (BF/BS) at one full matrix pass (3 viewports × 2 locales × 3 states).
