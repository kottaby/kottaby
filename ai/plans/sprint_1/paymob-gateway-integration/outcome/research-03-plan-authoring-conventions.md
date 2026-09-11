Research complete. Here is the digest.

---

# Plan-Authoring Conventions Digest — for `ai/plans/sprint_1/paymob-gateway-integration/`

## Sources read (all verified to exist)

| Source | Role |
|---|---|
| `.agents/spec-process-guide/templates/requirements-template.md` (308 lines), `design-template.md` (624), `tasks-template.md` (652), `deferred-items-template.md` (154), `checklists.md` (558), `plan-review-template.md` (108) | Canonical templates |
| `ai/prompt.md` (24 lines) | Generator contract (post-generation audit, deliverables list) |
| `ai/plans/sprint_1/subscription-purchase-payment-gateway/{specs,plan,tasks,deferred-items}.md` (253/335/234/61 lines), `outcome/plan-review-R1.md` (83 lines) | Newest sibling plan — de-facto current house style |
| `ai/finished_plans/sprint_1/plan-catalog-crud-admin-only/{specs,plan,tasks}.md` | Finished plan consistency check |
| `ai/plans/sprint_1/…`, `…`, `ai/plans/sprint_3/…`, `ai/finished_plans/sprint_1/…`, `…` | Cross-plan REQ-range probes |

---

## 1. Verbatim header / front-matter blocks (as actually used by the subscription-purchase plan, the current house style)

The generic templates use a `## Document Information` bullet block; the live plan convention wraps it in a path-first header. The subscription-purchase plan's are canonical for a new plan:

**specs.md** (`ai/plans/sprint_1/subscription-purchase-payment-gateway/specs.md:1-19`):
```markdown
# Requirements & Specification: Subscription Purchase via Payment Gateway

**Plan directory:** `ai/plans/sprint_1/subscription-purchase-payment-gateway/`
**Specs path:** `ai/plans/sprint_1/subscription-purchase-payment-gateway/specs.md`
**Deferred-items ledger:** `ai/plans/sprint_1/subscription-purchase-payment-gateway/deferred-items.md`
**Outcome directory:** `ai/plans/sprint_1/subscription-purchase-payment-gateway/outcome/`

## Document Information

- **Feature Name**: Subscription Purchase via Payment Gateway
- **Ticket Reference**: `docs/planning/TICKETS.md:449-493` (the subscription-purchase plan, Sprint 1, 5 pts, Blocked By the plan-catalog ticket — done in `ai/finished_plans/sprint_1/plan-catalog-crud-admin-only/`)
- **Target Directory**: `ai/plans/sprint_1/subscription-purchase-payment-gateway/`
- **Outcome Directory**: `ai/plans/sprint_1/subscription-purchase-payment-gateway/outcome/`
- **Companion Plan**: `ai/plans/sprint_1/subscription-purchase-payment-gateway/plan.md`
- **Companion Tasks**: `ai/plans/sprint_1/subscription-purchase-payment-gateway/tasks.md`
- **Version**: 1.0
- **Date**: 2026-09-06
- **Author**: Spec Plan Generator (swarm)
- **Stakeholders**: Dev 1 stream (owner), …
```

**plan.md** (`plan.md:1-13`):
```markdown
# Technical Architecture & Implementation Design: Subscription Purchase via Payment Gateway

**Plan directory:** `ai/plans/sprint_1/subscription-purchase-payment-gateway/`
**Specs:** `…/specs.md`
**Tasks:** `…/tasks.md`
**Deferred-items ledger:** `…/deferred-items.md`

## Document Information

- **Feature Name**: …
- **Ticket**: the subscription-purchase plan (Sprint 1, 5 pts) — `docs/planning/TICKETS.md:449-493`
- **Version**: 1.0 · **Date**: 2026-09-06
- **Related Documents**: `docs/billing/plan-catalog.md`, `docs/IDEMPOTENCY.md`, `docs/notifications/realtime-engine.md`, `docs/graphql/error-handling-contract.md`, `docs/specs/state-machine-invariants.md`, `docs/specs/open-decisions-and-gaps.md`, `docs/planning/SPRINT_PLAN.md`
```

**tasks.md** (`tasks.md:1-18`):
```markdown
# `tasks.md` — Subscription Purchase via Payment Gateway

**Plan directory:** `ai/plans/sprint_1/subscription-purchase-payment-gateway/`
**Specs:** `specs.md` · **Plan:** `plan.md` · **Ledger:** `deferred-items.md` · **Outcomes:** `outcome/`

**Nature of this ticket:** buys-side money flow — …

## Document Information

- **Feature**: … · **Ticket**: the subscription-purchase plan (Sprint 1, 5 pts)
- **Version**: 1.0 · **Date**: 2026-09-06

### Numbering & Traceability Conventions

- Task ids `X.Y` follow phases below; every implementation task carries the standard pipeline suffixes: `.QL` (quality loop `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`, exit 0), `.TE` (4-tier tests), `.SEC` (BOLA/BOPLA/BFLA audit), `.SR` (semantic review checklist), `.IV` (instruction verification — read ALL AGENTS.md + `.github/instructions/*.instructions.md` files printed by `sub-loop.ts`).
- Outcome files: `outcome/<task-id>-outcome.md` per completed task (MANDATORY).
- Every task declares `_Requirements: REQ-…_` with EXPANDED id lists (no ranges) so traceability is grep-verifiable.
- Tests run via `bun run test/scripts/run-test.ts <path>` ONLY (REQ-004); NEVER raw `bun test`.
```

**deferred-items.md** (`deferred-items.md:1-5`):
```markdown
# Deferred Items Ledger

**Feature:** `subscription-purchase-payment-gateway`
**Plan:** `ai/plans/sprint_1/subscription-purchase-payment-gateway/`
**Created:** `2026-09-06`
```
(the session-report plan's variant at `ai/plans/sprint_1/session-report-homework-infrastructure/deferred-items.md:1-5` uses `**Feature:**` + `**Plan Directory:**` + `**Created:**` — same shape.)

Convention variance to note (pick one and stay consistent):
- The session-report plan's tasks.md opens with blockquote-style `> **Plan directory (verbatim — used in every header, ledger path, outcome path, and self-reference below):** …` (`…/tasks.md:1-8`) and an explicit scope ruling line; the subscription-purchase plan uses the compact bold-line block above. Both are accepted; the subscription-purchase plan is the most recent money-flow plan and the best template for this Paymob plan.
- The finished plan-catalog plan uses a `> **Target ticket:** … / > **Plan directory:** … / > **Blocking dependencies:** … / > **Critical reconciliation note:** …` quote block (`…/specs.md:3-6`) and a "Source of truth" line citing the REQ range (`…/tasks.md:5`: `> **Source of truth:** `specs.md` (REQ-001..REQ-083) + `plan.md` (D1..D8)`).

---

## 2. Complete ordered section outlines per doc

### specs.md (the subscription-purchase plan actual outline — supersedes template’s generic order)
1. `## Document Information` (+ header block above)
2. `## Introduction` → `### Feature Summary`, `### Business Value`, `### Scope` (IN/OUT bullets, `specs.md:29-31`)
3. `## 1. Executive Summary & Problem Statement` — includes the **Verification-first ground-truth table** (Substrate / State / Evidence with `path:line`) (`specs.md:33-55`)
4. `## 2. Requirements (EARS)` with subsections:
   - `### 2.0 Execution Protocol & Engineering Discipline` (REQ-001 baseline/outcomes, REQ-002 per-file quality loop, REQ-003 i18n, REQ-004 test-runner discipline, REQ-005 enum discipline)
   - `### 2.1 … 2.8` domain sections (Purchase Flow; Payment Webhook & Activation; Concurrency/Atomicity/Integrity; Security/Authorization/Tenancy; Validation/Errors/Localization; GraphQL/Catalog/UX; Testing Obligations; Knowledge Propagation & Spec Hygiene)
   - Each REQ rendered as `- **REQ-NNN (Name)**: WHEN … THEN … SHALL …` with `path:line` evidence inline (`specs.md:61-136`)
5. `## 3. Cross-Actor Workflow Scenarios (Journeys)` — Actor Table / Ordered Step List / Denial & Probe Steps / Cross-Actor EARS Criteria (observer-perspective) (`specs.md:138-170`)
6. `## 4. UX/Navigation Requirements` — New Routes table, Sidebar/Nav integration, Role-Based Access Matrix; explicit "no new UI" ruling where applicable (`specs.md:172-193`)
7. `## 5. Non-Functional Requirements` (Performance / Security / Reliability / Usability-Localization)
8. `## 6. Constraints & Assumptions` (Technical / Business / Assumptions)
9. `## 7. Success Criteria` (Definition of Done checklist + Acceptance Metrics)
10. `## 8. Glossary` (term table)

Requirements-template givens that must carry over: Requirement 0/0.5 baseline + i18n/enum protocol (`requirements-template.md:44-84`) — the subscription-purchase plan consolidated these into its §2.0 block.

### plan.md (the subscription-purchase plan actual outline)
1. `## 1. System Overview & Architecture` → `### 1.1 What this is`, `### 1.2 Interaction diagram` (mermaid sequenceDiagram), `### 1.3 Key Design Decisions` — numbered **D1..D10** table: `| # | Decision | Rationale | Alternatives rejected |` (`plan.md:15-57`)
2. `## 2. Data Models & Database Schema` → 2.1 existing-schema verification table (`path:line`) / 2.2 schema deltas (CREATE/EXTEND/MIGRATION) / 2.3 canonical `backend/types/` types
3. `## 3. API Contracts & Pothos Resolvers` → 3.1 SDL sketch in a `graphql` fence; 3.2 resolver shape & authScopes table; 3.3 permission matrix; 3.4 REST webhook contract (incl. ROUTE_INVENTORY registration row)
4. `## 4. Backend Services, Repositories & Concurrency` → 4.1 exact signature lists per file (CREATE/EXTEND); 4.2 race-condition table (Race | Guard | Test proof); 4.3 cross-actor journey design (state machine table + mermaid stateDiagram-v2 + side-effect matrix + visibility matrix)
5. `## 5. Frontend UX & Navigation Specification` (explicit no-UI ruling allowed)
6. `## 6. Security, Authorization & Tenancy Mitigations` (threat → mitigation → REQ mapping table)
7. `## 7. Components & Interfaces (implementation level)` (per-task component mapping)
8. `## 8. Error Handling & Error Contract Detail` (situation → class → `extensions.code` → HTTP table)
9. `## 9. Testing Strategy (layered)` (Layer | Location | Tool | Scope)
10. `## 10. Deployment, Migration & Compatibility`
11. `## Appendix — Governing rule files (read at execution per task)` (`plan.md:332-335`)

Note: `ai/prompt.md:16` mandates `plan.md` MUST contain "Overview+decisions, Data Models, API Contracts+SDL+permission matrix, Services/Repo signatures+concurrency assessment+Journey Design, UX/Nav spec — even if explicit no-UI ruling, Security/Tenancy mitigations" — the subscription-purchase plan's outline is the living example.

### tasks.md (the subscription-purchase plan actual structure)
1. Header block + `### Numbering & Traceability Conventions` (verbatim above)
2. `## Non-Negotiable Execution Protocol` — 5 numbered items (`tasks.md:20-26`):
   ```markdown
   1. **Read `outcome/` first** — before ANY task, read every existing file in this plan's `outcome/`.
   2. **Per-file loop** — after each file edit, `sub-loop.ts <file> --lifecycle duplicates` must exit 0 before the next file.
   3. **Semantic review before `[x]`** — race conditions, env-config registration, dead code, cross-layer imports, enum value imports, deferred items (skill checklist).
   4. **No plan-meta in code** — comments/JSDoc never reference REQ ids, task ids, or plan paths.
   5. **Evidence or it didn't happen** — checkboxes flip only with outcome-file evidence.
   ```
   (the session-report plan expands this into P1..P7 protocols, incl. P7 instruction-file reality constraint.)
3. `## Phase 0: Pre-Implementation Baseline (MANDATORY)` — task 0.1 (record tsgo/biome/lint baseline counts; write `outcome/0.1-outcome.md`; `_Requirements: REQ-001_`)
4. `## Phase 1.5: Plan Review Gate (MANDATORY — executed at planning time)` — task 1.1 marked `[x]` by the author, verdict recorded in `outcome/plan-review-R1.md` (`tasks.md:36-40`)
5. Domain phases (Phase 2 "Schema, Enums & Types"; Phase 3 "Repositories (interleaved 100%-coverage tests)"; Phase 4 "Payment Gateway Port"; Phase 5 "Purchase Service"; **Phase 2.5 Mid-Point Backend Review Gate** placed after the backend block — `tasks.md:127-132`; Phase 6 "Activation Service & Webhook"; Phase 7 "GraphQL Surface"; Phase 8 "Catalog Lane Propagation + Admin Form Delta"; Phase 9 "Cross-Actor Journey Tests"; Phase 10 "Final Gate & Knowledge Propagation" with 12.1 baseline-compare + `grep -c "❌\|⚠️" deferred-items.md` == 0 and 13.1 knowledge propagation)
6. `## Traceability Map (REQ → tasks)` — terminal table mapping every REQ to task ids; grouped rows allowed (`| REQ-010, REQ-011, … | 6.1 (REQ-010 also 9.2, 9.3) |`), ranges inside a cell allowed (e.g. `4.1–4.4`), but the `_Requirements:` lines on tasks themselves must be **expanded, no ranges** (`tasks.md:17`, `199-234`)

Task entry shape (verbatim example, `tasks.md:80-83`):
```markdown
- [ ] 4.1 `SubscriptionRepository` (CREATE `backend/db/repo/billing/subscription.repository.ts` + barrel)
  - Methods per plan §4.1 (`insertSubscription`, `findById`, `findByPaymentReference`, `activatePendingOnce`, `listByUserId`); non-tx reads via `queryDb(tx)`; guarded update never SELECT-then-UPDATE.
  - [ ] 4.1.QL · [ ] 4.1.TE — `backend/db/test/logic/billing/subscription.repository.test.ts` (runInRollback, tx everywhere, zero-row guarded path proven; 100% coverage per `backend/db/test/AGENTS.md` rule 14) · [ ] 4.1.SEC · [ ] 4.1.SR · [ ] 4.1.IV
  - _Requirements: REQ-002, REQ-004, REQ-030, REQ-031, REQ-070_
```
Two accepted subtask styles: the compact one-liner above (the subscription-purchase plan, the dual-confirmation plan) or fully expanded subtask bullets with task-specific TE/SEC content (the session-report plan, e.g. `…/tasks.md:127-131`). CREATE/EXTEND kind labels are mandatory per touched path.

### deferred-items.md (the subscription-purchase plan actual structure, `deferred-items.md:1-61`)
1. Header (above) → `## Purpose` (verbatim from template line 11)
2. `## Ledger Table` with columns `| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |`; empty-at-authoring convention: a single `(none at plan-authoring time)` row (`deferred-items.md:19`)
3. `## Status Values` — ✅ Done / ⚠️ Partial / ❌ Blocked / 🔄 In Progress (the session-report plan adds a fifth: `📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan`, `…/deferred-items.md:24-28`)
4. `## Inbound Forward Contracts (resolved BY this plan — NOT deferred items)` — table `| External contract | Source | How this plan resolves it |` (`deferred-items.md:32-37`)
5. `## Known Cross-Ticket Deferrals (NOT this plan's ledger entries)` — table `| Item | Owning ticket | Note |` with the explicit sentence *"These belong to downstream tickets and are recorded here so their consumers see them — they MUST NOT block this plan's completion gate"* (`deferred-items.md:39-48`)
6. `## Enforcement` — names the final gate task id and the grep command with `Expected: 0`; exit criteria sentence (`deferred-items.md:52-61`)

### outcome/plan-review-R1.md (verdict format)
Template: `.agents/spec-process-guide/templates/plan-review-template.md` — header `## Review Round: <N>` / `## Date:` / `## Subagents Dispatched:` → `## Summary` (Total/Blocking/Medium/Low counts) → `## Findings by Dimension` table (Paths Existence, i18n Compliance, GraphQL Accuracy, Component Props, Permissions/Enums, Existing Components, Architecture Compliance, Cross-Reference Consistency + plan-specific rows like "Registry/Route Compliance", "UX/Nav ruling", "Traceability (specs↔tasks)") → `## Detailed Findings` (F1.. with Location/Expected/Actual/Fix Applied) → `## Dimension Pass Notes` → `## Post-Fix Verification` checklist → `## Lessons for Future Plans` → `## Traceability` → `## Next Steps`.

Actual the subscription-purchase plan R1 verdict line (`outcome/plan-review-R1.md:18`): `- **Verdict after fixes:** ✅ **Plan passes all AGENTS.md rules** (all 4 fixed in-file; re-verified by grep).` Header variation (`:3-5`): `## Review Round: 1 (Phase 1.5 gate)`, `## Subagents Dispatched: none — review executed inline …` (inline review is an accepted mode). Final checklist includes the structure gate verbatim (`:82`).

---

## 3. Standard QL/TE/SEC/SR/IV subtask pipeline boilerplate (verbatim from `tasks-template.md`)

Sequence: **QL → TE → SEC → SR → IV → Mark `[x]`** (`tasks-template.md:117`). Full boilerplate blocks (lines 54-115):

```markdown
- [ ] X.Y.QL **Quality Loop**: Per-file verification on `<file-path>`
  - Run: `bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates`
  - The script runs: tsgo → oxlint → biome:check → lint:type-aware → check:duplicates
  - It auto-discovers & prints applicable AGENTS.md + .agents/instructions files
  - It enforces the Fix-Or-Report rule (fix within same file; report cross-file deps to orchestrator)
  - Exit code 0 = all checks passed; 1 = stopped at failing check (errors printed)
  - Fix all errors and re-run until exit code 0 before proceeding
```
```markdown
- [ ] X.Y.TE **Test Engineering**: Author / expand tests using 4-Tier Framework
  - **Tier 1 (Branch & Statement Coverage)**: 100% method and branch coverage for new logic/methods.
  - **Tier 2 (Boundary Value Analysis)**: Test empty strings, nullability fallbacks, unicode/RTL, numeric limits, timezone/date boundaries.
  - **Tier 3 (Monkey & Chaos Testing)**: Execute randomized fuzz payloads, concurrent execution races (`Promise.allSettled`), and out-of-order state transitions.
  - **Tier 4 (Security & Abuse Testing)**: Probe SQL/LIKE wildcards (`%`, `_`, `\`), unauthenticated rejections, and invalid role handling.
  - **Layer Rules Enforced**:
    • Database tests: Wrapped in `runInRollback` + `tx` propagation to every repository method (`expectRepoError` try/catch).
    • Service tests: Mock all external channels (WhatsApp, Resend, Twilio, Fixer, Upstash Redis).
    • GraphQL tests: Setup via `setupTestServerLifecycle()` + execute via `testClient`.
    • Journey tests (`test/workflows/`): Real services + real DB, committed fixtures + tracked `afterAll` cleanup, NO `runInRollback`; authorization resolves honestly via real user roles; side effects (notifications) spied — see `docs/testing/workflow-journey-tests.md` and `test/workflows/AGENTS.md`.
```
```markdown
- [ ] X.Y.SEC **Security & Tenancy Audit**: Probe for authorization and boundary vulnerabilities
  - **BOLA / IDOR Defense**: Verify identity is derived from `ctx.user.id` / session context; confirm caller cannot read/mutate sibling tenant records.
  - **BOPLA Mass Assignment Defense**: Verify strict DTO mapping; ensure no `{ ...input }` spread into Drizzle `update()` / `set()` calls.
  - **BFLA Function Access**: Verify low-privilege tokens (e.g. students/parents/guests) cannot call admin/supervisor mutations or internal triggers.
  - **Composite Relations**: Verify child resources belong to the verified parent resource (`child.parentId === callerParentId`).
  - **Input Sanitization**: Ensure LIKE/ILIKE search queries escape wildcard characters (`escapeLikeWildcards`).
```
```markdown
- [ ] X.Y.SR **Semantic Review**: Agent self-review before marking complete
  - [ ] No client-supplied ID used without caller ownership or role permission assertion (IDOR/BOLA defense)
  - [ ] Multi-tenant Drizzle queries include explicit tenancy filter (`eq(table.parentId/tenantId, callerId)`)
  - [ ] No unvalidated `...input` spreading into Drizzle update methods (BOPLA mass assignment defense)
  - [ ] DataLoaders filter batch results against caller authorized tenancy
  - [ ] No read-then-write without atomicity (SELECT FOR UPDATE / tx / advisory lock)
  - [ ] No module-level mutable state without bounds
  - [ ] All `resolveEnvConfig` calls registered in `env-config-keys.ts`
  - [ ] All `resetX()` functions invalidate all resolved keys
  - [ ] No empty-string credential acceptance
  - [ ] No dead branches (all paths reachable)
  - [ ] No cross-layer imports (frontend→backend, shared→frontend/backend)
  - [ ] Enums imported as values (not `import type`) when used at runtime
  - [ ] Schema migrations match Drizzle schema
  - [ ] All deferred items logged in `deferred-items.md`
```
```markdown
- [ ] X.Y.IV **Instruction Verification**: Read & validate `<file-path>` against rule files
  - The `sub-loop.ts` script (run in X.Y.QL) auto-discovers & prints applicable rule files
  - Read ALL printed AGENTS.md files (e.g., `/home/ahmed/Projects/kottaby/AGENTS.md`, `/home/ahmed/Projects/kottaby/<layer>/AGENTS.md`)
  - Read ALL printed .agents/instructions files (e.g., `/home/ahmed/Projects/kottaby/.agents/instructions/<layer>.instructions.md`)
  - Validate the file against the rules in those files
```

**Practice note:** the subscription-purchase plan and the dual-confirmation plan use the compact inline form `[ ] X.Y.QL / TE (…task-specific…) / SEC (…) / SR / IV` instead of the full expansion; the session-report plan and the plan-catalog plan use expanded per-task versions with task-specific TE/SEC content. Both pass review; choose per plan size.

**Absolute path staleness warning:** the template's IV block and the Layer-to-Instructions mapping table (`tasks-template.md:119-138`) hardcode `/home/ahmed/Projects/kottaby/...` — the actual repo root is `/home/ahmed/Projects/kottaby_kottaby`. Live plans (the subscription-purchase plan, the session-report plan) do NOT echo absolute paths per task; they rely on `sub-loop.ts` auto-discovery plus a P7/appendix rule listing only *verified* paths (`…/tasks.md` P7; `subscription-purchase-plan…/plan.md:332-335` appendix). Follow that, not the template literals.

---

## 4. REQ-ID numbering conventions and free range

**REQ numbers are plan-local, not global.** Every spec'd plan restarts at REQ-001:

| Plan | REQ range used (grep of its specs.md) |
|---|---|
| the subscription-purchase plan (`ai/plans/sprint_1/subscription-purchase-plan…/specs.md`) | REQ-001..005, 010..017, 020..028, 030..034, 040..045, 050..053, 060..065, 070..075, 080..082 |
| the plan-catalog plan (`ai/finished_plans/sprint_1/…/specs.md`) | REQ-001.. up to REQ-083 |
| the session-lifecycle plan (`ai/finished_plans/sprint_1/…/specs.md`) | REQ-001..004, 010..023, 030..036, 040..047, 050..054, 060..065, 070..077, 080..083 |
| the applicant-lifecycle plan (`ai/finished_plans/sprint_1/…/specs.md`) | REQ-001.. REQ-083 |
| the session-report plan (`ai/plans/sprint_1/…/specs.md`) | REQ-001..003, 010..019, 030..034, 040..044, 050..055, 060..064, 070..072 |
| the dual-confirmation plan (`ai/plans/sprint_1/…/specs.md`) | **NO REQ-* at all** — requires are expressed as INV-S1…S8 invariant refs; REQ-* numbering is strong convention, not universal law |
| the sprint-3 plan (`ai/plans/sprint_3/…/specs.md`) | REQ-001..071 (contains two malformed tokens `REQ-01`, `REQ-05` — typos, not a convention) |

De-facto band convention (shared across plans but numbering is still local): **001-005** = execution-protocol block (baseline, quality loop, i18n, test-runner, enums), **010s/020s** = core flow, **030s** = concurrency/db integrity, **040s** = security/authz/tenancy, **050s** = validation/errors/localization, **060s** = GraphQL/UX, **070s** = testing obligations, **080s** = knowledge propagation/spec hygiene.

**Free-range ruling for the new Paymob plan: REQ-001 and up — the whole namespace is local to the plan.** Because the new plan is a successor to the subscription-purchase plan (real adapter on the port the subscription-purchase plan builds), the plan author MUST qualify every cross-plan REQ citation with the owning plan path, e.g. how the subscription-purchase plan cites `ai/finished_plans/sprint_1/plan-catalog-crud-admin-only/specs.md:83` (its deferred item D2)" (`deferred-items.md:36`).

---

## 5. Traceability conventions (task → REQ)

- Every task bullet ends with `_Requirements: REQ-…_` in **expanded** id lists — "no ranges" so grep-verifiable (`tasks.md:17`).
- `ai/prompt.md:17` mandates the machine check after authoring: ``for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo MISSING: $r; done`` — **zero misses**, "including ranges in section headers" (so the Traceability Map's grouped/ranged cells are tolerated only because each REQ also appears expanded in `_Requirements:` lines).
- tasks.md must end with a `## Traceability Map (REQ → tasks)` table (`tasks.md:199-234`).
- The plan-catalog plan adds a `> **Source of truth:** `specs.md` (REQ-001..REQ-083) + `plan.md` (D1..D8)` line (`…/tasks.md:5`) binding spec range + design decision ids.
- Design decisions are cited as D1..Dn between plan.md and tasks/specs (e.g. "plan D7", `(D2)` in `deferred-items.md:49`).
- Checkbox rule: `[ ]` → `[x]` only with outcome-file evidence ("Evidence or it didn't happen", `tasks.md:26`); outcome files at `outcome/<task-id>-outcome.md`; the Phase-1.5 review outcome is `outcome/plan-review-R1.md`.

---

## 6. Cross-plan reference conventions (incl. deferred items)

- **Full path + line cite**: `ai/finished_plans/sprint_1/plan-catalog-crud-admin-only/specs.md:83` (the subscription-purchase plan's `deferred-items.md:36`). Never bare ticket ids alone when citing a deferral.
- **Inbound vs outbound split** in the ledger: `## Inbound Forward Contracts (resolved BY this plan — NOT deferred items)` and `## Known Cross-Ticket Deferrals (NOT this plan's ledger entries)` with the explicit "MUST NOT block this plan's completion gate" sentence (the subscription-purchase plan `deferred-items.md:32-48`). Only the subscription-purchase plan's ledger carries the exact "Known Cross-Ticket Deferrals" heading among current plans (grep of all `deferred-items.md`).
- **Cross-ticket shorthand ids**: root `AGENTS.md` cites `ai/plans/shared-error-handling-response-contracts/deferred-items.md` entries as `BLT-01..BLT-03`; `ai/plans/sprint_3/admin-session-governance/deferred-items.md:15` consumes it as `- **D-05** … (BLT-03)`. So: prefix-style stable ledger ids exist as a cross-plan vocabulary.
- **Pre-seeded forward items**: the plan-catalog plan seeds D1/D2 at baseline with target tickets (`…/tasks.md:44-45`, `specs.md:41`); the session-report plan formalizes a `📅 Forward` status for this.
- **Spec-to-spec forward contracts**: the subscription-purchase plan's REQ-011 is titled "(Purchase-Time Activation Re-validation — fulfills the plan-catalog ticket REQ-044/D2)" — pattern: name the fulfilling REQ in the consumer plan, cite the producer's `path:line` + its ledger id.
- **Verification-first substrate table** (specs §1) doubles as the cross-plan intake: rows state whether upstream artifacts EXIST/NOT FOUND with grep evidence, e.g. `specs.md:39-49`.

---

## 7. Negative findings / traps the plan author must avoid

1. **No Paymob ticket exists** in `docs/planning/TICKETS.md` (grep for `paymob|Paymob`: zero hits). The mandate anchor is `docs/planning/SPRINT_PLAN.md:160` — risk-table row `| Payment gateway integration delays | Mock payment service for development; integrate real gateway in Sprint 2 |` (the subscription-purchase plan cites this as `SPRINT_PLAN.md:161`). The ticket's "Blocked By / Ticket Reference" header line will need a non-TICKETS source or an explicit no-ticket ruling.
2. **`.agents/skills/paymob-payments/` EXISTS** — a Paymob skill with an offline mirror of `developers.paymob.com` (116 pages), `references/cheatsheet.md`, HMAC key-order docs. The plan should cite it; the skills `write-tests`, `test-expert`, `idor-testing`, `pentester` referenced *inside the tasks-template TE/SEC headings* (`tasks-template.md:65,79`) do **NOT** exist in `.agents/skills/` — do not copy those dead skill links.
3. **Instruction-file path split**: `.agents/instructions/{backend,frontend,tests}.instructions.md` EXIST (verified); `.github/instructions/` does NOT exist. Root `AGENTS.md` and the subscription-purchase plan's tasks.md mention `.github/instructions/` — the session-report plan's P7 rule documents the live reality (cite only verified files). Follow the session-report plan's P7.
4. **Root `AGENTS.md` stale references**: `docs/workflows/plan-doc-reconciliation.md` and `ai/plans/shared-error-handling-response-contracts/deferred-items.md` are cited in root AGENTS.md but do NOT exist in this tree. If the new plan cites them, mark NOT FOUND.
5. **the subscription-purchase plan reserves `/api/payments/webhook` + env keys `PAYMENT_GATEWAY_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_ENABLED`, constant `MAX_PAYMENT_WEBHOOK_BODY_BYTES = 64_000`, port types `PaymentGatewayPort`/`PaymentCheckoutSession`/`PaymentWebhookEvent`, and factory `getPaymentGateway()` (`plan.md:199-202`, `tasks.md:102-107`)** — the Paymob plan's relationship (EXTEND adapter family vs. replace route) must be decided and cited.
6. The tasks-template Layer table (`tasks-template.md:123-138`) also lists layers whose AGENTS.md may not exist per the session-report plan's P7 (e.g. `frontend/views/AGENTS.md`, `frontend/components/ui/AGENTS.md` are flagged as non-existent there) — re-verify each before citing.
7. `ai/plans/sprint_1/…` is actually at `ai/plans/sprint_3/…` — sprint folder placement follows the ticket's Sprint field, not stream number.

## 8. Post-generation obligations (from `ai/prompt.md:14-19`)

1. Truncation check (read last line of each artifact).
2. Structure check (all mandatory plan.md sections, incl. explicit no-UI ruling).
3. Traceability grep loop — zero `MISSING`.
4. Anti-pattern sweep: no `Translation.` enum, no two-arg `getTranslations`, no `@/frontend/utils/logger`, no raw `bun test` on workflows, no bottom-nav, no invented paths.
5. Phase-1.5 gate: verdict in `outcome/plan-review-R1.md` before finishing. Deliverables: `specs.md · plan.md · tasks.md · deferred-items.md · outcome/`.
