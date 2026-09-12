# Deferred Items Ledger

> **Feature:** Student Evaluation Submission (Teacher Rating) — DEV2-016
> **Plan:** `ai/plans/sprint_3/student-evaluation-submission-teacher-rating/`
> **Created:** 2026-09-11

## Purpose

Tracks work deliberately excluded from this plan so it is revisited and never lost.

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Optional free-text `notes` on student ratings (column exists at `backend/db/schema/teachers/evaluations.ts:33`; input type omits it) | plan D5 scope cut | Future UX iteration ticket | 📅 Deferred | plan author | No client demand in the ticket AC. |
| D2 | Teacher notification on new rating (`NotificationType.EvaluationResult` exists at `backend/enum/notifications/notification-type.enum.ts:12`) | plan D7 | DEV2-017 or a notification-polish ticket | 📅 Deferred | plan author | Ticket AC requires no notification; DEV1-017 already surfaces evaluations to parents. |
| D3 | Pagination on `myTeacherEvaluations` | plan D12 | When a student's history can exceed a page (~>200 rows) | 📅 Deferred | plan author | Self-limiting by design. |
| D4 | Rating edit / re-rate / delete flows | spec scope table | Future governance dispute feature | 📅 Deferred | plan author | INV-E6 retention favors append posture; dispute-driven correction belongs with arbitration tooling. |

## Known Cross-Ticket Deferrals (NOT this plan's ledger entries)

| Item | Owning ticket | This plan's obligation |
|---|---|---|
| `teacher.average_rating` aggregation (`AVG(score)/20`, 0–5 CHECK) | DEV2-017 (also D4 in `ai/plans/sprint_1/session-report-homework-infrastructure/deferred-items.md:20`) | Store clean rows: one per (session, student), `score = rating × 20`, `session_id` always set. Forward contract documented in `plan.md` §4.5. |
| Parent-portal evaluation display | DEV1-016 / DEV1-017 | None — existing surfaces read independently. |
| Admin evaluation CRUD | DEV3-016 family | None — `evaluations` already in admin analytics scope. |
| Search-ranking consumption of ratings | Matching engine (Dev 3 tracks) | None — data plane only. |

## Enforcement

- Every new deferment discovered during implementation MUST be appended here with a status and a note **in the same commit** as the code that made the trade-off.
- Closing a deferred item requires updating its row status to ✅ with the resolving commit referenced.
