# Task 2 — Applicant transition write + guard hardening — Outcome

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`
**Environment**: sandbox, `DB_PROVIDER=pglite` (in-process PG, data dir `./db/pglite`)

## Summary

The applicant lifecycle now owns both halves of the purchase-time status contract:

1. **`ApplicantRepository.transitionToInEvaluation(userId, tx?)`** — a guarded
   single-statement UPDATE (`SET status='in_evaluation', updated_at=now()`
   `WHERE id = :userId AND status IN ('pending','failed') RETURNING *`). The
   enterable prior states are folded into the WHERE predicate (never
   SELECT-then-UPDATE); a zero-row miss returns `null` (already
   `in_evaluation` under a concurrent/repeat caller, `passed` — rejected
   upstream, or no row — the service tier disambiguates). `updated_at` is
   stamped DB-side; the attempt ledger (`verification_attempts`,
   `last_attempt_at`) and `cooldown_until` are deliberately untouched.
2. **Guard hardening in `ApplicantLifecycleService.assertCanPurchaseVerification`**
   — after the existing cooldown branch, a `passed` applicant is now rejected
   with `logger.logDomainError(...)` + `throw new ValidationError("APPLICANT_ALREADY_CERTIFIED", t.applicantAlreadyCertified)`,
   mirroring the cooldown guard's exact pattern (message/log-then-throw,
   canonical `{code, entity: "applicants", entityId, locale}` log context).
   Certification is terminal: the denial fires regardless of cooldown
   timestamps.
3. **i18n** — new flat `errors.applicantAlreadyCertified` key (en + ar +
   `ErrorsLabels` type) with a pin in the `errors`-namespace parity suite
   (the route-source discovery cannot see service-tier consumers, so the key
   is pinned explicitly like the session-report keys).

## Files modified

| File | Change |
|---|---|
| `backend/db/repo/teachers/applicant.repository.ts` | Added `transitionToInEvaluation` (guarded write cluster, next to `recordVerificationAttempt`); import gained `inArray` from drizzle-orm. Nothing else. |
| `backend/services/teachers/applicant-lifecycle.service.ts` | New `ApplicantStatus.Passed` rejection branch inside `assertCanPurchaseVerification` (after the cooldown branch); header responsibility list + logging enumeration + `@throws` docblock updated to name the new denial. `ApplicantStatus` was ALREADY a value import — no import change. |
| `shared/locale/types/errors/labels.ts` | `applicantAlreadyCertified: string` on `ErrorsLabels` (flat top-level slot, JSDoc documents the no-placeholder rule). |
| `shared/locale/en/errors/index.ts` | "You have already been certified as a teacher. Verification cannot be repeated." |
| `shared/locale/ar/errors/index.ts` | "لقد تم اعتمادك كمعلم قرآن بالفعل، ولا يمكن إعادة عملية التحقق." |
| `shared/locale/errors-namespace.parity.test.ts` | New pin block `applicant purchase denial key — flat domain addition on BOTH locales` (the `ErrorMessageKey` annotation inside the test is the compile-time flatness proof). |
| `backend/db/test/repo/teachers/applicant.repository.transition.test.ts` | NEW — Tier 1-4 repo suite (see 2.TE below). |
| `backend/services/teachers/applicant-lifecycle.service.test.ts` | APPENDED `assertCanPurchaseVerification — certified rejection (passed)` describe (7 tests) + coverage-map line + one shared unicode fixture constant. |
| `ai/plans/.../tasks.md` | Task 2 checkbox lifecycle. |

## Files NOT modified (and why)

- `backend/db/repo/teachers/index.ts` (and the top-level `backend/db/repo/index.ts`)
  barrel — `applicant.repository.ts` is ALREADY re-exported
  (`export * from "./applicant.repository"`), so `transitionToInEvaluation` is
  reachable via `ApplicantRepository` from `@/backend/db/repo` with zero
  barrel edits. Verified, not assumed.
- `backend/enum/teachers/applicant-status.enum.ts` — the canonical members
  (`Pending`/`InEvaluation`/`Failed`/`Passed`) already cover the transition.
- `getMyApplicantProfile` — untouched; its `canPurchaseVerification`
  computation (`!cooldownActive && status !== Passed`) already agrees with the
  hardened guard, and DEV2-004's profile tests pin that shape.
- Tasks 1 and 3 landed their own files in the shared working tree
  (`student-payments*`, `verification-plan.constants*`, `seed-plans.ts`);
  this task did not touch them. `git diff --name-only` for Task 2 = exactly
  the table above.

## Verification results

| Check | Result |
|---|---|
| 2.QL sub-loop `--lifecycle duplicates` — `applicant.repository.ts` | **exit 0** |
| 2.QL — `applicant-lifecycle.service.ts` | **exit 0** |
| 2.QL — `labels.ts` / `en/errors/index.ts` / `ar/errors/index.ts` | **exit 0** ×3 |
| 2.QL — `errors-namespace.parity.test.ts` | **exit 0** (after one fix, see below) |
| 2.QL — `applicant.repository.transition.test.ts` (new) | **exit 0** (after one fix, see below) |
| 2.QL — `applicant-lifecycle.service.test.ts` | **exit 0** |
| `bun tsgo` (project-wide) | **0 errors** |
| `bun biome:check` | **0 warnings** |
| 2.TE repo test | `bun run test/scripts/run-test.ts backend/db/test/repo/teachers/applicant.repository.transition.test.ts` → **13 pass / 0 fail** (69 expect calls) |
| 2.TE service test (whole file) | `bun run test/scripts/run-test.ts backend/services/teachers/applicant-lifecycle.service.test.ts` → **31 pass / 0 fail** (218 expect calls) = 24 pre-existing (cooldown/missing-row/reapplication/profile suites all green) + 7 new certified-guard tests |
| Parity suite | **22 pass / 0 fail** (21 pre-existing + 1 new pin) |

Sub-loop printed rule files read in full and honored: root `AGENTS.md`,
`backend/AGENTS.md`, `backend/db/repo/AGENTS.md`, `backend/services/AGENTS.md`,
`backend/db/test/AGENTS.md`, `shared/AGENTS.md`, `shared/locale/AGENTS.md`,
`.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`.

### Fixes made during the pipeline (honest record)

1. **Repo test tsgo**: `readApplicantRow` returns the raw `$inferSelect` row
   whose `status` is `string | null` (varchar default without NOT NULL); the
   `expectFlippedRow` helper parameter was widened to
   `{ id: number; status: string | null } | null`.
2. **Parity test lint**: the first draft asserted
   `expect(key).toBe("applicantAlreadyCertified")` on a literal-typed const —
   `sonarjs/no-trivial-assertions` (lint:type-aware) rejected it; the
   compile-time flatness proof now lives solely in the
   `const key: ErrorMessageKey = "applicantAlreadyCertified"` annotation,
   which is what actually fails `tsgo` if the key is ever nested.

## 2.TE — coverage delivered

Repo suite (`transitionToInEvaluation`):
- Tier 1: pending → row returned flipped to `in_evaluation`; failed → flips;
  absent id → `null`, no row created.
- Tier 2: `in_evaluation` and `passed` are zero-row no-ops returning `null`
  with stored state byte-identical (not even `updated_at` touched);
  `updated_at` advances DB-side from a historical seed while
  `verification_attempts` / `last_attempt_at` / `cooldown_until` survive
  untouched.
- Tier 3: 5 parallel transitions on ONE pending row via `Promise.allSettled`
  — exactly one winner, four null losers, zero rejections, attempts stay 0;
  sequential repeat after success is a null no-op; transition composes with
  `recordVerificationAttempt` inside ONE transaction (deadlock-free
  tx-threading proof) and the forced rollback leaves zero durable trace.
- Tier 4: unicode/RTL/emoji full-name fixture (`أحمد عبد الرحمن ﷺ 汉字 🎓`)
  transitions cleanly and round-trips byte-identical; transitioning user A
  leaves user B's row byte-identical; static source pins keep the write
  guarded (state folded into WHERE via `inArray(applicants.status, …)`,
  `.returning()`, no `.select(` in the function slice, no prepared
  statements/logger/i18n/console in the repository file).

Service suite (appended, same `runInRollback` + `expectRepoError` +
`silenceDomainLog` + byte-equal translation patterns as the existing guards):
- Tier 1: `passed` → `ValidationError` with code `APPLICANT_ALREADY_CERTIFIED`,
  message byte-equal to `getServerTranslations("en").errorsTranslations.applicantAlreadyCertified`,
  exactly one `logDomainError` with canonical context, zero writes.
- Tier 2 (boundary timestamps): a `passed` row whose cooldown expires EXACTLY
  now is still certified-denied (pins branch ordering: the certified check
  runs after the cooldown arm, and strict `>` lets the boundary instant
  through to it); an expired cooldown on a `passed` row never resurrects
  eligibility (ar literal); `in_evaluation` with NULL cooldown resolves
  silently — only `passed` is newly rejected.
- Tier 3 (concurrency): 12 parallel guard calls on a `passed` row deny
  deterministically (one byte-identical message), log exactly 12 canonical
  domain errors, and write nothing.
- Tier 4 (unicode): same multi-script name in two fixtures — ar/en denials
  are the byte-equal localized literals, distinct across locales, with zero
  user-derived material in any message.
- All pre-existing cooldown/missing-row/reapplication/profile cases stayed
  green (whole-file run).

## 2.SEC — guarded write + no new read surfaces

- The flip is a single UPDATE with the prior state folded into the WHERE
  predicate — no SELECT-then-UPDATE anywhere in the new code (pinned by a
  static source test asserting the function slice contains no `.select(`).
- Zero-row miss → `null` return (a signal, never an error, never a retry
  loop); the caller decides semantics.
- No new read surfaces: the repository gained one write method; the service
  gained one rejection branch on its existing single `findByUserId` read.
- The denial message is a static localized literal — no user data, no
  cooldown timestamps, no id material enters the client-facing copy
  (unicode leak probe proves it).

## 2.SR — semantic checklist

- No module state (both additions are stateless functions); no env-config
  additions; no new imports beyond `inArray` (drizzle-orm) in the repo.
- `ApplicantStatus` used as a VALUE import at both runtime use sites (service
  branch + repo write); the type-position-only file (`applicant.types.ts`)
  keeps its `import type` — untouched.
- No dead branches; no cross-layer imports; comments/JSDoc describe domain
  behavior only — `rg "REQ-[0-9]|Task 2|tasks\.md|specs\.md|plan\.md|DEV2"`
  over all eight edited files → zero matches.
- `git diff --name-only` (Task 2's share) = exactly: the two backend source
  files, three locale files, parity test, service test, the new repo test,
  plus plan artifacts (tasks.md, this outcome file).

## 2.IV — rule-file compliance highlights

- `backend/db/repo/AGENTS.md` "Guarded transition writes" rule: satisfied
  verbatim (single-statement guarded UPDATE + RETURNING; zero-row = miss
  signal, service disambiguates). `inArray` is used with a plain literal
  array and NO prepared statement — the prohibition only bans
  `inArray` + `sql.placeholder`.
- `backend/services/AGENTS.md`: localized error via `getServerTranslations`
  property access; `logDomainError` fires exactly once per expected domain
  rejection; no logic drift into the repo.
- `backend/db/test/AGENTS.md` + `tests.instructions.md`: `runInRollback`
  everywhere, `tx` passed to every repo/entity call, no
  `expect(...).rejects.toThrow()`, entity-setup factories only (no seed
  data), source-scan pins updated in the same change that touched the source.
- `shared/locale/AGENTS.md`: `@/shared/locale/...` alias discipline; leaf
  modules remain plain string literals (no logic).

## Carry-forward knowledge for future subtasks

1. **Task 5 (`VerificationPurchaseService.purchase`)** — exact signature to
   call inside its atomic transaction:
   `ApplicantRepository.transitionToInEvaluation(applicantUserId: number, tx?: DBTransaction): Promise<ApplicantSelectType | null>`.
   Import via the barrel (`import { ApplicantRepository } from "@/backend/db/repo"`).
   Step-order per plan §4.3: run the hardened
   `ApplicantLifecycleService.assertCanPurchaseVerification(applicantUserId, locale, tx)`
   BEFORE any write, call `recordReapplication` only when the applicant row
   read inside the tx reports `ApplicantStatus.Failed`, then call
   `transitionToInEvaluation(applicantUserId, tx)` LAST among the applicant
   writes — a `null` return there means "already `in_evaluation`" (silent
   no-op; the guard has already rejected `passed` upstream), never an error.
2. **`APPLICANT_ALREADY_CERTIFIED` guard contract** — Task 5's
   `passed → APPLICANT_ALREADY_CERTIFIED` test case needs NO new service
   code: `assertCanPurchaseVerification` now rejects `passed` with the
   translated literal from `errorsTranslations.applicantAlreadyCertified`
   (no placeholders — byte-equal assertions are safe in any tier) and logs
   once with `{ code, entity: "applicants", entityId, locale }`. The denial
   fires AFTER the cooldown branch, so a `passed` row with any cooldown
   state still surfaces the certified code, never `APPLICANT_COOLDOWN_ACTIVE`.
3. **Guard ordering caveat for Task 4's journey test (Applicant B/C)** —
   fixture rows for the cooldown cases must use `failed` status (not
   `passed`), since certification now outranks cooldown math.
4. **`applicants.status` select type is `string | null`** — any Task 5/6
   code comparing the raw row's status against an enum member must not
   assume non-null (the lifecycle service validates with `isApplicantStatus`
   before interpreting; repo-level callers get the raw varchar).
5. **Parity-pin pattern** — new flat `errors` keys consumed only by services
   are pinned in `shared/locale/errors-namespace.parity.test.ts` via an
   annotated `ErrorMessageKey` const (compile-time flatness proof); avoid
   re-asserting a literal against itself (sonarjs/no-trivial-assertions).

## Cross-file dependencies

- `ApplicantRepository.transitionToInEvaluation` ← Task 5's
  `verification-purchase.service.ts` (step 7h) and Task 4's journey test
  (step 2/5 observables).
- `assertCanPurchaseVerification` hardened branch ← Task 5's
  `passed → APPLICANT_ALREADY_CERTIFIED` service test case and Task 4's
  "purchase after passed" denial probe.
- `errors.applicantAlreadyCertified` (en/ar/types/parity pin) ← the guard's
  message; if the copy ever changes, only `shared/locale/{en,ar}/errors/index.ts`
  change together (tests assert via `getServerTranslations`, so they stay
  green).
- `backend/db/repo/teachers/index.ts` barrel already exports the repository —
  no barrel wiring needed by Task 5.

## Deferred items

None added — no out-of-scope discoveries this task (ledger D1–D6 unchanged).
