# Plan Review Report — Paymob Gateway Integration (paymob-gateway-integration)

## Review Round: 1 (Phase 1.5 gate)
## Date: 2026-09-07
## Subagents Dispatched: none — review executed inline against verification templates (research-03 §2 verdict format). Evidence gathers: six `outcome/research-*.md` digests + fresh `path:line` re-verification in this tree + the subscription-purchase plan contract comparison (`specs.md`/`plan.md`/`tasks.md`/`deferred-items.md`).

---

## Summary

- **Total issues found:** 7
- **Fixed in-file:** 4 (F1–F4)
- **Blocking (needs plan-author ruling before execution):** 1 (F5 — REQ-041 route-gating conflict)
- **Medium (structural convention gap):** 1 (F6 — missing mid-point review gate)
- **Low/Notes:** 1 (F7 — pre-existing A4 inventory failure in-tree)

---

## Findings by Dimension

| Dimension | Method | Issues Found | Status |
|---|---|---|---|
| Paths Existence | re-verified every `path:line` cite in specs §1 table + plan §2/§3/§4/§5 | 1 (test-path wrong directory) | ✅ Fixed (F3) |
| i18n Compliance | `shared/locale/` conventions check (namespace pipeline) | 1 (registration files omitted) | ✅ Fixed (F2) |
| GraphQL Accuracy | the subscription-purchase plan SDL cross-check (`plan.md:95-129`) + sharedDocuments rules | 0 | ✅ Pass |
| Component Props | not applicable at plan level (MUI rules mandated as REQs, verified against `frontend/AGENTS.md`) | 0 | ✅ Pass |
| Permissions/Enums | permission matrix vs `withPageAuth` reality; enum cites re-verified | 0 | ✅ Pass |
| Architecture Compliance | root + layer AGENTS.md (`app/`, `backend/`, `backend/types/`, `backend/db/repo/`, `shared/locale/`) | 1 (specs↔plan 400/401 contradiction) | ✅ Fixed (F1) |
| Cross-Reference Consistency (specs↔plan↔tasks↔ledger↔the subscription-purchase plan) | traceability grep loop + ledger gate + cross-plan contract diff | 3 | F4 ✅ Fixed; F5 ⚠️ ruling needed; F7 ℹ️ noted |
| Task Conventions (QL/TE/SEC/SR/IV, expanded `_Requirements:`, traceability) | grep loop per `ai/prompt.md:17` | 1 (mid-point gate absent) | ⚠️ Reported (F6) |

---

## Detailed Findings

### F1 — [MEDIUM] plan.md contradicted its own status matrix on missing-`hmac`

- **Location:** `plan.md:186` (§4.1, `paymob.adapter.ts` spec)
- **Expected:** Per plan §3.4 matrix (`plan.md:134`) and specs REQ-053 (`specs.md:143`): missing `hmac` / malformed JSON → **400**; invalid HMAC → **401**.
- **Actual:** §4.1 said "missing `hmac` → throw `UnauthorizedError` … map to 401".
- **Fix Applied:** reworded to "malformed JSON or missing `hmac` → throws a type the route maps to 400; invalid HMAC → throws an `UnauthorizedError` class for the route to map to 401".

### F2 — [MEDIUM] `checkout` namespace recipe omitted the `Translations`/`messages.ts` registration

- **Location:** `specs.md` REQ-066, `plan.md` §5 i18n bullet, `tasks.md` task 6.1
- **Expected:** Per `shared/AGENTS.md` §Namespace Registration + the live mechanism (`shared/locale/types/message.ts` `Translations` member + `shared/locale/{en,ar}/messages.ts` composition — wallet namespace verified: `walletTranslations: WalletLabels` at `types/message.ts:28`), adding a namespace REQUIRES those two registration files or tsgo fails on the new `checkoutTranslations` member.
- **Actual:** all three docs listed types/en/ar leaves + `defineNamespace` + parity test + "register barrels" only.
- **Fix Applied:** added explicit `shared/locale/types/message.ts` (`Translations` member) + `shared/locale/{en,ar}/messages.ts` registration to all three files (specs REQ-003/REQ-066, plan §5, tasks 6.1).

### F3 — [MEDIUM] Wrong DB-test directory cited for the student-payment suite

- **Location:** `plan.md` §9 row "Repository"; `tasks.md` task 2.2
- **Expected:** the subscription-purchase plan plans the suite at `backend/db/test/logic/billing/student-payment.repository.test.ts` (`tasks.md:87` of the subscription-purchase plan); in-tree billing DB tests live under `backend/db/test/logic/billing/`; `backend/db/test/repo/billing/` does not exist.
- **Actual:** plan/tasks cited `backend/db/test/repo/billing/student-payment.repository.test.ts`.
- **Fix Applied:** corrected to `backend/db/test/logic/billing/…` with a pointer to the subscription-purchase plan's planned file in both spots.

### F4 — [MEDIUM] Failure-notification divergence from the subscription-purchase plan was untracked

- **Location:** `specs.md` REQ-024/REQ-028 vs the subscription-purchase plan `specs.md:83` (its REQ-023: failed transition — "no credit, no notification"); consumed at `tasks.md` task 4.2
- **Expected:** Every cross-plan behavioral amendment on the subscription-purchase plan-owned surfaces is recorded in `deferred-items.md` (the plan's own A1–A5 discipline).
- **Actual:** this plan's REQ-024/REQ-028 add a `payment_confirmation` failure notification — a real behavioral amendment to the subscription-purchase plan's planned activation branch — but the A-set had no entry for it.
- **Fix Applied:** added ledger row **A6** (`deferred-items.md`) recording the divergence and routing it to task 4.2. (Contract-semantics decision itself left to the author; the ledger now makes it explicit.)

---

## Blocking Finding Requiring a Plan-Author Ruling

### F5 — [HIGH] REQ-041's whole-route 404 gate conflicts with the shared provider-dispatched receiver and would regress the mock flow

- **Location:** `specs.md` REQ-041 (`:132`); `plan.md` §3.4 matrix row ("provider ≠ paymob | 404") and §10 rollout step 2
- **Issue:** D6 + REQ-020 mandate ONE provider-dispatched receiver that the subscription-purchase plan may create first (with its mock branch, gated by `PAYMENT_WEBHOOK_ENABLED` per the subscription-purchase plan REQ-020). REQ-041 as written 404s THE ROUTE whenever `PAYMENT_GATEWAY_PROVIDER ≠ paymob` — which, after this plan lands, would disable the subscription-purchase plan's mock-webhook activation path during exactly the "deploy with `PAYMENT_GATEWAY_PROVIDER=mock`" rollout phase this plan itself prescribes (`plan.md:333`). Mock-mode purchases would stay `pending` forever in that window.
- **Recommended ruling (author decides):** scope the 404 to the PAYMOB BRANCH (paymob callbacks 404 when provider ≠ paymob; the mock branch keeps the subscription-purchase plan's `PAYMENT_WEBHOOK_ENABLED` gate), or explicitly supersede the subscription-purchase plan's mock-webhook flow and record that as an A7 amendment.
- **Why not auto-fixed:** this is a semantic contract decision between two plans, not a typo; the reviewer must not pick the ruling.

---

## Structural Finding (Reported, Not Fixed)

### F6 — [MEDIUM] No mid-point review gate despite >15 tasks

- **Location:** `tasks.md` (20 implementation/top-level tasks counted; template's conditional gate at `tasks-template.md:257`: "Phase 2.5: Mid-Point Review Gate (CONDITIONAL — Multi-Phase Plans >15 Tasks)"; house precedent: the subscription-purchase plan `tasks.md:127-132`)
- **Expected:** a mid-point backend review gate after the backend block (≈ after task 4.2/5.2), writing `outcome/midpoint-review-R1.md`.
- **Actual:** only the Phase-1.5 gate and the Phase-9 final gate exist; the backend→frontend handoff (task 6.x/7.x) has no review checkpoint.
- **Action:** author to add the gate phase (structure change — outside reviewer fix scope).

---

## Low / Informational

### F7 — [LOW] Pre-existing A4 static-assertion failure in-tree

`app/api/cron/sweep-sessions/route.ts` exists on disk but has no `ROUTE_INVENTORY` row; `backend/lib/gateway/static-assertions.test.ts` A4 currently FAILS (verified via `bun run test/scripts/run-test.ts backend/lib/gateway/static-assertions.test.ts` — 16 pass / 1 fail; in-flight work by another stream per shared-tree state). The plan already anticipates this (plan §3.4 step 3: "reconcile on execution") and task 0.1 captures it in the baseline. No plan change required; flagging so the baseline is not misread as caused by this plan.

## Dimension Pass Notes

- **Paths:** every other `path:line` cite re-verified EXACT: `student-payments.ts:23-48`, `subscriptions.ts:33`, `payment-gateway.enum.ts:10`, `enums.ts:35-44`, `payment-status.enum.ts:5-10`, `notification-engine.service.ts:42/79/116`, `notification-type.enum.ts:11`, `route-inventory.ts:33` (classification) + `:47-52` (inventory), `static-assertions.test.ts:238` (A4), `error-handling-contract.md:94-102` (exemptions), `env.ts:196/233/279/286/293/303`, `users.ts:17`, `navItems.ts:112` + `:53-74`, `plan-catalog.query.ts:18`, `sweep-sessions/route.ts:66-73`, `withPageAuth.ts:67-105`, `useBroadcastComposeSend.ts:35-63`, mirror `hmac-transaction-callback.md:27-48` + `hmac-for-card-tokens.md:23-32`, `SPRINT_PLAN.md:161`, the subscription-purchase plan `deferred-items.md:45`, the subscription-purchase plan `plan.md:105/135-136/199-202`, the subscription-purchase plan `specs.md:76/120`. `.agents/instructions/{backend,frontend,tests}.instructions.md` all EXIST; `frontend/views/AGENTS.md` confirmed MISSING (plan's appendix correctly rules it uncitable); `app/(dashboard)/shared/withPageAuth.ts` confirmed MISSING (app/AGENTS.md is stale there; plan cites the real `frontend/lib/auth/withPageAuth.ts` — correct).
- **i18n:** single-arg `getTranslations`/`getServerTranslations`; handle-based `useAppTranslation(Checkout)`; no `next-intl`; wallet-namespace template real; post-F2 registration list complete.
- **GraphQL:** NO new operations (D11) — consumes the subscription-purchase plan's `purchaseSubscription`/`mySubscriptions` + existing `planCatalog`; document naming/id-in-selection-set/`@apollo/client/react`/no-`useLazyQuery`/codegen-gate all match `frontend/graphql/sharedDocuments/AGENTS.md`.
- **Permissions:** student-role pages via `withPageAuth({ roles: [UserRole.Student] })` (in-tree precedent), webhook HMAC-authentic unauthenticated, cron bearer timing-safe — all consistent with `route-inventory`/`error-handling-contract` doctrine; no invented `requirePermissionForPage` usage.
- **Architecture:** port extension (not fork) honors D1/D6; port-type amendments confined to `backend/types/` with types-only discipline; intention HTTP outside tx (REQ-032); no module-level mutable state (REQ-033/D7); `queryDb` for non-tx repo read (A4 note matches `backend/db/repo/AGENTS.md:39`).
- **Traceability:** `for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo MISSING: $r; done` → zero misses after fixes. `_Requirements:` lines expanded (no ranges) ✓. Ledger gate `awk '/^## Ledger Table/,/^## Status Values/' deferred-items.md | grep -c "❌\|⚠️"` → 0 ✓ (git diff-gate exemption of the A-set confirmed structurally). REQ-067/068/… never claimed; numbering bands match house convention.

## Post-Fix Verification

- [x] Traceability loop zero misses (re-run after fixes)
- [x] Ledger gate returns 0 (re-run after A6 row; A-set table has no status glyphs by design)
- [x] No residual `backend/db/test/repo/billing/` or missing-hmac→401 strings (grep)
- [x] Plan files are docs only — no code touched; sub-loop stages not applicable to markdown
- [ ] F5 ruling by plan author (blocking for execution start)
- [ ] F6 mid-point gate added by plan author (recommended before Phase 7)

## Lessons for Future Plans

- When a plan amends ANOTHER plan's planned-but-unwritten contracts, the ledger amendment set (A1..An) is the single source of truth — every behavioral divergence (even "improvements" like F4's failure notification) must land there at authoring time.
- vendored-mirror line cites survive review well (`path:line` in mirror matched exactly); live-docs drift (checkout host migration) was correctly neutralized by env-config design (D3) — pattern worth reusing for any external vendor surface.
- New-locale-namespace checklists MUST include `types/message.ts` + `{en,ar}/messages.ts` registration; the "types/en/ar + namespace + parity test" recipe alone is incomplete.
- Inventory/registry assertions (A4) can be red in-tree for reasons unrelated to the plan under review — capture them in the baseline task, don't repair them mid-flight.

## Traceability

**Plan files modified:**
- `specs.md` — REQ-003 + REQ-066: added `types/message.ts` + `{en,ar}/messages.ts` registration (F2)
- `plan.md` — §4.1 parseWebhookEvent 400/401 mapping (F1); §5 i18n registration list (F2); §9 repository test path `logic/billing` (F3)
- `tasks.md` — 6.1 namespace registration files (F2); 2.2 test path `logic/billing` (F3)
- `deferred-items.md` — added amendment row A6 (F4)

**Outcome knowledge base updated:**
- This report saved as: `ai/plans/sprint_1/paymob-gateway-integration/outcome/plan-review-R1.md`

## Verdict

- **Verdict after fixes:** ⚠️ **Conditional pass** — all reviewable dimensions pass after 4 in-file fixes; **F5 (REQ-041 route-gating ruling) MUST be resolved by the plan author before execution begins** (recommended: also adopt F6's mid-point gate). Execution tasks 0.1 onward are unblocked only once F5's ruling is recorded in the ledger/REQ text.
