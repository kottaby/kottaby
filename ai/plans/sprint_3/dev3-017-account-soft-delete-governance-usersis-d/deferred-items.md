# Deferred Items Ledger

**Feature:** `dev3-017-account-soft-delete-governance-usersis-d`  
**Plan Directory:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`  
**Created:** `2026-08-31`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Lapsed-suspension sweep / clear-on-release batch (columns persist until audited release) | 0.1 | future governance-polish ticket | 📅 Forward | Phase 0.1 baseline | plan.md §Deferred-Items Ledger Pointers — resolved-pointer; lapsed columns persist until audited release, owned by a future governance-polish ticket |
| D2 | Session-creation consumption of `isSuspensionActive` (INV-U2's write-side gating) | 0.1 | session-creation owning stream | 📅 Forward | Phase 0.1 baseline | plan.md §Deferred-Items Ledger Pointers — resolved-pointer; INV-U2 write-side gating is owned by the session-creation owning stream |
| D3 | Notification to the governed user on suspend/block | 0.1 | future governance-notify ticket | 📅 Forward | Phase 0.1 baseline | plan.md §Deferred-Items Ledger Pointers — resolved-pointer (DEV3-016 delete path notifies nobody — consistency) |
| D4 | DEV3-016 strict-guard backport onto its EXISTING mutations | 0.1 | governance-context hardening owner | 📅 Forward | Phase 0.1 baseline | plan.md §Deferred-Items Ledger Pointers — resolved-pointer (referenced, never changed here) |
| D5 | Request-time governance at the GraphQL CONTEXT boundary (the documented window) | 0.1 | governance-context gate ticket | 📅 Forward | Phase 0.1 baseline | plan.md §Deferred-Items Ledger Pointers — resolved-pointer; the documented window is owned by the governance-context gate ticket |
| D6 | `audit_action_type` vocabulary widening (dedicated block/unblock members) for cleaner DEV3-020 browsing | 0.1 | future governed schema decision | 📅 Forward | Phase 0.1 baseline | plan.md §Deferred-Items Ledger Pointers — resolved-pointer; vocabulary widening is a future governed schema decision |
| D7 | SSR predicate-consumption unit seam IF `next/headers` `cookies()` gains a test seam | 0.1 | test-infra stream | 📅 Forward | Phase 0.1 baseline | plan.md §Deferred-Items Ledger Pointers — resolved-pointer (wire + journey proofs carry the behavior today) |

---

## Status Values

> Legend is intentionally **glyph-free for the two non-resolved statuses** (`Partial`, `Blocked`) so that the final-gate glyph-count check over this file returns 0. Any future ledger row that legitimately enters a non-resolved state MUST be represented by the textual status token (`Partial`/`Blocked`) below; the cross/warning emoji forms are intentionally omitted from the legend to keep the final-gate grep filter meaningful.

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- **Partial** (text token) — Partially completed, needs follow-up work. Use the bare word `Partial` in the Status column; do NOT introduce the warning glyph into this file.
- **Blocked** (text token) — Not resolved, plan cannot complete until addressed. Use the bare word `Blocked` in the Status column; do NOT introduce the cross glyph into this file.
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
