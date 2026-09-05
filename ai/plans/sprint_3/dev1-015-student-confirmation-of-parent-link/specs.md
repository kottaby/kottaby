```markdown
# Requirements & Specification: DEV1-015 — Student Confirmation of Parent Link

**Plan directory (verbatim):** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link`
**Specs file:** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/specs.md`
**Deferred-items ledger (to be created):** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/deferred-items.md`
**Outcome directory:** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/`

---

## Document Information

- **Feature Name**: DEV1-015 — Student Confirmation of Parent Link
- **Ticket Reference**: `DEV1-015` in `docs/planning/TICKETS.md` (Sprint 3, `Blocked By: DEV1-016 (satisfied)`, `Blocks: DEV3-011`)
- **Target Directory**: `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/`
- **Outcome Directory**: `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/`
- **Companion Plan**: `plan.md` (same directory)
- **Companion Tasks**: `tasks.md` (same directory)
- **Deferred-Items Ledger**: `deferred-items.md` (initialized, template `.agents/spec-process-guide/templates/deferred-items-template.md`)
- **Version**: 1.0
- **Date**: 2026-09-05
- **Author**: Copilot CLI (spec-driven-development skill, verification-first methodology)
- **Stakeholders**: Product (guardian-linking UX), Engineering (backend/frontend), QA (journey & regression suites), Security (BOLA/BOPLA/BFLA review)

## Introduction

This specification defines DEV1-015 — the student-side confirmation of parent link requests. The ticket converts the previously headless DEV1-014 service/repository spine into a consumed, regression-pinned feature: a student's single decision (approve or reject) drives a guarded, atomic state transition on the shared `parent_link_requests` row, notifies the parent, and — through DEV1-016 — renders the student's action box. Because sprint order pre-bound the substrate (DEV1-016 executes before DEV1-015 in chronological order), this plan executes as a substrate-closure ticket: verify exists → write Zero-Schema / Zero-Types proof → regression-bind the contract → close the discoverability hole with one new dashboard card.

### Feature Summary

A student confirms or rejects an incoming parent link request (submitted earlier by a parent via DEV1-014 handshake discovery) through a dedicated `myIncomingLinkRequests` inbox, a dual-actor `respondToLinkRequest` confirmation mutation, and a new dashboard discoverability card listing pending requests.

### Business Value

- Closes the guardian-linking loop: without student confirmation, parent link requests stay `PENDING` forever and no billing/approval visibility chain can form.
- Gives minors an explicit consent gate (safety/regulatory expectation for parent-child account linking) with a hard anti-spam denylist.
- Unblocks DEV3-011 (supervision dashboards) which consumes affirmed parent→student links.

### Scope

- **IN**: DEV1-014 substrate verification (`respondToLinkRequest`, reject + denylist co-write, `REJECTION` notification, inbox query, denylist repo, GraphQL wiring); frontend inbox card, navigation retargeting, inbox page wiring; NEW student-dashboard discoverability card; regression test suite additions; journey test J-REQ-01 scenario (already authored by DEV1-014, re-verified); knowledge propagation (doc + AGENTS.md references).
- **OUT**: Per ticket DEC-015 — no schema/tables/types (substrate owns), no rate limiting (DEV3-002), no audit emission (DEV3-016/017), no admin dashboards (DEV3-019), no notification-copy changes, no DEV1-013/014/016 re-implementation. Parent-side request initiation and email facility remain DEV1-014 scope; parent surface link to a student's request list is DEV1-013 scope.


## 1. Executive Summary & Problem Statement

### Feature
The student-side decision half of the parent-supervision handshake (Workflow 04 §4.4): the student must explicitly **confirm or reject** each incoming parent link request before any monitoring relationship exists. A pending `parent_link_requests` row confers nothing; only the student's confirmation writes `students.parent_id` and grants the parent read-only monitoring eligibility (the portal itself is DEV1-016's scope).

**Verification-First finding (load-bearing):** the authorizing substrate for this ticket is already shipped and verified by DEV1-014 (`docs/parents/parent-link-request.md`, status "Implemented and verified"). Confirmed present in the bundled code:
- `ParentLinkRequestService.respondToLinkRequest` / `listMyIncoming` — `backend/services/parents/parent-link-request.service.ts`
- Guarded claim + single-writer link — `backend/db/repo/parents/parent-link-request.repository.ts` (`respondToPendingForStudent`), `StudentRepository.linkParentIfUnlinked` (`backend/db/repo/students/student.repository.ts`)
- GraphQL surface — `respondToParentLinkRequest` mutation (`backend/graphql/mutation/parents/parent-link.mutation.ts`), `myIncomingParentLinkRequests` query (`backend/graphql/query/parents/parent-link.query.ts`), `IncomingParentLinkRequestPothosObject` (`backend/graphql/pothos/parents/parent-link-request.pothos.ts`)
- Documents — `myIncomingParentLinkRequestsQueryDocument`, `respondToParentLinkRequestMutationDocument` (`frontend/graphql/sharedDocuments/parents/parent-link.documents.ts`)
- Frontend status/denial helpers — `frontend/lib/parent-link-request-status.ts` (`isLinkRequestActionable`, `displayLinkRequestStatus`, `parentLinkStatusChipSpec`), `frontend/lib/parent-link-denials.ts` (`resolveParentLinkDenialCopy`)

DEV1-015 is therefore a **closure and discoverability slice**, not a re-implementation: it (a) pins the ticket's four acceptance criteria onto the shipped surface with dedicated regression batteries, (b) ships the one genuinely missing UX element — **dashboard discoverability** of pending incoming requests so the INV-P1 decision actually happens (a pending request the student never sees never gets confirmed), and (c) proves the cross-actor confirmation/rejection journey test-first.

### Problem from user perspective
- **Student (Yusuf):** A parent sent a link request. The student needs a prominent, trustworthy place to see WHO is asking (parent's FULL name — the sanctioned identity disclosure, since the decision needs it), until when they must act (7-day expiry), and a dead-simple Confirm/Reject. If the request is buried, the learning-parent relationship silently expires (B.14).
- **Parent (Fatima):** She needs to know the outcome — confirmed (she can start monitoring; portal arrives in DEV1-016) or rejected (she must not monitor, and learns nothing else about her child's activity).
- **Super Admin:** No admin override exists in this flow's decision step (the DEV3-019 direct-onboarding override lives outside the handshake); the admin only observes audit-free — this workflow intentionally writes ZERO `audit_logs` rows (DEV1-014 R10).

### Business value
- Child-safety gate INV-P1 ("a parent cannot monitor a student without the student's explicit confirmation") only materializes when the student *actually notices and decides* — discoverability is the activation step of the trust funnel for the parent-supervision feature (FR-7.2).
- Platform integrity: unauthorized tracking prevention is a compliance-grade guarantee; the decision path must be race-proof (two parents racing) and oracle-safe (a stranger learns nothing).

### Actors involved
| Actor | Role | Capability in this ticket |
|---|---|---|
| Student (caller) | `UserRole.Student` | List own incoming requests, confirm, reject |
| Parent (counterparty) | `UserRole.Parent` | Request/cancel (DEV1-014); here: observes the outcome via notification |
| Teacher / Admin / other Student | other roles | MUST be rejected from every student link surface (BFLA) |
| Unauthenticated | — | MUST be rejected (401) before any resolver runs |

### Non-goals (explicitly OUT of scope)
- ❌ Re-implementing `respondToLinkRequest`, `listMyIncoming`, the guarded claim, sibling-expiry choreography, or the single-writer `linkParentIfUnlinked` (all shipped by DEV1-014).
- ❌ The parent monitoring portal reads (DEV1-016) and parent session-completion notification emitters (DEV1-017).
- ❌ Unlink/revoke of an established link (deferred decision D3 of DEV1-014 — a future ticket owns the exit from `confirmed`).
- ❌ The cron sweep/reminder schedulers (DEV1-014 D1) — the sweep/reminder primitives already exist.
- ❌ Any new GraphQL root field, new state vocabulary (`cancelled`, `Unlinked`), new notification type, or schema/migration change.
- ❌ Admin-side views of link requests (governance surface — DEV3 stream).
- ❌ Email/SMS channel delivery (notifications arrive via the existing in-app engine only).

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

- **REQ-001 (Pre-Implementation Baseline & Ledger):** WHEN implementation begins THEN the system-of-record SHALL capture baseline error counts (`tsgo`, `biome:check`, `lint-service`) and initialize `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md` BEFORE any code change.
- **REQ-002 (Verification-First Substrate Inventory):** WHEN planning implementation details THEN the plan SHALL verify — against the bundled code, not docs prose — the presence of every substrate item DEV1-015 consumes (service methods, repo guarded writes, GraphQL fields, documents, frontend helpers, the student link-requests view at `frontend/views/students/link-requests/**`, its route under `app/`, the nav entry in `frontend/views/dashboard/nav/navItems.ts`, and the DEV1-014 journey `test/workflows/parents/parent-link-request.journey.test.ts`). Items confirmed present are classified UPDATE/REUSE; items absent are explicitly classified CREATE. No "extend" claim may cite prose alone.
- **REQ-003 (Type-Safe i18n & Enum Value Imports Compliance):**
  - Client components MUST use `useAppTranslation(<NamespaceHandle>)` with `defineNamespace` handle consts (e.g. `useAppTranslation(ParentLink)`) and property access (`t.someLabel`) — never string literals, never a `Translation` enum (does not exist), never `t('key')` call form.
  - Server components MUST use `getTranslations(locale)` (ONE argument, full `Translations` tree) with property access.
  - GraphQL resolvers MUST use `ctx.t("namespace")`.
  - All enums used at runtime (e.g. `LinkStatus`, `UserRole`, `NotificationType`) MUST be value imports with enum members, never raw string literals.
- **REQ-004 (Canonical Types Discipline):** All entity types MUST come from `backend/types/parents/parent-link-request.types.ts` (`ParentLinkRequestSelectType`, `IncomingParentLinkRequestReturnType`, `OutgoingParentLinkRequestReturnType`), student types from `backend/types/students/student.types.ts`, and shared infra types (`DBTransaction`, `DBQueryExecutor`) from `@/backend/types`. Pothos resolvers MUST NOT declare local shapes.

### 2.2 Core Feature Logic / Happy Paths

- **REQ-010 (Pending visibility — list):** WHEN an authenticated student has ≥1 incoming link request with `status = pending` AND `expiresAt > now` THEN the link-requests surface SHALL render each request with the requesting parent's FULL name, creation time, expiry time, and Confirm/Reject affordances. (Substrate: `myIncomingParentLinkRequests` → `ParentLinkRequestService.listMyIncoming` — REUSE, pinned.)
- **REQ-011 (Pending visibility — notification):** WHEN a parent creates a link request THEN the system SHALL persist exactly ONE `parent_link_request` notification for the student carrying `relatedEntityType = "parent_link_request"` and `relatedEntityId = <requestId>`, and the notification drawer SHALL route the student's click to the student link-requests route. (Emission shipped by DEV1-014 (`emitRequestNotificationTx`); DEV1-015 pins the consumption/deep-link behavior — verify existing drawer resolution, close any gap.)
- **REQ-012 (Confirm):** WHEN a student confirms an own pending unexpired request THEN the system SHALL, inside ONE transaction: (a) claim the row `pending → confirmed` via the owner-scoped guarded update, (b) write `students.parent_id` ONLY through `StudentRepository.linkParentIfUnlinked` (single-writer), (c) materialize every sibling pending request for that student to `expired`, (d) set `respondedAt`, and (e) emit the acceptance notification to the PARENT in the parent's persisted locale; publishing SHALL occur strictly after commit.
- **REQ-013 (Reject):** WHEN a student rejects an own pending unexpired request THEN the system SHALL flip ONLY that row `pending → rejected` with `respondedAt` stamped, SHALL write NOTHING to `students.parent_id`, SHALL leave sibling pendings untouched (a "no" to parent A is not a "no" to parent B), and SHALL notify the parent in the parent's persisted locale.
- **REQ-014 (Expiry liveness):** IF `expiresAt <= now` (strict-`>` liveness; the boundary instant belongs to expiry) THEN the request SHALL be non-actionable everywhere: the mutation-side claim rejects it, and every read renders it as `LinkStatus.Expired` — with the decision affordances hidden/disabled. Reads SHALL perform ZERO writes (lazy materialization; the D1 sweep owns bulk materialization).
- **REQ-015 (Dashboard discoverability card — NEW):** WHEN an authenticated student with ≥1 actionable incoming link request (pending AND unexpired) opens the student dashboard home THEN the system SHALL render a dedicated "pending parent link request" card (count, parent full name of the most recent requester or localized plus-N copy, and a single CTA deep-linking to the student link-requests route). WHEN zero actionable requests exist THEN the card SHALL NOT render (no empty-state scar).
- **REQ-016 (Post-decision convergence):** WHEN a Confirm/Reject mutation resolves THEN the client SHALL converge state via the returned id-first row write-back PLUS a refetch of the incoming list (siblings fold to expired on confirm), and the dashboard card SHALL disappear when no actionable request remains.
- **REQ-017 (INV-P1 closure — no pre-confirmation monitoring):** UNTIL a confirmation commits THEN `students.parent_id` SHALL remain `NULL` (or its prior confirmed value) and NOTHING in this flow SHALL grant the parent any observation of student data beyond the DEV1-014 masked-name discovery contract (R9 — the parent side stays masked FOREVER, including post-confirm outgoing rows).

### 2.3 Security, Authorization & Tenancy

- **REQ-020 (BFLA — role gating):** WHEN any caller hits `respondToParentLinkRequest` / `myIncomingParentLinkRequests` THEN the field's `authScopes: { $all: { authenticated: true, role: [UserRole.Student] } }` conjunction SHALL evaluate BEFORE the resolver body: anonymous → `UNAUTHORIZED` (401 semantics); authenticated parent/teacher/admin → `FORBIDDEN` (403 semantics) with the canonical localized denial copy. The plain-map ANY-semantics form is FORBIDDEN.
- **REQ-021 (BOLA/IDOR — ownership + no oracle):** WHEN a student submits a `requestId` NOT owned by them (foreign or nonexistent) THEN the system SHALL reject with the constant NOT_FOUND-shaped denial — byte-identical code, message, and envelope for foreign vs nonexistent (no existence oracle). Identity MUST derive from `ctx.user.id` exclusively; no client-supplied student/parent id is accepted anywhere on the wire.
- **REQ-022 (Governance re-check):** WHEN a student invokes the decision mutation THEN the service SHALL re-read the actor fresh (identity + role + governance) before any write; a governed (suspended/blocked/deleted) student SHALL receive the constant `ForbiddenError` denial copy with zero side effects.
- **REQ-023 (BOPLA):** THE mutation input SHALL carry exactly `{ requestId, accept }`; repository writes SHALL consume server-side DTO projections field-by-field — no `{ ...input }` spread into any Drizzle `set()`/`values()` call.
- **REQ-024 (Log hygiene):** Denials SHALL emit at most ONE bounded `logger.logDomainError` with `{ code, entity: "parent_link_requests", entityId, locale }` — never the handshake code, never requester/target names; happy paths SHALL log nothing. `console.*` is FORBIDDEN (backend `logger` from `@/backend/lib/logger`; frontend `logger` from `@/frontend/lib/logger`).
- **REQ-025 (Rate limiting):** Student link operations inherit the platform's documented fail-open rate-limiter posture; this ticket adds NO limiter and claims no new throttle guarantee (recorded against the future rate-limiting stream).

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-030 (Single-transaction decision):** EVERY decision (confirm or reject) SHALL execute inside ONE `withTransaction` unit; any mid-staging failure SHALL roll back the claim, the link write, the sibling expiry, and the emit — zero partial state, zero publish.
- **REQ-031 (Guarded claim, zero-row classification):** The respond claim SHALL be a single guarded `UPDATE … WHERE id = ? AND student_id = <caller> AND status = 'pending' AND expires_at > now() … RETURNING`; a zero-row match SHALL be classified via the existing `classifyUnclaimableRequest` read into the existing typed denials (not-found / already-resolved / expired), never a silent no-op.
- **REQ-032 (Two-parent race — exactly one winner):** WHEN two parents' requests for the same student are confirmed concurrently THEN exactly ONE SHALL win: the loser's `linkParentIfUnlinked` zero-row SHALL abort its whole transaction into the already-resolved conflict shape, with the loser parent emitted NOTHING from the losing unit.
- **REQ-033 (Respond-vs-expiry race):** WHEN a respond races the expiry boundary/sweep THEN the row SHALL converge to EXACTLY ONE terminal state (confirmed/rejected/expired), never a double-write.
- **REQ-034 (Publish-after-commit):** Realtime fan-out SHALL be reachable ONLY after the owning transaction commits; a rolled-back decision SHALL produce zero pushes (publish structurally unreachable pre-commit).
- **REQ-035 (Regression — pair arbiter untouched):** The partial unique index `parent_link_requests_pending_pair_unique` (one live pending per parent+student pair) and its 23505→`PARENT_LINK_ALREADY_PENDING` mapping SHALL remain the only duplicate-pending defense; DEV1-015 adds no second arbiter.

### 2.5 Validation & Error Contracts

- **REQ-040 (Pre-DB input shape):** WHEN `requestId` is missing, non-numeric, ≤ 0, fractional, or non-safe-integer THEN the resolver/service boundary SHALL reject with `ValidationError` (code `VALIDATION`) BEFORE any database read (existing `isPositiveSafeInt` gate — REUSE, do not fork).
- **REQ-041 (Closed denial taxonomy — verify, never extend silently):** The decision surface SHALL reuse the EXACT typed-denial vocabulary shipped by DEV1-014 (verified against `backend/services/parents/parent-link-request.helpers.ts` + `parent-link-request.service.ts` at implementation time; expected families: constant NOT_FOUND shape for foreign/absent ids, typed conflict for already-resolved, typed expiry denial). ANY new `extensions.code` MUST be registered per `docs/graphql/domain-error-extensions-code.md` and recorded in the plan's deferred-items ledger — otherwise the taxonomy stays closed.
- **REQ-042 (Localization):** ALL user-facing copy and errors SHALL resolve through compile-time i18n (server: `getServerTranslations(locale)`; client: `useAppTranslation(ParentLink)` etc.); error codes map bijectively to flat `ErrorsLabels` keys (domain-prefixed camelCase like `parentLink…`), en/ar parity proven by the locale parity suite.

### 2.6 GraphQL & Frontend Contracts

- **REQ-050 (Wire surface — reuse, zero new root fields):** The ticket SHALL ship ZERO new GraphQL root fields; it reuses `query myIncomingParentLinkRequests: [IncomingParentLinkRequest!]!` and `mutation respondToParentLinkRequest(requestId: ID!, accept: Boolean!): IncomingParentLinkRequest!` (exact existing signatures verified during implementation). Documents live in `frontend/graphql/sharedDocuments/parents/parent-link.documents.ts` as `TypedDocumentNode`s with `id` selected FIRST; codegen output MUST show zero unrelated drift (`bun run generate:gqlSchema && bun codegen`, drift diff empty). `DateTime` scalar fields stay `type: "DateTime"` — no `toISOString()` into `String`. If ANY Pothos surface changes, the `backend/graphql/test/schema-surface.test.ts` baseline SHALL be updated in the same change.
- **REQ-051 (Dashboard card data path):** The REQ-015 card SHALL be a client component driven by `useQuery(myIncomingParentLinkRequestsQueryDocument)` (the same id-first list document the decision page uses — one normalized cache truth), deriving "actionable" via `displayLinkRequestStatus`/`isLinkRequestActionable` (`frontend/lib/parent-link-request-status.ts`). No new query for a count.
- **REQ-052 (MUI v9 discipline):** All UI SHALL use `sx` only (no direct style props), `theme.palette.*` tokens (no hardcoded colors), `*Outlined` icons, ≥44px touch targets, RTL-safe logical layout, and localized strings only.
- **REQ-053 (Routing/nav reality):** Wrong-role page access SHALL redirect via `roleDashboardPath(ctx.role)` (never bare `/dashboard`); the link-requests nav entry SHALL target the real student route — if `frontend/views/dashboard/nav/navItems.ts` currently routes it to the `[feature]` catch-all ComingSoon page, RETARGET it (no duplicate entries). Mobile nav = the temporary MUI `Drawer`; no bottom-nav work.

### 2.7 Test Coverage

- **REQ-060 (Coverage):** ALL NEW code (dashboard card + any glue) SHALL reach 100% statement/branch coverage; existing DEV1-014 surfaces SHALL be pinned by extension, never rewritten suites.
- **REQ-061 (Layer discipline):** Repository/service assertions SHALL use `runInRollback` + explicit `tx` propagation + `expectRepoError` try/catch (NEVER `expect().rejects.toThrow()` inside a rollback tx).
- **REQ-062 (Journey — test-first):** BEFORE any implementation, a new journey `test/workflows/parents/student-confirmation-of-link.journey.test.ts` SHALL encode the §2.9 journeys against the REAL services and REAL test DB: committed fixtures in `beforeAll`, tracked hard-delete in `afterAll`, ZERO `runInRollback`, honest role resolution, and the fanout/notification boundary spied (no external sends). If verification (REQ-002) proves the existing DEV1-014 journey already covers a step byte-for-byte, the new journey references it and pins only the uncovered confirmation-leg assertions (e.g., notification-drawer/visibility semantics).
- **REQ-063 (Wire regression):** The existing wire matrix (`backend/graphql/test/parent-link.wire.test.ts`) SHALL stay green; DEV1-015 adds only genuinely missing decision-leg cells (e.g., expired-claim denial on the wire), nothing duplicative.
- **REQ-064 (Component tests):** The dashboard card SHALL ship with component suites covering loading / absent (no actionable) / present (count + CTA + RTL) / post-decision disappearance, in both locales.
- **REQ-065 (Invariant probes):** Dedicated negative assertions SHALL prove: (a) pre-confirmation `students.parent_id` is NULL; (b) rejection leaves it unchanged; (c) the parent holds zero monitoring capability at every non-confirmed state (INV-P1).

### 2.8 Documentation & Knowledge Gates

- **REQ-070 (Canonical doc):** Implementation SHALL amend `docs/parents/parent-link-request.md` with a DEV1-015 closure section (what the student-confirmation slice added: dashboard discoverability card, journey, decision-leg wire cells) — it SHALL NOT fork a parallel canonical doc and SHALL NOT renumber or edit `docs/specs/state-machine-invariants.md` or `docs/specs/open-decisions-and-gaps.md` (bindings are by reference only).
- **REQ-071 (Layer knowledge):** Layer AGENTS.md updates SHALL be minimal one-line rule additions only if a NEW permanent rule emerged (expectation: none — the single-writer/expiry/notification rules already exist); the root AGENTS.md Important References list gains nothing new (the parents docs are already recorded).

### 2.9 Cross-Actor Workflow Scenarios (Journeys)

#### Actor Table
| Actor | Role / permission group | CAN do | CANNOT do |
|---|---|---|---|
| Parent (requester) | `UserRole.Parent` | Send/cancel link requests (DEV1-014); receive outcome notification | Confirm/reject; read any student data pre-confirmation; see the student's full name |
| Student (decider) | `UserRole.Student` | List own incoming requests; confirm; reject | Respond to others' requests; respond when governed; see masked names |
| Other student / Teacher / Admin | other roles | — | Every student link operation (pre-resolver FORBIDDEN) |
| Anonymous | — | — | Everything (401) |

#### Ordered Step List
1. **Parent → creates link request** (DEV1-014 surface) → shared state: `parent_link_requests(pending)` row + ONE `parent_link_request` notification row for the student + one post-commit publish to the student.
2. **Student → opens dashboard** → observes the pending-request card (count + CTA); incoming list shows parent FULL name + expiry.
3. **Student → opens the `parent_link_request` notification** → lands on the link-requests decision route.
4. **DENIAL: Teacher/Admin/foreign student → hits the decision surface** → pre-resolver FORBIDDEN; zero rows touched.
5. **DENIAL: Student → submits a foreign/nonexistent `requestId`** → constant NOT_FOUND shape; no branch disclosure; zero writes.
6. **Student → REJECTS** → row → `rejected` (+ `respondedAt`); `students.parent_id` untouched; siblings untouched; ONE rejection notification to the parent (parent's locale); publish post-commit.
7. **Student → CONFIRMS** → row → `confirmed`; `students.parent_id` = parent (single-writer guarded); all sibling pendings → `expired`; ONE acceptance notification to the parent; dashboard card disappears (no actionable pendings left); the parent side's outgoing row stays masked-named per R9.
8. **RACE: two parents' requests confirmed concurrently** → exactly one winner link; loser collapses to already-resolved conflict with zero writes/notifications from the losing unit.
9. **Boundary: respond at exactly `expiresAt == now`** → deterministically EXPIRED denial (same behavior mutation-side and render-side).

#### Cross-Actor EARS Criteria (observer-phrased)
- **J-REQ-01:** WHEN the parent sends a link request THEN the system SHALL create a `pending` row AND make it visible to the student in BOTH the notification center (deep-linked) and the dashboard card.
- **J-REQ-02:** WHEN the student confirms THEN the parent SHALL observe exactly one acceptance notification AND the parent-side outgoing row SHALL surface `confirmed` — while NEVER surfacing the student's full name.
- **J-REQ-03:** WHEN the student rejects THEN the parent SHALL observe exactly one rejection notification AND the outgoing row SHALL surface `rejected`, and the parent SHALL gain no monitoring capability.
- **J-REQ-04:** WHEN any non-student actor (or a foreign student) attempts the decision mutation THEN the system SHALL reject them AND emit zero notifications to either party.
- **J-REQ-05:** WHEN two parents' requests race to confirmation THEN the parent whose request lost SHALL observe an already-resolved conflict and the winning parent SHALL observe confirmation — with exactly one linked parent and zero overlapping terminal states.

---

## 3. System Decisions & State Machine Invariants Alignment

### Decision References (`docs/specs/open-decisions-and-gaps.md`)
| Decision | Binding on this ticket |
|---|---|
| **A.2** (`students.parent_id` FK model) | The confirmation writes THIS column only, via the guarded single-writer — no separate linking table, ever. |
| **A.3** (unique `handshake_code`) | The code stays a capability for request creation only; the decision flow consumes request ids scoped to the caller — no code crosses the decision wire. |
| **A.4 / A.4.3** (notifications table; emitter-locale) | Outcome notifications are engine-emitted in the PARENT's persisted locale (the emitters shipped by DEV1-014 already implement recipient-locale composition); publish-after-commit per `docs/notifications/realtime-engine.md` §3.1/3.2. |
| **B.12** (one parent per student) | The guarded `linkParentIfUnlinked` predicate (`parent_id IS NULL`) is the two-parent race arbiter (REQ-032). |
| **B.13** (parent links multiple children) | Per-child gating; nothing here constrains the parent globally. |
| **B.14** (7-day expiry) | Strict-`>` liveness; lazy materialization on reads; boundary instant = expired (REQ-014; parity pinned in the journey). |

### State Machine & Lifecycle Invariants (`docs/specs/state-machine-invariants.md`)
| Invariant | Enforcement in this ticket |
|---|---|
| **INV-P1** (no monitoring without explicit confirmation) | THE central invariant: REQ-012's link write is the ONLY grant; REQ-017 + journey negative probes (J-REQ-03/04) prove no capability exists pre-confirmation or post-rejection. |
| **INV-P2** (parent read-only MVP) | Unaffected — DEV1-015 ships no parent read surface; the portal is DEV1-016's and MUST consume only `students.parent_id` (never the request table). |
| **INV-P3** (parent real-time notification on session completion) | Enabled-by the engine substrate; NOT exercised here (the emitters are DEV1-016/017). This ticket's parent notifications are link-outcome only. |
| **INV-P4** (link data model) | Resolved substrate — reused as-is. |
| Session/Wallet invariants (INV-S*, INV-W*) | N/A — zero session/financial state touched. |

### Canonical workflows (`docs/workflows/04-parent-supervision-handshake.md`)
This ticket implements §4.4 ("Student Confirmation") and consumes §4.2/§4.3 (discovery + request, shipped by DEV1-013/014). The Admin onboarding override (§8-resolved) is recognized as the sole sanctioned NON-handshake writer of `students.parent_id`, living outside this flow — no path in this ticket bypasses the student's decision.

---

## 4. Cross-Layer Traceability Matrix

| Requirement ID | Decision / Invariant | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|---|
| REQ-001/002/003/004 (baseline, inventory, i18n, types) | — | — | — | — | Baseline outcome file; substrate inventory outcome |
| REQ-010 (pending list) | B.14, INV-P1 | `ParentLinkRequestService.listMyIncoming` | `myIncomingParentLinkRequests` | Student link-requests view (`frontend/views/students/link-requests/**` — verify per REQ-002) | Existing service tests (extend); journey step 2 |
| REQ-011 (notification + deep link) | A.4 | `emitRequestNotificationTx` (DEV1-014 substrate) | `myNotifications` / drawer documents | `frontend/components/ui/NotificationDrawer*.tsx` deep-link behavior | Component/contract test pinning `parent_link_request` route resolution |
| REQ-012 (confirm) | A.2, B.12, INV-P1, INV-P4 | `respondToLinkRequest` + `respondToPendingForStudent` + `StudentRepository.linkParentIfUnlinked` + sibling sweep | `respondToParentLinkRequest(accept: true)` | Decision CTA on link-requests view | Journey step 7; chaos two-parent race (existing `parent-link-request.chaos.test.ts` coverage confirmed/extended) |
| REQ-013 (reject) | INV-P1 | `respondToLinkRequest` (reject branch) | `respondToParentLinkRequest(accept: false)` | Decision CTA | Journey step 6; parent-notification spy assertion |
| REQ-014 (expiry liveness) | B.14 | `classifyUnclaimableRequest` / render-time mapping | (read render + mutation denial) | `isLinkRequestActionable` / `displayLinkRequestStatus` consumers | Boundary instant test (`expiresAt == now`); wire expiry cell |
| REQ-015 (dashboard card — NEW) | B.14, INV-P1 | (client `useQuery` over existing service) | `myIncomingParentLinkRequests` | NEW card under `frontend/views/**` (student dashboard home, alongside `HandshakeCodeCard` slot in `RoleDashboardPage`) | REQ-064 component suites (loading/absent/present/RTL, both locales) |
| REQ-016 (post-decision convergence) | — | — | id-first mutation document write-back | Card disappearance + list refetch | Component test (post-decision), journey assertion |
| REQ-017 (no pre-confirmation monitoring) | INV-P1, B.12 | `students.parent_id` untouched until confirm | — | — | Journey negative probes (J-REQ-03/04), REQ-065 invariant tests |
| REQ-020/021/022 (BFLA/BOLA/governance) | — | `requireActor` (fresh re-check), guarded ownership claim | `$all` scope conjunction on both fields | — | Wire matrix (existing `parent-link.wire.test.ts` + added decision cells); journey denials |
| REQ-023/024 (BOPLA, log hygiene) | — | Field-by-field DTO mapping; bounded `logDomainError` | closed input shape | — | Service suite log-spy assertions; static lock reuse (`parent-link.static-locks.test.ts` — extend corpus if new files land) |
| REQ-030–035 (atomicity/concurrency) | B.12, B.14 | `withTransaction` unit; guarded claims; 23505 mapping | — | — | Chaos cells (invocation order race, expiry race, savepoint integrity); publish-after-commit spy |
| REQ-040/041/042 (validation & error contract) | — | `isPositiveSafeInt` parser; closed denial vocabulary | `extensions.code` passthrough; boundary finalizer | `frontend/lib/parent-link-denials.ts` mapping | Error-contract matrix cells; locale parity suites |
| REQ-050–054 (GraphQL/frontend contracts) | — | — | Existing Pothos objects; codegen drift = 0; schema-surface baseline unchanged | MUI v9 sx-only card; `roleDashboardPath` redirects; nav retargeting check | `backend/graphql/test/schema-surface.test.ts` (unchanged-surface assertion); `documents.contract.test.ts` parity; nav component/pin tests |
| REQ-060–065 (test coverage) | — | — | — | — | The suites enumerated in each REQ row |
| REQ-070/071 (documentation) | — | — | — | — | Diff-proven doc updates; ledger gate (zero ❌/⚠️) |

**1:1 journey mapping:** §2.9 journeys map onto `test/workflows/parents/student-confirmation-of-link.journey.test.ts` (test-first, REQ-062); the shared DEV1-014 journey (`test/workflows/parents/parent-link-request.journey.test.ts` — existence verified per REQ-002) continues to own the request-creation leg coverage.
```

---

## 5. UX/Navigation Requirements Summary

(Full design in `plan.md` §5; this is the requirements-level contract.)

| Surface | Route / Location | Actor | Purpose |
|---|---|---|---|
| Student inbox page | `/student/parent-link/requests` | STUDENT | List incoming `PENDING` requests; confirm/reject |
| Student dashboard card | `/student/dashboard` (new component) | STUDENT | Discoverability: surface up to N pending requests with confirm/reject shortcuts |
| navItems entry | `frontend/views/dashboard/navItems.ts` (existing student group) | STUDENT | Retarget or add a "Parent Link Requests" item — verify-first, no duplication |

**EARS:**
- WHEN a student opens the inbox route THEN the system SHALL render all `PENDING` requests addressed to that student (server-fetched, never client-only state).
- WHEN a student dashboard renders with ≥1 pending request THEN the system SHALL surface the discoverability card above the fold.
- WHEN a non-student role routes to the inbox URL THEN the system SHALL deny access (role-gated page guard).

## 6. Non-Functional Requirements

### Performance
- WHEN the inbox page loads THEN the system SHALL fetch pending requests in a single batched query (DataLoader or single repo call; no N+1).
- WHEN the dashboard card renders THEN the system SHALL reuse the inbox query response or a cheap count query; adding at most one additional indexed read.

### Security (non-functional mirrors of §2.3)
- WHEN any incoming payload is logged THEN the system SHALL redact identifiers per `docs/graphql/error-handling-contract.md`.
- WHEN a denial occurs THEN the denial response SHALL be constant across not-found vs. unauthorized (no oracle).

### Accessibility (a11y)
- WHEN the inbox/card renders THEN components SHALL meet WCAG 2.1 AA: semantic buttons for confirm/reject, localized ARIA labels, keyboard operability, visible focus.

### Internationalization & RTL
- WHEN the UI renders in `ar` THEN all layout SHALL mirror correctly (MUI stylis RTL), and all strings SHALL come from the compile-time locale namespaces (English + Arabic parity).

### Reliability
- WHEN the notification dispatch fails THEN the respond mutation SHALL still succeed (publish-after-commit with engine claim; no transactional coupling to outbound notification).

## 7. Constraints and Assumptions

### Technical Constraints
- Substrate functions must be REUSED verbatim where they exist; any required edit to substrate = STOP + deferred ledger entry, per DEC-015.
- Database hosts PostgreSQL via Drizzle ORM; transaction discipline is `runInRollback` for tests, `tx` propagation for repo calls.
- Frontend is React 19 + MUI v9 under Next.js 16 App Router; style props forbidden, `sx` only.

### Business Constraints
- Dual-actor rule: only the addressed student may respond; the requester (parent) cannot self-confirm.
- Denylist behavior owned by DEV1-014's substrate; this ticket pins it via tests only.

### Assumptions
- `parent_link_requests` schema, service (`respondToLinkRequest`, `listMyIncoming` or equivalent), repos, Pothos resolvers, and documents exist per DEV1-014 outcome (tx-outcome.md). Verification gate 0.2 confirms before any build work.
- DEV1-016 supplies the `respondToLinkRequest` mutation document + page wrappers; DEV1-015 consumes/verifies them rather than re-authoring.
- J-REQ-01 journey test existing & pinned by DEV1-014 remains the authoritative end-to-end journey; DEV1-015 re-runs, does not fork it.

## 8. Success Criteria

### Definition of Done
- [ ] All REQ-010…071 acceptance criteria demonstrably met via tests or verification gates
- [ ] Journey test `test/workflows/parents/parent-link-request.journey.test.ts` J-REQ-01 passes
- [ ] Dashboard card renders pending items for student role only; desktop/mobile/RTL/AR verified via agent-browser
- [ ] No new tsgo/biome/lint errors vs baseline; per-file sub-loop exits 0
- [ ] Zero-schema / zero-types proof committed (Phase 0.2 inventory)
- [ ] Knowledge propagation doc created and AGENTS.md references added

### Acceptance Metrics
- Test tiers: Tier 1–4 cells present for each modified/created file.
- UI: agent-browser dimension matrix passes (Desktop 1440, Tablet 768, Mobile 375; LTR/RTL; empty/loading/error states).
- Traceability: 100% of REQ IDs cited by ≥1 task (no orphans); every task traces to ≥1 REQ.

## 9. Glossary

| Term | Definition |
|---|---|
| **DEV1-014 substrate** | The service/repo/resolver/notification spine for parent link requests, implemented ahead of DEV1-015 per sprint order. |
| **Denylist** | Per-student table preventing a specific parent from requesting again after rejection (`parent_link_denylist` or equivalent). |
| **J-REQ-01** | Journey requirement: parent sends request → student confirms → parent notified; embodied by `test/workflows/parents/parent-link-request.journey.test.ts`. |
| **Sub-loop** | `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` — per-file quality verification (tsgo→oxlint→biome→lint→duplicates). |
| **Verification-first** | Rule that every "update/reuse" claim must be checked in code before claimed; failure = STOP + ledger entry, not speculative rewriting. |
| **Zero-schema / zero-types proof** | Evidence (grep + git diff) that DEV1-015 adds no Drizzle schema tables/columns and no `backend/types/` files. |
| **Discoverability card** | The NEW dashboard component surfacing pending parent-link requests on `/student/dashboard`. |
- **Dashboard card**: discoverability iteration for pending link requests on the student home screen (the only new UI surface introduced by this ticket).
