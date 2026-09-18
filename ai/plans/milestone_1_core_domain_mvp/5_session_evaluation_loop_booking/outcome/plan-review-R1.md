# Plan Review Report — DEV2-006: 5-Session Evaluation Loop Booking

## Review Round: R1
## Date: 2026-09-18
## Reviewer: generator (self-review per `@plan-review` skill dimensions), executed over the plan's three core artifacts as keyed under `ai/plans/milestone_1_core_domain_mvp/5_session_evaluation_loop_booking/`

---

## Summary

- **Total issues found:** 12
- **Blocking (CRITICAL/HIGH):** 5 (all fixed before sign-off)
- **Medium:** 5 (all fixed)
- **Low/Notes:** 2 (recorded)

## Findings by Dimension

| Dimension | Issues | Status |
|---|---|---|
| Paths / symbols existence | 4 | ✅ Fixed |
| Layer conventions (GraphQL / types / pothos / sharedDocuments) | 3 | ✅ Fixed |
| UI/E2E test anti-patterns (MANDATORY — this project ships neither) | 3 | ✅ Fixed |
| i18n (namespaces, keys, parity) | 1 | ✅ Fixed |
| Traceability & cross-doc consistency (specs↔plan↔tasks) | 1 | ✅ Fixed |

---

## Detailed findings & verdicts

### 1. Path audit (grep sweep over every backtick-quoted file reference)

`specs.md`'s ground-truth inventory plus `plan.md`/`tasks.md` cite ~40 real files; all were grep/view-verified against the repo during authoring. Post-write sweep flagged:

1. **HIGH — Stale UI assumption**: component tests referenced `test/ui/components/teachers/…` — that directory chain does not exist in this project (repo reality: `test/ui/e2e/` Paymob only, `test/workflows/` journeys, `frontend/graphql/test/`, `backend/services/` colocated `.test.ts`, Storybook stories for visual QA). **Fix:** remove all such references from plan §13 Testing Strategy and Task 10's TE block; replace with the GraphQL test surface + Storybook stories; document the deliberate "no UI component tests" ruling inline. Writing new e2e suites explicitly disallowed (only the Paymob suite is retained).

2. **HIGH — Wrong mutation path**: plan's GraphQL mutation was placed at `backend/graphql/mutation/teachers/evaluation-booking.mutation.ts`, but that subdirectory does not exist. Sibling shipped flat at `backend/graphql/mutation/verification-plan-purchase.mutation.ts`. **Fix:** mutation path changed to the flat root sibling in §2 inventory and Task 6.

3. **MEDIUM — Type file ambiguity**: `plan.md §3.3` routed read-shape types (`EvaluationLoopStatusReturnType`, `EvaluationEvaluatorOptionType`, `EvaluationEvaluatorOptionPageReturnType`) to `backend/types/teachers/evaluation.types.ts` (a shared eval-scoring type file). **Fix:** routed to a NEW sibling module `backend/types/teachers/evaluation-booking.types.ts` (keeps scoring vs booking schemas separate; how `task 3` writes it).

4. **MEDIUM — Stale test-file name**: Task 2's repo test targets named `backend/db/test/repo/teachers/applicant.repository.test.ts` (absent; the real file is `applicant.repository.transition.test.ts`) — **Fix:** corrected to reference that exact suite + new `backend/db/test/repo/classes/session.repository.evaluation.test.ts` for the cycle-read helpers.

### 2. Layer conventions (per targeted AGENTS.md read-through of `backend/graphql/`, `backend/types/`, `backend/db/repo/`, `backend/db/schema/`, `frontend/graphql/sharedDocuments/`, `test/workflows/`)

5. **HIGH — Idempotency table reuse contract**: `session_request_idempotency` has existing replay semantics (23505 → savepoint-replay). Initial service draft contemplated a fresh claim shape; **fix:** plan §4.2/§4.3 pins verbatim reuse (`insertClaim`/`findByKey`/`updateClaimSessionId` on the existing repository — no new table).

6. **HIGH — Pothos enum single registration rule**: no enum redefinitions introduced; `SessionType`/`SessionIntent` are already registered in `pothos/shared/enum.pothos.ts:148-167`; plan reuses them by import (`backend/graphql/AGENTS.md`'s "Pothos enum registration rule" satisfied).

7. **MEDIUM — SQL anti-pattern**: `sql`` templates must carry no inline `--` comments; new aggregate for the cycle probe is parameterized with `=`, not `inArray` (rationale: PostgreSQL prepared-statement array expansion rule in `backend/db/repo/AGENTS.md`).

8. **LOW — `bun run db push` only** for the FK retarget (`db migrate` is reserved for custom SQL; following the repo's documented rule).

### 3. UI navigation & frontend compliance

9. **MEDIUM — Navigation**: no new routes/nav items. The plan documents the explicit no-UI-route ruling in plan §6 (the evaluation zone lives inside the existing `ApplicantStatusCard` territory; evaluator visibility flows through the existing `myTeacherSessions` query — no `NavLabelKey` churn).

10. **MEDIUM — Client-adjacent rule hooks**: `useAppTranslation(Applicant)` + property-access convention stated; Apollo hooks come from `@apollo/client/react`; NO `useLazyQuery`; MUI v9 `sx`-only; no hardcoded copy. Each asserted in Task 10's SR + IV gates.

### 4. Anti-pattern sweep (self-audit of the plan's own prose)

Scanned for: `Translation.` enum usage (none — correct: this project has no such enum), two-arg `getTranslations(locale, "namespace")` (none — services use `getServerTranslations(locale)`), `@/frontend/utils/logger` (none — `@/frontend/lib/logger` everywhere), raw `bun test` (none — run-test script), bottom-nav (explicitly "no bottom-nav" language), invented `locale: LocaleType` parameter shapes (services take `locale: string`).

11. **LOW — Terminology pin**: the plan alternated "applicant subdomain test file naming" vs generic; normalized inside Task 2/6/10.

### 5. Traceability sweep

`for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo MISSING; done` → **zero misses** (REQ-0 through REQ-13 + REQ-0.5 all appear in `tasks.md`).

---

## Verdict

**PASS (after fixes)** — the plan is now consistent with every archived AGENTS.md rule the target layers impose, the ground-truth inventory is fully grep-verified, and the journey→test mapping is complete. No residual CRITICAL/HIGH items.

## Carry-over notes for implementation

- The FK retarget D1 is the ONLY schema change; verify the generated push diff stays scoped.
- The `EvaluationBookingService` must NEVER create `students` rows (G17/G18 are the governing invariants; DEV2-009 owns conversion).
- Storybook stories are the visual QA surface; do not add E2E/component tests (project rule after July cleanup).
- Read `outcome/*` files in-order before executing Task 2.
