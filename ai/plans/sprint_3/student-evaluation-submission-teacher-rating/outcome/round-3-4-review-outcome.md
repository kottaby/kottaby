# Review Iterations R3+R4 — outcome

> **Plan:** ai/plans/sprint_3/student-evaluation-submission-teacher-rating · **Base:** 2bdea32 · **R3:** backend deep-dive reviewer · **R4:** frontend deep-dive reviewer · **Date:** 2026-09-12

## R3 findings (1 LOW)

| # | File | Finding | Disposition |
|---|---|---|---|
| 1 | backend/services/teachers/student-evaluation.service.ts | logDenial arms label entity "evaluation" while carrying the session id (taxonomy nit) | FIXED: relabeled "session" per sibling taxonomy (label-follows-id rule documented); 3 service-test assertions updated (suite 19/0) |

R3 also verified clean: score/CHECK edge semantics, guard order vs §4.1, non-locking probe safety (Completed is terminal; stamps never cleared), 23505 cause-chain, error taxonomy, end-to-end name audit (pothos→SDL→documents→codegen), queryDb mapping, registration.

## R4 findings (1 MEDIUM — real defect)

| # | File | Finding | Disposition |
|---|---|---|---|
| 1 | frontend/lib/notification-route-resolution.ts | Deep-link map keyed by relatedEntityType but the new entry used the notification-type value "session_completion" — no emitter persists that as an entity type → route unreachable in production | FIXED: type-aware discriminator — resolver checks the row's notification TYPE first (NOTIFICATION_ROUTE_BY_TYPE → STUDENT_SESSIONS_ROUTE), then falls back to the relatedEntity map; bogus key removed; signature updated (type first) with the single caller (NotificationDrawerBody) migrated; fixtures made realistic and a negative cell added proving "session"-entity rows of other types never route to the student page (deep-link suite 15/0) |

R4 also verified clean: keyed-unmount draft clearing, double-submit guards, writeQuery shape vs Apollo v4 references, eviction completeness, monotonic rated set, confirm-pending exclusivity, i18n/a11y wiring.

## Fix verification

Deep-link 15 pass/0 fail; service suite 19 pass/0 fail; QL exit 0 ×6; (journey re-run deferred to the final gate sweep).

## Round record

- R3: findings 1 · fixed 1 · remaining 0
- R4: findings 1 (MEDIUM) · fixed 1 · remaining 0
