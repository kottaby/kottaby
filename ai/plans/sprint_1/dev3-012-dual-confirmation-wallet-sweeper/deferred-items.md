# Deferred Items Ledger — DEV3-012

| ID | Deferred Item | Source Task | Target Task | Status | Notes |
|---|---|---|---|---|---|
| F3 | Frontend confirm affordance + wallet views (plan task 3.1) | plan | next round | ⏸ Forward | Backend slice first — financial primitives must be green before UI consumes them |
| F4 | Claim-row expiry inside the sweeper (D2 tail) | specs R-203 | this plan, task 1.2 stretch | ⏸ Forward | "Claims are harmless rows" — only if trivial; never blocks the session sweep |
| F5 | Wallet DB trigger (schema docblock's aspirational trigger) | specs R-202 | future ticket | ⏸ Forward | Explicit same-tx updates this round; a trigger migration is a standalone schema ticket |
