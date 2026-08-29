# Deferred Items Ledger

**Feature:** `dev1-013-student-handshake-code-generation`  
**Plan Directory:** `ai/plans/dev1-013-student-handshake-code-generation/`  
**Created:** `2026-08-28`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Parent page "Send link request" CTA wire-up | 0.1 (DEV1-013 baseline) | DEV1-014 | 📝 Forward | — | Pre-seeded forward-note, non-blocking. The parent-side CTA that consumes this ticket's handshake-code discovery/link flow is owned by DEV1-014; DEV1-013 ships the code-generation + discovery backend without the CTA wire-up. |
| D2 | Real per-parent/per-IP rate limiting for the discovery query | 0.1 (DEV1-013 baseline) | DEV2-002 | 📝 Forward | — | Pre-seeded forward-note, non-blocking. Brute-force mitigation rationale per REQ-034: real per-parent/per-IP throttling of the code-discovery query is owned by the DEV2-002 stream; DEV1-013 relies on existing scope/auth guardrails only. |
| D3 | Direct-onboarding (B.6-family) code generation reuse via shared `generateHandshakeCode` service entry point | 0.1 (DEV1-013 baseline) | DEV3-019 | 📝 Forward | — | Pre-seeded forward-note, non-blocking. Reuse of the shared service entry point by the direct-onboarding (B.6-family) flows is owned by DEV3-019; DEV1-013 exposes the entry point without onboarding-flow integration. |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📝 **Forward** — Pre-seeded forward-note: known follow-up explicitly owned by a later ticket/stream; non-blocking for this plan (plan may complete with this entry open)
