# Deferred Items Ledger — DEV3-012 (Dual-Confirmation Completion Handshake)

- **Plan Directory:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
- **Ledger ID convention:** `DEF-NN`

Each entry: short statement, owner (follow-up ticket), reason deferred.

| ID | Item | Owner / Forward Contract | Reason |
|---|---|---|---|
| DEF-01 | Admin arbitration actions (refund / partial / uphold) on `disputed` rows, teacher wallet reversal, audit rows | **DEV3-022** (Sprint 3) | Out of DEV3-012 scope: this ticket only puts rows into `disputed` and queues admin notification. |
| DEF-02 | Wallet anatomy hardening (`total_earning`, per-currency), wallet UI, transaction listing | **DEV3-013/014/015** | This ticket consumes `ensureWalletOnce` + `creditEarningOnce` exactly as defined by DEV3-004's slice. |
| DEF-03 | Plan-linked dynamic pricing replacing `SESSION_FEE_*` constants | **DEV3-013** | Recorded forward contract in `docs/sessions/session-lifecycle.md`. |
| DEF-04 | Evaluation-type sessions recitation coupling | **DEV3-007** | C.5 — DEV3-012 never touches `recitation`. |
| DEF-05 | Cron registry job kind registration (pg-boss / job-handler) if the repo later centralizes cron dispatch | follow-on cron ticket | Current surface uses the existing HTTP cron route; no runtime change here. |
| DEF-06 | Session-side disposition when the deadline lapses on a session that ALSO has an open dispute | speculative | Impossible state by construction (refund lives only on non-disputed paths; dispute freezes the hold before any refund arm can match). Revisit only if a race is observed in practice. |

**Ledger rules** (per spec-driven-development):
- Every `deferred` decision from ANY outcome file must land here.
- Nothing may be deferred without an entry.
- Entries are retired only by the follow-up ticket's own plan.
