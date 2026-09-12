# Plan Review Report — Subscription Validity Window & Expiry

## Review Round: 1
## Date: 2026-09-12
## Subagents Dispatched: none (single inline reviewer; all verifications performed against the live tree with grep/read)

---

## Summary

- **Total issues found:** 6
- **Blocking (CRITICAL/HIGH):** 2 (F1 — D7/REQ-061 falsified frontend-fallback mechanism; F2 — wrong index citation in REQ-022)
- **Medium:** 3 (F3 — REQ-023(a)/O1 guard divergence on `pending`; F4 — 8.1 deferred-gate self-contradiction vs D2's sanctioned ❌; F5 — D1/D3 ledger statuses now stale after gate ratification)
- **Low/Notes:** 1 (F6 — research-04 §4 contains the falsified fallback claim; left intact as a research record, superseded by plan.md D7)

**Verdict: PASS (after fixes applied in this round).** Plan passes all AGENTS.md rules for affected layers. Decisions D1–D7 ratified; ledger D1/D3 closed by this review.

---

## Findings by Dimension

| Dimension | Subagent | Issues Found | Status |
|---|---|---|---|
| Paths Existence | inline | 1 (F2) | ✅ Fixed |
| i18n Compliance | inline | 0 (3-file key recipe + parity test verified real) | ✅ Clean |
| GraphQL Accuracy | inline | 0 (schema enum `Expired` at `schema.graphql:1166-1172`, `StudentSubscription` at `:1117-1151`, `mySubscriptions` at `:921` — all exact) | ✅ Clean |
| Component Props / Frontend surface | inline | 1 (F1: claimed VALIDATION fallback does not cover custom domain codes; no wired `createSession` consumer exists) | ✅ Fixed |
| Permissions/Enums | inline | 0 (`subscription_status` pgEnum ↔ `SubscriptionStatus` enum ↔ SDL aligned; `UserRole` 4 members; `SubscriptionCreditLane` 3 members incl. `reviews`; `HeldBalanceLane` 3 members) | ✅ Clean |
| Existing Components / Precedents | inline | 0 (sweep-sessions route, `sweepExpiredSessions`, `debitBookingLadder`, `activatePendingOnce`, journey helpers — all verified line-accurate) | ✅ Clean |
| Architecture Compliance | inline | 0 (types in `backend/types`, guarded-statement doctrine, no audit-logs writer, no new GraphQL surface, logger from `@/backend/lib/logger`) | ✅ Clean |
| Cross-Reference Consistency | inline | 4 (F3/F4/F5 + REQ↔task traceability sweep — clean after fixes) | ✅ Fixed |

---

## Citation Verification Record (load-bearing anchors re-verified against the tree)

All passed after my specs fix; drift noted where relevant.

- `backend/services/billing/subscription-activation.service.ts` — `MS_PER_DAY = 86_400_000` at `:96`; `endDate = start + intervalDays * MS_PER_DAY` at `:368` (cited `:360-372`) ✅
- `backend/db/schema/enums.ts:47-53` (`subscription_status` pgEnum incl. `expired`) ✅; `backend/enum/billing/subscription-status.enum.ts:6-12` ✅
- `backend/db/schema/billing/subscriptions.ts` — pgTable at `:28`, `startDate`/`endDate` at `:39-40`, indexes at `:51-55` (partial `.where(sql...)` idiom at `:53-55`) ✅
- `backend/db/schema/billing/plans.ts` — `intervalDays` at `:28`, CHECK `> 0` at `:41` ✅
- `backend/db/schema/students/students.ts` — lanes at `:24-27`, CHECKs at `:42-45` (cited `:24-45`, `:42-44`) ✅
- `backend/db/schema/audit/audit-logs.ts:30-47` — `actorId` NOT NULL ✅
- `backend/db/repo/billing/subscription.repository.ts` — `activatePendingOnce` at `:131-149`; zero `expireDueActive`/`hasUncoveredExpiredLane` today ✅
- `backend/db/repo/students/student.repository.credit-lane.helpers.ts:108` (`creditLaneBalance`) ✅; `decrementLaneIfAvailable` at `student.repository.ts:478-493` ✅
- `backend/services/classes/session-lifecycle.booking.ts` — `debitBookingLadder` at `:95`, trial debit `:101`, intent debit `:105-106`, `logDomainError` `:108`, `throw ValidationError("INSUFFICIENT_BALANCE", t.insufficientBalance)` at `:113`; `bookSessionInTx` at `:192` ✅
- `backend/services/classes/session-lifecycle.service.ts` — `sweepExpiredSessions` at `:776`, `now` captured at `:781`, `getServerTranslations(locale).errorsTranslations` at `:203` ✅
- `app/api/cron/sweep-sessions/route.ts` — `bearerSecretMatches` at `:66`, mode gates `getEnv` at `:83-84`, bare 404 at `:86`, `locale = "en"` at `:79` ✅
- `backend/lib/gateway/route-inventory.ts` — `ROUTE_INVENTORY` at `:54`, sweep-sessions entry `classification: "envelope"` at `:61`; `route-inventory.test.ts` + `static-assertions.test.ts` exist ✅
- `backend/lib/errors/error-code-taxonomy.ts:47` (`VALIDATION: 422`) ✅; custom domain codes normalize to `null` (`:53-58`, `:101-113`)
- `backend/lib/errors.ts:65` — `ValidationError(code, message)` overload ✅
- Locale 3-file recipe — `shared/locale/types/errors/labels.ts:174`, `en/errors/index.ts:85`, `ar/errors/index.ts:84`, parity suite exists ✅
- `frontend/providers/apollo/error-link.map.ts` — aliases at `:58-65` (RATE_LIMIT_EXCEEDED only), `mapValidationRow` at `:242-258` (requires `code === "VALIDATION"`), dispatcher doc table "anything else → null" at `:335-356` ✅ (basis of F1)
- `frontend/views/dashboard/nav/navItems.ts:120` (`/subscriptions` student link) ✅; `app/(dashboard)/[feature]/page.tsx:26-30` (`ComingSoonView` catch-all) ✅
- Test fixtures — `runInRollback` at `backend/db/test/test-utils.ts:34`; `createTestSubscription` expired example at `entity-setup.ts:208-218`; `secondPrecisionMs` at `test/workflows/helpers/second-precision.ts:21`; journey precedent `subscription-purchase.journey.test.ts:142` (publishReceipts spy) and `:539` (window assertion); `expectSingleDenial` local at `:248`; `sweep-sessions-route.test.ts:66-74` env gymnastics ✅
- Workflow helpers — `provisionStudentActor` (`actor-context.ts:88`), `TrackedFixtures`, `journeyPrefix` (`session-cast.ts:314`), `catchJourneyError` (`journey-fixtures.ts:226`) ✅
- Verified-absent (correctly cited as missing/stale): `scripts/cron-worker.ts` (stale `package.json:63` entry), `backend/services/cron/`, `vercel.json`, `env-config-keys.ts`, `backend/lib/cron-auth.ts`, `backend/lib/auth/require-permission.ts`, `app/(dashboard)/shared/withPageAuth.ts`; real page-guard = `frontend/lib/auth/withPageAuth.ts` ✅
- Docs anchors — `docs/planning/TICKETS.md:540-581` (this ticket), `:579` decision refs, `:583-631` sibling, `:606-609` cancel-preserves-balance; `docs/specs/state-machine-invariants.md:124-135` (A.9), `:147` INV-B3; `docs/billing/subscription-purchase.md:359-362` assigns window-end zeroing to this job ✅
- `package.json` scripts referenced (`bun run db` push path, `test/scripts/run-test.ts`, `sub-loop.ts`) ✅; `backend/db/test/logic/billing/` exists with AGENTS.md ✅

---

## Detailed Findings

### F1 [HIGH] — D7/REQ-061 claimed a frontend fallback that does not exist

- **Location:** `specs.md` REQ-061; `plan.md` decision table D7 + §6 touchpoint paragraph + §8 "Client" row; `tasks.md` numbering bullet + task 5.2 bullet; `deferred-items.md` D3 row
- **Expected:** truthful mechanism for how the denial surfaces client-side.
- **Actual:** artifacts claimed custom domain codes "fall through to the VALIDATION fallback" and the localized snackbar "renders with zero frontend changes" (citing research-04 §4). Verified against the tree: `mapValidationRow` matches only the literal `VALIDATION` code (`error-link.map.ts:242-258`); `normalizeGraphQLErrorCode` folds only `RATE_LIMIT_EXCEEDED` (`:58-65`); `mapGraphQLErrorByCode` returns `null` for everything else ("anything else → null" documented at the dispatcher, `:335-356`); and `dispatchMappedGraphQLErrorActions` only publishes mapped actions (`frontend/providers/apollo/utils/error-surface.ts`). Separately, `createSessionMutationDocument` (`frontend/graphql/sharedDocuments/scheduling/session-lifecycle.documents.ts:48`) has **zero wired consumers** in `frontend/` (only its document file + `documents.contract.test.ts` — grep-verified), so there is no booking dialog to render into at all.
- **Fix Applied:** re-grounded the zero-frontend ruling on the two verified facts (no wired booking surface; no custom-code map row). REQ-061 rewritten (surfacing deferred to the booking-UI landing, REQUIRED there); plan D7 rewritten (surface-absence justification; research-04 §4 explicitly marked falsified); plan §6 touchpoint + §8 client row corrected; tasks 5.2 now asserts `mapGraphQLErrorByCode("SUBSCRIPTION_EXPIRED", …) → null` and no new consumer as negative evidence; tasks numbering bullet + 1.1 bullet updated; deferred-items D3 rewritten and closed ✅ (this review) with the MUST-arm-at-landing obligation recorded.
  - Before: "(VERIFIED) custom domain codes fall through to the VALIDATION toast… snackbar fallback renders the localized copy with ZERO frontend changes"
  - After: "Zero frontend changes — justified by surface absence, not fallback coverage … the future booking-UI ticket SHALL map `SUBSCRIPTION_EXPIRED` → the new `subscriptionExpired` key"

### F2 [HIGH] — Wrong index citation in REQ-022

- **Location:** `specs.md` REQ-022, final sentence
- **Expected:** `backend/db/schema/billing/subscriptions.ts:51-55` (the index list: `subscriptions_user_id_idx`, `subscriptions_plan_id_idx`, partial `subscriptions_payment_reference_unique`)
- **Actual:** "`subscription.repository.ts:38-44` indexes only `user_id`/`plan_id`/partial `payment_reference`" — `subscription.repository.ts:38-44` is the `SUBSCRIPTION_READ_COLUMNS` projection constant, not an index list. plan.md already cited the correct schema-file location.
- **Fix Applied:** citation corrected to the schema file.
  - Before: `` `subscription.repository.ts:38-44` indexes only … ``
  - After: `` the index list in `backend/db/schema/billing/subscriptions.ts:51-55` covers only … ``

### F3 [MEDIUM] — REQ-023(a) vs plan O1 guard divergence on `pending`

- **Location:** `specs.md` REQ-023 option (a)
- **Expected:** specs and plan.md D2 describe one identically-predicated semantic.
- **Actual:** specs (a) said the cover guard is "no other in-window active subscription"; plan O1 (correctly, and as echoed by tasks 4.2's test matrix: "covered by PENDING sub ⇒ NOT zeroed") guards on `status IN ('active','pending')` with `active` post-flip being in-window by construction.
- **Fix Applied:** specs (a) reworded to the plan's exact guard (`status = 'active'` post-flip, plus `status = 'pending'` as coverage).
  - Before: "zero … ONLY when no other in-window active subscription covers that student-lane pair"
  - After: "zero … ONLY when no other subscription of the same student credits that lane with `status = 'active'` (post-flip, hence in-window) or `status = 'pending'`"

### F4 [MEDIUM] — Task 8.1 deferred gate self-contradiction

- **Location:** `tasks.md` task 8.1 deferred-gate bullet; `deferred-items.md` Enforcement section
- **Expected:** the gate criterion must be satisfiable at the point it runs (Phase 8 precedes Phase 9).
- **Actual:** demanded `grep -c "❌\|⚠️" = 0` while D2's ❌ is explicitly sanctioned until 9.1's canonical doc records the ops handoff — guaranteed to read 1 at the time of the check.
- **Fix Applied:** expectation changed to "exactly 1 (D2's sanctioned ❌) at Phase 8; MUST be 0 after 9.1", with the legend-block exclusion retained; Enforcement section reworded identically.
  - Before: "MUST return 0 (… D2 closes ONLY when 9.1's canonical doc records the external-trigger ops handoff)"
  - After: "expected count exactly 1 at this checkpoint — D2's sanctioned ❌ … After 9.1 the count MUST be 0 (re-run the grep there)"

### F5 [MEDIUM] — Ledger statuses stale after gate ratification

- **Location:** `deferred-items.md` D1/D3 rows; `tasks.md` 0.1 baseline bullet, 1.1 bullet, numbering-conventions bullet
- **Expected:** the 1.1 gate closes D1 (O1 ratified) and D3 (resolution recorded) with `Verified By` references.
- **Actual:** D1/D3 pinned at 🔄 "In Progress" with "row closes when the gate accepts plan.md".
- **Fix Applied:** D1 → ✅ Done (`Verified By: outcome/plan-review-R1.md`, notes updated to the ratified post-flip+pending guard); D3 → ✅ Done (resolution = defer-to-booking-UI-landing per corrected D7, obligation recorded in REQ-061 + 9.1 canonical doc); tasks 0.1/1.1/numbering bullets updated to the closed statuses.

### F6 [LOW] — Research digest retains the falsified claim

- **Location:** `outcome/research-04-ux-graphql-permissions.md:66`
- **Actual:** "custom domain codes fall through to the VALIDATION toast/snackbar fallback" — falsified at F1.
- **Fix Applied:** left intact (research digests are point-in-time records); plan.md D7 now explicitly cites it as falsified by the `:242-258` guard, so executors cannot inherit the error. Noted here for the record.

---

## Fix Subagents Dispatched

| Subagent | Target Files | Findings Fixed | Status |
|---|---|---|---|
| (none — inline fixes by this reviewer) | `specs.md`, `plan.md`, `tasks.md`, `deferred-items.md` | F1–F5 | ✅ Complete |

---

## Post-Fix Verification

- [x] REQ traceability sweep re-run: `grep -oE 'REQ-[0-9]+' specs.md` (36 distinct REQs incl. 001) all present in `tasks.md` — clean
- [x] Traceability table task-ids match actual task ids (0.1/1.1/2.1-2.3/3.1/4.1-4.2/5.1-5.2/6.1/6.5/7.1/8.1/9.1 all exist) — clean
- [x] Anti-pattern sweep on artifacts post-edit: no affirmative use of `Translation.` enum, two-arg `getTranslations`, `LocaleType`, `@/frontend/utils/logger` in backend context, raw `bun test`, bottom-nav, or any verified-absent path — all matches are inside FORBIDDEN/safelist prose
- [x] plan.md mandatory sections intact after edits (Overview/Sequence/Decisions, Data Models, API+SDL+permission matrix, Services/Concurrency/Journey, UX/Nav, Security, Error Handling, Performance, Testing, Deployment, Knowledge Propagation)
- [x] REQ-023 phrasing consistent across specs (a) ↔ plan D2/§2.1 ↔ tasks 4.2
- [x] plan-review skill re-run mentally on edited spans — "Plan passes all AGENTS.md rules for affected layers" now holds
- [ ] `bun run scripts/health/sub-loop.ts <file>` per plan file — N/A (plan artifacts are markdown; sub-loop checks target code files; skipped with justification)

**Verification command (executed):**

```bash
cd /home/ahmed/Projects/kottaby_kottaby
for r in $(grep -oE 'REQ-[0-9]+' ai/plans/sprint_1/subscription-validity-window-expiry/specs.md | sort -u); do
  grep -q "$r" ai/plans/sprint_1/subscription-validity-window-expiry/tasks.md || echo "MISSING: $r"
done   # → clean (no output)
grep -c "❌\|⚠️" ai/plans/sprint_1/subscription-validity-window-expiry/deferred-items.md   # raw count includes icon-legend/anti-pattern lines; Ledger Table rows: D1 ✅, D2 ❌ (sanctioned), D3 ✅
```

---

## Lessons for Future Plans

- Claims about frontend error-surface fallback must be verified in `frontend/providers/apollo/error-link.map.ts` itself: the dispatcher's documented "anything else → null" row means custom domain codes (`INSUFFICIENT_BALANCE`, `SUBSCRIPTION_EXPIRED`, …) render NOTHING via the global surface unless a dialog-local arm or a dedicated map row exists.
- Before asserting "Surface X will show error Y", grep for a *wired consumer* of the producing mutation — `createSession` currently has none, which changes every UX claim about booking denials.
- Deferred-ledger grep gates must specify the expected count **at the checkpoint they run at**, not the end-state count.
- Multi-source specs (options + later decisions) need a pin phrase tying the spec option to the plan's chosen predicate exactly; near-synonyms ("in-window active" vs "`active` post-flip + `pending`") diverge silently.
- Every `path:line` load-bearing citation in this plan was verified live; exactly one (specs REQ-022) pointed at the wrong file. Index citations belong to `backend/db/schema/**`, not repo files.

---

## Traceability

**Plan files modified:**
- `specs.md` — F1 (REQ-061 rewrite, §4 surface paragraph + role-matrix UI cell), F2 (REQ-022 citation), F3 (REQ-023(a) guard)
- `plan.md` — F1 (D7 decision row, §6 touchpoint paragraph, §8 client row)
- `tasks.md` — F1 (numbering bullet, 1.1 bullet, 5.2 frontend bullet, 9.1 canonical-doc bullet), F4 (8.1 deferred gate), F5 (0.1 baseline bullet)
- `deferred-items.md` — F1/F5 (D1 → ✅ ratified, D3 → ✅ rewritten + closed), F4 (Enforcement section)

**Outcome knowledge base updated:**
- This report saved as: `ai/plans/sprint_1/subscription-validity-window-expiry/outcome/plan-review-R1.md`

---

## Next Steps

- [ ] Commit patched plan files
- [ ] Proceed to implementation (Phase 0 → Phase 2; journey test-first per 3.1)
- [ ] No further review rounds required; resume only if implementation uncovers new drift (then open plan-review-R2)
