# Review Rounds R3-R4 (outcome)

## Round R3 — types + code health (independent)
24 LOW findings: 17 new plan-artifact comment refs; dead `actionJoin` locale key; SESSION_STARTED_STATUS re-declared; 6 duplicated wire-test helpers; over-exported internals; double page-clamp; suite fixture duplication (noted, not fixed — diminishing returns).
**Resolution:** 5 commits (36e4836 refs stripped, db629dc dead key, 4f3c599 constant import, 6ded64b un-exports, a3590e7 helpers hoist). Fixture-dup hoists noted for a future harness task. tsgo 0; suites green.

## Round R4 — backend semantics (independent)
1 MEDIUM + 5 LOW:
- [MEDIUM] fee_held not cleared on admin cancel (GraphQL-visible inconsistent terminal shape) → FIXED 7cd75f7 (guard clears marker in the guarded statement; refund reads pre-capture lane on same tx; regression-pinned service+repo).
- join read-then-audit → FIXED c855838 (single INSERT..SELECT with in-statement eligibility).
- recurring-wave occurrence-independent claim keys → FIXED c79f3fd (updatedAt-stamped keys for rescheduled/teacherReassigned; cancel stays one-shot).
- tail-first receipt walk → FIXED c79f3fd (head-first, recipient order preserved).
- self-reassign no-op noise → FIX CLAIMED but absent; caught by R6 → landed 9792d1a (different-teacher fold; zero-row conflict; zero audit).
- >2^53 id reaching SQL → zod v4 .int() verified safe at runtime; explicit pin added 174cb38 (Number.isSafeInteger refine + tests) per R6.
**Verification:** service 44-45 pass/0 fail; repo admin 26/0; journey 13/0; tsgo 0.
