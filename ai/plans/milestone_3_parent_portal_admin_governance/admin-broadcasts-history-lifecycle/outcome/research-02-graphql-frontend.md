# Research — GraphQL surface, SDL pins & frontend patterns

Purpose: map the existing broadcast GraphQL surface, the SDL pin tests that gate schema changes, and the frontend list-page reference patterns for the history/detail UI.

Date: 2026-09-18

## Verified findings

### Existing broadcast GraphQL surface

- Only existing broadcast GraphQL op: `adminBroadcastNotification(input): Int!` at `backend/graphql/mutation/notifications/admin-broadcast.mutation.ts:56` — the file has no named exports; the root field registers at import time.
- Input types live in `backend/graphql/pothos/notifications/admin-broadcast.pothos.ts`.
- Mutation/query barrels use side-effect imports (`import "./x.mutation";`) to register types — new root fields must be registered the same way.
- Admin prelude: `adminOnlyAuthScopes = {$all: {authenticated: true, role: [UserRole.Admin]}}` at `backend/graphql/shared/admin-prelude.ts:24`, and `requireAdminUser(ctx)` at `backend/graphql/shared/admin-prelude.ts:31`.

### Page gate & current page

- Page gate: `withPageAuth({roles: [UserRole.Admin], redirectTo: "/admin/broadcasts"})` in `app/(dashboard)/admin/broadcasts/page.tsx` — role gating only, no AppPermission.
- The page is a Server Component shell that renders `<BroadcastComposeContainer />` and resolves metadata via `getTranslations(locale).adminBroadcastsTranslations`.
- Nav item for the page at `frontend/views/dashboard/nav/navItems.ts:167` (`/admin/broadcasts`, CampaignOutlined) — unchanged; no new nav entries.

### Resolved full paths of the SDL pin tests

- `backend/graphql/test/sdl-static-assertions.test.ts`
- `backend/graphql/test/schema-surface.test.ts`

### SDL surface pins affected by new queries/mutations/enums

- `sdl-static-assertions.test.ts`:
  - `FROZEN_MUTATION_FIELDS` at :124; the mutation test asserts the sorted field list at :378.
  - `FROZEN_QUERY_FIELDS` at :192; the query test asserts at :383.
- `schema-surface.test.ts`:
  - `RECONCILED_ADMIN_BROADCAST_CERTIFY_MUTATION_FIELDS` at :598 (spread into the sorted mutation list at :862).
  - `RECONCILED_ENUMS` at :609 — currently `["BroadcastAudienceType","LinkStatus"]` (spread at :934).
  - `RECONCILED_ADMIN_BROADCAST_TYPE_NAMES` at :623 (spread at :1020).
  - Admin-mutation sorted-contiguity pin in the ~:858–:880 region — the whole admin block must remain one contiguous sorted slice in the sorted Mutation list.
  - Whole-schema named-type delta pin at :992.
  - `NotificationType` enum 9-value pin at :1265.
  - Codegen-sync test requiring byte-identical `frontend/graphql/generated/schema.graphql` at :2161-2162.

### Audit-completeness catalog

- Every new admin mutation must add a "wired" row to `test/workflows/admin/audit-completeness.catalog.ts`.
- Broadcast precedent entry at :110-118: `{mutationField: "adminBroadcastNotification", serviceEntry: "AdminBroadcastService.broadcast", expectedActionTypes: [AuditActionType.Create], expectedEntityType: "notification_broadcast", kind: "wired"}`.

### Pagination precedent

- Admin audit trail queries define the house page payload: `{items, totalCount, page, pageSize}`; entry objects list `id: ID!` as first field; out-of-range page → empty items + honest totalCount.

### Codegen

- GraphQL codegen: `bun run generate:gqlSchema && bun codegen` (the codegen-sync pin test fails until the artifact matches).

### Frontend compose surface (to stay untouched)

- 12 compose-only files under `frontend/views/admin/broadcasts/`: `BroadcastComposeContainer.tsx`, `BroadcastComposeForm.tsx`, `BroadcastComposeFields.tsx`, `BroadcastComposeHeader.tsx`, `BroadcastComposeConfirmDialog.tsx`, `BroadcastComposeSuccessSnackbar.tsx`, `BroadcastComposeCompanions.tsx`, `broadcast-compose-skin.ts`, `broadcast-compose.helpers.ts`, `useBroadcastCompose.ts`, `useBroadcastComposeDraft.ts`, `useBroadcastComposeSend.ts`.

### List-page reference patterns

- `frontend/views/admin/session-governance/` — draft→applied filter state, 1-based page, pageSize 25, honest totals, clamped `changePage`, in-page detail drawer, dialog remount via a single `useState<string|null>` key (representative files: `AdminSessionFilterBar.tsx`, `AdminSessionFilterFields.tsx`, `AdminSessionDetailDrawer.tsx`, `AdminSessionGovernanceChrome.tsx`).
- `frontend/views/admin/disputes/` — render-state matrix, `clampPage`, snackbar toasts (representative files: `AdminDisputeCaseAuditTrail.tsx`, `AdminDisputeCaseArtifacts.tsx`, `AdminDisputeAnalyticsCard.tsx`).
- Both reference surfaces use hand-composed MUI Stack/Paper/Table — AppDataGrid/PageContainer are NOT used by these pages.

### Notification route resolution

- `frontend/lib/notification-route-resolution.ts` — the resolver returns the `/notifications` feed fallback (`NOTIFICATIONS_FEED_ROUTE` at :35; final fallthrough at :211).
- The literal string "broadcast" appears nowhere in the file, so a `relatedEntityType` value `"broadcast"` falls through all existing maps to the notifications feed — no changes needed there.
- Co-located test exists at `frontend/lib/notification-route-resolution.test.ts`.

## Carry-over notes for plan phases

- New history queries (list + detail) and a stop mutation each require edits to both SDL pin tests plus `bun run generate:gqlSchema && bun codegen` — budget pin-test updates as explicit tasks.
- If a `BroadcastStatus` enum is added to the schema, `RECONCILED_ENUMS` (`schema-surface.test.ts:609`) and the named-type delta pin (:992) both change.
- New mutations (e.g. a stop mutation) must add their `audit-completeness.catalog.ts` row in the same task that creates the mutation field.
- The history/detail list pages should follow the session-governance pagination/filter idioms with hand-composed MUI (no AppDataGrid/PageContainer), keeping the 12 compose files untouched.
- New admin queries must list `id: ID!` first on every object type (Apollo cache normalization) and return honest totalCount with empty items for out-of-range pages.
