# Plan Review Report — Segregated Session Balance Crediting (DEV1-007)

## Review Round: R1
## Date: 2026-09-11
## Subagents Dispatched: 1 (plan-review dimensions 1–8 + anti-pattern mandate, thorough code verification)

---

## Summary

- **Total issues found:** 8
- **Blocking (CRITICAL/HIGH):** 0
- **Medium:** 3 (GraphQL SDL inaccuracies)
- **Low/Notes:** 5 (test-runner flag, i18n snippet shape, section numbering, filename drift, nonexistent validator hedges)

**Verdict after fixes:** **PASS** — all findings fixed in place; re-verification of each fix point done against the same real-code evidence the reviewer produced. Plan conforms to AGENTS.md + layer rules for the layers it touches (backend services/tests, workflows, GraphQL tests, db schema (no change), docs).

---

## Findings by Dimension

| Dimension | Issues Found | Status |
|---|---|---|
| Paths Existence | 0 (every cited path verified to exist; ~40 load-bearing `file:line` refs spot-verified accurate) | ✅ Clean |
| i18n Compliance | 1 (REQ-008 snippet used `await getTranslations(locale)`; real signature is synchronous) | ✅ Fixed |
| GraphQL Accuracy | 3 (enum value casing; `SessionSubmitInput` vs real `CreateSessionInput`; `confirmSessionCompletion(input:)` vs real `(id: ID!)`) | ✅ Fixed |
| Component Props | 0 (no-UI ruling consistent everywhere) | ✅ Clean |
| Permissions/Enums | 0 (role names, enum vocabularies, `$all` scope composition all match real code) | ✅ Clean |
| Existing Components | 0 (every "already shipped" claim confirmed against code) | ✅ Clean |
| Architecture Compliance | 1 (hold-as-debit anchor cited `backend/services/AGENTS.md:16` — that line is the seed-services section, not the model anchor) | ✅ Fixed |
| Cross-Reference Consistency | 3 (outcome filename drift in plan.md §7; specs.md section numbering skipped 2.5/2.6; tasks.md 3.1 referenced nonexistent `scripts/validate-mermaid.ts`) | ✅ Fixed |
| Anti-pattern mandate | 1 (tasks.md 1.1 passed `--focus` outside `--last` mode — inert flag) | ✅ Fixed |

---

## Detailed Findings & Fixes Applied

1. **[M] plan.md §3.1 — SDL enum casing** — real schema uses TS enum keys (`schema.graphql` registers `Hifz|Tajweed|Reviews`); fixed `HIFZ TAJWEED REVIEWS` → `Hifz Tajweed Reviews`.
2. **[M] plan.md §3.1 — input type name** — `SessionSubmitInput` is the backend TS type; GraphQL uses `CreateSessionInput` (`backend/graphql/pothos/classes/create-session-input.pothos.ts:36`); fixed.
3. **[M] plan.md §3.1 — mutation args** — real signature `confirmSessionCompletion(id: ID!)`; fixed.
4. **[M→L] tasks.md 1.1 — `--focus` flag** — only effective in `--last` view mode (`test/scripts/run-test.ts`); rewrote as full run + `--last --focus` view command.
5. **[L] specs.md REQ-008 — spurious `await`** — `getTranslations(locale)` is synchronous (`shared/locale/server.ts:15`); removed `await`.
6. **[L] specs.md — section numbering skipped 2.5/2.6** — renumbered to 2.5 (Integrity/Documentation/Tenancy), 2.6 (Testing Obligations), 2.7 (Knowledge Propagation).
7. **[L] plan.md §7 vs tasks.md 1.1 — outcome filename drift** — unified on `outcome/1.1-substrate-verification-outcome.md`.
8. **[L] tasks.md 3.1 — nonexistent validator** — replaced with the accurate statement that no DBML validator exists in-repo (parity enforced by re-reading Drizzle source).
9. **[L] specs.md §1 + plan.md §1.3 D1 — loose citation** — dropped `backend/services/AGENTS.md:16`; anchors are now `docs/sessions/session-lifecycle.md` §4–§5 + single-writer discipline reference.

---

## Post-Fix Verification

- [x] All stale references resolved (grep confirms: no `HIFZ TAJWEED`, no `SessionSubmitInput` in GraphQL SDL block, no `--focus` outside `--last`, no `await getTranslations`, no `AGENTS.md:16`, no `2.8/2.9` headers, no `1-substrate-verification` filename).
- [x] AC traceability intact: `REQ-001..035` all present in tasks.md (coverage matrix re-checked after edits — edits touched no REQ refs).
- [x] No new violations introduced by fixes (fixes were citation/snippet corrections only).
- [x] Deferred-items gate command evaluates to 0 on the current ledger (all rows ✅ Done).

## Lessons for Future Plans

- When writing SDL snippets from memory, confirm against `frontend/graphql/generated/schema.graphql` — Pothos registers TS enum keys verbatim (no upper-casing).
- `SessionSubmitInput` (backend TS) vs `CreateSessionInput` (GraphQL input) is a recurring confusion pair in this codebase.
- `run-test.ts --focus` is view-only (binds to `--last`); prescribing it as a run filter would silently run the whole file.
- Ticket wording diverges from shipped models often enough that a "ratify vs refactor" decision section is mandatory for replayable tickets.

## Next Steps

- Plan is execution-ready: proceed with `tasks.md` Phase 0 → 4 (implementation is a separate instruction).
