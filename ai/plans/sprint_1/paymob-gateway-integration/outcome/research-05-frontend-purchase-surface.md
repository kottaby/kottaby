# Research Digest — Frontend Purchase Surface for Paymob Gateway Plan

## 0. Critical negative findings (verify before planning)

- **`purchaseSubscription` / `mySubscriptions` do NOT exist in code.** Only in `ai/plans/sprint_1/subscription-purchase-payment-gateway/{specs,plan,tasks}.md`. `frontend/graphql/generated/schema.graphql` has no `Subscription` object type, no purchase mutation (grep: only `hasActiveSubscription` on some type at :55/:139 and `PlatformAnalyticsSubscriptions` at :565). `backend/services/billing/` contains only `plan-catalog.service.ts` + `wallet.service.ts` — no purchase service. DB tables DO exist: `backend/db/schema/billing/subscriptions.ts`, `student-payments.ts`, `student-subscriptions.ts`, `plans.ts`. the subscription-purchase plan's specs.md:120 (REQ-064) explicitly says "This ticket ships NO student-facing purchase UI."
- **The shared UI primitives from `frontend/COMPONENT_PATTERNS.md` do NOT exist as components.** `PageContainer`, `PageHeader`, `SectionPanel`, `AppDataGrid`, shared `MetricCard`, shared `StatusBadge` — NOT FOUND in `frontend/components/ui/` (real contents: `PermissionDeniedFallback.tsx`, `RetryableNotice.tsx`, `NoticeSnackbar.tsx`, `ErrorRetryAlert.tsx`, `IconCircleEmptyState.tsx`, `GraphQLErrorSurfaceHost.tsx`, `graphqlErrorSurface/`, `sessionList/`, notification drawer files, `fieldError.ts`, `focusRing.ts`, `useNotificationDrawerActions.ts`). Only a feature-local `frontend/views/admin/analytics/MetricCard.tsx` exists. Likewise `frontend/mobile/` and `frontend/desktop/` dirs referenced by COMPONENT_PATTERNS.md are NOT FOUND.
- **`RequirePermission` client component: NOT FOUND** anywhere in `frontend/` (only doc references). `requirePermissionForPage` / `AppPermission` from `app/AGENTS.md`: NOT FOUND in `backend/lib/auth/` or `backend/enum/`. The actual in-tree mechanism is the **role-based** `withPageAuth`.
- `docs/auth/permission-architecture.md` — NOT FOUND (root AGENTS.md references it; `docs/auth/` contains only jwt-authentication-service, qiraah-selection-and-c5, REDIRECT_LOOP_FIX*, user-registration).
- `docs/app/with-page-auth.md` describes a DIFFERENT, stale `withPageAuth` from `@/backend/lib/auth/withPageAuth` with `Permission[]` args — that file does NOT exist. The real one is `frontend/lib/auth/withPageAuth.ts` (see §5).
- `frontend/NEW_PAGE_WORKFLOW.md` — NOT FOUND (referenced by `.agents/instructions/frontend.instructions.md` but absent from `frontend/`).
- `frontend/stores/` contains only `AGENTS.md` — no store files currently.
- `frontend/graphql/sharedDocuments/AGENTS.md` "Layout" listing is stale: actual subdirs are only `admin/ auth/ billing/ notifications/ parents/ scheduling/ students/ teachers/` (no `sessions/`, `classes/`, `meeting/`, `permissions/`, `profile/`, `reports/`, `resources/`, `shared/`, `suggestions/`, `complaints/`, `supervisor/`).
- New plan dir `ai/plans/sprint_1/paymob-gateway-integration/` does **not yet exist** (sprint_1 already holds sibling plans for subscription-purchase, dual-confirmation, session-report, and recitation).
- No external-redirect precedent: zero `window.location.assign`/`href` usages in `frontend/views/**`. Only sanitizer `frontend/lib/safeRedirect.ts` (internal paths) and `frontend/providers/apollo/utils/auth-recovery.ts:228` (`globalThis.window.location.href`). The redirect-to-Paymob-iframe/portal pattern must be specified fresh.

## 1. Candidate routes + view directories

Current route reality (from `find app/(dashboard)`):

| Surface | Today | Recommendation |
|---|---|---|
| Student plan catalog | No route; backend `planCatalog` query already exists (`backend/graphql/query/plan-catalog.query.ts:18`, authenticated for all roles, scopes at :22) | CREATE `app/(dashboard)/student/plans/page.tsx` + `frontend/views/student/plans/…Container`. Model on `app/(dashboard)/student/sessions/page.tsx:33` |
| Checkout initiation | No route | Either same catalog view (dialog/button → mutation → redirect) or CREATE `app/(dashboard)/student/checkout/page.tsx` |
| Payment result (success/failure return from gateway) | No route | CREATE `app/(dashboard)/student/checkout/result/page.tsx` reading `searchParams` (Next.js 16: `await searchParams`) |
| My subscriptions | CREATE — nothing implemented | Existing nav link `/subscriptions` (`frontend/views/dashboard/nav/navItems.ts:112`, icon `CardMembershipOutlined as SubscriptionsIcon`) currently resolves to the catch-all `app/(dashboard)/[feature]/page.tsx` → `ComingSoonView`. A real page at `app/(dashboard)/subscriptions/page.tsx` would take precedence over the catch-all automatically; *or* retarget nav to `/student/subscriptions` and create that route (precedent: Sessions retarget note at `navItems.ts:100-101`) |

Route-group notes: there is **no `[locale]` segment under `(dashboard)`** — locale comes from the `NEXT_LOCALE` cookie via `getLocaleFromCookie()` (`shared/locale/server-cookies.ts:6`). `generateMetadata` pattern with localized title: `app/(dashboard)/admin/plans/page.tsx:23-30`, `app/(dashboard)/wallet/page.tsx:25-30`.

View-layer homes: `frontend/views/student/` currently holds only `sessions/`. New views per prototype: `frontend/views/student/plans/`, `frontend/views/student/subscriptions/` (and checkout pieces). Layout precedents: `frontend/views/admin/plans/` uses subdirs `catalog/ dialogs/ forms/ hooks/ ui/` + `index.ts` barrel; `frontend/views/student/sessions/` is flat with one `StudentSessionsContainer.tsx` orchestrator + sibling hooks; `frontend/views/teacher/wallet/` flat with `TeacherWalletContainer.tsx` + `WalletBody.tsx` + pieces. View files are `"use client"` clients; note the duplicated `"use client"` directive at `PlanCatalogContainer.tsx:1` and `:14` (and `usePlanStatusDialog.ts:1/:14`) — tolerated in-tree but don't copy it into new files.

## 2. i18n namespaces

Real architecture (`shared/locale/AGENTS.md`, actual files):

- **Namespaces are handle objects**, created by `defineNamespace<PascalLabels>("stable.string.id", translations => translations.<camel>Translations)` in `shared/locale/namespaces/<ns>/<ns>.namespace.ts`; registered via barrel `shared/locale/namespaces/index.ts` (existing exports include `Plans`, `Wallet`, `Sessions`, `Errors`, `Common`…). Example: `shared/locale/namespaces/plans/plans.namespace.ts:1-4` → `defineNamespace<PlansLabels>("plans.plans", ...)`.
- Per namespace you need: `shared/locale/types/<ns>/index.ts` (`*Labels` interface), `shared/locale/en/<ns>/index.ts`, `shared/locale/ar/<ns>/index.ts`, plus a parity test convention `<ns>-namespace.parity.test.ts` in `shared/locale/` (see `plans-namespace.parity.test.ts`, `wallet-namespace.parity.test.ts`).
- Existing namespaces (both `en/` and `namespaces/` and `types/`): `adminBroadcasts, adminUsers, analytics, applicant, auth, common, dashboard, errors, handshakeCode, landing, notifications, parentLink, plans, recitation, sessions, wallet`.
- **`plans` already exists but is admin-CRUD-shaped** (`shared/locale/types/plans/index.ts:10-70` — pageTitle, createPlanDialogTitle, validationPriceMessage, etc.). The purchase funnel needs either a **new namespace** (e.g. `subscriptions` / `checkout`) or additive keys in `plans`. Cash/money formatting: note `intervalDaysShort` precedent for short units.
- **Client entry**: `import { useAppTranslation } from "@/shared/locale";` (or `@/shared/locale/client`) then `const t = useAppTranslation(Plans)` — handle object, NOT a string (real code: `frontend/views/admin/plans/hooks/usePlanStatusDialog.ts:20-21,40`; root/shared AGENTS.md examples showing `useAppTranslation("auth")` are stale w.r.t. actual call sites).
- **Server entry**: `import { getTranslations } from "@/shared/locale/server"`; signature `getTranslations(locale: string)` is **synchronous** (`shared/locale/server.ts:15`) returning a `Translations` object with per-namespace `*Translations` properties, e.g. `.plansTranslations` (`shared/locale/en/messages.ts:26`), `.walletTranslations`, `.sessionsTranslations`, `.dashboardTranslations`. Pages combine with `getLocaleFromCookie()` (see `app/(dashboard)/wallet/page.tsx:24-27`).
- **API/scripts**: `getServerTranslations(locale)` via `@/shared/locale/server-graphql`. **Resolvers**: `await ctx.t("namespace")`.
- The `errors` namespace is the canonical transport-error surface — do not duplicate keys like `validation`/`rateLimitExceeded` elsewhere (shared/AGENTS.md:262-264). Transport-error UX flows through error-link mapping, not namespaces.

## 3. GraphQL document conventions (for `purchaseSubscription` + checkout/status query)

Source of truth: `frontend/graphql/sharedDocuments/AGENTS.md` + working exemplar `frontend/graphql/sharedDocuments/billing/plan-catalog.documents.ts`.

- **Placement**: put purchase/subscription docs under `frontend/graphql/sharedDocuments/billing/` — e.g. extend `plan-catalog.documents.ts` or new `subscription-purchase.documents.ts`; export via `billing/index.ts` (already re-exported from top-level `index.ts`; consumers may use barrel `@/frontend/graphql/sharedDocuments` or deep import).
- **Naming**: `purchaseSubscriptionMutationDocument: TypedDocumentNode<PurchaseSubscriptionMutation, PurchaseSubscriptionMutationVariables>`; `mySubscriptionsQueryDocument: TypedDocumentNode<MySubscriptionsQuery>` (no-arg → omit variables parameter). Pattern proven at `plan-catalog.documents.ts:21,55`.
- **Imports**: `import { gql, type TypedDocumentNode } from "@apollo/client"` (never `@apollo/client/core`); all op types from `@/frontend/graphql/generated/gql/graphql`; no inline type literals, no `NonNullable<...>` index-access workarounds.
- **`id` on every object type in every selection set** (rule at sharedDocuments/AGENTS.md:113-114).
- **Hooks**: `useQuery` / `useMutation` from `@apollo/client/react` ONLY (e.g. `PlanCatalogContainer.tsx:16`, `usePlanStatusDialog.ts:16,43`). `useLazyQuery` banned. Exemplar stateful query: `useQuery(adminPlansQueryDocument, { variables: { includeInactive: true }, fetchPolicy: "cache-and-network" })` (`PlanCatalogContainer.tsx:38-41`).
- **Codegen gate**: none of the purchase types exist yet. After the backend mutation/query land you MUST run `bun run generate:gqlSchema && bun codegen` (AGENTS.md:107-111) — until then `PurchaseSubscriptionMutation` etc. are absent from `frontend/graphql/generated/gql/graphql.ts`.
- **Idempotency key transport** (purchase is idempotent per the subscription-purchase plan): pattern at `frontend/views/admin/broadcasts/useBroadcastComposeSend.ts:35-63` — mint with `randomUUID()` helper into a `useRef` at scenario start, send via `context: { headers: { "x-idempotency-key": composeKeyRef.current } }` (:49), rotate the key ONLY on success; failed submits keep the same key.
- **Error surfacing**: mutation error behavior comes from `frontend/providers/apollo/error-link.map.ts` (`mapGraphQLErrorByCode`, branch on `extensions.code` — never HTTP status); `DUPLICATE_REQUEST` is success-equivalent UX (see treatment notes in `frontend/views/student/sessions/StudentSessionsContainer.tsx:61`); VALIDATION field errors project through `frontend/lib/mutationFieldErrors.ts` / `frontend/components/ui/fieldError.ts`. `GraphQLErrorSurfaceHost` (mounted once via AppClientProviders) is the ONLY error-listener host — pages must NOT register their own.

## 4. Component / UX conventions for the redirect-to-gateway funnel

- **Page scaffold (real, current)**: MUI `Container maxWidth="lg" sx={{ py: 4 }}` + `Stack` header row + `Typography variant="h4" component="h1"` title + `variant="body1"` subtitle; CTA `Button` with `startIcon` (`PlanCatalogContainer.tsx:52-80`). Query error → MUI `Alert severity="error"` (:83-87); success toast via `Snackbar` + `Alert severity="success"` (`autoHideDuration={4000}`) (:121-130).
- **Loading/empty**: dedicated skeleton + empty-state components per view (precedent `PlanCatalogSkeleton.tsx`, `PlanCatalogEmptyState.tsx`, `SessionsLoadingSkeleton.tsx`, `SessionsEmptyState.tsx`, `IconCircleEmptyState.tsx`). Student-sessions chrome rule (keep chrome mounted through loading/error branches): documented in `StudentSessionsContainer.tsx` header.
- **Responsive**: no enforced scaffold — `PlanMobileCardList.tsx` lives beside `PlanCatalogTable.tsx` inside `catalog/`; viewport tier via `ViewportContext` (`frontend/context/ViewportContext.ts`, tiers mobile/tablet/desktop, `isMobile` = < 900px) provider-mounted globally. TheCOMPONENT_PATTERNS.md `PageContainer`/`MobilePageContainer`/`AppDataGrid`/`StatusBadge` primitives are documented but do not exist in the tree — do not cite them as imports.
- **Status display**: no shared `StatusBadge` component exists; status chips are locally built. For subscription status (active/pending/failed) an explicit new chip/palette mapping is needed — theme tokens per `frontend/THEME_PALETTE.md`; `frontend/AGENTS.md:3-10` forbids hardcoded colors, use `sx={(theme) => …}` + `theme.palette.*` tokens, `on<Color>` siblings for contrast.
- **MUI v9 rules** (must-follow for the plan): style props in `sx` only; icons `*Outlined` suffix; `component="output"` for aria-live; `LockOutlined` + `PermissionDeniedFallback` for denial renders; reduced-motion honored via `useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true })` (`frontend/AGENTS.md:56`).
- **Redirect-to-gateway**: no precedent — plan must choose between full-page redirect (use `globalThis.window.location.href` idiom from `auth-recovery.ts:228`) vs keeping Paymob's iframe-in-page; payment-result return URL must be an app route (§1) that re-queries `mySubscriptions` and shows success/failure branch.

## 5. Permission / role wrapper rules (student-only pages)

The operative pattern (all real current pages):

```tsx
// app/(dashboard)/student/<new>/page.tsx
export default async function StudentXPage() {
  await withPageAuth({ roles: [UserRole.Student], redirectTo: "/student/x" });
  return <StudentXContainer />;
}
```

- `withPageAuth` from `@/frontend/lib/auth/withPageAuth` (`frontend/lib/auth/withPageAuth.ts:67-105`): anonymous → `redirect("/login?redirect=<path>")`; role mismatch → that caller's role dashboard via `roleDashboardPath` (never bare `/dashboard`). No permission check exists in-tree today.
- `UserRole` import: `@/backend/enum/users/user-role.enum` (page-level) — see `student/sessions/page.tsx:2`, `wallet/page.tsx:2`.
- GraphQL-side enforcement (when backend lands): the subscription-purchase plan specs.md:69 specifies `authScopes: { $all: { authenticated: true, role: [UserRole.Student] } }` with studentId derived from `ctx.user.id`, never input — frontend should never send studentId.
- Do NOT gate `/dashboard` pages with client wrappers; the server page guard is the only authz boundary (comment: `app/(dashboard)/student/sessions/page.tsx:14-19`).

## 6. Storybook placement

- Config: `.storybook/main.ts:9` — stories glob `frontend/stories/**/*.stories.@(js|jsx|mjs|ts|tsx)`.
- Convention: page-level stories live in `frontend/stories/pages/<area>/` (existing: `pages/admin/Plans.stories.tsx` + `plans.fixtures.ts`, `pages/auth/Login.stories.tsx`, `pages/StudentDashboard.stories.tsx`, `pages/auth`, `pages/admin` dirs). Domain stories in `frontend/stories/admin/` (e.g. `AdminUsersDirectory`), `frontend/stories/ui/`, `frontend/stories/lib/`.
- Harness: `StoryApolloProvider` (wraps MockLink responses) + `DashboardStoryFrame` from `@/frontend/stories/lib/storyHarness`; global decorator supplies theme + locale. Meta pattern `title: "Pages/Admin/Plans"`, `tags: ["autodocs"]`, `layout: "fullscreen"`; story arms include `Default` (fixture mocks) and `Loading` (never-resolving mock) — see `frontend/stories/pages/admin/Plans.stories.tsx:20-56`.
- Suggested new stories: `frontend/stories/pages/student/PlanCatalog.stories.tsx`, `.../Checkout.stories.tsx`, `.../MySubscriptions.stories.tsx` with matching `*.fixtures.ts`, covering default / loading / empty / payment-failed states (prototype states: active / pending / failed / empty).

## 7. Prototype screens (`ai/plans/sprint_1/subscription-purchase-payment-gateway/prototype/screens.json`, 12 screens)

Purchase-funnel-relevant (all by title/file, PNGs not opened):

| Title | File | Device / State |
|---|---|---|
| Choose Your Plan — Student App | `student-plan-catalog-default-mobile.png` | MOBILE / default |
| Choose Your Plan — Student Portal | `student-plan-catalog-default-desktop.png` | DESKTOP / default |
| Checkout — Kottaby | `checkout-mock-payment-mobile.png` | MOBILE / checkout (mock-payment screen) |
| My Subscriptions — App | `my-subscriptions-active-mobile.png` | MOBILE / active |
| My Subscriptions — Student Portal | `my-subscriptions-active-desktop.png` | DESKTOP / active |
| My Subscriptions — Pending Payment | `my-subscriptions-pending-mobile.png` | MOBILE / pending |
| My Subscriptions — Payment Failed | `my-subscriptions-failed-mobile.png` | MOBILE / failed |
| My Subscriptions — empty (illustration) | `my-subscriptions-empty-mobile.png` | MOBILE / empty |
| Notifications — payment confirmation | `payment-confirmation-notification-mobile.png` | MOBILE / confirmed |

Not purchase-journey (admin-sided): Plan Catalog Dashboard, New Plan Form, Edit Plan (admin `/admin/plans`, desktop).

## 8. Companion facts worth anchoring in the plan

- the subscription-purchase plan deferred the purchase UI explicitly (specs.md:100-102, 119-120, 181): backend contract = `purchaseSubscription(input: PurchaseSubscriptionInput!): PurchaseSubscriptionPayload!` and `mySubscriptions: [Subscription!]!`; its `tasks.md:156` names target backend files (`backend/graphql/mutation/subscription-purchase.mutation.ts`, `backend/graphql/query/subscription.query.ts`) that do not yet exist. Check with the plan author whether Paymob plan supersedes/depends on the subscription-purchase plan backend execution.
- `navItems.ts:112` – student `/subscriptions` nav link is already wired; shipping the page removes a catch-all catch. Nav labels come from `DashboardLabels`/`HandshakeCodeLabels` with collision-guard typing (`navItems.ts:53-74`).
- Teacher wallet flow (`frontend/views/teacher/wallet/`) is the closest money-domain UI precedent (balance card, ledger, withdraw dialog, `useTeacherWalletWithdraw` mutation hook, `SNACKBAR_AUTOHIDE_MS` shared const in `teacherWalletShared.ts`).
- `docs/billing/plan-catalog.md` exists for the plan-catalog backend contract; no docs for subscriptions/payments yet.
- Root AGENTS.md mandates quality flow `bun quality-gate` and per-file `bun run scripts/health/sub-loop.ts <file> --lifecycle <stage>`; after any schema/doc change: `bun run generate:gqlSchema && bun codegen`.
