---
applyTo: "frontend/**/*.ts,frontend/**/*.tsx,frontend/**/*.css,app/**/*.ts,app/**/*.tsx"
---

# Frontend Rules

### MUI v9 Breaking Changes

- Style props are NOT valid direct props. Always use `sx`:
  - `<Typography sx={{ fontWeight: 700, mb: 1 }}>` not `<Typography fontWeight={700} mb={1}>`
  - `<Stack sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>` not `<Stack alignItems="center" gap={2}>`
  - `<Box sx={{ p: 2, display: "flex" }}>` not `<Box p={2} display="flex">`
  - `<Grid sx={{ mb: 2 }}>` not `<Grid mb={2}>`
- Invalid direct props per component - all must go in `sx`:
  - Typography: `fontWeight`, `textAlign`, `mb`, `mt`, `p`, `color`, `variant` as style overrides
  - Stack: `alignItems`, `justifyContent`, `flexWrap`, `gap`, `mb`, `mt`, `direction`
  - Box: `p`, `px`, `py`, `mt`, `mb`, `display`, `flex`, `textAlign`, `component`
  - Grid: `alignItems`, `justifyContent`, `mb`, `mt`, `order`
- Icon naming: `*Outline` -> `*Outlined` (e.g., `ErrorOutline` -> `ErrorOutlined`, `CheckCircleOutline` -> `CheckCircleOutlined`)
- DatePicker autoComplete: must use nested slotProps, not directly on `textField`:
  ```tsx
  <DatePicker slotProps={{ textField: { slotProps: { htmlInput: { autoComplete: "off" } } } }} />
  ```
- Autocomplete: `params.slotProps.htmlInput` not `params.inputProps` (`AutocompleteRenderInputParams` no longer has `inputProps`)
- Typography `component` prop: not valid directly - use wrapper element or `sx` workaround
- ListItemText: use `slotProps` not `primaryTypographyProps` for font weight
- Use mui-mcp server if available for component API docs

### React 19

- NEVER `FormEvent` (removed). Use `React.SubmitEvent` or `React.SyntheticEvent<HTMLFormElement>`
- FormData casting: `(formData.get("name") as string | null) ?? ""` - avoids `@typescript-eslint/no-base-to-string`
- Context, Provider, and useHook in separate files (Fast Refresh requirement)
  - `MyContext.tsx` - exports `Context` and `Provider`
  - `useMyHook.ts` - exports the hook
- NextAuth handler cast in App Router `route.ts`:
  ```ts
  const handler = NextAuth(authOptions) as (req: Request) => Promise<Response>;
  ```

### Next.js 16 (BREAKING CHANGES)

- This is NOT standard Next.js - APIs, conventions, and file structure differ from training data
- Read `node_modules/next/dist/docs/` before writing any Next.js code - heed deprecation notices
- Server Components (`app/`): no hooks (`useState`, `useEffect`), no browser APIs, no repos/DB
- Server Components call services directly - NOT GraphQL. Use cached wrappers for deduplication
- Layouts cannot pass props to page children - pages only receive `params` and `searchParams`
- `await params` for locale: `const { locale } = await params;`
- `React.cache()` pattern for layout-page data sharing - memoizes per request, executes only once:
  ```ts
  import { cache } from "react";
  import { SessionService } from "@/backend/services/auth/session.service";
  export const getCurrentUser = cache(async (userId: string) => {
    return SessionService.getCurrentUserProfile(userId);
  });
  ```
- Place cached wrappers in `backend/lib/auth/` or similar shared location
- `getServerUserContext()` auth guard in layouts:
  ```ts
  import { redirect } from "next/navigation";
  import { getServerUserContext } from "@/backend/lib/auth/server-auth";
  const { userId, context } = await getServerUserContext();
  if (!userId || !context) redirect(`/${locale}/login`);
  ```
- Server translations: `getTranslations(locale)` from `@/shared/locale/server` (synchronous, single string arg, returns property-chain — NOT awaited)
- Client translations: `useAppTranslation("<namespace>")` from `@/shared/locale/client`
- Locale in redirects: `redirect(`/${locale}/login`)` - never `redirect("/login")`

### Apollo & GraphQL

- NO `useLazyQuery` - use stateful `useQuery` exclusively (tracks loading/error/data automatically)
- Import hooks from `"@apollo/client/react"`, NOT `"@apollo/client"` or `"@apollo/client/core"`
- Import `gql` and `TypedDocumentNode` from `"@apollo/client"` (NOT `"@apollo/client/core"`):
  ```ts
  import { gql, type TypedDocumentNode } from "@apollo/client";        // gql + TypedDocumentNode
  import { useQuery, useApolloClient } from "@apollo/client/react";     // hooks ONLY
  ```
- `id` field on ALL object types in selection sets (Apollo cache normalization)
- Documents in `frontend/graphql/sharedDocuments/<domain>.documents.ts`
- Export all documents from `frontend/graphql/sharedDocuments/index.ts`
- Document naming: `{entityName}QueryDocument` / `{entityName}MutationDocument`
- TypedDocumentNode convention table:

  | Operation | Const name | TypedDocumentNode type |
  |---|---|---|
  | query | `{entityName}QueryDocument` | `TypedDocumentNode<{EntityName}Query, {EntityName}QueryVariables>` |
  | mutation | `{entityName}MutationDocument` | `TypedDocumentNode<{EntityName}Mutation, {EntityName}MutationVariables>` |
  | no-arg query | `{entityName}QueryDocument` | `TypedDocumentNode<{EntityName}Query>` (omit second type param) |

- Import pattern for documents:
  ```ts
  import { gql, type TypedDocumentNode } from "@apollo/client";
  import type { EntityNameQuery, EntityNameQueryVariables } from "@/frontend/graphql/generated/gql/graphql";
  ```
- All generated types (operation results, variables, enums, extracted field types, inputs) live in the single `graphql.ts` file. The old `graphql-types.ts` and `operations.ts` files no longer exist.
- For nested field types, use compact extracted names: `{OperationName}_{field}` (e.g., `MeQuery_me`)
- NEVER inline type literals - always use generated types from `frontend/graphql/generated/gql/graphql`
- Codegen after schema/document changes (both steps required):
  ```bash
  ~/.bun/bin/bun run generate:gqlSchema
  ~/.bun/bin/bun codegen
  ```

### Zustand Stores

- Strictly typed using GraphQL generated types (import from `graphql.ts`)
- **NO MAPPING (CRITICAL)**: No type mapping functions, no intermediate conversion layers, no indexed-access workarounds (e.g., `NonNullable<MeQuery["me"]>`). Use the exact codegen-generated extracted type name directly (e.g., `MeQuery_me`).
- **NO SCHEMA TYPES**: No schema-level object types (e.g., `User`). Only operation-derived types from `graphql.ts`.
- **NO HARDCODED TYPES**: Never redefine types that should come from codegen. If codegen doesn't emit a needed type, fix the codegen config or the document — don't create a local type.
- Resolve type issues by adjusting GraphQL schema/queries - do NOT manually map or redefine types
- If schema and frontend types misalign, fix the schema or query - never create mapping workarounds

### Theme & Styling

- NO hardcoded colors - no hex (`#fff`), rgb/rgba, or CSS color names (`red`, `blue`)
- Theme callback for palette values: `sx={(theme) => ({ color: theme.palette.primary.main })}`
- `on<Color>` siblings for contrast (e.g., `theme.palette.onPrimary` not `primary.contrastText`)
- Never delete existing theme values - map them (e.g., `boxShadow` -> `theme.palette.shadow.card`)
- Use theme font variants (`headlineLg`, `titleLg`, `labelUppercase`, `bodyMd`) - no hardcoded font `sx`
- No string-based palette access: `color="primary.main"` is WRONG - use `sx` callback instead

### i18n

- All user-facing strings via the compile-time TypeScript i18n system in `@/shared/locale` - never hardcode error messages or UI text
- Client components: `useAppTranslation("<namespace>")` from `@/shared/locale/client`
- Server components: `getTranslations(locale)` from `@/shared/locale/server` (synchronous, returns property-chain — NOT awaited)
- Client components are wrapped in `LocaleProvider` from `@/frontend/providers/LocaleProvider` (NOT `NextIntlClientProvider`)

### Logging

- NEVER use `console.*` - ESLint will error
- `import { logger } from '@/frontend/utils/logger'`
- Methods: `logger.info`, `logger.warn`, `logger.error`, `logger.debug`
- Production: info/warn/debug suppressed, error always logs
- **Client logger `batchInterval`** MUST be at least 30s in production; `beforeunload` flush required (uses `fetch` with `keepalive: true`, NOT `navigator.sendBeacon`); error/warn logs MUST bypass min-batch-size guard.
- **`RequirePermission`** MUST NOT log DEBUG messages by default — gate behind `process.env.NEXT_PUBLIC_DEBUG_PERMISSIONS === "true"`

### Storybook

- `<RequirePermission>` defaults to admin - use `useUserStore.setState()` for specific perms (e.g., Parent vs Teacher)
- Auto-wrapped in `LocaleProvider` from `@/frontend/providers/LocaleProvider` - component must use `useAppTranslation` from `@/shared/locale/client` for compatibility
- Real `userStore` aliased to `mockUserStore` - prefer mock stores for predictable initial state
- Decorators in metadata `decorators` array, not wrapping component directly in story function

### Views & Components

- Functional components only - no class components
- Domain structure: `frontend/views/dashboard/` - group related views and sub-components logically
- Access control: `<RequirePermission>` wrapper for permission-gated components
- Client data fetching: Apollo `useQuery` with generated TypedDocumentNodes
- Server data fetching: call services via cached wrappers (never repos/DB directly)
- **Duplicate view logic**: When view variants (e.g., form factors) share presentation logic, extract a shared scaffold component into a `shared/` directory at the parent level. Variants import ONLY from the scaffold — never from each other.

### Code Style

- No nested ternary operators - extract into if/else or separate functions (SonarJS code smell)
