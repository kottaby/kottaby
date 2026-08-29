# Phase 0.1 Outcome — Baseline Recording

**Task ID:** 0.1 — Record error baseline and initialize the deferred-items ledger
**Plan:** DEV3-010 — Real-Time Notification Engine (WebSocket)
**Plan directory (ACTUAL):** `ai/plans/sprint_2/dev3-010-real-time-notification-engine-websocket/`
**Date:** 2026-08-29
**Branch:** `feat/dev3-010-real-time-notification-engine-websocket`
**Environment:**
- Runtime: bun 1.x, Node toolchain
- Database: PostgreSQL 17 (user-space) — `postgresql://postgres@127.0.0.1:5432/app_db`
- Dev server: Next.js on port `:3000` (running)

---

## Baseline Command Results (verbatim counts)

### 1. `bun tsgo` (full typecheck build)

- **Errors: 0** — zero `error TS` lines in the full build output
- **Exit code: 0**

### 2. `bun biome:check`

- **Checked 504 files in 23s**
- **No fixes applied**
- **Warnings/errors: 0**
- **Exit code: 0**

### 3. `bun run scripts/lint-service.ts --json --id baseline`

- **`success: true`**, **`exitCode: 0`**
- **Scope:** `full-repo`
- **`fileCount: 0`** (zero flagged files)
- Duration: 23710 ms
- Full JSON payload archived verbatim at: `outcome/baseline/lint.json`

### 4. `git diff --name-only` / `git status --porcelain`

- **Clean working tree.** The only modification is the expected ledger seeding:
  `ai/plans/sprint_2/dev3-010-real-time-notification-engine-websocket/deferred-items.md`
- No unexpected source-file modifications.

---

## Pre-Existing Issues to Ignore During Post-Implementation Review

**NONE.** The baseline is **perfectly green** across all four probes (tsgo 0 errors · biome 504 files clean · lint-service success/exit 0 with fileCount 0 · clean git tree). There are no pre-existing errors, warnings, or dirty files to excuse in later phases.

> **NOTE for all future tasks in this plan:** the quality bar is **ZERO new errors of any kind** — any new TS error, biome warning, lint-service flag, or unexpected dirty file appearing in a later phase is a **regression** and must be fixed before that task's checkboxes may be marked.

---

## Deferred-Items Ledger Initialization

`ai/plans/sprint_2/dev3-010-real-time-notification-engine-websocket/deferred-items.md` was initialized (template + table structure) and pre-seeded with four **non-blocking forward items**, each carrying an owning ticket:

| ID | Deferred Item | Owning Ticket / Target | Status |
|----|---------------|------------------------|--------|
| D1 | Emitter wiring per event type (engine emits; per-domain emitters NOT wired here) | DEV3-011 / DEV1-016 / DEV1-017 / DEV2-016 / DEV3-012 / DEV3-013 / DEV3-022d | 🔄 Deferred (non-blocking) |
| D2 | Recipient-locale copy storage (localized notification copy) | future `users.locale` decision (users-schema owning ticket) — NEVER patched inline | 🔄 Deferred (non-blocking) |
| D3 | Production WS host provisioning (WebSocket host infra) | deployment workstream | 🔄 Deferred (non-blocking) |
| D4 | Multi-channel / unified-preferences integration | notification-preferences ticket | 🔄 Deferred (non-blocking) |

All four items are pre-seeded **forward items with owning tickets**, recorded as non-blocking; the plan's final gate (`grep -c "❌\|⚠️"`) excludes them. No item blocks DEV3-010 implementation.

---

## Artifacts Produced

- `outcome/baseline/lint.json` — verbatim lint-service JSON payload (baseline id: `baseline`)
- `outcome/phase0-baseline-outcome.md` — this document
- `deferred-items.md` — ledger seeded with D1–D4
- `tasks.md` — checkboxes `0.1` and `0.1.SR` flipped to `[x]`

**Baseline delta:** none — this is the reference baseline itself.
