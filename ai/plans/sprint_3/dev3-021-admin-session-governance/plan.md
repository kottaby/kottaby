# Implementation Plan: DEV3-021 — Admin Session Governance

> **Plan directory (verbatim):** `ai/plans/sprint_3/dev3-021-admin-session-governance`
> **Specs:** §2 ids REQ-001..REQ-081
> **Blocked by:** DEV3-004 (session lifecycle) — shipped.

---

## 1. System Overview & Architecture

```
/session-governance (MUI)
        │useQuery/useMutation (Apollo)
        ▼
GraphQL Query/Mutation (Pothos)
        │authScopes: $all:{authenticated,role:[Admin]}
        ▼
SessionAdminGovernanceService
  ├─ assertActorAdmin(ctx.user.id, locale, tx)   [BFLA]
  ├─ SessionRepository (read-only)
  └─ withTransaction ──────────────────────┐
        │                                  │
        ▼                                  ▼
 SessionRepository guard UPDATE      AuditService.createAuditLog
 Refund: refundHeldLaneToProvenance   (A.5 append-only)
        └─ post-commit: SessionRequestNotificationService (recipient-locale waves)
```

**Key Design Decisions:**
- **D-01** Reuse-first: no forks of `assertActorAdmin`, `AuditService`, `refundHeldLaneToProvenance`, `withTransaction`, session Pothos objects, or barrels — task 0.2 verify-then-claim sweep anchors each by `path:line`.
- **D-02** Five new service functions grouped in ONE new module `backend/services/classes/session-admin-governance.ts` registered on the existing `SessionLifecycleService` namespace — keeps the "single writer" doctrine coherent with DEV3-004's module extraction pattern (mirrors `session-lifecycle.{booking,confirmation,governance,guards,transitions}.ts`).
- **D-03** Eligibility matrix (canonized in specs §2.4): reschedule → `scheduled|started`; cancel → any pre-terminal (`scheduled|started`); reassign → `scheduled` only; join → `started` only.
- **D-04** Frontend view structure follows `frontend/views/admin/disputes/...` scaffold: `AdminSessionGovernanceContainer` + `AdminSessionGovernanceChrome` + row components — common/desktop/mobile triplication avoided since this is a single-density desk-first surface (one component tree, MUI responsive breakpoints only).
- **D-05** Timestamps update in place (D-01A): `startedAt`/`endedAt` — they exist (`backend/db/schema/classes/session.ts:46-47`); no `scheduled_at`/`scheduledAt`/`meetingUrl` columns exist — VERIFIED ABSENT.
- **D-06** Cancel refunds reuse only the recorded-lane primitive; a session row with no recorded lane refunds nothing (no synthesized lanes).
- **D-07** Nav item: admin block gains `{ route: "/admin/session-governance", labelKey: "sessionGovernance" }` adjacent to `/audit` — verified the admin block ends at navItems.ts:145-146.

---

## 2. Data Models & Database Schema

**No Drizzle schema changes.** Verified: `backend/db/schema/classes/session.ts` already provides `id`, `studentId`, `teacherId`, `type` (SessionType), `status` (SessionStatus), `createdAt`, `startedAt`, `endedAt`, `confirmationDeadline`, `durationMinutes`. No migrations, no pushes.

**New canonical types** (`backend/types/classes/admin-session-governance.types.ts`, exported through `@/backend/types` barrel):
- `AdminSessionListFilterInput { teacherUserId?, studentUserId?, type?, status?, dateFrom?, dateTo?, page?, pageSize? }`
- `AdminSessionRescheduleInput { sessionId, startedAt, endedAt }`
- `AdminSessionCancelInput { sessionId, reason? }`
- `AdminSessionReassignInput { sessionId, newTeacherUserId }`
- `AdminSessionJoinInput { sessionId }`
- `AdminSessionRowReturnType extends SessionReturnType { needsAttention: boolean }`
- `AdminSessionDetail = SessionReturnType | null`

**_Zod schemas_** live in the same file, exported for the Pothos argument validation functions (`zodToResult`-style per existing precedent).

---

## 3. API Contracts & Pothos Resolvers

**SDL:**

```graphql
extend type Query {
  adminSessions(filter: AdminSessionListFilterInput!, page: Int = 1, pageSize: Int = 25): SessionPage!
  adminSession(id: ID!): Session
}
extend type Mutation {
  adminRescheduleSession(input: AdminSessionRescheduleInput!): Session!
  adminCancelSession(input: AdminSessionCancelInput!): Session!
  adminReassignTeacher(input: AdminSessionReassignInput!): Session!
  adminJoinSession(input: AdminSessionJoinInput!): Session!
}
```

- Auth: every field carries `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }` (BFLA, mirrors `resolveSessionDispute`).
- Errors: `DomainError` subclasses → `extensions.code` per registry; `cancel`/`reschedule`/`reassign`/`join` conflict = `SESSION_INVALID_TRANSITION` (registered code, localized).
- **Caller permission matrix:** Admin ✓ all 7; other roles ✗ all 7 (403).

---

## 4. Backend Services & Repositories

**SessionAdminGovernanceService** (new module `backend/services/classes/session-admin-governance.ts`, follows the existing extraction-file layout):

```ts
export namespace SessionAdminGovernanceService {
  listAll(actorId, filter, page, pageSize, locale): Promise<Page<AdminSessionRow>> // READ
  getDetail(actorId, sessionId, locale): Promise<AdminSessionDetail | null>        // READ
  reschedule(actorId, input, locale): Promise<Session>                              // WRITE (tx)
  cancel(actorId, input, locale, idempotencyKey): Promise<Session>                  // WRITE (tx, idem)
  reassignTeacher(actorId, input, locale): Promise<Session>                        // WRITE (tx)
  join(actorId, input, locale): Promise<Session>                                    // WRITE (audit only)
}
```

- Every method top: `await assertActorAdmin(actorId, locale, tx)`.
- Mutation methods wrap in `withTransaction(async tx => { ... })`; repo receives `tx`.
- **`refundHeldLaneToProvenance`** consumed VERBATIM from `session-lifecycle.transitions.ts` (import; no reimplementation).
- Notifications: invoke `SessionRequestNotificationService` post-commit via the same wave-envelope the participant flows use — ids: `sessionGovernance.rescheduled`, `sessionGovernance.cancelled`, `sessionGovernance.teacherReassigned` — each wave targeting student + teacher (+ new teacher, in reassign).

**SessionRepository new methods** (`backend/db/repo/classes/session.repository.ts`):
- `listForAdmin(filter, page, pageSize, tx)` — joins + where + ordered pagination; returns `{rows, total}`; prepared statements not applicable (multi-shapes) — Drizzle select-builder with explicit select list.
- guard updates: `guardReschedule`, `guardCancel(preTerminal)`, `guardReassignTeacher(scheduled)`, all returning the updated row or undefined → 0-rows ⇒ `InvalidTransition`.
- `getAnyByIdForAdmin(id, tx)` — read-by-id without participant scoping (admin browse).

**Concurrency & race notes:**
- TOCTOU is bounded by the guard-update eligibility clause (state re-checked atomically in SQL).
- Refund idempotency derives from the primitive itself; the idempotency key claim dedupes repeated client retries at the gateway layer (existing plumbing).
- No cross-session global locks required.

---

## 5. Frontend UX & Navigation Specification

**Routes:**

| Route | Purpose | Access |
|---|---|---|
| `/admin/session-governance` | Directory + actions | admin only |

**Nav registration** (`frontend/views/dashboard/nav/navItems.ts` admin block): insert `{ route: "/admin/session-governance", labelKey: "sessionGovernance", Icon: EventNoteOutlined }` between `/audit` and `/disputes`.

**Page assembly** (`app/(dashboard)/admin/session-governance/page.tsx`): `withPageAuth` admin-gated; `getLocaleFromCookie`-based locale; SSR PR-only wrapper renders client container.

**View tree** (`frontend/views/admin/session-governance/`):

- `AdminSessionGovernanceContainer.tsx` — Apollo bindings for directory + detail + mutations
- `AdminSessionGovernanceChrome.tsx` — MetricCardGrid summary (counts per status) + filter bar (teacher/student/type/status/date range inputs)
- `AdminSessionsBody.tsx` — AppDataGrid rows + pager
- `AdminSessionRow.tsx` — row cells + badge (`needsAttention`) + kebab menu actions
- `AdminSessionRowStatusCell.tsx` — StatusBadge of the session status
- `AdminSessionDetailDrawer.tsx` — side-panel read-only detail
- `RescheduleSessionDialog.tsx`, `CancelSessionDialog.tsx` (with `reason` input), `ReassignTeacherDialog.tsx` (teacher picker), `JoinObservationAction.tsx` (single-click confirm banner)

**Per-role rendering differences:** only Admin sees the surface; the surface is structurally absent for others.

**Responsive:** desktop 1440 px default drawer; ≤ md (768 px) drawer becomes full-screen `Dialog`; mobile 375 px uses temporary `Drawer` (MUI), NOT a bottom-nav (none exists).

**RTL:** relies on existing dir-flip; all `sx` uses logical props (`paddingInlineStart` etc.) — no `left/right`.

**Visual-state matrix:** loading (skeleton), empty (0-row CTA copy), error (Snackbar+retry), disabled (actions disabled per state eligibility matrix), badge `needsAttention` (warning palette).

**Apollo documents** (`frontend/graphql/sharedDocuments/adminSessions.documents.ts`): `AdminSessionsQueryDocument`, `AdminSessionQueryDocument`, `AdminSessionRescheduleMutationDocument`, `AdminSessionCancelMutationDocument`, `AdminSessionReassignTeacherMutationDocument`, `AdminSessionJoinMutationDocument`. Each object selection includes `id`. Hooks from `@apollo/client/react`. NO `useLazyQuery`.

---

## 6. Security & Tenancy Mitigations

- **BFLA:** Pothos `$all` admin scope + service-side `assertActorAdmin` re-assert (defense in depth).
- **BOPLA:** Whitelist mapping; NO `{ ...input }` spread into Drizzle updates; each repo method receives a typed, field-reduced payload.
- **BOLA:** Directory/detail intentionally unscoped per-row (admins see all); NEVER surfaced to non-admin roles; error splitting (`forbidden` vs `unauthorized`) mirrors existing admin ops.
- **Rate limiting:** Out of scope; recorded in deferred-items (D-03).
- **Error disclosure:** No SQL, no PII beyond ids, no secrets in messages; localization enforced.
