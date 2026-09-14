# Task 2 — Applicant transition write + guard hardening

- **Date:** 2026-09-14
- **Branch:** `feat/verification-plan-purchase-5-sessions`
- **Requirements:** REQ-4.1-4.3, REQ-4.5, REQ-4.6, REQ-7.1, REQ-0.5, REQ-8.1 · **Design:** plan.md §4.1, §4.2

## Summary of what was implemented

1. **`ApplicantRepository.transitionToInEvaluation` (plan §4.1, binding):** appended to the existing namespace in `backend/db/repo/teachers/applicant.repository.ts` — signature `(userId: number, tx?: DBTransaction): Promise<ApplicantSelectType | null>`. Single guarded Drizzle UPDATE: `SET status = in_evaluation, updated_at = now() WHERE id = $1 AND status IN ('pending','failed') RETURNING *`. The prior state IS the WHERE predicate (no SELECT-then-UPDATE); zero rows → `null` (silent no-op; the service tier disambiguates). Status values come from the `ApplicantStatus` enum members (`InEvaluation`/`Pending`/`Failed`) via `inArray(applicants.status, [...])` — plain array per the repo `inArray`-with-placeholder prohibition (sibling precedent: `user.repository.ts`, `plan.repository.ts`). Optional-`tx` branching, `sql\`now()\`` stamping, no prepared statements, and the docblock style mirror `recordVerificationAttempt`/`finalizeOnCertification` exactly; JSDoc describes domain behavior only (zero plan-artifact references).
2. **Guard hardening (plan §4.2):** `ApplicantLifecycleService.assertCanPurchaseVerification` gains, AFTER the cooldown branch: `row.status === ApplicantStatus.Passed` → `logger.logDomainError("Verification purchase denied: already certified", { code: "APPLICANT_ALREADY_CERTIFIED", entity: "applicants", entityId: userId, locale })` then `throw new ValidationError("APPLICANT_ALREADY_CERTIFIED", t.applicantAlreadyCertified)`. Shape/log-order/context match the sibling `APPLICANT_NOT_FOUND` and `APPLICANT_COOLDOWN_ACTIVE` branches byte-for-byte. `ApplicantStatus` was verified to be a VALUE import (`import { ApplicantStatus, isApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum"`) and remains one. Module header + function `@throws` docblocks updated to document the third rejection (docs kept truthful; no plan artifacts).
3. **i18n (REQ-7.1, REQ-0.5):** new `errors.applicantAlreadyCertified` key — declared in `shared/locale/types/errors/labels.ts` (typed `ErrorsLabels` slot with a domain docblock), realized in `shared/locale/en/errors/index.ts` ("You are already certified. Verification purchases are no longer available for this account.") and `shared/locale/ar/errors/index.ts` ("أنت معتمد بالفعل كمعلم قرآن. لم تعد عمليات شراء التوثيق متاحة لهذا الحساب." — tone-matched to the neighboring `applicantCooldownActive`/`applicantNotFound` copy). Both locale consts are compile-time typed against `ErrorsLabels`, so a one-side drift fails `bun tsgo`. NO new namespace, NO Translation enum, NO `t('...')` calls — pure property-access additions alongside neighbors.
4. **Parity pins:** `shared/locale/errors-namespace.parity.test.ts` extended with a dedicated `APPLICANT_LIFECYCLE_KEYS` pinned inventory (`applicantNotFound`, `applicantCooldownActive`, `applicantStatusCorrupt`, `applicantAlreadyCertified`) + a describe block mirroring the existing session-report pattern: exhaustive-key check on every `applicant*` key in the ar map, and `test.each` proving each key resolves non-empty in BOTH maps and exists on the compile-time schema. en/ar are now pinned for the new key.

## Files created/modified

| File | Change |
|---|---|
| `backend/db/repo/teachers/applicant.repository.ts` | + `inArray` drizzle import; + `transitionToInEvaluation` guarded write (JSDoc, enum members, tx/standalone branches) |
| `backend/services/teachers/applicant-lifecycle.service.ts` | + `passed` → `APPLICANT_ALREADY_CERTIFIED` branch after the cooldown arm; module-header + `@throws` docblock updates |
| `shared/locale/types/errors/labels.ts` | + `applicantAlreadyCertified` typed slot + docblock |
| `shared/locale/en/errors/index.ts` | + English copy |
| `shared/locale/ar/errors/index.ts` | + Arabic copy (tone-matched to sibling applicant keys) |
| `shared/locale/errors-namespace.parity.test.ts` | + applicant-lifecycle pinned inventory + parity describe block |
| `backend/db/test/repo/teachers/applicant.repository.transition.test.ts` | NEW — 4-Tier repo suite for the transition (14 tests) |
| `backend/services/teachers/applicant-lifecycle.service.test.ts` | + certified-rejection describe (5 tests, Tiers 1-3) + coverage-map docblock line |

**Files NOT modified (deliberately):** `backend/enum/teachers/applicant-status.enum.ts` (already the canonical vocabulary; value import reused), `backend/db/schema/teachers/applicants.ts` (varchar status by design — no schema change per plan §3.2), `shared/locale/namespaces/errors/*` (defineNamespace handle untouched — no new namespace), `backend/db/repo/index.ts` (barrel already re-exports the teachers repo), shared/constants + seeds (parallel Task 3's files — untouched), all GraphQL/pothos/frontend files (Task 2 adds no surface).

## Verification results

### Sub-loop (per edited file, `--lifecycle duplicates`) — 8/8 exit 0

| File | Result |
|---|---|
| `backend/db/repo/teachers/applicant.repository.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `backend/services/teachers/applicant-lifecycle.service.ts` | exit 0 — all five stages ✅ |
| `shared/locale/types/errors/labels.ts` | exit 0 — all five stages ✅ |
| `shared/locale/en/errors/index.ts` | exit 0 — all five stages ✅ |
| `shared/locale/ar/errors/index.ts` | exit 0 — all five stages ✅ |
| `shared/locale/errors-namespace.parity.test.ts` | exit 0 — all five stages ✅ |
| `backend/db/test/repo/teachers/applicant.repository.transition.test.ts` | exit 0 — all five stages ✅ |
| `backend/services/teachers/applicant-lifecycle.service.test.ts` | exit 0 — all five stages ✅ |

### tsgo final count

`bun tsgo` → **0 errors** (exit 0; baseline 0 preserved).

### Test runs (exact commands + counts)

| Command | Result |
|---|---|
| `bun run test/scripts/run-test.ts backend/db/test/repo/teachers/applicant.repository.transition.test.ts` | **14 pass / 0 fail** (43 expects) — new suite |
| `bun run test/scripts/run-test.ts backend/services/teachers/applicant-lifecycle.service.test.ts` | **30 pass / 0 fail** (202 expects) — 25 pre-existing (incl. cooldown strict-`>` EXACTLY-now boundary, all still green) + 5 new certified-rejection cases |
| `bun run test/scripts/run-test.ts shared/locale/errors-namespace.parity.test.ts` | **26 pass / 0 fail** (230 expects) — incl. the 5 new applicant pin cases |

### 2.TE tier coverage (new repo suite)

- **Tier 1:** pending → flips + returns the FULL `ApplicantSelectType` row (exact 7-key shape pinned); failed → flips; in_evaluation → null + status unchanged; passed → null + status unchanged; nonexistent id → null.
- **Tier 2:** `updated_at` stamped strictly forward (fixture seeded 60s in the past → returned stamp later — deterministic against `now()`-is-tx-start semantics); unicode-name applicants (RTL Arabic + CJK + emoji) transition cleanly and their `users.fullName` round-trips untouched; attempt audit trail (`verification_attempts`, `last_attempt_at`) survives the flip unclobbered.
- **Tier 3:** repeat transition inside ONE tx = zero-row no-op; two concurrent transitions from pending on INDEPENDENT committed-fixture transactions via `Promise.allSettled` — exactly one writer flips, the loser matches zero rows (guarded-UPDATE row lock + `EvalPlanQual` recheck), final committed state consistent (`in_evaluation`); real-Postgres gated (`isPgliteProvider` skip, committed fixtures + tracked `afterAll` hard-delete per `teacher.repository.test.ts` convention).
- **Tier 4 (static):** guarded single UPDATE with state folded into WHERE and no `.select(` in the function slice (no read-then-write); enum members only (no `'pending'/'failed'/'in_evaluation'` literals); no `.prepare(`; no i18n/logger/console; no plan-artifact references.

### Service-side tier coverage (new describe)

- Tier 1: passed → `ValidationError` + code + byte-equal `getServerTranslations("en").errorsTranslations.applicantAlreadyCertified` + exactly one `logDomainError` with canonical `{code, entity, entityId, locale}` context; in_evaluation still resolves silently (only `passed` is terminal) with ZERO log calls.
- Tier 2 (boundary): passed + ACTIVE cooldown → the cooldown arm wins (`APPLICANT_COOLDOWN_ACTIVE`) — pins the mandated branch order; unicode-named certified applicant → ar/en denials resolve distinctly, byte-equal per locale, zero identity leakage.
- Tier 3: 12 parallel certified denials via `Promise.allSettled` are deterministic (one shared byte-identical message).
- Existing cooldown cases (incl. the strict-`>` EXACTLY-now boundary) remain green — no regression.

## 2.SEC — Security review conclusion

**The guarded UPDATE folds the lifecycle pre-state into the WHERE predicate — there is no SELECT-then-UPDATE window anywhere in `transitionToInEvaluation`** (pinned by the Tier-4 static test: `.select(` absent from the function slice). Zero-row results are returned as `null` and handled at both call tiers (repo tests for in_evaluation/passed/absent; service flow treats it as the documented silent no-op). No new read surfaces, no new predicates on any listing, no parameter changes: the write is parameterized (id + status members as bound values), and the `inArray` use is a plain static array — the prohibited pattern (`sql.placeholder` prepared statements) is absent. No permission logic was added at the repo tier (repo AGENTS separation preserved); the authorization decisions remain in the service guard. The new service rejection discloses nothing but the generic localized copy (unicode-identity leak probe included in tests).

## 2.SR — Semantic review checklist

- **No module state:** the repo function holds no module-level mutable state (a function-local const set fragment, same as siblings); the service change adds no state.
- **No env-config additions:** none.
- **Enums as value imports:** `ApplicantStatus` remains a VALUE import in both edited backend files (verified; runtime comparisons `row.status === ApplicantStatus.Passed` and `inArray` members use the enum object); locale/test files import values (`errorsEn`/`errorsAr`) per existing convention.
- **No dead branches:** every new branch is reachable and covered (in_evaluation-allow, cooldown-wins-over-certified, certified-deny all asserted); no unreachable code introduced.
- **No plan-artifact references in code:** verified — comments describe domain behavior only (Tier-4 static pin enforces it on the repo file).
- **No cross-layer violations:** repo imports only schema/enum/types/drizzle; service uses the one-arg `getServerTranslations(locale)` + property access; locale files use `@/shared/locale/...` aliases only.
- **No `console.*`, no `oxlint-disable`:** none.

## 2.IV — Instruction verification

Rule files printed by sub-loop.ts and read before/while validating: root `AGENTS.md`, `backend/AGENTS.md`, `backend/db/repo/AGENTS.md`, `backend/services/AGENTS.md`, `backend/db/test/AGENTS.md`, `shared/AGENTS.md`, `shared/locale/AGENTS.md`, `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`. Validation per layer:

- **Repo file:** single-statement guarded UPDATE with state/ownership folded into WHERE + RETURNING, zero-row as miss signal — exactly the `backend/db/repo/AGENTS.md` "Guarded transition writes" rule; data-access only (no business logic, no localized strings); types from `@/backend/types`; optional-tx fallback + no prepared statements per file conventions; namespace-per-file preserved (append-only).
- **Service file:** business logic stays in the service tier; all user-facing strings via one-arg `getServerTranslations` + property access; `logDomainError` exactly-once at the throw site with entity/entityId/locale context; docblocks kept truthful; no service-layer types file.
- **Locale files:** compile-time system only (typed `ErrorsLabels` const, no next-intl, no new namespace); ar/en/types updated together; parity test extended (REQ-0.5 #6 honored); `@/shared/locale/...` alias discipline.
- **Test files:** `runInRollback` + `tx` to every call; entity-setup helpers only (no seed queries); no `rejects.toThrow` (return-null contract needs no error probing; service denials via `expectRepoError`); committed fixtures only where the concurrency tier requires them, with tracked `afterAll` hard-deletes; PGlite gating for the cross-connection lock test; no `any`; bun:test imports only; `getServerTranslations` direct use is confined to the service suite (per its established self-contained convention; the DB-repo suite uses none).

## Carry-forward knowledge for future tasks

- **Task 5 (VerificationPurchaseService) wiring contract:** `transitionToInEvaluation(applicantUserId, tx)` is the step-7h write; it returns the updated row or `null` — `null` for already-`in_evaluation` is the SILENT NO-OP path, do NOT map it to an error. The `passed` case never reaches the repo (the hardened guard rejects it with `APPLICANT_ALREADY_CERTIFIED` at step-7b, before any write).
- **Branch order is pinned by tests:** inside `assertCanPurchaseVerification` the cooldown arm precedes the certified arm — a passed applicant with an active cooldown gets `APPLICANT_COOLDOWN_ACTIVE`. Reordering requires updating the pinned service test.
- **The transition does NOT touch `verification_attempts`/`last_attempt_at`** (audit trail preserved — pinned by test); attempt accounting stays exclusively with `recordVerificationAttempt` (step 7g from `failed` only).
- **`updated_at` semantics:** the write stamps `sql\`now()\`` (tx-start time). Inside one transaction the value equals other same-tx `now()` stamps; to assert change deterministically, seed the fixture with an older explicit `updatedAt` (the new repo suite shows the pattern).
- **Environment:** D6 carry-forward honored — `kottaby_db` already carries the migration journal + immutability triggers (Task 1); no DB repairs were needed here.
- **Parallel-task hygiene:** Task 3's files (shared/constants, seeds, their tests) were untouched; the process-lock queue serialized concurrent sub-loops cleanly (no friction).

## Cross-file dependencies discovered

- `shared/locale/types/errors/labels.ts` → `shared/locale/en/errors/index.ts` + `shared/locale/ar/errors/index.ts` + `errors-namespace.parity.test.ts` must move together (compile-time typing + pinned inventory enforce it) — consumed by Task 5's service via `t.errorsTranslations.applicantAlreadyCertified` and by Task 4's journey assertions.
- `ApplicantRepository.transitionToInEvaluation` is repo-tier only; Task 5 must call it through the `@/backend/db/repo` barrel inside its purchase transaction (step 7h) — no new exports/barrel edits were needed.
- None outstanding: no other file requires changes for Task 2's scope.
