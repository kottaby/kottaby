# Research Digest 01 — Planning-Artifact Conventions (for "Subscription Validity Window & Expiry")

**Ticket:** `docs/planning/TICKETS.md:540-581` (Dev 1, Sprint 1, 3 pts, Blocked By "Segregated Session Balance Crediting", Decision Refs FR-2.4 / INV-B3 / INV-B6 at `:579`)
**Digest scope:** templates + finished-plan format ground truth + neighbor-ticket boundaries + decision-ref glossary. NO source-code analysis here.
**Verified-negative flags up front:**
1. The finished reference plan `ai/finished_plans/sprint_1/subscription-purchase-payment-gateway/` contains ONLY `specs.md`, `plan.md`, `tasks.md` (verified by `ls`). `deferred-items.md`, `outcome/`, and `outcome/plan-review-R1.md` are **referenced inside those files** (plan.md:6, tasks.md:4) but do **not exist in the directory today** — do not cite them as model files.
2. The blocking ticket's plan directory is named `ai/plans/sprint_1/Segregated Session Balance-crediting/` (literal space before `-crediting`, capital B). It now contains BOTH `specs.md` (274 lines) and `plan.md` (277 lines) — the brief's claim "only specs.md exists" is stale.

---

## Part A — Template conventions (` .agents/spec-process-guide/templates/`)

### A.1 requirements-template.md (307 lines) → our `specs.md`

Ordered sections the template demands:

| # | Section | Key sub-structure |
|---|---|---|
| 1 | Document Information (`:19-27`) | Feature Name, Target Directory `ai/plans/<feature>`, Outcome Directory, Version, Date, Author, Stakeholders |
| 2 | Introduction (`:29-40`) | Feature Summary / Business Value / Scope (incl. excluded) |
| 3 | Requirements (`:42-131`) | **Req 0 "Pre-Implementation Baseline & Execution Protocol"** (`:44-56`, baseline counts, deferred ledger creation, outcome read/write, checkbox flips, sub-loop, semantic checklist) and **Req 0.5 "Translation System & Enum Import Compliance"** (`:58-84` incl. forbidden anti-pattern list). Then per requirement: `**User Story:** As a…` + `#### Acceptance Criteria` in **EARS**: WHEN (event), IF (condition), WHILE (continuous), WHERE (context), always `SHALL` (`:92-95`), PLUS an `#### Additional Details` block (Priority/Complexity/Dependencies/Assumptions, `:97-101`) |
| 4 | UX/Navigation Requirements **(MANDATORY)** (`:133-146`) | "New Routes & Role-Based Access" table (`Route | Purpose | Permission | Roles with Access`) + Sidebar Navigation Placement |
| 5 | Cross-Actor Workflow Scenarios (Journeys) (`:148-170`, conditional on 2+ actors) | Actor Table → Ordered Step List (`actor → action → shared-state change + side effects`) → Cross-Actor EARS criteria from the OBSERVER's perspective incl. denial cases; each journey maps 1:1 to `test/workflows/<domain>/<journey>.test.ts` |
| 6 | Non-Functional Requirements (`:172-188`) | Performance / Security / Usability / Reliability, each EARS-phrased |
| 7 | Constraints and Assumptions (`:190-203`) | Technical / Business / Assumptions |
| 8 | Success Criteria (`:205-216`) | Definition of Done checklist + Acceptance Metrics |
| 9 | Glossary (`:218-224`) | Term/Definition table |

Trailing "Requirements Review Checklist" (`:228-265`): Completeness, Quality, EARS validation, Clarity, Traceability.

### A.2 design-template.md (624 lines) → our `plan.md`

Ordered sections:

| # | Section | Key sub-structure |
|---|---|---|
| 1 | Document Information (`:19-28`) | + Reviewers, Related Documents |
| 2 | Overview (`:30-224`) | Design Goals; Key Design Decisions; **UX/Navigation Specification (REQUIRED)** with 5 sub-tables — New Routes & URLs, Sidebar Navigation Integration (group/parent/children/bottom-nav order), Role-Based Access Matrix over ALL 6 roles, Per-Audience Rendering, Permission Mapping (`requirePermissionForPage` / `<RequirePermission>`); Translation System Requirements (CRITICAL) with CORRECT/WRONG code blocks; **Concurrency & Race Condition Assessment (CONDITIONAL)** — Concurrency Model, Race-Condition Scenario table, SELECT-FOR-UPDATE method list, TOCTOU windows; **Cross-Actor Journey Design (CONDITIONAL)** — Shared-Entity State Machine table + mermaid `stateDiagram-v2` + Side-Effect Matrix (rows created/updated, notifications, idempotency key) + Cross-Actor Visibility table; Drizzle SQL anti-pattern (no `--` inside sql templates); Outcome & Knowledge Transfer Protocol |
| 3 | Architecture (`:226-255`) | System Context + mermaid, High-Level Architecture + mermaid, Technology Stack table |
| 4 | Components and Interfaces (`:257-309`) | Per component: Purpose / Responsibilities / Interfaces (Input/Output/Dependencies) / Implementation Notes |
| 5 | Data Models (`:311-366`) | TS interface per entity + Validation Rules + Relationships + Data Flow sequence diagram |
| 6 | API Design (`:368-415`) | Method/Path/Request/Response/Error Responses per endpoint |
| 7 | Security Considerations (`:417-435`) | Authentication / Authorization / Data Protection / Input Validation |
| 8 | Error Handling (`:437-466`) | Error category table (Category|HTTP|Description|User Action), error response JSON shape, Logging Strategy |
| 9 | Performance Considerations (`:468-489`) | Load targets / Optimization / Monitoring |
| 10 | Testing Strategy (`:491-511`) | Unit / Integration / E2E / Performance |
| 11 | Deployment and Operations (`:513-533`) | |
| 12 | Migration and Compatibility (`:535-550`) | Data migration, backward compat, integration impact |
| — | Design Review Checklist (`:554-594`) | incl. "every cross-actor journey has state machine + side-effect matrix + visibility table" and UX completeness block |

### A.3 tasks-template.md (638 lines) → our `tasks.md`

Ordered skeleton: Document Information (`:19-29`) → **Non-Negotiable Execution Protocol**, 6 numbered rules (`:31-48`: read outcome/ first; per-file sub-loop; semantic checklist; global health check; write outcome file; flip checkbox) → **MANDATORY Subtasks for Every Implementation Task** (`:50-117`).

The 5 subtask pipeline, in strict order (`Sequence` line `:117`):

1. **X.Y.QL Quality Loop** (`:54-63`) — run `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` until exit 0
2. **X.Y.TE Test Engineering** (`:65-77`) — 4-Tier framework (T1 branch coverage; T2 boundary incl. unicode/RTL + timezone/date boundaries; T3 chaos `Promise.allSettled` + out-of-order transitions; T4 security/abuse, SQL-LIKE wildcards, unauthenticated rejection) + layer rules (`runInRollback`+tx, mocked channels, `testClient`, journey rules)
3. **X.Y.SEC Security & Tenancy Audit** (`:79-87`) — BOLA/IDOR, BOPLA (no `{...input}` spread), BFLA, composite relations, LIKE escaping
4. **X.Y.SR Semantic Review** (`:89-106`) — 14-item checklist (IDOR, tenancy filter, BOPLA, DataLoader tenancy, atomicity, bounded module state, env-config registration, reset() completeness, empty-string creds, dead branches, cross-layer imports, enum value imports, schema↔migration sync, deferred-items logging)
5. **X.Y.IV Instruction Verification** (`:108-115`) — read ALL AGENTS.md + `.agents/instructions/*.md` printed by sub-loop.ts

Also mandatory reference blocks: **Layer-to-Instructions Mapping table** (`:119-135`), Drizzle convention (`:137-139`: `bun run db push` for schema, `bun db migrate` for custom SQL), journey-test task pattern (`:580-593`, TEST-FIRST).

Phase layout (template): **Task 0** baseline (MANDATORY, `:157-173` — record tsgo/biome/lint counts to `/tmp/baseline-*`, create deferred-items.md, write `outcome/0-baseline-outcome.md`); Phase 1 foundation; **Phase 1.5 Plan Review Gate** (MANDATORY, `:189-202` — `@plan-review` skill over specs/plan/tasks, writes `outcome/plan-review-R1.md`, loop to zero violations); **Phase 2.5 Mid-Point Backend Review Gate** (CONDITIONAL, `:254-271` — include when plan has >15 tasks AND distinct backend+frontend phases); Phases 3–6 (API, UI, integration, deploy); **Phase 7 Knowledge Propagation (MANDATORY final)** (`:393-419`): deferred-items enforcement via `grep -c "❌\|⚠️"` must be 0 (blocking), baseline-vs-final comparison, canonical doc under `docs/<domain>/` (domain→dir table at `:421-440`; billing plans ⇒ `docs/billing/`), AGENTS.md/instruction files NEVER updated by plan work.

### A.4 deferred-items-template.md (154 lines) → our `deferred-items.md`

Header: Feature/Plan/Created block (`:1-6`). Structure: Purpose (`:9-12`) → **Ledger Table** with columns `ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes` (`:17-21`), IDs `D1, D2, …` → Status Values (`:25-30`: ✅ Done / ⚠️ Partial / ❌ Blocked / 🔄 In Progress) → Usage Guidelines (`:34-63`) → **Enforcement** (`:66-78`): final gate runs `grep -c "❌\|⚠️" <ledger>`; expected 0; plan cannot complete otherwise → Common patterns (`:82-107`) → Anti-patterns (`:111-117`).

### A.5 plan-review-template.md (108 lines) → `outcome/plan-review-R1.md`

Header fields: `## Review Round: <N>`, `## Date`, `## Subagents Dispatched` (`:3-5`). Summary counts by severity (`:9-14`). **Findings by Dimension** table with exactly 8 verify-dimensions (`:20-29`): verify-paths-exist, verify-i18n-namespaces, verify-graphql-accuracy, verify-component-props, verify-permissions-enums, verify-existing-components, verify-three-tier-architecture, verify-cross-ref-consistency — each status ✅/⚠️/❌. Detailed Findings entries carry `**[CRITICAL/HIGH/MEDIUM/LOW]**` + Location / Expected / Actual / Fix Applied (`:39-47`). Then Fix Subagents Dispatched table, Post-Fix Verification checklist (`:65-80`), Lessons for Future Plans, Traceability, Next Steps.

### A.6 checklists.md (557 lines) — per-phase checklists

Requirements-phase (EARS compliance, `:20-33`); design-phase; tasks-phase essentials: every implementation task carries **X.Y.TE** (not a generic "write tests" bullet, `:163`), journey tasks per cross-actor flow (`:164`), pen-test/E2E tasks not silently omitted (`:165`), Knowledge Propagation final task creating a canonical `docs/<domain>/` doc and NEVER touching AGENTS.md/instructions (`:167`, `:414`). Standalone checklists to inline/repeat per task: **Semantic Review** (`:447-473`), **Translation & Enum Import** (`:477-492`), **Race Condition** (`:496-518`), **Type Cascade** (`:522-536`), **Scope Boundary** (`:540-554`).

---

## Part B — Finished plan ground truth (`ai/finished_plans/sprint_1/subscription-purchase-payment-gateway/`)

### B.1 Header / legend blocks (copy this exact shape)

`specs.md:1-6`: title `# Requirements & Specification: <Title>`, then a plain bold-key block:
```
**Plan directory:** this directory (under `ai/finished_plans/sprint_1/`; moved from `ai/plans/` on completion)
**Specs path:** this file
**Deferred-items ledger:** `deferred-items.md` (this directory)
**Outcome directory:** `outcome/` (this directory)
```
For a live plan under `ai/plans/sprint_1/<slug>/` the sibling plan writes FULL paths instead (`ai/plans/sprint_1/Segregated Session Balance-crediting/specs.md:3-8`: Plan directory / Specs path / Plan path / Tasks path / Deferred-items ledger / Outcome directory — one line each).

`specs.md` Document Information adds (`specs.md:8-19`): Feature Name, **Ticket Reference `docs/planning/TICKETS.md:449-493` with the ticket's sprint/points/block-chain inline**, Target Directory, Outcome Directory, Companion Plan, Companion Tasks, Version, Date, **Author: Spec Plan Generator (swarm)**, Stakeholders.

`plan.md:1-6` header: title `# Technical Architecture & Implementation Design: <Title>` + Plan directory / Specs / Tasks / Deferred-items ledger cross-links. Document Information adds Related Documents list of canonical docs (`plan.md:13`).

`tasks.md:1-6` header: ``# `tasks.md` — <Title>`` + one-line sibling-link bar: `**Specs:** specs.md · **Plan:** plan.md · **Ledger:** deferred-items.md · **Outcomes:** outcome/`, plus a "Nature of this ticket" one-liner.

### B.2 REQ-ID numbering style (specs.md)

- Numbered sections `## 1. Executive Summary & Problem Statement` … `## 8. Glossary` (finished specs.md:33,57,138,172,195,212,230,244).
- Requirements live under `## 2. Requirements (EARS)` in thematic subsections: **2.0 Execution Protocol & Engineering Discipline = REQ-001…005** (`:59-65`), 2.1 Purchase Flow = REQ-010…017, 2.2 Webhook/Activation = REQ-020…028, 2.3 Concurrency = REQ-030…034, 2.4 Security/Tenancy = REQ-040…045, 2.5 Validation/Errors/i18n = REQ-050…053, 2.6 GraphQL/Catalog/UX = REQ-060…065, 2.7 Testing Obligations = REQ-070…075, 2.8 Knowledge Propagation = REQ-080…082. Decade-banded numbering per theme.
- Each REQ is a bolded bullet EARS sentence: `- **REQ-022 (Confirmation Transition — atomic)**: WHEN … THEN … SHALL … AND …` (`specs.md:82`). Every claim carries an inline cited path:line or doc anchor.
- The blocking ticket uses a variant: `**REQ-003** — WHEN …` (em-dash, then 2.0 baseline REQ-001…007, 2.0.5 i18n+enum REQ-008…009, then 2.1+ domain REQs, `Segregated Session Balance-crediting/specs.md:87-177`). Either banding is accepted; decade-banding is the richer precedent.

### B.3 Traceability conventions (tasks.md)

- A dedicated **"Numbering & Traceability Conventions"** block right after Document Information (`tasks.md:13-18`): pipeline suffixes spelled out (`.QL` quality loop w/ exact sub-loop command, `.TE` 4-tier tests, `.SEC` BOLA/BOPLA/BFLA, `.SR` semantic checklist, `.IV` read all AGENTS.md + instructions), outcome-file naming `outcome/<task-id>-outcome.md` MANDATORY, `_Requirements: REQ-…_` with **EXPANDED id lists (no ranges)** so traceability is grep-verifiable, tests only via `bun run test/scripts/run-test.ts`.
- **"Non-Negotiable Execution Protocol"** 5-item list (`tasks.md:20-26`): read outcome/ first; per-file loop exit 0; semantic review before `[x]`; **no plan-meta in code** (comments/JSDoc never cite REQ ids, task ids, or plan paths, `:25`); evidence-or-it-didn't-happen checkbox rule.
- Tasks: `## Phase N: <name>` headings; items `- [x] 6.1 Title` with sub-bullets of exact file actions (`CREATE`/`EXTEND` `path`), then an inline pipeline line either compact `- [x] 2.1.QL / 2.1.TE / 2.1.SEC / 2.1.SR / 2.1.IV (note)` (`tasks.md:50`) or expanded `- [x] 4.1.QL · [x] 4.1.TE — <test file + what it proves> · [x] 4.1.SEC · …` (`tasks.md:82`), then `_Requirements: REQ-002, REQ-004, …_` as the final italic line.
- Mandatory bookend tasks: **Phase 0** baseline `0.1` (`tasks.md:28-34`), **Phase 1.5** plan-review gate (`tasks.md:36-40`, gates implementation start), **Phase 2.5 mid-point review** because plan had >15 tasks (`tasks.md:127-132`), final baseline-comparison + deferred-enforcement task (`tasks.md:186-190`), and Knowledge Propagation `13.1` writing `docs/billing/subscription-purchase.md` + invariant addenda + ≤2-line AGENTS cross-refs (`tasks.md:192-197`).
- **Closing "Traceability Map (REQ → tasks)" table** (`tasks.md:199-234`): `| REQ | Tasks |`, one row per REQ or consolidated group (`REQ-010, REQ-011, … | 6.1 (REQ-010 also 9.2, 9.3)`).

### B.4 plan.md layout worth copying

Numbered sections 1–10 + Appendix: §1 System Overview (1.1 What this is, 1.2 mermaid sequence, **1.3 Key Design Decisions table `| # | Decision | Rationale | Alternatives rejected |` with D1..D10**, `plan.md:44-57`); §2 Data Models (2.1 existing-schema verification table, 2.2 schema deltas table with CREATE/EXTEND kind, 2.3 canonical types); §3 API contracts (3.1 SDL sketch in graphql fence, 3.2 resolver shape & authScopes table, **3.3 Permission matrix `| Principal | <op1> | <op2> | … |`** with 401/403/✅ cells, `plan.md:145-151`, 3.4 REST contract table); §4 services/repos (4.1 exact TS signatures, 4.2 concurrency race table `| Race | Guard | Test proof |`, 4.3 journey state machine + mermaid stateDiagram + side-effect matrix + cross-actor visibility); §5 Frontend UX bullets; §6 Security table `| Threat | Mitigation | REQ |`; §7 Components per task; §8 error contract table `| Situation | Class | extensions.code | HTTP |` (`:302-310`); §9 layered testing table; §10 deployment/rollback; **Appendix — Governing rule files** reading list (`:332-335`).

### B.5 Deferred-items in the finished plan — verified negative

Tasks/plan reference `deferred-items.md` as "authored at planning time, empty ledger" (tasks.md:31-32) and final gate `grep -c "❌\|⚠️" deferred-items.md` MUST be 0 (tasks.md:187-188), but the directory contains no such file today, and no `outcome/` directory exists (incl. no `plan-review-R1.md`). Template shape (Part A.4/A.5) is the only ground truth for those artifacts.

---

## Part C — Blocking ticket: "Segregated Session Balance Crediting" (DEV1-007)

File: `ai/plans/sprint_1/Segregated Session Balance-crediting/specs.md` (274 lines).

**REQ ids in play:** 2.0 discipline REQ-001…007 (`:89-101`); 2.0.5 i18n/enum REQ-008…009 (`:105-111`); 2.1 verification REQ-010…012 (`:115-119`); 2.2 crediting REQ-013…018 (`:123-133`); 2.3 consumption/denial/refund REQ-019…023 (`:137-145`); 2.4 ratifications REQ-024…026 (`:149-153`); 2.7 integrity/docs/tenancy REQ-027…029 (`:157-161`); 2.8 testing REQ-030…032 (`:165-169`); 2.9 knowledge/closeout REQ-033…035 (`:173-177`).

**Scope assumptions our ticket builds on (what IT ships/owns):**
- Balance lanes already exist and are verified: `students.balance_hifz/tajweed/reviews/trial` + 4 CHECK constraints (`specs.md:63-64`).
- Activation crediting (full `sessionCount` → plan's `balance_lane`, exactly-once via `activatePendingOnce`) exists (`:66-68`, REQ-013/014).
- Hold-as-debit booking ladder + `INSUFFICIENT_BALANCE` denial exist (`:70`, REQ-019/020); "422" semantics = VALIDATION code family, over GraphQL via `errors[].extensions.code` (ratified in `:125` of plan.md decision D3).
- Eligibility: `(intent lane > 0) OR (balance_trial > 0)` — INV-B4/INV-B8 ratified (REQ-026). This matters for AC3 of our ticket ("expired subscription → 422"): the booking denial logic today is balance-based, NOT status-based — no "subscription status" check exists in that ladder (no mention of expiry anywhere in its REQ set).

**Explicit handoff to OUR ticket (verbatim, `specs.md:48`, Scope OUT list):**
> "Subscription expiry / validity-window job (DEV1-008 'Subscription Validity Window & Expiry', `docs/planning/TICKETS.md:540+` — depends on this ticket but is its own scope)."

So: DEV1-007 promises NO validity-window hook, NO tracking of which units came from which subscription period, and NO expiry-aware denial. Its plan.md:187 states the subscription state machine as `pending → active` being "terminal for this scope" — i.e., the `expired` transition is undelegated until our ticket.

**Caveat for AC2 (balance zeroing):** INV-B3 + this ticket's ratifications mean balances are BURNED into a single per-lane integer (no per-period attribution on `students`). "Zero the remaining balance for that subscription period" cannot be implemented as "subtract N from the lane" without an attribution record — flag to planner: either new attribution tracking or a documented ratification (same ratify-don't-rebuild pattern as DEV1-007's D1–D4) is required. Also note INV-B3's explicit **trial exclusion** (`state-machine-invariants.md:147`) and the sibling ratification that `reviews` lane is credit-only (DEV1-007 REQ-025).

---

## Part D — Sibling ticket boundary: "Admin Subscription Management (Extend/Renew/Cancel/Upgrade/Downgrade)"

`docs/planning/TICKETS.md:583-631` (Dev 1, Sprint 1, 5 pts, **Blocked By: Subscription Validity Window & Expiry** — OUR ticket is its blocker, i.e. we land first). Decision refs: **B.17 (prorated plan changes), FR-2.7, A.5 (audit_logs)** (`:631`).

What IT covers (mark each OUT of our scope):
| Capability | Sibling AC evidence |
|---|---|
| Extend validity window (`end_date`) | `:597-600` (extend → end_date extended + **audit_logs** entry) — this is INV-B6 delivered HERE, not in our ticket |
| Renew expired subscription | `:602-604` (new period created with fresh session credits) |
| Cancel subscription | `:606-609` (`status=cancelled`, **balance preserved NOT zeroed** — contrast our AC2 zeroing on expiry) |
| Upgrade plan (prorated) | `:611-615` (remaining N sessions prorated as value credit toward new plan; new subscription with new session_count; window resets to new interval_days) |
| Downgrade plan (prorated) | `:617-620` (excess value forfeited) |
| Admin gate / 403 for non-admin | test scenario `:629` |

Implication: our ticket must ship the **expired state + expiry job + validity-window date-writing** and the **expired-booking rejection**, and must NOT ship: admin mutations for extend/renew/cancel/upgrade/downgrade, `audit_logs` writing for such actions, proration math, or `cancelled` semantics (balance-preserve rule belongs to sibling). Note asymmetry: expiry ZEROES (our AC2) while admin cancel PRESERVES (sibling `:609`) — plans should call this out explicitly.

---

## Part E — Decision-ref glossary (verbatim anchors)

| Ref | Definition & location |
|---|---|
| **FR-2.4 Subscription Activation** | `docs/specs/functional-requirements.md:62-65`: "When a student subscribes to a plan, the full session count is credited to the respective balance immediately." Schema line: `subscriptions (teacher_id, plan_id, start_date, end_date)` + `student_subscriptions (student_id, subscription_id)` — NB the `teacher_id` wording is stale; A.9/B.8/C.2 made it generic `user_id`. Business rule: "Sessions have a defined validity window (`interval_days`); unused sessions expire at the end of the interval with no carryover." |
| **INV-B3** | `docs/specs/state-machine-invariants.md:147`: "Unused sessions expire at the end of the `interval_days` window with no carryover. This expiry rule explicitly DOES NOT apply to `balance_trial`: the trial lane is not subscription-bound… A trial credit persists until consumed by a session booking." |
| **INV-B4** (supporting AC3) | `state-machine-invariants.md:148`: "A student cannot request a session if the relevant balance is 0 **(or expired)**" — the "(or expired)" clause is the textual hook for our 422 "Subscription expired" rejection. Eligibility remains `(intent lane > 0) OR (balance_trial > 0)`. |
| **INV-B6** | `state-machine-invariants.md:150`: "The Admin can manually extend subscription validity windows (`end_date`)." — owned by the SIBLING ticket (Part D); our plan references it only as a boundary. |
| **INV-B7** | `state-machine-invariants.md:151`: trial granted once per student; `trial_granted_at` marker + guarded conditional UPDATE; ConflictError on second grant. Relevant only as background (trial immune to expiry per INV-B3). |
| **A.9 subscription status** | `docs/specs/open-decisions-and-gaps.md:59-63` (RESOLVED): `subscriptions.status` enum `subscription_status` = **`active`, `pending`, `expired`, `cancelled`, `suspended`** — `expired` already exists as an enum value. State table at `state-machine-invariants.md:126-131` defines `Active = start_date <= now < end_date`, `Expired = now >= end_date`; pending-reconciliation note `:134-140` (pending = pending-until-paid; guarded single-statement, zero-row = replay) governs our status-write style too. |
| **FR-2.7 / B.17 / A.5** (sibling's refs, for exclusion) | FR-2.7 = admin extend/renew/cancel/up-down (`functional-requirements.md:77-79`); B.17 = prorated plan changes (open-decisions section B); A.5 = audit_logs decision (both referenced from `TICKETS.md:631`). |

## Part F — Conventions our plan artifacts must satisfy (checklist for the planning wave)

1. Files: `ai/plans/sprint_1/subscription-validity-window-expiry/{specs.md, plan.md, tasks.md, deferred-items.md, outcome/}` (match sibling/PSG path conventions above).
2. specs.md: header block + full-path cross-links; sections 1–8 as in the finished plan; EARS REQs in decade bands with `WHEN…THEN…SHALL`; REQ-00x execution protocol block; explicit IN/OUT Scope listing sibling capabilities as OUT (Part D).
3. plan.md: D1..Dn decisions table; §3 permission matrix; §4.2 race table (expiry job is inherently concurrent with bookings — TOCTOU/race rows needed); §8 error contract incl. the new 422/"Subscription expired" code; the Drizzle `--`-comment anti-pattern callout; journey design only if 2+ actors (expiry job = system actor counts).
4. tasks.md: Numbering & Traceability Conventions block; Non-Negotiable Execution Protocol; `X.Y.QL/TE/SEC/SR/IV` per task with `_Requirements: REQ-…_` expanded; Phase 0 baseline + Phase 1.5 plan-review gate; mid-point gate only if >15 tasks (this is a 3-pt ticket — likely below threshold); final baseline+deferred gate + Knowledge Propagation writing a `docs/billing/<kebab>.md` canonical doc + invariant addendum (`INV-B3` implementation note) — per tasks-template `:393-419` and checklists.md `:167`.
5. Envelope discipline: tests via `bun run test/scripts/run-test.ts`; per-file `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`; no plan-meta identifiers in code comments (finished tasks.md:25).
