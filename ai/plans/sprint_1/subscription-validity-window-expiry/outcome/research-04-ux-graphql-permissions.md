# Research 04 — UX surface, navigation, permission conventions, GraphQL client error contract

Scope: what the "Subscription Validity Window & Expiry" plan may reference on the UI/nav/permissions/
client-error side, plus verified package.json script names. Every claim below was verified by grep/read
in this session on 2026-09-11. Verified negatives are called out explicitly.

## 1. Existing subscription UI surfaces — what actually exists today

### 1.1 Student-facing subscription pages: NONE (verified negative)

- `app/(dashboard)/` child directories are exactly: `admin, audit, dashboard, disputes, [feature], notifications, parent, profile, shared, student, students, teacher, teachers, wallet` (plus `layout.tsx`). There is **no `app/(dashboard)/subscriptions/` route** (verified by directory listing).
- `app/(dashboard)/student/` contains only `dashboard/`, `link-requests/`, `sessions/` — no `plans/`, no `checkout/`, no `subscriptions/`.
- `frontend/views/student/` contains only `sessions/` — **no `frontend/views/student/subscriptions/`, no `frontend/views/student/checkout/`**. `MySubscriptionsContainer.tsx` and `PaymentResultContainer.tsx` do NOT exist anywhere (verified by repo-wide grep for `MySubscriptions` — only plan/docs text and backend code hit).
- Therefore the student sidebar link `{ route: "/subscriptions", labelKey: "subscriptions", Icon: SubscriptionsIcon }` at `frontend/views/dashboard/nav/navItems.ts:120` (Student array) currently resolves to the catch-all `app/(dashboard)/[feature]/page.tsx:26-30`, which renders `<ComingSoonView feature={feature} />`; `ComingSoonView` maps the `subscriptions` segment to the dashboard locale label at `frontend/views/dashboard/layout/ComingSoonView.tsx:20-33`.

### 1.2 What the paymob plan says about these screens (and its execution state)

- `ai/plans/sprint_1/paymob-gateway-integration/plan.md:263-264` plans to CREATE `app/(dashboard)/student/checkout/result/page.tsx` + `frontend/views/student/checkout/result/PaymentResultContainer.tsx` and `app/(dashboard)/subscriptions/page.tsx` + `frontend/views/student/subscriptions/MySubscriptionsContainer.tsx` ("activates the pre-existing nav entry (`navItems.ts:112)`" — note the stale line ref; actual is `navItems.ts:120`).
- Same plan, `tasks.md:142`: status chips active/pending/failed + empty state for `MySubscriptionsContainer`. **These are planned-but-unlanded** — the components above do not exist in the codebase today (§1.1). Do not cite them as existing surfaces; if the expiry plan needs an "expired" visual state, it must either rule no-UI or note the dependency on that unlanded surface.

### 1.3 Subscription-adjacent surfaces that DO exist today

- **Admin plan catalog** — `app/(dashboard)/admin/plans/page.tsx:33` renders `PlanCatalogContainer` behind `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/plans" })` (page.tsx:33). Plan mutations in `backend/graphql/mutation/plan-catalog.mutation.ts` (e.g. `createPlan` at :20-48). `intervalDays` is already a plan catalog edge (locale type `planIntervalDaysInvalid` at `shared/locale/types/errors/labels.ts:17`).
- **Admin user detail `hasActiveSubscription` flag** — `backend/graphql/pothos/admin/admin-user.pothos.ts:194`; wired to `backend/services/admin/user-management.mappers.ts:159` (`hasActiveSubscription: row.studentHasActiveSubscription ?? false`); admin UI label at `shared/locale/en/adminUsers/index.ts:224`. Read-only EXISTS semantics — derived, not the subscription status field.
- **Admin analytics subscription counters** — locale types exist for totals incl. `subscriptionsExpiredLabel` at `shared/locale/types/analytics/index.ts:111-117`; backend counter surface exists (`PlatformAnalyticsSubscriptions` in `frontend/graphql/generated/schema.graphql`). If the expiry job is correct, the EXISTING analytics "expired" counter just starts counting — no UI change needed, but it is a free verification surface.
- **Student session booking/listing** — `app/(dashboard)/student/sessions/page.tsx` → `StudentSessionsContainer` (`frontend/views/student/sessions/StudentSessionsContainer.tsx`). This is where AC3's "student requests a session" physically happens; booking rejection copy surfaces here (see §4).

### 1.4 GraphQL schema surface that already exists (no schema change needed for expiry state display)

- `Query.mySubscriptions: [StudentSubscription!]!` — `frontend/graphql/generated/schema.graphql:921`; resolver `backend/graphql/query/subscription.query.ts:42-65` (student-only, zero-arg, owner-scoped).
- `type StudentSubscription` already carries `startDate: String`, `endDate: String`, `status: SubscriptionStatus!` — `frontend/graphql/generated/schema.graphql:1117-1151` (doc comments: "Timestamp the subscription period ends, or null while pending." :1122).
- `enum SubscriptionStatus { Active, Cancelled, Expired, Pending, Suspended }` — `frontend/graphql/generated/schema.graphql:1166-1172`. **`Expired` already exists in the schema enum** — the expiry job flips rows into an enum value the client schema already knows. No enum/codegen addition needed for status display.
- **No frontend document consumes `mySubscriptions` today** — `frontend/graphql/sharedDocuments/billing/` contains only `plan-catalog.documents.ts` and `wallet.documents.ts` (+ `index.ts`); grep for `mySubscriptions|purchaseSubscription` across `frontend/graphql/sharedDocuments` returns nothing.
- Canonical billing contract `docs/billing/subscription-purchase.md:359-362` explicitly assigns "balance zeroing and status transitions at window end" to the expiry job — this ticket is that job.

## 2. Navigation

- **Single source**: `frontend/views/dashboard/nav/navItems.ts` — `DashboardNavItem { route, labelKey, Icon }` (:40-44) keyed by role in `NAV_ITEMS_BY_ROLE: Record<UserRole, readonly DashboardNavItem[]>` (:115-165), served by `getNavItemsForRole(role)` (:173-178). Labels resolve via `resolveNavItemLabel` (:190-199) against the `dashboard` + `handshakeCode` locale bundles; `UserRole` here is the codegen enum from `@/frontend/graphql/generated/gql/graphql` (:28).
- **Rendering**: `frontend/views/dashboard/nav/DashboardSidebar.tsx:48-54` — MUI `Drawer` (permanent ≥lg, temporary below), items from `getNavItemsForRole(user?.role)` (:54). No bottom navigation exists — repo-wide grep for `BottomNav|BottomNavigation`/`bottom.?nav` finds only comment mentions (a mobile drawer in `frontend/views/admin/session-governance/AdminSessionDetailDrawer.tsx:132`, a comment in `AdminUsersDirectoryContainer.tsx:121`). **The plan must not invent a bottom-nav entry.**
- **Gating format is role-only** at nav level — the map is keyed by `UserRole` and nothing finer (no per-item permission predicates). Fine-grained permission gating documented in `app/AGENTS.md` relies on `<RequirePermission>`, but that component does NOT exist in code (repo-wide grep hits only `frontend/AGENTS.md`) — verified negative.
- Adding an item = add one line to the role's array + ensure the label key exists in `shared/locale/types/dashboard/index.ts` (`subscriptions` already at :24-25) and both locale leaves.
- Catch-all: `app/(dashboard)/[feature]/page.tsx` (cited in §1.1) — any nav route without a real page renders Coming Soon, so an existing-but-unlanded `/subscriptions` link is the status quo, not a bug this ticket must fix.

## 3. Permission / role model

- **Role list actually used**: `ClientUserRole`/codegen aside, the server enum is `backend/enum/users/user-role.enum.ts:5-10` — exactly four values: `Admin="admin"`, `Teacher="teacher"`, `Student="student"`, `Parent="parent"`. There is NO `SUPER_ADMIN` role; "superAdmin" is a boolean-ish scope derived from the admin role (`backend/graphql/pothos/builder.ts:35`: "`superAdmin: true` — true iff `ctx.isSuperAdmin` (admin role)").
- **GraphQL field auth = Pothos `authScopes`** (declarative, before the resolver runs; fail-closed per `backend/graphql/AGENTS.md:10`). Scope kinds: `authenticated` / `role` / `permission` / `superAdmin` / `notImpersonating` (`backend/graphql/AGENTS.md:10`). Verbatim call-site examples:
  1. Student-scoped, explicit `$all` conjunction (the 401/403 split) — `backend/graphql/query/subscription.query.ts:47-52`:
     `authScopes: { $all: { authenticated: true, role: [UserRole.Student] } }`
  2. Role-only admin mutation — `backend/graphql/mutation/plan-catalog.mutation.ts:24-26`: `authScopes: { role: [UserRole.Admin] }` (+ unreachable narrowing re-throw at :42-44).
  3. Role-agnostic authenticated with service-side participant predicate — `backend/graphql/query/classes/session-lifecycle.query.ts:167-169`: `authScopes: { authenticated: true }`.
- **Composition rule** (critical if the plan touches scopes): plain key-map = ANY semantics; role conjunctions MUST be `$all { authenticated: true, role: [...] }` — `backend/graphql/AGENTS.md:17`. `authScopes: { permission: AppPermission.X }` for permission-gated ops; `superAdmin: true` blocks all non-admins (`backend/graphql/AGENTS.md:95,100`).
- **Service-layer context propagation**: resolvers pass `ctx.user.id`, `ctx.locale`, and (for permission-checked services) a `UserPermissionContext` `{ permissions, permissionGroups, isSuperAdmin, role }` populated by `createContext` — `backend/graphql/AGENTS.md:99`. Grep finds no `requirePermission`/`PermissionsService` calls under `backend/services/*.ts` at this scope — permission enforcement today lives at the `authScopes` layer plus service-side participant/owner predicates (e.g. `backend/graphql/query/subscription.query.ts:58-62` owner predicate service-side).
- **Page guards**: real pattern is `withPageAuth` from `@/frontend/lib/auth/withPageAuth.ts` (NOT the stale `app/(dashboard)/shared/withPageAuth.ts` path that `app/AGENTS.md:14` cites — that file does not exist; verified). Examples: `app/(dashboard)/admin/users/page.tsx` `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/users" })`; `app/(dashboard)/admin/plans/page.tsx:33`. `withPageAuth` redirects anonymous → `/login?redirect=...`, role mismatch → role-specific dashboard (`frontend/lib/auth/withPageAuth.ts:34-47`).
- **`requirePermissionForPage` / `backend/lib/auth/require-permission.ts` do NOT exist** (Glob + repo grep hit only docs/plans/AGENTS.md) — another verified negative: `app/AGENTS.md` documents it aspirationally. The plan must not call it.

## 4. GraphQL client error conventions (how AC3's 422 surfaces)

- **Server taxonomy**: `backend/lib/errors/error-code-taxonomy.ts:41-51` — `ERROR_CODE_HTTP_STATUS`: VALIDATION→422, CONFLICT/DUPLICATE_REQUEST→409, UNAUTHORIZED→401, FORBIDDEN→403, etc. `ValidationError` (`backend/lib/errors.ts:65-90`) supports `constructor(code: string, message: string)` — a custom SCREAMING_SNAKE domain code riding the 422/VALIDATION category.
- **AC3 precedent (exact)**: booking already rejects with a 422 + custom code + localized message at `backend/services/classes/session-lifecycle.booking.ts:108-113`:
  `throw new ValidationError("INSUFFICIENT_BALANCE", t.insufficientBalance);` (after `logger.logDomainError(...)`). The plan's "Subscription expired" rejection should mirror this shape: `ValidationError("SUBSCRIPTION_EXPIRED", <localized copy>)`. Note the current booking guard (`debitBookingLadder`, :95-116) only checks lane balances — today an expired subscription's student hits `INSUFFICIENT_BALANCE` only if balances were zeroed; the plan must decide whether the expiry job's zeroing makes a separate "Subscription expired" check necessary, per AC3.
- **Localized error copy lives in `errors` namespace**: `shared/locale/types/errors/labels.ts` — flat entries (`insufficientBalance` :174) for session booking; grouped sub-namespaces for new domains (`SubscriptionPurchaseErrorsLabels` :29-40, accessed as `errorsTranslations.subscriptionPurchase.<key>`). **Verified negative: no `subscriptionExpired` key exists today** — the plan must add one to the type file + both locale leaves (`shared/locale/en/errors/…`, `shared/locale/ar/errors/…`).
- **Resolver locale**: direct resolver throws use `ctx.t("<namespace>")` bound to `ctx.locale` (`backend/graphql/AGENTS.md:14`); services take `getServerTranslations`-typed `t` (e.g. `session-lifecycle.booking.ts:60-73`). **No `LocaleType`** — locale is a plain `string` param.
- **Client mapping — single table**: `frontend/providers/apollo/error-link.map.ts` `mapGraphQLErrorByCode(code, context)` — branches ONLY on `extensions.code` (`frontend/AGENTS.md` "Single code→behavior map"). Relevant rows: VALIDATION → `form-fields` when `hasForm` + `extensions.fields[]`, else localized `toast` (`error-link.map.ts:242-261`); CONFLICT → inline `notice` (:279-287); FORBIDDEN query → query-denial (PermissionDeniedFallback) / mutation → toast (:219-221); RATE_LIMITED/SERVICE_UNAVAILABLE → retryable notices (:298-315). `GraphQLErrorSurfaceHost` (`frontend/components/ui/GraphQLErrorSurfaceHost.tsx`) is the ONLY `registerGraphQLErrorActionListener` consumer (`frontend/AGENTS.md` "Surface host ownership") — page code must NOT register its own listener.
- **Form projection seam**: `frontend/lib/mutationFieldErrors.ts` exports `projectMutationFieldErrors(error)` (:125) + `applyProjectedFieldErrors` (:147) — re-runs the same map with `hasForm:true`, whitelists server-localized `extensions.fields[]` messages only (:19-34). Real consumer example: `frontend/views/auth/register/RegisterForm.tsx:41` ("applied via `applyProjectedFieldErrors`").
- **Per-dialog error arms (the booking-plane pattern AC3 lands in)**: `frontend/views/student/sessions/sessionDialogErrorArms.ts` classifies server codes into snackbar vocabulary — documented convention at `frontend/views/student/sessions/SessionDisputeConfirmDialog.tsx:23-27`: `VALIDATION` → `onFailure(errors.validation)` error snackbar; `FORBIDDEN` → `onFailure(errors.forbidden)`; masked/other → `sessions.genericError`. **Verified negative: no consumer of `INSUFFICIENT_BALANCE` exists in `frontend/` today** (grep returns nothing) — custom domain codes fall through to the VALIDATION toast/snackbar fallback. If the plan wants a distinct "Subscription expired" snackbar in booking UI, that's new frontend work in the session dialog arms + a new locale key; otherwise the VALIDATION fallback covers AC3 with zero UI code.

## 5. package.json scripts (verified verbatim, `package.json:<line>`)

| Purpose | Script name | Command (verbatim) | Line |
|---|---|---|---|
| Type check | `tsgo` | `bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit` | :15 |
| Quality gate | `quality-gate` | `bun run scripts/quality-gate.ts` | :47 |
| Quality gate (fresh) | `quality-gate:fresh` | `bun run scripts/quality-gate.ts --fresh` | :48 |
| Services tests | `test:services` | `bun --env-file=.env.test test/scripts/run-services-tests-parallel.ts` | :24 |
| Services tests (sequential) | `test:services:sequential` | `bun run scripts/lib/run-locked-cmd.ts test:services:sequential bun --env-file=.env.test test backend/services/ --timeout=60000` | :25 |
| UI E2E | `test:ui:e2e` | `bun run scripts/lib/run-locked-cmd.ts test:ui:e2e bun run test/scripts/run-server-tests.ts --e2e test/ui/e2e/` | :35 |
| E2E prereq build | `build:test` | `bun run scripts/lib/run-locked-cmd.ts build:test bun run test/scripts/build-test.ts` | :40 |
| GraphQL schema gen | `generate:gqlSchema` | `bun run scripts/generator/generate-gql-schema.ts` | :69 |
| Codegen | `codegen` | `graphql-codegen --config codegen.ts` | :70 |
| DB actions entry | `db` | `bun --no-env-file run scripts/dbActions/cli-entry.ts` | :53 |
| DB push | `db:push` | `bun --no-env-file run scripts/dbActions/cli-entry.ts --env-file=.env.sqlite push` | :72 (⚠ targets **sqlite**; the postgres push goes through `db` interactive CLI) |
| DB migrate (sqlite) | `db:sqlite:migrate` | `bun --no-env-file run scripts/dbActions/cli-entry.ts --env-file=.env.sqlite migrate` | :58 |
| Lint | `lint` | `bun run scripts/lint-service.ts` | :41 |
| Oxlint | `oxlint` | `bun run scripts/lib/run-locked-cmd.ts oxlint oxlint --deny-warnings --ignore-path .gitignore` | :44 |
| Biome | `biome:check` | `bun run scripts/lib/run-locked-cmd.ts biome:check bunx @biomejs/biome check --write --unsafe .` | :12 |

Not package.json scripts (invoke directly, verified absent from package.json):
- Sub-loop per-file verification: `bun run scripts/health/sub-loop.ts <file> --lifecycle <stage>` (script file path per AGENTS.md; not a `package.json` entry).
- Single-test runner: `bun run test/scripts/run-test.ts <test-path>` (not a script entry).

## 6. Verdict for this ticket's plan

- **UX scope**: an explicit, evidence-backed **NO-UI ruling is defensible** — there is no student subscriptions page today (`/subscriptions` is a nav link → catch-all ComingSoon), no checkout/result UI, no `MySubscriptionsContainer` (all planned-but-unlanded by the paymob plan), and no frontend document consuming `mySubscriptions`. The schema already exposes `SubscriptionStatus.Expired` + `startDate`/`endDate`, so when the paymob UI lands it renders the expired state for free from data this ticket produces.
- **If any UX is specified at all**, the only in-scope touchpoint is the booking rejection copy path (AC3): a new `errors` namespace key (e.g. `subscriptionExpired`) + optionally a new arm in `frontend/views/student/sessions/sessionDialogErrorArms.ts`; the VALIDATION toast/snackbar fallback already guarantees a localized snackbar with zero frontend changes.
- Nav: no new nav item, no bottom nav; `/subscriptions` remains the pre-existing student link.
- Permissions: expiry job is system-scope (actor-less sweep — precedent: `backend/services/parents/parent-link-request.service.ts:27-29` `sweepExpiredRequests` "system-scope, actor-less"); booking rejection rides the existing student booking mutation's own authScopes — no new GraphQL operations, no scope changes.
