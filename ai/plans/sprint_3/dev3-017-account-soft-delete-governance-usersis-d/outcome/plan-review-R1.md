# Phase 1.5 Plan-Review Gate — R1 Outcome

**Task ID:** 0.3
**Plan:** `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d`
**Reviewer:** Phase 0.3 Plan-Review Subagent
**Methodology:** `.agents/skills/plan-review/SKILL.md`
**Date:** 2026-09-03
**Branch:** `feat/dev3-017-account-soft-delete-governance`

## Verdict

✅ **PASS** — implementation (Phases 1–7) MAY begin.

The plan trio (`specs.md` 239 lines + `plan.md` 503 lines + `tasks.md` 418 lines) is **compliant on all 20 cross-cutting rule dimensions** drawn from the layer-specific AGENTS.md files and the three `.agents/instructions/*.instructions.md` files. **Zero rule violations** were found. The gate opens.

Seven factual-accuracy defects (stale line-number citations, a wrong path, a mis-described helper location) are noted below — these are **NOT plan-review rule violations**; they are carry-forward knowledge items already recorded by the Phase 0.2 outcome (anchors A1/A3/A4/A9/A18/A19) and the Non-Negotiable Execution Protocol item 1 (`tasks.md:14`) mandates that every implementation subagent reads ALL outcome files FIRST. The corrections are therefore already in the implementer's hands before any code is written; the plan files are NOT edited (per the hard rule: plan-file edits are reserved for legitimate rule violations, not accuracy defects documented elsewhere).

## Plan Trio Reviewed

| File | Lines | Path |
|---|---|---|
| `specs.md` | 239 | `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/specs.md` |
| `plan.md` | 503 | `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/plan.md` |
| `tasks.md` | 418 | `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/tasks.md` |

Plus the existing outcomes read in pre-execution:
- `outcome/0-baseline-outcome.md` (201 lines — incl. post-install re-baseline: tsgo exit 0 / biome exit 0 / clean tree)
- `outcome/0-2-reuse-substrate-outcome.md` (422 lines — 21 anchors verified, 7 accuracy defects documented as carry-forward knowledge)

## Layers Touched (from tasks.md Phase 1–7)

| Layer prefix | AGENTS.md | Tasks |
|---|---|---|
| `backend/types/admin/` | `backend/types/AGENTS.md` | 1.1 |
| `backend/lib/auth/` | (covered by `backend/AGENTS.md`) | 1.2, 3.2 |
| `backend/services/students/` | `backend/services/AGENTS.md` | 1.3 |
| `shared/locale/` | `shared/locale/AGENTS.md` + `shared/AGENTS.md` | 1.4, 4.2 |
| `backend/services/admin/` | `backend/services/AGENTS.md` | 2.2, 2.4 |
| `backend/db/repo/admin/` | `backend/db/repo/AGENTS.md` | 2.3 |
| `backend/services/auth/` | `backend/services/AGENTS.md` | 3.2 |
| `backend/graphql/mutation/admin/` | `backend/graphql/mutation/AGENTS.md` | 3.1 |
| `backend/graphql/test/` | `backend/graphql/AGENTS.md` | 3.3, 3.4 |
| `backend/graphql/pothos/admin/` | `backend/graphql/pothos/AGENTS.md` | verify-only |
| `frontend/graphql/sharedDocuments/admin/` | `frontend/graphql/sharedDocuments/AGENTS.md` + `frontend/graphql/AGENTS.md` | 4.1 |
| `frontend/views/admin/users/` | `frontend/AGENTS.md` (NO `frontend/views/AGENTS.md` exists — verified via Glob) | 4.3 |
| `app/(dashboard)/admin/users/` | `app/AGENTS.md` | verify-only |
| `test/workflows/admin/` | `test/workflows/AGENTS.md` | 2.1 |
| `test/helpers/` | (covered by `test/workflows/AGENTS.md`) | verify-only |
| `docs/admin/` | (docs propagation) | 7.1 |
| `docs/auth/` | (docs propagation) | 7.2 |
| `docs/parents/` | (docs propagation) | 7.2 |
| Root `AGENTS.md` + `backend/services/AGENTS.md` + `backend/db/repo/AGENTS.md` | (AGENTS.md propagation) | 7.3 |

## AGENTS.md Files Read

| File | Status |
|---|---|
| `/home/z/my-project/AGENTS.md` (root) | ✅ read (full — 484 lines via persisted output) |
| `/home/z/my-project/backend/AGENTS.md` | ✅ read (full — 142 lines) |
| `/home/z/my-project/backend/services/AGENTS.md` | ✅ read (full — 177 lines) |
| `/home/z/my-project/backend/db/repo/AGENTS.md` | ✅ read (full — 118 lines) |
| `/home/z/my-project/backend/graphql/AGENTS.md` | ✅ read (full — 161 lines) |
| `/home/z/my-project/backend/graphql/mutation/AGENTS.md` | ✅ read (full — 58 lines) |
| `/home/z/my-project/backend/graphql/pothos/AGENTS.md` | ✅ read (full — 85 lines) |
| `/home/z/my-project/backend/types/AGENTS.md` | ✅ read (full — 104 lines) |
| `/home/z/my-project/frontend/AGENTS.md` | ✅ read (full — 78 lines) |
| `/home/z/my-project/frontend/graphql/AGENTS.md` | ✅ read (full — 116 lines) |
| `/home/z/my-project/frontend/graphql/sharedDocuments/AGENTS.md` | ✅ read (full — 124 lines) |
| `/home/z/my-project/app/AGENTS.md` | ✅ read (full — 123 lines) |
| `/home/z/my-project/shared/AGENTS.md` | ✅ read (full — 287 lines) |
| `/home/z/my-project/shared/locale/AGENTS.md` | ✅ read (full — 34 lines) |
| `/home/z/my-project/test/workflows/AGENTS.md` | ✅ read (full — 145 lines) |
| `backend/services/admin/AGENTS.md` | N/A — does NOT exist (covered by `backend/services/AGENTS.md`) |
| `backend/db/repo/admin/AGENTS.md` | N/A — does NOT exist (covered by `backend/db/repo/AGENTS.md`) |
| `backend/types/admin/AGENTS.md` | N/A — does NOT exist (covered by `backend/types/AGENTS.md`) |
| `backend/lib/auth/AGENTS.md` | N/A — does NOT exist (covered by `backend/AGENTS.md`) |
| `backend/lib/AGENTS.md` | N/A — does NOT exist (covered by `backend/AGENTS.md`) |
| `frontend/views/AGENTS.md` | N/A — does NOT exist (plan's `tasks.md:307` correctly acknowledges this) |
| `frontend/views/admin/AGENTS.md` | N/A — does NOT exist |
| `frontend/views/admin/users/AGENTS.md` | N/A — does NOT exist |
| `test/AGENTS.md` | N/A — does NOT exist |
| `test/helpers/AGENTS.md` | N/A — does NOT exist |
| `test/workflows/admin/AGENTS.md` | N/A — does NOT exist (covered by `test/workflows/AGENTS.md`) |

Discovery: `Glob **/AGENTS.md` from `/home/z/my-project` returned 26 files. All applicable ones were read; the plan's claim at `tasks.md:307` that "`frontend/views/AGENTS.md` and `frontend/components/ui/AGENTS.md` do NOT exist" was VERIFIED via the Glob result.

## Instruction Files Read

| File | Status |
|---|---|
| `/home/z/my-project/.agents/instructions/backend.instructions.md` | ✅ read (full — 201 lines) |
| `/home/z/my-project/.agents/instructions/frontend.instructions.md` | ✅ read (full — 215 lines) |
| `/home/z/my-project/.agents/instructions/tests.instructions.md` | ✅ read (full — 212 lines) |

## Findings (Round 1)

### Plan-Review Rule Violations (per the 20 dimensions): **0**

Each of the 20 cross-cutting rule dimensions was scanned against `specs.md` + `plan.md` + `tasks.md`. Every dimension returned ✅ COMPLIANT. Detailed dimension-by-dimension audit:

#### Dimension 1 — Type imports: ✅ COMPLIANT
- Rule: All types must come from `@/backend/types/{entity}.types.ts` — no local type definitions in Pothos, GraphQL resolvers, services, or repositories.
- Plan: `plan.md §2.2 (lines 111-125)` adds ONE interface (`GovernanceProbeRowType`) to the EXISTING `backend/types/admin/admin-user.types.ts`; explicitly forbids "NO local types in Pothos/resolvers; NO service-layer `.types.ts` file anywhere."
- Tasks: `tasks.md:62-73` instructs extending the EXISTING canonical types file; `tasks.md:183-184` declares return types as the EXISTING `AdminUserDetailReturnType`; `tasks.md:226` says "NO local types (args derive from the Pothos field inference; canonical types only)".
- Confirmed against `backend/types/AGENTS.md` ("All `.types.ts` files MUST live in `backend/types/`") and `backend/services/AGENTS.md` ("Service-layer `.types.ts` files are prohibited").

#### Dimension 2 — Service boundaries: ✅ COMPLIANT
- Rule: Server Components call services directly; Client Components use Apollo hooks.
- Plan: `app/(dashboard)/admin/users/[id]/page.tsx` is verify-only (no edits); the new `GovernanceActionsSection` is a Client Component using `useMutation` (`plan.md §5.4 component tree`). `plan.md §6 BOLA` confirms `actorId = ctx.user.id` exclusively — no Server-Component-side governance mutation paths.
- Confirmed against `app/AGENTS.md` ("Server Components may call backend services directly", "Server Components must **not** use React hooks").

#### Dimension 3 — MUI v9: ✅ COMPLIANT
- Rule: Style props are NOT valid on MUI components — must use `sx` prop; `*Outlined` icons only.
- Plan: `plan.md §5.4 (line 431)` "MUI v9 discipline: `sx`-only styling; `theme.palette.*` only; `*Outlined` icons; `focusVisibleRingSx` (`frontend/components/ui/focusRing.ts`) on all interactive elements; ≥44px touch targets".
- Tasks: `tasks.md:306` "MUI v9 discipline: `sx`-only (NO direct style props); `theme.palette.*` only (NO hex/rgb); `*Outlined` icons (e.g. `ShieldOutlined`)".
- Confirmed against `frontend/AGENTS.md` ("Style props are NOT valid direct props. Always use `sx`") and `frontend.instructions.md` ("Icon naming: `*Outline` -> `*Outlined`").

#### Dimension 4 — i18n: ✅ COMPLIANT
- Rule: All user-facing strings must use the compile-time TypeScript i18n system in `shared/locale/`, no hardcoded text.
- Plan: `plan.md §5.4 (line 427)` — `AdminUsers` namespace gains ONE group `governanceActions` with EXACTLY 20 slots, both `en`/`ar` locales; `plan.md §5.4 (line 429)` error-copy source of truth: seven new `errorsTranslations.adminUsers` keys + reuse of existing flat `accountDeleted/accountBlocked/accountSuspended`.
- Tasks: 1.4 (error keys), 4.2 (UI keys) — both require both locale implementations.
- Confirmed against `shared/AGENTS.md` §Translation System and `shared/locale/AGENTS.md` (compile-time TypeScript i18n).

#### Dimension 5 — Logging: ✅ COMPLIANT
- Rule: Never `console.*` — must use `logger` from `@/frontend/utils/logger` or `@/backend/lib/logger`.
- Plan: `plan.md §6 (line 468)` "ZERO `console.*`; ONE `logger.logDomainError` per denial (`{ code, entity: "user", entityId, locale }`); happy path silent".
- Tasks: `tasks.md:200` "DomainError subclasses only; `logger` only".
- Confirmed against `AGENTS.md` (root — Logging section) and `backend.instructions.md` ("NEVER use `console.*`").

#### Dimension 6 — Test conventions: ✅ COMPLIANT
- Rule: Database tests must use `runInRollback`, pass `tx`, no `expect().rejects.toThrow()`; journey tests use `test/workflows/` harness.
- Plan: `tasks.md:175` repo tests use `runInRollback + tx propagated to EVERY call + expectRepoError try/catch (NEVER rejects.toThrow())`. `tasks.md:194-197` 4-Tier service test design. `tasks.md:131` journey uses `test/workflows/` harness — "ZERO `runInRollback` around service calls (services spawn their own transactions)". The committed-fixture auth-consumption block (D11, `plan.md §1.3 line 92`) is the documented exception with explicit justification (`AuthService.login` reads via GLOBAL `db` + `touchLastActiveAt` fire-and-forget → outer rollback tx would cause lock-wait hazard).
- Confirmed against `test/workflows/AGENTS.md` rule 1 ("NO `runInRollback` — ever.") + rule 6 ("Never `expect(...).rejects.toThrow()`") + `tests.instructions.md` ("ALWAYS use `runInRollback` wrapper" + "NEVER `expect(...).rejects.toThrow()` inside `runInRollback`").

#### Dimension 7 — GraphQL documents: ✅ COMPLIANT
- Rule: Named `{Entity}QueryDocument`/`{Entity}MutationDocument`, must include `id` field, import from `@apollo/client/react`.
- Plan: `plan.md §5.4 (line 406)` "`adminSetUserSuspendedMutationDocument: TypedDocumentNode<AdminSetUserSuspendedMutation, AdminSetUserSuspendedMutationVariables>` + block analog; BOTH reuse the EXISTING `AdminUserDetailFields` fragment (`admin-users.documents.ts:50-103`) whose `id` is selected FIRST".
- Tasks: `tasks.md:280` "NO `useLazyQuery`; hooks will come from `@apollo/client/react` in the view task".
- Confirmed against `frontend/graphql/AGENTS.md` and `frontend/graphql/sharedDocuments/AGENTS.md` (TypedDocumentNode convention table).

#### Dimension 8 — Enum usage: ✅ COMPLIANT
- Rule: Enums as VALUE imports with MEMBERS in runtime expressions (never string literals where enum types expected).
- Plan: `tasks.md:188` "AuditActionType as VALUE import with MEMBERS (never string literals)". `tasks.md:226` "UserRole as VALUE import with MEMBER".
- Plan §4.2 step 5 uses `AuditActionType.Suspend`, `AuditActionType.Reactivate` (members, not strings).
- Confirmed against `backend/graphql/AGENTS.md` §Pothos Enum Registration Pattern.

#### Dimension 9 — DomainError taxonomy: ✅ COMPLIANT
- Rule: Only `DomainError` subclasses; `logger.logDomainError` for denials; one error code per denial.
- Plan: `plan.md §6 (line 468)`. Uses `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError` — all `DomainError` subclasses per `backend/graphql/AGENTS.md` ("All resolver errors MUST use DomainError subclasses").
- Tasks: `tasks.md:200` "DomainError subclasses only".
- Each denial: exactly ONE `logger.logDomainError` per denial (`plan.md §4.2 step 5`).

#### Dimension 10 — Pothos input types: N/A
- Rule: Accept `T | null | undefined` (not just `T | undefined`).
- The plan uses SCALAR args only (`id: Int!, suspended: Boolean!, periodDays: Int, blocked: Boolean!`) — NO Pothos input types are introduced. `plan.md §3.1` "NO new object types, NO new input types, NO new enums". Rule is moot.

#### Dimension 11 — Drizzle SQL templates: ✅ COMPLIANT
- Rule: `sql\`\`` form with NULL-safe predicates; no inline `--` comments inside `sql` templates.
- Plan: `plan.md §4.3 (line 290)` "Drizzle form with `and(eq(users.id, id), <axis guard>, or(eq(users.isDeleted, false), isNull(users.isDeleted)) ?? sql\`false\`)` — value imports for nothing else; NO prepared statements on writes; NO inline `--` comments inside `sql` templates."
- Tasks: `tasks.md:171` same constraints.
- The `?? sql\`false\`` form is the documented pattern from the existing `setDeletedOnce` (verified at `admin-user.repository.ts:355-375`).

#### Dimension 12 — withTransaction discipline: ✅ COMPLIANT
- Rule: single transaction boundary; `tx` propagated to EVERY inner call; no `db` mixing.
- Plan: `plan.md §4.2 step 4` "withTransaction(outerTx, async tx => { … }) body" with `tx` propagated to repo call, classifier probe, audit row insert, and `getUserDetail` composition.
- Tasks: `tasks.md:200` "withTransaction single boundary; tx propagated to EVERY inner call".
- Confirmed against `tests.instructions.md` ("ALWAYS pass `tx` to ALL repo methods inside transactions").

#### Dimension 13 — BFLA double-line: ✅ COMPLIANT
- Rule: `authScopes` on Pothos field + strict actor re-check inside service.
- Plan: `plan.md §3.2 (line 169)` "authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } } on each (the `$all` conjunction is load-bearing)". `plan.md §4.1` strict `assertActiveActorAdmin` inside the service.
- Tasks: `tasks.md:234` "scope double-line wired (pre-resolver 401/403); `actorId` exclusively from `ctx.user.id`".
- Confirmed against `backend/graphql/AGENTS.md` §Participant-scoped operations ("make the conjunction EXPLICIT with `$all { authenticated: true, role: [UserRole.X] }`").

#### Dimension 14 — BOPLA mass-assignment prevention: ✅ COMPLIANT
- Rule: field-by-field payload construction (no `{ ...input }` spread).
- Plan: `plan.md §6 (line 461)` "Mutations take scalar args ONLY (no input object); service builds write payloads field-by-field; repo `set` maps are closed literals. `{ ...input }` appears NOWHERE."
- Tasks: `tasks.md:199` "field-by-field payload construction, no spread".
- Audit `details` payload at `plan.md §4.2 step 5` is field-by-field: `{ changedFields: [...], suspended: true, suspendedPeriodDays }`.

#### Dimension 15 — BOLA actor sourcing: ✅ COMPLIANT
- Rule: `actorId` from caller param only, never from a target payload.
- Plan: `plan.md §6 (line 460)` "`actorId` derives EXCLUSIVELY from `ctx.user.id`; target `id` is a legitimate admin-controlled parameter".
- Tasks: `tasks.md:199` "actorId from caller param only, never from a target payload".
- Tasks 3.1 resolver delegates `ctx.user.id` exclusively (`tasks.md:226`).

#### Dimension 16 — Cross-layer imports: ✅ COMPLIANT
- Rule: frontend → backend forbidden; shared → frontend/backend forbidden.
- Plan: `plan.md §2.3 (line 129)` "`backend/lib/auth/suspension-window.ts` (runtime module; imports NOTHING but the type-shape inline — shared-layer purity is trivially satisfied since it imports no `frontend`/`app` code)".
- Tasks 1.2 instruction (`tasks.md:91`) "ZERO imports beyond inline types".
- Confirmed against `shared/AGENTS.md` ("NEVER import from `@/frontend/**`, `@/backend/**`, or `@/app/**`").

#### Dimension 17 — Schema drift gate: ✅ COMPLIANT
- Rule: REQ-045 zero schema drift — verify plan does NOT modify `backend/db/schema/**` or `backend/db/migration/**`.
- Plan: `plan.md §2.1 (line 109)` "Zero-drift gate: `git diff -- backend/db/schema/** backend/db/migration/**` MUST be empty at completion. No `bun run db` is ever invoked for this ticket."
- Tasks 5.2 (`tasks.md:337`) "Zero-drift gate: `git diff -- backend/db/schema/** backend/db/migration/**` MUST be EMPTY — capture output in the outcome; `bun run db` NEVER invoked (attest)".
- Confirmed: NO tasks under Phase 1-7 touch `backend/db/schema/**` or `backend/db/migration/**`.

#### Dimension 18 — Hard-delete prohibition: ✅ COMPLIANT
- Rule: INV-U4 — plan must not introduce hard-delete writers or GraphQL fields.
- Plan: `plan.md §6 (line 466)` "Static lock: zero `.delete(users`/`.delete(students`/`.delete(teacher`/`.delete(parents`/`.delete(applicants` writers in production code ... and ZERO `hardDelete*`/`deleteUser`-shaped Mutation fields on the built schema (inventory-pinned)."
- Tasks 5.2 (`tasks.md:335-340`) — adds/static-verifies the lock suite.
- Plan write paths all use `.update(users)` — NO `.delete(users)` introduced (`plan.md §4.3` lines 279-287).

#### Dimension 19 — Clean comments: ✅ COMPLIANT
- Rule: Code comments must NOT reference plan artifacts (no "REQ-1", "Task 3.2", "Phase 4", or `.ai/plans/...` citations in source comments).
- Audit: scanned `plan.md §3-§5` and `tasks.md` task bodies for proposed code comments containing plan-artifact refs. NONE found. Plan describes code with identifiers like `AuditActionType.Suspend` (the actual enum member) and `USER_ALREADY_DELETED` (the actual error code) — these are NOT plan refs.
- The plan files themselves reference "REQ-xxx", "Task X", "D6", etc. — but those are descriptive prose ABOUT the plan, NOT proposed code comments.

#### Dimension 20 — Outcome file protocol: ✅ COMPLIANT
- Rule: every task has outcome file mandate; checkboxes `[ ]` → `[x]` discipline.
- Tasks: `tasks.md` §Non-Negotiable Execution Protocol item 5 ("Outcome Documentation (MANDATORY): after completing a task, write `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/<task-id>-outcome.md`") + item 6 ("Checkbox Tracking (MANDATORY): tick `[ ]` → `[x]` on the task line AND each completed subtask line").
- Each Phase 1-7 task body has a corresponding outcome-file requirement (e.g. 2.M gate, 5.1 integration outcome, 7.4 completion synthesis).

### Factual-Accacy Defects (NOT plan-review findings — documented for completeness)

These are NOT plan-review rule violations. They are accuracy defects in cited line numbers / file paths / architectural claims that the Phase 0.2 outcome ALREADY documented as Carry-Forward Knowledge. Per the Non-Negotiable Execution Protocol item 1 (`tasks.md:14` — "BEFORE starting any task, read ALL existing files under `ai/plans/sprint_3/dev3-017-account-soft-delete-governance-usersis-d/outcome/`"), every implementation subagent will see the corrections in the 0.2 outcome before relying on the cited line numbers. Listed here for audit-trail transparency.

#### F1 — `setDeletedOnce` cited at `admin-user.repository.ts:627-647` (OUT OF RANGE)
- Severity: HIGH (factual accuracy; out-of-range citation)
- Where cited in plan: `plan.md:87` (D6), `plan.md:276`, `tasks.md:34` (Task 0.2 anchor list), `tasks.md:167` (Task 2.3 instructions)
- Actual (verified by direct `Grep`): `setDeletedOnce` is at `backend/db/repo/admin/admin-user.repository.ts:355` (file is 399 lines).
- Documented in: `0-2-reuse-substrate-outcome.md` A1 + Carry-Forward Knowledge item 1.
- Resolution: **REJECTED with justification** — NOT a rule violation per the 20 plan-review dimensions; the 0.2 outcome already carries the corrected line number forward. Plan-file edit withheld per hard rule ("plan-file edits reserved for legitimate rule violations, not accuracy defects documented elsewhere").

#### F2 — `buildAuditContract` described as "private closure inside `user-management.service.ts`" (FALSE)
- Severity: HIGH (factual accuracy; mis-described architectural location)
- Where cited in plan: `plan.md:251`, `tasks.md:35` (Task 0.2 anchor list), `tasks.md:186` (Task 2.4 step 5)
- Actual (verified by direct `Grep`): `buildAuditContract` is an EXPORTED FUNCTION at `backend/services/admin/user-management.helpers.ts:334`; imported into `user-management.service.ts` at line 68; consumed at lines 313 (Create), 374 (Update), 438 (Delete/Reactivate).
- Documented in: `0-2-reuse-substrate-outcome.md` A3 + Carry-Forward Knowledge item 2.
- Resolution: **REJECTED with justification** — NOT a rule violation per the 20 plan-review dimensions (the `.helpers.ts` extraction pattern IS compliant with `backend/services/AGENTS.md` rule "If a service file contains both types and runtime code, split: types → `backend/types/`, runtime → stays in the service layer with a non-`.types` filename (e.g., `.helpers.ts`...)"). The plan's description ("private closure") is inaccurate, but the 0.2 outcome correction is available to implementers per the Non-Negotiable Execution Protocol item 1.

#### F3 — `setUserDeleted` cited at `user-management.service.ts:972-1028` (OUT OF RANGE)
- Severity: HIGH (factual accuracy; out-of-range citation)
- Where cited in plan: `tasks.md:36` (Task 0.2 anchor list — "`setUserDeleted` (`backend/services/admin/user-management.service.ts:972-1028`) incl. the self-protection placement (lines 988-996) and `getUserDetail` composition (lines 809-833)`"), `tasks.md:186` ("placement mirrors lines 988-996")
- Actual (verified by direct `Grep`): `setUserDeleted` at line 388; self-protection at lines 405-412; `getUserDetail` at line 225; file is 446 lines.
- Documented in: `0-2-reuse-substrate-outcome.md` A4 + Carry-Forward Knowledge item 1.
- Resolution: **REJECTED with justification** — NOT a rule violation; the 0.2 outcome already carries the corrected line numbers forward.

#### F4 — Task 2.2 Branch A premise assumes "private `assertActorAdmin` (`user-management.service.ts:240-271`)" — extraction was ALREADY DONE
- Severity: HIGH (factual accuracy; broken branch-decision premise)
- Where cited in plan: `tasks.md:152` (Task 2.2 Branch A instructions)
- Actual (verified by direct `Grep`): `assertActorAdmin` is EXPORTED at `backend/services/admin/admin-gate.helpers.ts:59`; imported into `user-management.service.ts` at line 65; used at lines 118, 157, 193, 231, 271, 342, 395 (no private copy exists). The sibling file `admin-gate.helpers.ts` (singular "gate") — NOT the plan's target `admin-guards.helpers.ts` (plural "guards") — already houses the BFLA actor gate.
- Documented in: `0-2-reuse-substrate-outcome.md` A19 + Conditional Verdicts section ("task 2.2 Branch B-upgrade: BUILD a new strict governance guard from scratch ... recommend filename `admin-governance-guard.helpers.ts` to avoid colliding with the existing `admin-gate.helpers.ts` BFLA gate").
- Resolution: **REJECTED with justification** — NOT a rule violation per the 20 plan-review dimensions. The 0.2 outcome's Conditional Verdict section ALREADY prescribes the resolution: BUILD a new strict governance guard (recommend `admin-governance-guard.helpers.ts`), since the existing `admin-gate.helpers.ts` (singular) covers BFLA actor gating only and contains NO suspended/blocked/deleted evaluation. Plan's Branch A premise is broken, but the 0.2 outcome's Branch B-upgrade prescription is the path forward — and it is documented in a Carry-Forward Knowledge item that the implementer will read per the Non-Negotiable Execution Protocol item 1.

#### F5 — `AdminUserDetailContainer.tsx` cited at `frontend/views/admin/users/` (WRONG PATH)
- Severity: MEDIUM (factual accuracy; wrong file path)
- Where cited in plan: `plan.md:19`, `plan.md:371`, `tasks.md:42`
- Actual (verified via `LS frontend/views/admin/users/`): container is at `frontend/views/admin/users/detail/AdminUserDetailContainer.tsx` (subdirectory `detail/`).
- Documented in: `0-2-reuse-substrate-outcome.md` A18 + Conditional Verdicts section ("Frontend container shape (task 4.3 update-in-place) — Container at `frontend/views/admin/users/detail/AdminUserDetailContainer.tsx`").
- Resolution: **REJECTED with justification** — NOT a rule violation per the 20 plan-review dimensions. The 0.2 outcome's Conditional Verdict section ALREADY prescribes UPDATE-IN-PLACE; the implementer will see this prescription before editing. Plan's task 4.3 already acknowledges "verify-first per 0.2" (`tasks.md:303`).

#### F6 — Task 4.3 proposes `frontend/views/admin/users/components/GovernanceActionsSection.tsx` (subdirectory does NOT exist; 0.2 outcome recommended UPDATE-IN-PLACE of existing `GovernanceCard.tsx`)
- Severity: MEDIUM (factual accuracy; proposed new directory that 0.2 outcome superseded)
- Where cited in plan: `tasks.md:302-303`
- Actual (verified via `LS frontend/views/admin/users/`): NO `components/` subdirectory exists; the EXISTING `GovernanceCard.tsx` at `frontend/views/admin/users/detail/GovernanceCard.tsx` is the verified UI surface for governance actions (per 0.2 outcome A18 + Conditional Verdicts).
- Documented in: `0-2-reuse-substrate-outcome.md` A18 + Conditional Verdicts section ("UPDATE-IN-PLACE — zero new cards needed. The new `adminSetUserSuspended` / `adminSetUserBlocked` mutations wire into the existing `useAdminUserDetail` hook ... and the existing `GovernanceCard` surface gains suspend/block action buttons").
- Resolution: **REJECTED with justification** — NOT a rule violation per the 20 plan-review dimensions. Task 4.3 ALREADY acknowledges the verify-first carve-out ("or the sibling path the VERIFIED container structure in 0.2 dictates; record the chosen path in the outcome"). The 0.2 outcome's UPDATE-IN-PLACE prescription is the path forward — and the implementer will see it before editing.

#### F7 — `withTransaction` import cited at `user-management.service.ts:67` (ACTUAL: line 62)
- Severity: LOW (factual accuracy; off-by-5 line citation)
- Where cited in plan: `tasks.md:40` (Task 0.2 anchor list)
- Actual (verified by direct `Grep`): import at line 62.
- Documented in: `0-2-reuse-substrate-outcome.md` A4 + A9.
- Resolution: **REJECTED with justification** — NOT a rule violation; cosmetic citation drift, already corrected by the 0.2 outcome.

### Severity Tally (Round 1)

| Severity | Count | Type |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 4 (F1, F2, F3, F4) | Factual-accuracy defects (NOT rule violations) |
| MEDIUM | 2 (F5, F6) | Factual-accuracy defects (NOT rule violations) |
| LOW | 1 (F7) | Factual-accuracy defect (NOT rule violation) |
| **Rule violations (plan-review findings)** | **0** | — |

## Iteration Round 2 (no fixes applied — verdict reached on Round 1)

Per the hard rule ("plan-file edits reserved for legitimate rule violations per the 20 dimensions above"), NO plan-file edits were applied. All 20 dimensions returned COMPLIANT on Round 1; the seven accuracy defects (F1-F7) are explicitly REJECTED-with-justification as out-of-scope for plan-review (they are 0.2-scope items already documented as Carry-Forward Knowledge). Round 2 is therefore a no-op re-review of the same plan trio with the same outcome: **zero rule violations**.

## Final State

- Findings resolved: 0 fixed, 7 rejected-with-justification (F1-F7 — accuracy defects documented elsewhere by 0.2 outcome)
- Plan files modified: NONE — `specs.md`, `plan.md`, `tasks.md` are UNTOUCHED. (Per hard rule: edits reserved for legitimate rule violations per the 20 dimensions. The accuracy defects are NOT rule violations and are already carried forward by the 0.2 outcome.)
- Remaining open findings: 0 rule violations (gate PASS). The 7 accuracy defects are documented for audit-trail transparency but are NOT gate-blocking — they are 0.2-scope Carry-Forward Knowledge items, and the Non-Negotiable Execution Protocol item 1 (`tasks.md:14`) mandates that implementers read the 0.2 outcome BEFORE starting any task.

## Gate Decision

✅ **Implementation (Phases 1-7) MAY begin.**

The plan trio is compliant with every applicable AGENTS.md and instruction-file rule across all 20 cross-cutting dimensions. The 0.3 plan-review gate is satisfied (REQ-083). The 7 factual-accuracy defects (F1-F7) noted above are carry-forward knowledge from the Phase 0.2 outcome — they are NOT gate blockers; they are documented to ensure implementation subagents receive a transparent audit trail alongside the corrections already present in `outcome/0-2-reuse-substrate-outcome.md`.

### Pre-Implementation Reminders (for the orchestrator / Phase 1+ subagents)

1. **Read all outcome files first** — per `tasks.md:14` Non-Negotiable Execution Protocol item 1. The 0.2 outcome carries 7 corrected line/path citations (F1-F7 above) that the plan files still cite wrongly. Grep the symbol name, do NOT trust the cited line number.
2. **`bun install` IS now complete** — the 0.1 outcome's "Post-Install Re-Baseline" section (`outcome/0-baseline-outcome.md:187-200`) confirms tsgo exit 0 / biome exit 0 / clean tree. The Phase 0.1 sandbox hazard is RESOLVED.
3. **`buildAuditContract` is the EXPORTED helper at `user-management.helpers.ts:334`** — NOT a private closure inside the service (despite what plan.md/tasks.md prose claims). Task 2.4 MUST reuse this exported helper.
4. **`assertActorAdmin` is the EXPORTED function at `admin-gate.helpers.ts:59`** — NOT a private closure inside `user-management.service.ts`. Task 2.2's Branch A premise (extract the private copy) is broken; the 0.2 outcome's Branch B-upgrade prescription (BUILD a new `admin-governance-guard.helpers.ts` strict governance guard) is the path forward.
5. **Frontend container is at `frontend/views/admin/users/detail/AdminUserDetailContainer.tsx`** (NOT the cited root path). Task 4.3 is UPDATE-IN-PLACE — extend the existing `GovernanceCard.tsx` at `frontend/views/admin/users/detail/GovernanceCard.tsx`; wire new mutation docs into the existing `useAdminUserDetail` hook at `frontend/views/admin/users/hooks/useAdminUserDetail.ts`.
6. **Schema-surface tests are STALE** (0.2 outcome A20/A21 + Schema-Surface Freshness Check). Task 3.4 must RECONCILE-then-EXTEND: first re-anchor `schema-surface.test.ts` + `sdl-static-assertions.test.ts` inventories to the LIVE 21-op Mutation root, THEN pin the 2 new DEV3-017 mutations (`adminSetUserBlocked`, `adminSetUserSuspended`).
