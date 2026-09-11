# Final Outcome — Session Report & Homework Infrastructure

**Plan:** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure`
**Branch:** `feat/dev3-006-session-report-homework` (base: `origin/main` @ `ffce457`)
**Date:** 2026-09-07 · **Issue:** kottaby/kottaby#75 · Sprint 1, Core Domain MVP (5 pts)

## Executive summary

The guarded session-report + homework infrastructure landed end-to-end: schema amendments (one-report/one-homework-per-session unique arbiters), canonical types, the `isSurahJuzRef` guard, en/ar i18n (9 error keys + 3 notification slots), two repositories + the session gate/wave reads, pure validators, the notification seam, the `SessionReportService` write+read surface (exact pipeline: pre-DB validation → governance re-assertion → `FOR UPDATE` gate → atomic report+homework co-creation → prior-grade one-shot routing → in-tx notifications → publish-after-commit), the Pothos GraphQL surface (mutation + 2 queries + 4 closed inputs + enum registration), frontend typed documents, and the knowledge artifacts. All 31 implementation checkboxes are `[x]` with outcome files; the two GraphQL-wire items are honestly recorded (runner-skipped under pglite; execution in CI).

## Requirements traceability (specs §4 matrix, implementation columns filled)

| REQ | Invariant | Implementation (file → artifact) | Verification (outcome → evidence) |
|---|---|---|---|
| REQ-001 | — | `outcome/0-baseline-outcome.md`, `deferred-items.md` (D1–D5 pre-seeded) | baseline floor: tsgo 0 / oxlint 0-0 / lint pass / biome clean |
| REQ-002 | — | enum VALUE imports; locale keys typed via `ErrorsLabels`/`NotificationsLabels`; parity suites updated | 1.4-outcome: errors 18 pass, notifications 105 pass |
| REQ-003 | — | `backend/types/classes/report.types.ts` (+ReportInsertType/ReturnType/submit-input family), `home-work.types.ts` (NEW), `session-notification.types.ts` (wave types) | 1.3-outcome: test-d conformance compiler-validated; 0 `any` |
| REQ-010 | — | `report.repository.ts` (insertReport / findBySessionId, tx-last) | 2.2-outcome: 14 tests, 100% stmt; 23505 untranslated at repo tier |
| REQ-011 | INV-HW4 | `home-work.repository.ts` (4 methods; `gradeHomeWorkOnce` guarded UPDATE) | 2.3-outcome: 21 tests; double-grade null-miss; naming deviation `findLatestUngradedByStudentId`→`findLatestByStudentId` (D5 reconciliation, §Deviation D5 below) |
| REQ-012 | INV-S7, INV-U | `session-report.service.ts` gate: governance (`assertTeacherGovernanceClean`) → `lockForReportGate` FOR UPDATE → owner/status classification | 2.7-outcome tier 1/4; journey steps 2/3; wire matrix (CI) |
| REQ-013 | INV-S8 | single `withTransaction` co-creation; orphan structurally unreachable | journey step 11 forced mid-tx rollback: zero rows + zero publishes |
| REQ-014 | B.11 | Jadid/Madi cohesive blocks; safe-int ayahs + `MAX_AYAH_VALUE` bound; `isSurahJuzRef` | guards 46 pass (bounds, fuzz, enum smuggling); journey step 4 sweep |
| REQ-015 | INV-HW3/HW4 | grade columns nullable (verified already-nullable, no-op); newest-prior-row routing; first-session no-op vs all-graded CONFLICT | 1.1-outcome R2; 2.9-fixes outcome; journey steps 9/10 |
| REQ-016 | INV-HW2 | pre-DB validators (rating 0–5, notes ≤2000, grades 0–100) → localized VALIDATION | guards suite boundaries; journey step 4 ×8 |
| REQ-017 | oracle ruling | `getSessionReport`/`getSessionHomework` (naming adaptation of the spec sketch `getSessionReportById`) participant-only reads, silent | service suite read tiers; journey steps 7/8 |
| REQ-018/019 | INV-P1/P3 | `session-report-notification.service.ts`: one wave-context read, recipient-locale, parent iff linked, names-only copy, `session:{id}:report` key, publish post-commit | notification suite 17 pass (100% stmt+branch); journey steps 5/5b/9 |
| REQ-030/031/032 | BOLA/BFLA/BOPLA | oracle collapse (writes/reads), `$all` scope + service re-assertion, field-by-field mapping (no spread) | journey + service tier 4; pentest wave PASS; wire smuggle probes (CI) |
| REQ-033 | — | no LIKE surface (N/A by construction); notes stored verbatim parameterized | pentest wave injection check |
| REQ-034 | INV-S1/S2 | cancelled/disputed → `SESSION_INVALID_TRANSITION` (same shape as wrong-state) | service suite per-status denials |
| REQ-040/043 | — | `reports_session_id_unique` + `home_work_session_id_unique` arbiters; 23505 → `SESSION_REPORT_ALREADY_EXISTS` (constraint-scoped on homework leg) | 1.2-outcome introspection 5/5; storm ×3 deterministic (1 winner, N−1 conflicts) |
| REQ-041/042 | — | one tx unit; tx propagated to every call (grep-verified) | review-backend wave; journey step 11 |
| REQ-044 | INV-S3 | zero wallet/fee_held/teacher_transaction writes | journey + service count-delta oracles |
| REQ-050/051/052 | — | Pothos objects (`id` first, DateTime scalar, exhaustive mapper), mutation + 2 nullable queries, closed inputs | 3.1–3.3 outcomes; toSchema probe; SDL pins |
| REQ-053 | — | codegen + surface freeze (7 additions) + 9 SDL pins | 3.4-outcome: surface 41 pass, SDL 20 pass, drift ZERO |
| REQ-054 | — | `session-report.documents.ts` (3 TypedDocumentNodes, id-first, exact selections) | 4.1-outcome: contract suite 11 pass; cache no-change verified |
| REQ-055 | — | N/A — zero UI files ship (scope ruling; docs-only) | review-frontend wave: frontend changeset = documents+generated only |
| REQ-060 | — | repo suites in `backend/db/test/repo/classes/` (house location; task's `__tests__/` sketch = documented deviation) | 169 pass / 0 fail; 100% stmt both repos |
| REQ-061 | — | service suite 4 tiers, real DB, storm ×3 | 32 pass ×4 runs; determinism evidence |
| REQ-062 | — | journey test-first (RED recorded) → GREEN ×3 | 2.1-outcome (RED evidence) + 2.9-outcome (14/14 ×3) |
| REQ-063 | — | `session-report.wire.test.ts` authored (1141 lines, matrix+smuggle+fuzz+byte-identity) | 5.1-outcome: execution deferred to CI — repo's own runner skips ALL GraphQL suites under pglite by design (run-server-tests.ts:630–645); ledger row Wire-Suite-CI |
| REQ-064 | — | coverage gate | 5.2-outcome: 100% stmt on ALL new modules; branch ≥95.65 (documented defensive-guard exceptions); drift zero |
| REQ-070 | — | `docs/sessions/session-report-homework.md` (canonical, house style) | 7.1-7.2-outcome |
| REQ-071 | — | 5 layer AGENTS.md + root AGENTS.md pointer (additive, minimal) | 7.1-7.2-outcome diff excerpts |
| REQ-072 | — | `docs/sessions/session-lifecycle.md` INV-S7/S8 rows → "Shipped" + citation | 7.1-7.2-outcome |

## Phase 6 findings resolution

All findings LOW or below — 4 fixed (ayah bound, resilient wave join, `isSuppliedBlock` dedupe, stale doc line), 7 recorded with rationale (vocabulary exports, pre-existing conventions, by-design INFO items). Zero CRITICAL/HIGH/MEDIUM across the 4 reviewer waves + Wave-2 zero-finding verification. Full ledger: `outcome/6-review-waves.md`.

## Final test matrix

| Suite | Result |
|---|---|
| repo suites (`backend/db/test/repo`) | 169 pass / 3 skip / 0 fail |
| services suites (`backend/services/classes`) | 217 pass / 3 skip / 0 fail (831 total in coverage run) |
| schema-surface + session-sdl | 41 + 20 pass / 0 fail |
| journey (`test/workflows/classes/session-report-homework.journey.test.ts`) | 14 pass / 0 fail ×3 |
| documents contract (+ root) | 11 + 20 pass / 0 fail |
| GraphQL wire tier | runner-skipped under pglite (by design) → CI |
| tsgo / oxlint / biome / lint-service / duplicates | 0 / 0-0 / clean / pass / 0 clones (baseline held) |
| codegen drift | zero (md5-verified) |

## Deferred-items final snapshot

D1 (114-surah expansion → curriculum stream), D2 (parent read surface → the parent-portal ticket), D3 (submit UX → the submit-UX ticket), D4 (rating aggregation → the rating-aggregation ticket), D5 (report amendment semantics → future ticket), Wire-Suite-CI (wire execution → CI/postgres, environmental). Zero blocked items.

## Known limitations & handoff notes

- **Submit-UX ticket** consumes `submitSessionReportMutationDocument`, `sessionReportQueryDocument`, `sessionHomeworkQueryDocument` from `frontend/graphql/sharedDocuments/scheduling/session-report.documents.ts` (also re-exported via the hub + root barrel). Nullable roots: both queries return `null` for non-participants — render an empty/skeleton state, never an error.
- **Parent-portal ticket**: parent reads are `null` by design until the parent read surface lands (ledger D2); parents currently receive the report-ready notification only.
- **Rating-aggregation ticket**: source rows live in `reports.student_rating_by_teacher` (0–5 int, CHECK-backstopped).
- **Governance**: submission requires governance-clean + teacher-role (service re-assertion `assertTeacherGovernanceClean`, shared `assertRoleGovernanceClean` core with the admin variant).
- **Wire suite**: executes in CI with real postgres (`bun run test:graphql`); in pglite sandboxes every GraphQL suite skips by repo design.
