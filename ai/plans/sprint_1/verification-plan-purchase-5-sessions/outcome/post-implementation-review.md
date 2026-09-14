# Post-Implementation Review — DEV2-005 Verification Plan Purchase (5 Sessions)

## Wave: 1 · Date: 2026-09-14 · Branch: `feat/verification-plan-purchase-5-sessions` @ 558cfd5

Review scope: `git diff bde0e02..HEAD` (the plan's exact file set; baseline
bde0e02 = origin/main at branch time; Phase 0 baseline tsgo 0 / biome 0 —
every finding below is new). Midpoint-review-R1 disposed findings excluded.

## Review subagents dispatched (parallel)

1. **review-types + review-backend** (schema/repos/services/mutation/types/constants/seed)
2. **review-frontend + i18n + test-quality** (documents/dialog/hook/zones/locales/component+graphql tests) — including the skill-mandated **prototype-parity comparison** (`prototype/purchase-dialog-desktop.png`) and the **zero-fake-data scan**
3. **security-probing** (9 probes over the new surface + webhook regression proof)

## Findings aggregation

| # | Severity | File | Finding | Disposition |
|---|---|---|---|---|
| 1 | MEDIUM | backend/services/teachers/verification-purchase.service.ts | Governance is asserted pre-gateway only; the sibling student flow additionally re-asserts `assertActorGovernanceClean` INSIDE the tx (covers a caller governed during the checkout round-trip). Plan §4.3 omits it (plan-conformant); distinct from D9. | **Deferred → D11** (defense-in-depth follow-up; fail-open window is millisecond-scale on a governed-actor transition) |
| 2 | MEDIUM | frontend/views/teachers/dashboard/useVerificationPurchase.ts | Post-success refetch window re-enables the confirm affordance before `onClose()`; a double-click in that window can mint a second pending pair (server posture accepted per REQ-9.7 — guarded flip no-ops; settlement grants no extra credit). | **Deferred → D12** (cheap `settling` latch UI follow-up; server posture is the accepted repeat-purchase contract) |
| 3 | LOW | backend/services/billing/subscription-activation.service.ts:346 | Corruption-arm abort detail `"student row vanished before the lane credit"` now doubles for the neither-row case (log fidelity only; byte-prescribed by plan §4.4). | Accepted posture; noted for the future ops-doc pass (Task 13 notes it) |
| 4 | INFO | verification-purchase.service.ts:247 | Repeat purchase from `in_evaluation` opens a fresh checkout + pending pair each time (documented intended posture; flip no-ops; no extra credit). | Accepted posture; candidate for D11's single-flight guard if product confirms |
| 5 | INFO | verification-purchase.service.ts:431-438 | Pre-tx gateway checkout leaves an orphaned provider session on in-tx denial (mirrors sibling; fail-safe webhook settlement). | Accepted posture |
| 6 | INFO | dialog aria/copy | LinearProgress aria-label reuses the dialog title; ar/en dialog titles differ in wording (both natural); duplicate lane reuses purchaseSuccess copy at info severity. | Noted; no plan-pinned keys exist for dedicated copy |
| 7 | INFO | outcome bookkeeping | 9-outcome.md said "12-test suite / six keys"; actual: 14 tests (7/locale), 7 keys (purchaseCta + six). | **Fixed** — 9-outcome.md corrected |

## Per-dimension verdicts

- **Types/backend**: PASS — enums value-imported everywhere; no duplicate types; `@/` imports only; no dead code; one tx (guard→claim→pair→flip→backfill), gateway strictly pre-tx; guarded single-statement transition; money only from DB plan rows; plan §4.3 line-by-line conformant; zero plan-artifact leakage / console.*.
- **Frontend/i18n/tests**: PASS — MUI v9 sx-only + palette callbacks; Apollo hooks from `@apollo/client/react` (no `useLazyQuery`); key rotate-on-success / keep-on-rejection wire-proven; error-surface contract exact (only the cooldown server message renders raw); zero fake data (grep clean; fixtures keyed off the shared constant); parity pins verified (18/18 + 27/27 re-run).
- **Prototype parity**: PASS — shared layout matches (title + close, tinted plan surface, cancel-text + contained confirm with lock icon); prototype-only extras (sub-heading, multi-row card icons, shield alert) are NOT regressions — plan §6/§8 pin the implemented one-line descriptor flow and exact key inventory; spec authoritative. Zero leaked prototype placeholder data.
- **Security probes**: 9/9 PASS — BOLA/IDOR (inputless; ctx identity only; oracle-safe foreign denials), BOPLA (zero client authority), BFLA (gate + scopes), replay/idempotency (23505 arbiter byte-mirrors the hardened student flow; key never logged — test-pinned), money integrity (append-only triggers untouched; unique payment_reference; count/list parity fix ADDED a join, removed none), webhook regression (route diff EMPTY; HMAC/kill-switch/body-cap intact; arbiter untouched), injection (parameterized; no wildcard interpolation; guarded UPDATE single-statement), GraphQL abuse (no new unbounded resolvers; uncaught DomainErrors to the masking boundary), governance (shared `assertActorGovernanceClean` at the boundary).

## Verdict

**Blocking (CRITICAL/HIGH): 0 — zero feature-specific blocking findings. The wave passes on round 1.** Advisory: 2 MEDIUM (deferred D11/D12) + 5 INFO (accepted/noted) + 1 bookkeeping fix applied.
