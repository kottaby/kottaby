# Deferred Items Ledger

**Feature:** Session Report Submission with Homework (Jadid & Madi)
**Plan:** `ai/plans/milestone_2_matching_notifications_escrow/session_report_submission_with_homework_jadid_madi/`
**Created:** 2026-09-17

---

## Purpose

This ledger tracks all work deliberately deferred from this plan so no deferred item is forgotten. Every entry names an owning follow-up surface; the final quality gate (Task 7) audits this table — zero ❌ rows.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task / Owner Surface | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Full 114-surah `SurahJuzRef` enum expansion (runtime ships 5 surahs + 30 juz; B.11's spec text says "all 114 Surahs" — `docs/specs/open-decisions-and-gaps.md:135-139` vs `session-report-homework.md:89`) + matching label-map growth | Plan-time (scope ruling) | `Surah/Juz Enum Homework Tracking` ticket (`docs/planning/TICKETS.md:1424` — explicitly Blocked By THIS ticket) | 🔄 Handed off | specs.md §Scope | Enum expansion is that ticket's core; its other listed scenarios (valid/invalid enum values, non-contiguous tracks) are ALREADY shipped by M1's guards — the plan for that ticket should verify-then-extend |
| D2 | Parent-portal adoption of the localized `surahJuzLabel` (replacing the raw regex `formatSurahJuzRef`, `frontend/views/parent/monitoring/parentMonitoringDisplay.ts:52-56`) | Plan-time (scope ruling) | Next parent-portal display ticket | ❌ Deferred | plan.md D5/§4 | `formatSurahJuzRef` keeps working unchanged; the label map lands in this plan and is ready for adoption |
| D3 | Student-facing homework page (student nav has a `/homework` ComingSoon; students read per-session homework via the participant query today) | Plan-time (scope ruling) | Student-portal ticket | ❌ Deferred | specs.md §Scope | `studentHomeworkHistory` is deliberately teacher-role-scoped; a student surface needs its own gate ruling (caller ≡ the student) |
| D4 | Parent report-ready deep-link display (`/parent/children/<id>?tab=reports&session=<id>` — the DEV1-017 forward item, `docs/parents/monitoring-portal.md:207,307`) | Plan-time (pre-existing) | Portal display ticket | ❌ Deferred | monitoring-portal doc | Pre-existing forward item, untouched by this plan; the wave itself ships with M1 |
| D5 | Report edit/void semantics (append-only posture stands — M1 D10) | Plan-time (scope ruling) | Future compensating-artifact ticket | ❌ Deferred | plan.md §9 | Corrections remain out of scope until a ticket defines them; the dialog renders review state only |
| D6 | Teacher attribution on history rows (which teacher authored each assignment) | Plan-time (scope ruling) | `Admin Academic Tracking` ticket (`docs/planning/TICKETS.md:2182`, Milestone 3 — Blocked By this ticket) | ❌ Deferred | REQ-4/D2 | `HomeWorkRepository.listForStudent` returns homework rows only; attribution needs a session-join projection; AC 4 needs visibility, not attribution |
| D7 | Row-level CTA label distinguishing "submit" vs "view report" before dialog open (needs `Session`/list enrichment with report existence) | Task 4/5 (design D7) | Future sessions-list enrichment ticket | ❌ Deferred | plan.md D7 | The dialog resolves the state on open and `SESSION_REPORT_ALREADY_EXISTS` is the race-safe backstop; avoids a Session-object + service ripple for a label |

---

## Status Values

- ✅ **Done** — completed and verified (reference the outcome file or commit)
- ⚠️ **Partial** — partially resolved, follow-up needed
- ❌ **Blocked/Deferred** — deliberately out of this plan's scope, owning surface named
- 🔄 **In Progress/Handed off** — being worked on by the owning surface

## Usage Guidelines

- **Adding:** any task discovering cross-surface work adds a row here (source task, owning surface, status ❌) — never a silent TODO.
- **Completing:** set ✅ with the verification reference (outcome file / commit).
- **Enforcement (Task 7):** every row must be ✅ or ❌-with-named-owner; no orphaned items; the M1 ledger convention (`ai/finished_plans/milestone_1_core_domain_mvp/session-report-homework-infrastructure/plan.md` D-numbering) is preserved.
