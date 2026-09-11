# Plan Review — Round 2 Addendum (cross-check audits + rulings)

## Review Round: 2 (addendum to `plan-review-R1.md`)

**Date:** 2026-09-07
**Scope:** two parallel audits that ran alongside the Phase 1.5 gate — (A) Paymob vendor-claim accuracy vs the offline mirror (`.agents/skills/paymob-payments/references/`), (B) repo reference-integrity audit of all `path:line` citations; plus author rulings on R1's open findings (F5, F6, A6).

## R1 follow-ups closed

| Finding | Disposition |
|---|---|
| F5 (HIGH) — REQ-041 404-gating conflicted with the single provider-dispatched receiver | **Ruled + fixed.** Gating is per-branch: the paymob branch 404s when `PAYMENT_GATEWAY_PROVIDER ≠ paymob`; the route's availability follows the active provider's own gate (mock keeps the subscription-purchase plan's `PAYMENT_WEBHOOK_ENABLED` semantics). Updated: `specs.md` REQ-041, `plan.md` §3.4 matrix row, `tasks.md` 4.1 + 4.1.TE. |
| F6 (MEDIUM) — no mid-point review gate for a >15-task plan | **Fixed.** New task 5.3 "Mid-point backend review gate" (Phase 2.5 pattern) added after Phase 5; traceability map updated (REQ-002, REQ-082 rows). |
| A6 — failure-path notification diverges from the subscription-purchase plan REQ-023 | **Ruled: keep failure notification.** The funnel UX requires a failure signal; ruling recorded verbatim in `deferred-items.md` A6. |
| F7 (LOW) — pre-existing A4 static-assertion discrepancy for `/api/cron/sweep-sessions` | No plan change; execution-time reconciliation already specified (plan §3.4 step 3, task 0.1 baseline check). |

## Audit A — Paymob vendor accuracy (mirror cross-check)

All load-bearing claims match the mirror exactly: the 20-key HMAC list verbatim in order (POST nested / GET flat variants, boolean + missing-value handling), endpoint paths/methods/auth headers, intention request/response fields, callback field names, test-credential facts, 1-hour inquiry-token TTL, and the absence of a documented retry policy / IP allowlist. Four soft flags were applied:

1. `type: "TRANSACTION"` is not guaranteed upstream → dispatch now keys off payload SHAPE, with the discriminator treated as optional (`plan.md` §3.4 + adapter contract bullet; `specs.md` REQ-026).
2. Refund/void flag combination (`is_refund`/`is_void` + `has_parent_transaction`) is now explicitly a sandbox-validated assumption (REQ-026 wording + ledger).
3. Transaction-inquiry token placement pinned to the request BODY (`auth_token`) per the inquiry page (plan §4.1 `PaymobHttpClient` bullet).
4. `PAYMOB_CHECKOUT_BASE_URL` is now specified as a full host(+path) prefix — default `https://eg.checkout.paymob.com` (docs-MCP live-docs finding, disclosed as mirror-unverifiable), operator fallback `https://accept.paymob.com/unifiedcheckout/` (specs REQ-016, plan §4.1 env bullet).

Note: the mirror count on disk is 119 pages (specs ground-truth table updated from the SKILL's stale "116").

## Audit B — Reference integrity

~95 citations checked across the four plan files: all paths exist; all the subscription-purchase plan cross-references land on the cited content (verified individually). One stale anchor fixed: `backend/lib/gateway/static-assertions.test.ts:238` → `:241` (the disk↔registry A4 test). No NOT-FOUND citations remain.

## Result

All three review tracks are green after the fixes above. The plan is gate-clean and execution-ready, subject to the stated blocking dependency (the subscription-purchase plan backend landing first).
