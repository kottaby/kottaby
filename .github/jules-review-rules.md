# Kottaby Repository Code Review Guidelines

## Core Architectural Rules (Always Blocking)
- **Layer Isolation**:
  - `shared/` must NEVER import from `@/frontend/**`, `@/backend/**`, or `@/app/**`.
  - `backend/` must NEVER import from `@/frontend/**` or `@/app/**`.
  - Server Components in `app/` call backend services directly, never via GraphQL.
  - Client Components must use Apollo hooks, never calling backend services directly.
- **Path Aliases & Imports**:
  - All project imports must use `@/*` aliases (e.g., `@/backend/services`, `@/frontend/views`). Relative paths like `../../` across modules are prohibited.
  - In barrel files (`index.ts`), only relative `./` paths are permitted. `../` is forbidden.
  - Always import from the highest available barrel file.
- **Logging**:
  - Direct `console.log`, `console.warn`, `console.error` are strictly prohibited.
  - Always use `import { logger } from "@/frontend/utils/logger"` on frontend or `import { logger } from "@/backend/lib/logger"` on backend.
  - Expected domain/business rejections must use `logger.logDomainError(msg, ctx)`.

## Frontend Conventions (React 19 & MUI v9)
- **MUI v9 Style Props**:
  - Style props (`fontWeight`, `textAlign`, `mb`, `mt`, `p`, `display`, etc.) are NOT valid direct props on `Typography`, `Stack`, `Box`, `Grid`.
  - Always use the `sx` prop: `<Typography sx={{ fontWeight: 700, mb: 1 }}>`.
  - Icon naming convention: use `*Outlined` suffix (e.g., `ErrorOutlined`, `DeleteOutlined`), NOT `*Outline`.
- **Theme & Colors**:
  - NEVER hardcode hex, rgb, or color literals (`#fff`, `black`, `rgba(...)`).
  - Always use theme tokens via `theme.palette` (e.g., `sx={(theme) => ({ color: theme.palette.text.primary })}`).
- **React 19**:
  - `FormEvent` is deprecated/removed. Use `React.SubmitEvent` or `React.SyntheticEvent<HTMLFormElement>`.
- **GraphQL / Apollo Client**:
  - Always import hooks (`useQuery`, `useMutation`) from `"@apollo/client/react"`, never from `"@apollo/client"`.
  - Every GraphQL query document must explicitly include the `id` field on all object types for Apollo cache normalization.
  - Do not use `useLazyQuery`; use stateful `useQuery`.

## Backend & Database Conventions
- **Type Definitions**:
  - All entity types must be defined in `@/backend/types/{entity}.types.ts`.
  - Never define types locally inside Pothos GraphQL files.
  - Service-layer `.types.ts` files are prohibited (types live in `backend/types/`).
- **Database Transactions & Repositories**:
  - When inside a database transaction, always pass `tx` to all repository methods. Mixing `db` and `tx` calls causes deadlocks.
  - In database tests, always wrap execution in `runInRollback`. Never use `expect(...).rejects.toThrow()` inside `runInRollback`.
  - Tests must never query seed data; test entities must be generated using `entity-setup.ts` helpers.

## Internationalization (i18n)
- **Custom Compile-Time i18n System**:
  - Never hardcode user-facing strings or error messages in UI or resolvers.
  - Legacy `next-intl` is removed and must never be imported.
  - Frontend components must use `useAppTranslation("namespace")` from `@/shared/locale/client`.
  - Server components use `getTranslations(locale, "namespace")` from `@/shared/locale/server`.
  - GraphQL resolvers use `ctx.t("namespace")`.

## What to Skip / Non-Issues
- Auto-generated GraphQL files in `frontend/graphql/generated/` are managed by codegen.
- Biome and ESLint handle routine formatting and stylistic whitespace; focus on correctness, security, architecture, performance, and maintainability.
