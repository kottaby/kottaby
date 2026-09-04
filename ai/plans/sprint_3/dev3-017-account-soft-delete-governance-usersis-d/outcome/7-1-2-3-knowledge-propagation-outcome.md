# Phase 7.1 + 7.2 + 7.3 — Knowledge Propagation Outcome

**Task ID:** 7.1 + 7.2 + 7.3
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Date:** 2026-09-04
**Requirements:** REQ-080, REQ-081, REQ-082

---

## What was implemented

### 7.1 — Canonical doc (REQ-080)

- **CREATED** `docs/admin/account-governance.md` — the single canonical reference for the four-state governance lifecycle on `users` (active / suspended / blocked / soft-deleted) and the admin mutations that transition between states.
- Sections shipped (per tasks.md verbatim scope):
  1. **Why** — four-state lifecycle table, Workflow 05 §5 ownership, INV-U4 hard-delete lock, three load-bearing requirements (no TOCTOU on governance writes, lapse = READ-ONLY on the auth path, zero audit-action vocabulary drift).
  2. **Pattern** — (a) guarded single-statement transitions + zero-row classifier + ONE in-tx audit row (8-step pipeline mirroring `setDeletedOnce`); (b) audit-vocabulary mapping for block/unblock via the Suspend/Reactivate members + `details.changedFields` table (zero `audit_action_type` drift — REQ-045); (c) the shared predicate `backend/lib/auth/suspension-window.ts#isSuspensionActive` + both auth consumers (`assertUserActive` in login/refresh, `getServerUserContext` in SSR) + handshake consumer (`isGovernanceExcludedFromDiscovery`).
  3. **Rules** — (1) suspend window `1..3650` mandatory on ON direction; (2) self-protection; (3) uniform `USER_ALREADY_DELETED` deleted-target rule; (4) axis independence; (5) lapse = READ-ONLY on the auth path (REQ-019 zero-write proof); (6) strict `assertActiveActorAdmin` guard on governance mutations ONLY (D4 forward-pointer for the DEV3-016 backport).
  4. **What NOT to Do** — never SELECT-then-UPDATE governance; never hard-delete (INV-U4 lock suite); never extend a suspension in place (use the audited unsuspend+re-suspend pair); never write on the auth path; never fork the predicate; never widen `audit_action_type` outside a governed schema decision (D6).
  5. **Rollout Summary** — the two mutations registered (`adminSetUserSuspended` / `adminSetUserBlocked`); the file inventory (types / predicate / repo / service / auth boundary / handshake / guard / GraphQL / locale / frontend / tests); the `schema-surface.test.ts` + `sdl-static-assertions.test.ts` baseline reconciliation (mirrored the live 23-op Mutation root — documented one-time reconciliation, NOT a silent baseline flip).
  6. **Related Documents** — `docs/admin/user-management.md`, `docs/auth/jwt-authentication-service.md` §5.3/§5.7, `docs/parents/handshake-code-discovery.md`, `docs/workflows/05-admin-governance-override.md` §5, `docs/specs/state-machine-invariants.md` §6, `docs/specs/open-decisions-and-gaps.md` (last two by reference only — NOT edited).

### 7.2 — Inbound/outbound doc reconciliation pointers (REQ-081)

- **MODIFIED** `docs/admin/user-management.md` §6 Scope Split Record — the DEV3-017 row flipped to `**DEV3-017** ✅ shipped — see docs/admin/account-governance.md` (ONE in-place line mutation; NO renumbering; NO re-litigating JR-C-1; row structure preserved).
- **MODIFIED** `docs/auth/jwt-authentication-service.md` §5.3 — added a `> **Note (DEV3-017):**` blockquote below the `assertNotSuspended` description: the shared suspension-window predicate NOW EXISTS at `backend/lib/auth/suspension-window.ts#isSuspensionActive`, consumed by login / `refreshToken` / SSR (`assertUserActive` + `getServerUserContext`); session-creation gating remains the owning consumer (forward pointer D2).
- **MODIFIED** `docs/auth/jwt-authentication-service.md` §5.7 Deferred items table — the `assertNotSuspended` row extended with the same pointer: shared predicate NOW EXISTS at `backend/lib/auth/suspension-window.ts` (consumed by login/refresh/SSR); this session-creation helper remains the owning consumer (forward pointer D2). See `docs/admin/account-governance.md`.
- **MODIFIED** `docs/parents/handshake-code-discovery.md` R3 — added a `> **Note (DEV3-017):**` blockquote below the window-math narrative: the window math above now lives in the shared predicate `backend/lib/auth/suspension-window.ts#isSuspensionActive`; this R3 table stays the semantic source. See `docs/admin/account-governance.md`.
- **NOT edited:** `docs/specs/open-decisions-and-gaps.md` and `docs/specs/state-machine-invariants.md` — bindings by reference only (per tasks.md verbatim + REQ-081). This ticket mints NO new decision and NO new invariant.

### 7.3 — AGENTS.md propagation (REQ-082)

- **MODIFIED** `backend/services/AGENTS.md` — added ONE rule line (as a bold-prefixed bullet, immediately after the existing admin-user-management entry): "Account governance (suspend / block): governance mutations use guarded single-statement transitions (`setSuspendedOnce` / `setBlockedOnce` + `findGovernanceState` zero-row classifier — mirrors `setDeletedOnce`) + the strict `assertActiveActorAdmin` guard (NOT the relaxed `assertActorAdmin` variant) + the Suspend/Reactivate audit-vocabulary mapping for block/unblock (zero `audit_action_type` drift). See `docs/admin/account-governance.md`."
- **MODIFIED** `backend/db/repo/AGENTS.md` — added ONE entry (as a bold-prefixed bullet, immediately after the existing `Guarded self-scope updates` precedent): "Guarded governance-transition pattern (`AdminUserRepository` in `backend/db/repo/admin/admin-user.repository.ts`): `setSuspendedOnce` / `setBlockedOnce` issue single-statement UPDATEs with NULL-safe axis guards + not-deleted guard + `RETURNING SAFE_USER_SELECT` (no SELECT-then-UPDATE TOCTOU — the WHERE clause is the atomicity guarantee); zero-row misses disambiguated by the `findGovernanceState` 5-column classifier probe (mirrors `setDeletedOnce`). See `docs/admin/account-governance.md`."
- **MODIFIED** root `AGENTS.md` Important References — added `docs/admin/account-governance.md` line immediately after the existing `docs/admin/user-management.md` entry (keeps the admin-domain docs grouped): "Account governance canonical reference (DEV3-017: four-state lifecycle on `users`, guarded single-statement transitions + zero-row classifier + ONE in-tx audit row, suspend-window rules `1..3650` mandatory on ON direction, fail-closed shared suspension predicate at `backend/lib/auth/suspension-window.ts`, audit-vocabulary mapping for block/unblock via Suspend/Reactivate, axis independence, lapse = READ-ONLY on the auth path, strict `assertActiveActorAdmin` guard on governance mutations, INV-U4 hard-delete lock)".

Per SKILL.md §Knowledge Propagation filter: all three AGENTS.md additions are **permanent, codebase-wide architectural rules** (guarded single-statement transition + zero-row classifier precedent; strict active-actor guard on governance mutations; zero audit-vocabulary drift) — NOT plan-specific business logic or entity schemas. They pass the global-battle-tested-knowledge filter.

---

## Files modified

| File | Task | Change |
|---|---|---|
| `docs/admin/account-governance.md` | 7.1 | NEW — 7 sections (Why / Pattern / Rules / What NOT to Do / Rollout Summary / Related Documents) |
| `docs/admin/user-management.md` | 7.2 | §6 Scope Split Record — DEV3-017 row flipped to `✅ shipped` + canonical-doc pointer (ONE line mutation) |
| `docs/auth/jwt-authentication-service.md` | 7.2 | §5.3 + §5.7 — note that the shared window predicate NOW EXISTS at `backend/lib/auth/suspension-window.ts`; consumed by login/refresh/SSR; session-creation gating remains the owning consumer (forward pointer D2) |
| `docs/parents/handshake-code-discovery.md` | 7.2 | R3 — one-line pointer that window math now lives in the shared predicate (R3 table stays the semantic source) |
| `backend/services/AGENTS.md` | 7.3 | ONE rule line on governance mutations (guarded transitions + strict guard + audit-vocabulary mapping) |
| `backend/db/repo/AGENTS.md` | 7.3 | ONE entry on the guarded governance-transition pattern (`setSuspendedOnce`/`setBlockedOnce` + `findGovernanceState`) mirroring `setDeletedOnce` |
| `AGENTS.md` | 7.3 | Important References entry for `docs/admin/account-governance.md` |

**NOT edited (per tasks.md verbatim + Hard Rules):**
- `docs/specs/open-decisions-and-gaps.md` — bindings by reference only.
- `docs/specs/state-machine-invariants.md` — bindings by reference only.
- All plan files (`tasks.md`, `specs.md`, `plan.md`, `deferred-items.md`) — orchestrator owns checkbox toggles; the checkbox flips for 7.1/7.2/7.3 are the orchestrator's responsibility.
- All source code under `backend/` / `frontend/` / `shared/` / `test/` — docs-only task.

---

## Verification evidence

- **tsgo project-wide:** `bun tsgo` exit 0 ✅ (no new errors — these are documentation-only changes; markdown files are not type-checked, so the exit-0 signal confirms no source-code regression from the earlier DEV3-017 implementation phases).
- **`git diff --name-only docs/specs/`:** EMPTY ✅ (the two specs files were NOT touched — bindings by reference only per REQ-081).
- **sub-loop health:** ran on all 7 modified files; tsgo passed for each (markdown files produce zero tsgo errors by definition). The oxlint "FAILED — 0 files" message on `AGENTS.md` is the expected no-source-files-in-markdown signal (oxlint lints `.ts`/`.tsx`/`.js`/`.jsx` only — markdown produces "0 files" and the script treats that as a stop).
- **All AGENTS.md additions are rules/references ONLY** — NO code dumps (per REQ-082 + SKILL.md §Knowledge Propagation).
- **All doc reconciliation pointers are ONE-line additions** (or single in-place row mutations) — per REQ-081 "ONE line pointer; NO renumbering, NO re-litigating JR-C-1".

---

## Carry-forward for Phase 7.4 (Outcome synthesis & final gates)

- The canonical doc `docs/admin/account-governance.md` is now the entry point for every future governance-implementer — it consolidates the four-state lifecycle, the guarded-transition pattern, the suspend-window rules, the audit-vocabulary mapping, the fail-closed predicate contract, and the What-NOT-to-Do guardrails in one place.
- The D1–D7 forward-pointer contracts are now documented in `docs/admin/account-governance.md` (in the "Rules" §6 strict-guard D4 forward-pointer, the "Pattern" §2 audit-vocabulary D6 forward-pointer, the "Related Documents" §`docs/auth/jwt-authentication-service.md` §5.3/§5.7 session-creation D2 forward-pointer, and the "What NOT to Do" §6 audit-vocabulary-widening D6 forward-pointer).
- Phase 7.4 (completion outcome) MUST:
  1. Cross-reference this canonical doc as the knowledge-propagation deliverable.
  2. Verify all final gates (Verification Anchors 1–12 from `plan.md`).
  3. Confirm baseline diff = 0 attestation + zero-drift `git diff` attestation.
  4. Confirm `grep -c "❌\|⚠️" ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/deferred-items.md` = 0.
  5. Tick the 7.1 / 7.2 / 7.3 checkboxes (orchestrator's responsibility) once this outcome is accepted.
