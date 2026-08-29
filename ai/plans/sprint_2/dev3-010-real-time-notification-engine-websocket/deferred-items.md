# Deferred Items Ledger

**Feature:** `dev3-010-real-time-notification-engine-websocket`  
**Plan Directory:** `ai/plans/dev3-010-real-time-notification-engine-websocket/`  
**Created:** `2026-08-28`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Emitter wiring per event type (engine emits; per-domain emitters NOT wired here) | 0.1 (DEV3-010 engine contract) | DEV3-011 / DEV1-016 / DEV1-017 / DEV2-016 / DEV3-012 / DEV3-013 / DEV3-022d | 🔄 Deferred | — | non-blocking, owning ticket recorded; forward item pre-seeded at baseline |
| D2 | Recipient-locale copy storage (localized notification copy) | 0.1 (DEV3-010 baseline) | future `users.locale` decision (users-schema owning ticket) | 🔄 Deferred | — | non-blocking, owning ticket recorded; requires future `users.locale` decision — NEVER patched inline |
| D3 | Production WS host provisioning (WebSocket host infra) | 0.1 (DEV3-010 baseline) | deployment workstream | 🔄 Deferred | — | non-blocking, owning ticket recorded; forward item pre-seeded at baseline |
| D4 | Multi-channel / unified-preferences integration | 0.1 (DEV3-010 baseline) | notification-preferences ticket | 🔄 Deferred | — | non-blocking, owning ticket recorded; forward item pre-seeded at baseline |

> **D1–D4 are pre-seeded non-blocking forward items with owning tickets; final gate `grep -c "❌\|⚠️"` excludes them.**

## Resolved Dispositions (plan-review rulings — administrative, non-blocking)

| ID | Finding (source) | Disposition | Ruled By | Date |
|---|---|---|---|---|
| B1 | `backend/db/repo/notifications/` namespace does NOT pre-exist (plan assumed "extend existing") | Task 2.4 re-scoped: **CREATE** the notification repository namespace fresh following sibling repo patterns (`backend/db/repo/parents/` etc. per `backend/db/repo/AGENTS.md`); all 7 plan methods are net-new; no existing code depends on the namespace | Orchestrator (Task 0.2 audit + 0.3 plan-review A2) | 2026-08-29 |
| A1 | No cache adapter code exists yet (`backend/services/redis/` README-only) | Engine (Task 2.6) defines + injects its own idempotency-claim cache port; mocked in tests — consistent with plan D4/D5 | Task 0.2 audit | 2026-08-29 |
| A2 | No `env-config-keys.ts` registry file; effective seam is `backend/lib/env.ts` (`resolveEnvConfig` + `resetEnvironmentCache`) | Task 1.5 registers new WS/fanout keys in the existing `backend/lib/env.ts` seam (dev3-003 precedent — registration not a separate registry file) | Task 0.2 audit | 2026-08-29 |
| A3 | `withPageAuth` does not exist; actual guard = client-side `DashboardLayout` `useAuth()` redirect | Task 4.3 server shell follows the ACTUAL `app/(dashboard)/` page conventions (server component + getTranslations delegating to client container guarded by the dashboard layout) | Task 0.2 audit + 0.3 review A4 | 2026-08-29 |
| A4 | No `Translation` enum in codebase; i18n convention = `defineNamespace("notifications", …)` handle | Task 1.4 registers namespace via `defineNamespace` handle; frontend consumes via that handle (NOT a `Translation` enum import) | 0.3 plan-review | 2026-08-29 |
| A5 | Canonical test runner path = `bun run test/scripts/run-test.ts` (plan refs to `scripts/run-test/run-test.ts` are stale) | All TE subtasks use `bun run test/scripts/run-test.ts <path>` | 0.3 plan-review | 2026-08-29 |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
