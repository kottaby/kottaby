# Midpoint Backend Review Report — Round 1 (Task 8 review gate)

**Plan:** DEV2-005 — Verification Plan Purchase (5 Sessions)
**Branch:** `feat/verification-plan-purchase-5-sessions`
**Date:** 2026-09-14
**Gate:** Task 8 — mid-point backend review wave + fixes (after Tasks 1–7, before Tasks 9–10)

---

## Review Wave

Three parallel review subagents dispatched over the tasks 1–7 surface:

| Subagent | Scope |
|---|---|
| review-backend | DB schema/repo/service/graphql layers (verification purchase flow, activation, admin finance surface) |
| review-types | shared/backend type surface, locale type contracts, generated types |
| error/i18n spot-check | error codes, locale parity suites, transport copy |

---

## Summary

- **Total findings:** 13
- **Blocking (HIGH):** 1 → FIXED
- **Medium:** 2 → DEFERRED (D9 new; D7 pre-tracked)
- **Low/Info:** 10 → 1 FIXED, 9 accepted as posture/pre-existing idiom
- **Verdict before fixes:** FAIL (1 blocking) → **after fixes: PASS — zero blocking findings remaining**

---

## Findings Table

| # | Severity | Finding | File | Disposition |
|---|---|---|---|---|
| 1 | HIGH | `countForAdminAudit` counted directly off `student_payments` (students joined only when `studentNameSearch` is set) while `listForAdminAudit` always INNER-JOINs `students` → after the `studentId`-nullable schema change a NULL-owner verification payment was counted but could never be listed (phantom totals on the admin financial-audit surface) | `backend/db/repo/billing/student-payment.repository.ts` | **FIXED** — count now applies the same unconditional students→users INNER JOIN as the listing (both executor branches); count == listed row-set for ALL inputs; owner-bearing counts byte-identical (1:1 PK join); surface deliberately NOT switched to LEFT JOIN (see D8) |
| 2 | MEDIUM | In-tx plan re-validation asymmetry: the verification purchase re-validates only the active re-read (plan §4.3 step 7a); the sibling student flow additionally re-compares price/currency vs the minted checkout and gates interval/session ceilings. Mismatch posture is fail-safe (settlement quarantine) | `backend/services/teachers/verification-purchase.service.ts` | **DEFERRED (D9)** — plan-conformant as shipped; sibling gates reuse recorded as defense-in-depth follow-up (future catalog-integrity ticket) |
| 3 | MEDIUM | Journey step-7 expectation reconciliation (foreign-replay probe actor/error vs in-tx gate ordering) | `backend/db/test/workflows/teachers/verification-plan-purchase.journey.test.ts` | **DEFERRED (D7)** — already tracked in the ledger since Task 6; to be reconciled at the Task 10 journey-green gate |
| 4 | LOW | FK-arm unimplemented for NULL-owner payments (sibling parity arm; unreachable on the current schema) | backend repo layer | **ACCEPTED-POSTURE** — sibling-parity arm is unreachable; no code change |
| 5 | LOW | Certification-vs-purchase race window | `backend/services/teachers/` | **ACCEPTED-POSTURE** — accepted posture per plan §5.4 |
| 6 | LOW | Parallel id-guard families (duplicated guard shapes across the two purchase flows) | purchase guards / services | **ACCEPTED-POSTURE** — future cleanup candidate; no ledger row mandated, no code change in scope |
| 7 | LOW | Raw-branch guard bypass (dual raw/Drizzle branch surface) | `backend/db/repo/billing/student-payment.repository.ts` | **PRE-EXISTING-IDIOM** — the documented dual-branch bare-read posture (repo AGENTS.md), unchanged |
| 8 | LOW | `ErrorsTranslations` alias duplicate | `shared/locale/` | **PRE-EXISTING-IDIOM** — established pattern on the locale surface |
| 9 | LOW | Abort-detail double-duty (detail field doubles as log fidelity carrier) | backend service layer | **ACCEPTED-POSTURE** — log fidelity only; no functional impact |
| 10 | LOW | `UnauthorizedError` English-only copy | `backend/graphql/mutation/` | **PRE-EXISTING-IDIOM** — pre-existing sibling idiom (wallet query narrowing guard), not this plan's surface |
| 11 | LOW | `entityId = planTitle` typing on the checkout payload | backend types | **ACCEPTED-POSTURE** — type-legal and documented |
| 12 | LOW | Missing absolute zero-ICU-placeholder pin on `applicantAlreadyCertified` | `shared/locale/errors-namespace.parity.test.ts` | **FIXED** — `icuPlaceholdersOf(...)` helper added (mirroring the applicant-namespace suite idiom) + `toEqual([])` pin for BOTH locales |
| 13 | INFO | ar vocabulary harmony across the new denial copy | `shared/locale/ar/` | **ACCEPTED-POSTURE (noted)** — terminology consistent; no action |

---

## Fixes Applied (exact edits)

1. `backend/db/repo/billing/student-payment.repository.ts` — `countForAdminAudit`: the conditional `needsJoin` join (name-search-only) replaced by the UNCONDITIONAL students→users INNER JOIN in BOTH executor branches (Drizzle tx branch + raw `queryDb` branch), mirroring `listForAdminAudit`'s join semantics exactly; docblock updated to state the mirrored join contract. No other behavior change; LEFT JOIN deliberately NOT introduced (admin visibility of NULL-owner payments is a deliberate future surface change — ledger D8).
2. `backend/db/test/repo/billing/student-payment.repository.admin.test.ts` — new NULL-owner coverage: `createNullOwnerPayment` fixture helper (the logic suite's `createNullOwnerPaymentPair` pattern); tx-branch tests proving count == listed length with a NULL-owner row present, with and without `studentNameSearch`; raw-branch committed NULL-owner fixture (+ tracked subscription/plan/user cleanup in `afterAll` per the file's committed-fixture conventions) proving raw-branch count/list parity and the empty-page-on-both-surfaces name-search case; coverage map updated.
3. `shared/locale/errors-namespace.parity.test.ts` — local `icuPlaceholdersOf` parsing helper (mirrored from the applicant-namespace suite idiom) + the `applicantAlreadyCertified` zero-placeholder pin asserted for BOTH locales inside the applicant-lifecycle pin block.

---

## Post-Fix Verification

| Check | Result |
|---|---|
| `bun run test/scripts/run-test.ts backend/db/test/repo/billing/student-payment.repository.admin.test.ts` | **19 pass / 0 fail** (60 expect() calls) — incl. the 5 new NULL-owner parity tests |
| `bun run test/scripts/run-test.ts shared/locale/errors-namespace.parity.test.ts` | **27 pass / 0 fail** (232 expect() calls) — incl. the new zero-placeholder pin |
| Regression: `backend/db/test/logic/billing/student-payment.repository.test.ts` (NULL-owner logic suite) | **10 pass / 0 fail** (75 expect() calls) |
| sub-loop `--lifecycle duplicates` on `backend/db/repo/billing/student-payment.repository.ts` | exit **0** |
| sub-loop `--lifecycle duplicates` on `backend/db/test/repo/billing/student-payment.repository.admin.test.ts` | exit **0** |
| sub-loop `--lifecycle duplicates` on `shared/locale/errors-namespace.parity.test.ts` | exit **0** |
| `bun tsgo` (project-wide) | exit **0** — **0 errors** |

---

## Re-Review Scope Statement

- The fixes are repo-local: one repository function (join semantics of the admin-audit count), its admin test suite extension, and one locale parity pin. No behavior change beyond the count-branch fix; no surface switched to LEFT JOIN; no other file touched.
- Re-review of the fixed surface found **no further blocking findings**.
- **Backend review verdict: zero blocking findings remaining** — the Task 8 gate passes and the plan proceeds to Tasks 9–10.
- Deferred work recorded in the ledger: **D8** (admin-audit visibility for NULL-owner payments — deliberate future LEFT-JOIN surface change) and **D9** (verification purchase in-tx plan re-validation depth — defense-in-depth reuse of the sibling flow's checkout-comparison gates); D7 remains tracked for the Task 10 journey-green gate.
