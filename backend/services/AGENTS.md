# Backend Service Layer Rules

- **Domain-Driven Architecture**: Service layers must be constructed per domain of concern (e.g., `PermissionsService`, `ScheduleService`).
- **NO Monolithic Services**: Do not create generic, monolithic services (like a single `DashboardService` handling everything).
- **Business Logic Hub**: This layer should contain all business rules, orchestration, and complex permission gating before calling the repository layer.
- **SSR Usage**: Services can be used directly by Next.js Server Components (SSR) or Server Actions, so they must not rely on GraphQL-specific contexts unless passed explicitly.
- **i18n / Localized Error Messages**: All user-facing error messages, alerts, and feedback generated in services must use the compile-time TypeScript translation system via `getServerTranslations(locale, "<namespace>")` from `@/shared/locale/server-graphql` (optionally accepts a `locale?: string` parameter). Hardcoded strings for exceptions or responses are forbidden. The legacy `getBackendTranslations` helper from `@/backend/lib/intl` is deprecated and must not be used.
- **Type Definition Pattern**: Services should import and use types from `backend/types/` (e.g., `{Entity}ReturnType`, `{Entity}SubmitInput`, `DBTransaction`) rather than creating ad-hoc type definitions or directly referencing schema types. These types should be imported from `@/backend/types` and used for function parameters, return types, and data transformations.
- **Service-layer `.types.ts` files are prohibited.** All types live in `backend/types/`. If a service file contains both types and runtime code, split: types → `backend/types/`, runtime → stays in the service layer with a non-`.types` filename (e.g., `.helpers.ts`, `.constants.ts`).
- **Batch Service Methods for DataLoader**: Services that are called from GraphQL field resolvers MUST expose batch versions of single-entity lookup methods to support Pothos DataLoader batching. Batch methods accept `ids: string[]` and return `Map<string, T | null>`.
- **Single-writer discipline**: where a domain designates a single writer service for a table or record, consumers (resolvers, sibling services, read surfaces) import that owning service by reference — never the repository or table directly. Composition seams accept the caller's `outerTx` as the FINAL parameter so composed writes join the caller's transaction; guard/governance pre-checks run before the transaction opens. For write-once tables, arbitrate duplicates with the table's UNIQUE constraint (catch the 23505 cause-chain → typed conflict) instead of a pre-check SELECT, which races and leaks.
- **Shared helpers**: when multiple service files share identical helper functions (auth preludes, config upserts, insert payload builders, session creators), extract them into `shared/` modules under the owning domain rather than duplicating.
- **Cache fail-open & permission ordering**: hot read paths may use the entity cache, but all cache reads and invalidation calls MUST wrap provider errors in `try/catch` and fall through gracefully to the underlying data source without crashing caller requests. Permission gating (`assert*`, `hasPermission`, ...) MUST run BEFORE cache lookups — authorization checks stay outside cached reads so unauthorized users never receive cached payloads or execute cache queries.

## Seed services (`backend/services/seed/`)

- **Not production domain services.** Modules here provision demo/seed data for `bun db seed` and GraphQL test helpers. They must never be imported from GraphQL resolvers, API routes, or production request handlers.
- **Naming:** `*SeedService` namespaces with `seed*` write methods.
- **Production safety:** All writes call `assertSeedWriteAllowed()` from `backend/lib/bootstrap-gate.ts` (blocked on real production; allowed in local dev and CI test servers via `TEST_SERVER` / `TEST_CI`).

## Testing (`backend/services/**/*.test.ts`)

Service tests live next to the code they cover (`*.test.ts` or `test/` subdirectories). Run via `bun run test:services`.

### No real external APIs (mandatory)

Service tests **must never** make real network calls to third-party providers. Always mock outbound integrations before exercising the service under test:

- Mock the persistence seam and the realtime fan-out transport — never write real rows or hit a real broker from service tests.

If a test needs to confirm a live provider is wired, add a **single smoke** under `test/integration/` and run `bun run test:integration` — not here.

### Provider integration tests belong in `test/integration/`

**Do NOT add `*.integration.test.ts` or live provider smokes under `backend/services/`** (any external seam — transport round-trips, provider APIs — belongs in the matching `test/integration/` subdirectory).

Run integration smokes with `bun run test:integration` (parallel runner). Each integration file gets **one** smoke test (single API call) to confirm the adapter reaches the live provider — not full service or app behaviour.

## Serverless Cold-Start Optimization

- **Permission Context Propagation**: Services accepting permission checks MUST accept `UserPermissionContext` from the GraphQL context instead of re-querying via `PermissionsService.hasPermission(userId, ...)`. The `UserPermissionContext` type in `@/backend/types/permissions/permission.types.ts` already contains `permissions`, `permissionGroups`, `isSuperAdmin`, and `role` — passing it through eliminates repeated DB queries per call.

## Linting Rules

- NEVER use `oxlint-disable` comments — fix the root cause.
