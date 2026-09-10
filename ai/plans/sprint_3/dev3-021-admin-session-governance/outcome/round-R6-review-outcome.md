# Review Round R6 (outcome) — security re-probe (independent)

Re-probe of the R4 fix commits themselves:
- [MEDIUM] self-reassign denial claimed but ABSENT (c855838) → FIXED 9792d1a (repo guard different-teacher fold; service test: conflict + byte-identical row + zero audit/waves; repo admin test: 0-row same-teacher).
- [LOW] implicit zod safe-int → explicit pin 174cb38 (+4-schema rejection tests).
- [INFO] join INSERT..SELECT snapshot semantics (no row lock) — accepted residual (audit-only, admin-only, documented); [INFO] ms-level occurrence-key collision (admin self-race; fail-closed) — accepted.
**Area confirmations:** gate swap exact-variant ×6; page ceiling unbypassable; fee_held clear cannot skip refund; INSERT..SELECT bound + server-fixed fields; occurrence keys server-owned (updated_at not client-writable); R3 refactor commits introduce no behavior.
