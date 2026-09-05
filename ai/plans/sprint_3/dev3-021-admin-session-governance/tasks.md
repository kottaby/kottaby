# DEV3-021 — Admin Session Governance — tasks.md

**Plan directory**: `ai/plans/sprint_3/dev3-021-admin-session-governance/`

Legend: every backend/frontend leaf carries QL (quality loop `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`), plus stage tags TE/SEC/SR/IV (backend), TE/BF/BS/SR/IV (frontend).

## Phase 0 — Baseline

- [ ] 0.1 Run baseline `bun quality-gate`; record pre-existing failures → `deferred-items.md` (REQ-001).
- [ ] 0.2 Verify exact admin authScope string & resolver pattern used by DEV3-016/017/022 admin resolvers (`backend/graphql/pothos/admin/*`) and copy verbatim.

## Phase 1 — Types & i18n

- [ ] 1.1 CREATE `backend/types/classes/session-governance.types.ts` — `AdminSessionListFilterInput`, `AdminSessionPage`, `AdminSessionRescheduleInput`, `AdminSessionReassignInput`, `AdminSessionJoinResult` + zod schemas (REQ-003, REQ-010..020, REQ-050).
  - [ ] 1.1.QL / 1.1.TE / 1.1.SEC / 1.1.SR / 1.1.IV (`.agents/instructions/backend.instructions.md`, `backend/types/AGENTS.md`)
- [ ] 1.2 UPDATE `backend/types/classes/index.ts` barrel (`export * from "./session-governance.types"`).
- [ ] 1.3 CREATE/UPDATE locale namespace submodule `shared/locale/namespaces/adminSessions` keys for filters/actions/dialogs/errors (en+ar parity) (REQ-002, REQ-050).
  - [ ] 1.3.QL / 1.3.IV (shared layer: verify no cross-layer imports).

## Phase 2 — Repository

- [ ] 2.1 UPDATE `backend/db/repo/classes/session.repository.ts`: `listAdminAll(filter, page, pageSize, tx?)` (window-count, `created_at DESC, id DESC`, half-open dates), `adminUpdateTimingGuarded`, `adminCancelGuarded`, `adminReassignGuarded` with `RETURNING` guard pattern (REQ-010, REQ-040..042).
  - [ ] 2.1.QL / 2.1.TE (Tier-1/2; `runInRollback`, full `tx` propagation) / 2.1.SEC / 2.1.SR / 2.1.IV
- [ ] 2.2 Verify `TeacherRepository` certified-lookup method signature (`is_approved`); use verbatim — if missing, report CROSS-FILE DEPENDENCY.

## Phase 3 — Service

- [ ] 3.1 CREATE `backend/services/classes/session-admin-governance.ts`: `listAdminAllSessions`, `getAdminSession`, `adminReschedule`, `adminCancel` (tx: guard-UPDATE → `refundHeldLaneToProvenance` → `AuditService.createAuditLog` → post-commit notify), `adminReassign`, `adminJoin` (REQ-010..020, REQ-030..051).
  - [ ] 3.1.QL / 3.1.TE (Tier-1..4 incl. chaos: concurrent cancel vs start; concurrent reassign vs cancel; Tier-4 non-admin/BOLA) / 3.1.SEC / 3.1.SR / 3.1.IV
- [ ] 3.2 UPDATE session-lifecycle service barrel/namespace re-export + `backend/services/classes/index.ts` barrel.

## Phase 4 — GraphQL

- [ ] 4.1 CREATE `backend/graphql/pothos/classes/admin-session-object.pothos.ts` (page + join objects; `DateTime` scalar) (REQ-060).
  - [ ] 4.1.QL / 4.1.TE / 4.1.SEC / 4.1.SR / 4.1.IV
- [ ] 4.2 CREATE `backend/graphql/query/classes/admin-session.query.ts` — `adminSessions`, `adminSession` (REQ-010..012, REQ-030/031).
  - [ ] 4.2.QL / 4.2.TE / 4.2.SEC / 4.2.SR / 4.2.IV
- [ ] 4.3 CREATE `backend/graphql/mutation/classes/admin-session.mutation.ts` — 4 mutations w/ zod validation (REQ-013..020, REQ-050/051).
  - [ ] 4.3.QL / 4.3.TE / 4.3.SEC / 4.3.SR / 4.3.IV
- [ ] 4.4 UPDATE barrels `backend/graphql/pothos/classes/index.ts` + query/mutation classes barrels; run `bun run generate:gqlSchema && bun codegen` (REQ-060).
- [ ] 4.5 GraphQL integration tests via `frontend/graphql/test/` harness (testClient): REQ-031 (403 each field), REQ-010 results, REQ-014 cancel e2e, REQ-015/017/019 error codes (REQ-070/071).

## Phase 5 — Frontend

- [ ] 5.1 CREATE `frontend/graphql/sharedDocuments/adminSessions.documents.ts` (REQ-061). QL/TE/SR/IV.
- [ ] 5.2 CREATE `app/(dashboard)/admin/sessions/page.tsx` server gate (REQ-062). QL/IV.
- [ ] 5.3 CREATE `frontend/views/admin/sessions/` view tree: `AdminSessionsShared.tsx` scaffold, `AdminSessionsDesktop.tsx`, `AdminSessionsMobile.tsx` wrappers, `AdminSessionsView.tsx`, `useAdminSessionsViewModel.ts`, `SessionFiltersBar.tsx`, `AdminSessionActionsMenu.tsx`, `RescheduleDialog.tsx`, `ConfirmAdminActionDialog.tsx`, `JoinObservePanel.tsx` (REQ-063; REQ-002 i18n, MUI v9 sx-only) — one task per file, each with QL, TE (Happy DOM + MockedProvider), BF (agent-browser flow), BS (screenshots 1440/768/375 en+ar-RTL), SR, IV (`.agents/instructions/frontend.instructions.md`). Split tasks 5.3.1..5.3.10.
- [ ] 5.4 UPDATE `frontend/views/dashboard/nav/navItems.ts` — admin `sessions` item (label via i18n handle) (REQ-062). QL/SR/IV.
- [ ] 5.5 UI component tests for dialogs/filters/states (REQ-072); Playwright e2e admin-cancel happy path (`test/ui/e2e/`, requires `bun run build:test`).

## Phase 6 — Workflow Journeys (TEST-FIRST)

- [ ] 6.1 CREATE `test/workflows/admin/admin-session-governance.test.ts` — real DB, beforeAll-commit/afterAll-delete fixtures, REAL services: journey A (cancel started → refund + notify + audit), journey B (reassign → teacher swap + audits + notifications), journey C (join started → audit only, zero session mutation) (specs §2.9; REQ-071).
  - [ ] 6.1.QL / 6.1.SR / 6.1.IV (`.agents/instructions/{backend,tests}.instructions.md`)

## Phase 7 — Knowledge Propagation

- [ ] 7.1 CREATE `docs/admin/session-governance.md` (canonical ref) (REQ-080).
- [ ] 7.2 UPDATE `docs/sessions/session-lifecycle.md` consumer-guidance (DEV3-021 anchor) + root `AGENTS.md` Important References.
- [ ] 7.3 Final `bun quality-gate` green; update `outcome/` with results; close deferred ledger items or transfer.
