# Plan Review Report — DEV2-005 Verification Plan Purchase (5 Sessions)

## Review Round: 1
## Date: 2026-09-11
## Subagents Dispatched: paths+symbols existence | conventions+architecture compliance | cross-reference consistency

---

## Summary

- **Total issues found:** 10
- **Blocking (HIGH):** 2
- **Medium:** 3
- **Low/Notes:** 5
- **Verdict before fixes:** FAIL (2 blocking) → **after fixes: PASS**

---

## Findings by Dimension

| Dimension | Subagent | Issues | Status |
|---|---|---|---|
| Path existence | verify-paths-exist | H1, H2, M1, L1, L2 (~60 citations; all others VERIFIED) | ✅ Fixed |
| Conventions/AGENTS compliance | verify-conventions | L1-L4 (plan correct; root AGENTS.md itself stale in 2 bullets) | ✅ Fixed/Noted |
| Cross-reference consistency | verify-cross-ref | M1-M3, L1-L4 | ✅ Fixed |

## Detailed Findings (blocking & mediums)

1. **[HIGH] specs.md header** — `ai/finished_plans/sprint_1/` sibling dirs referenced with ticket-id prefixes; real dirs carry none. **Fix applied:** corrected to `teacher-applicant-registration-applicant/` + `subscription-purchase-payment-gateway/` (re-verified live).
2. **[HIGH] plan.md §4.3** — `isPositiveSafeId` / `isCarryableIdempotencyKey` are module-private (`subscription-purchase.service.ts:109,120`) — the new service could not import them, and copies would trip the duplicates gate. **Fix applied:** mandatory promotion to new `backend/services/billing/purchase-guards.helpers.ts` added to plan.md §4.3 + tasks.md Task 5; `withTransaction` import pinned to `@/backend/lib/db/with-transaction` (`with-transaction.ts:27`).
3. **[MED] tasks.md 5.TE** — `expectDomainDenial` named as if shared; it is suite-local (pattern source: `subscription-purchase.service.test.ts`; unrelated same-named local at `test/workflows/sessions/recitation-record.journey.test.ts:161`). **Fix applied:** wording now mandates a suite-local helper and names the real source.
4. **[MED] plan.md D1** — deferred-items back-reference said D4; the payment-failed posture is D1. **Fix applied.**
5. **[MED] deferred-items D3 notes** — claimed specs §4 documented the student-catalog exposure; it did not. **Fix applied:** specs §4 Out-of-Scope now carries the explicit bullet.
6. **[MED] specs §12** — seeded-ledger text didn't enumerate ledger ids and listed a phantom "generated-doc drift" item (that work is Task 13, not deferred). **Fix applied:** §12 now names D1–D5; Task 13 relationship clarified.

## Low findings fixed

- Activation edit window pinned `:381-408` (task 6) and register/login pattern range corrected to `applicant-profile.test.ts:109-190` (plan §9, task 7).
- `mutation/index.ts` header-docblock narration line added to Task 7 (keeps the flat-barrel header truthful).
- tasks.md traceability matrix + per-task `_Requirements_` mutually aligned (REQ-0.5/REQ-1/REQ-8.1/REQ-8.3/REQ-9/REQ-5 rows).
- `purchasePlanLine` placeholder order unified to specs REQ-7.2 `(title, price, currency, sessions, days)` in plan §8.
- `outcome/` directory created with this file (was expected-pending).

## Doc-drift noted (NOT edited — rule files are hand-curated)

- Root `AGENTS.md` i18n bullet prescribes two-arg `getTranslations(locale, "namespace")`; live code is one-arg (`shared/locale/server.ts:15`, `server-graphql.ts:3`).
- Root `AGENTS.md` logger bullet points at nonexistent `@/frontend/utils/logger`; real path `@/frontend/lib/logger`.
Both recorded as **deferred-items D5** for the maintainers' doc pass. All plan content already matches the REAL APIs.

## Post-Fix Verification

- [x] Stale references resolved (grep re-run on all three artifacts)
- [x] Traceability: every `REQ-` id in specs.md appears in tasks.md (0 misses)
- [x] Anti-pattern sweep clean (no `Translation.` enum, no two-arg `getTranslations`, no `@/frontend/utils/logger`, no raw `bun test` on workflows, no bottom-nav additions)
- [x] Ticket ACs fully mapped (REQ-1..9), incl. the 4 ticket test scenarios

**Final verdict: the plan passes the AGENTS.md + layer rules for every layer it touches.**

## Lessons for Future Plans

- Cite sibling-plan directories by their live names only — the `ai/finished_plans/` tree is being actively renamed during Sprint-1 housekeeping; re-verify at generation time.
- Never plan an import of a private helper from a finished ticket's service — check export status, and prefer promoting to a shared `*.helpers.ts` module (duplicates gate makes copies expensive).
