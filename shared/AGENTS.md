# Shared Layer Rules

## Purpose

The `shared/` layer contains code used by **both** frontend and backend: utilities, i18n messages, domain constants, enums, and cross-layer contract types (e.g. locale translation contracts). It sits below `app/`, `frontend/`, and `backend/` in the dependency graph — nothing in shared may depend on those layers. Canonical database/entity types do NOT live here — they belong to `backend/types/` (see "Cross-Layer Shared Types" below).

## Layer Isolation (CRITICAL)

- **NEVER** import from `@/frontend/**`, `@/backend/**`, or `@/app/**`.
- Enforced by ESLint `no-restricted-imports` in `eslint.config.mjs` for all `shared/**/*.{ts,tsx}` files.
- If shared code needs a value that currently lives in another layer (enum, constant, utility, or cross-layer contract type), **move or duplicate the canonical definition into `shared/`** and have the other layer import from shared — not the reverse. Exception: canonical database/entity types stay in `backend/types/`; other layers import them from there type-only.

### Positive Pattern

```typescript
// frontend/views/auth/register/registerFormUtils.ts
import { isValidEmail } from "@/shared/lib/email";
```

### Negative Pattern (PROHIBITED)

```typescript
import { isSafeRedirect } from "@/frontend/lib/safeRedirect";
import { SomeEnum } from "@/backend/enum";
import type { SomeType } from "@/frontend/graphql/generated/gql/graphql";
```

## Import Convention

- Always use the `@/` path alias — relative `./` or `../` imports are banned (same rule as `app/`, `backend/`, `frontend/`, `test/`, and `scripts/`).
- Prefer deep imports over barrel files: `import { SomeEnum } from "@/shared/constants/some.enum"`.
- `**/index.ts` barrel files may use relative `./` sibling re-exports by design (ESLint exception).

## File Organization

| Directory | Purpose |
|-----------|---------|
| `shared/lib/` | Pure utilities and domain logic with no layer deps |
| `shared/constants/` | Enums and stable domain constants |
| `shared/locale/` | Compile-time i18n system (types, `ar/`, `en/`) — see the Translation System section below |

## Shared Enums

When frontend and backend both need the same enum values:

1. Define the enum in `shared/constants/{domain}.enum.ts` using the same string values as the backend enum.
2. Use dot access in shared code and tests: `ClassOutcome.PENDING`.
3. Keep `@/backend/enum` for backend-only code; backend services/repos import from there.
4. Frontend should use GraphQL codegen enums for API-facing types, or import from `@/shared/constants/` when shared logic requires the same values.
5. **Never** import `@/backend/enum` from `shared/` — see `backend/enum/AGENTS.md`.

## Extracting Code Into Shared

When moving logic from `frontend/` or `backend/` into `shared/`:

1. Place the implementation in the appropriate `shared/` subdirectory (`lib/`, `constants/`).
2. Update all consumers to import directly from the `shared/` source (e.g. `import { isValidEmail } from "@/shared/lib/email"`). Do not re-export from `frontend/` or `backend/` locations — consumers must import from `shared/` directly.
3. Move or define any required enums/types in `shared/` before updating imports in shared files.
4. Run tests for affected shared modules and verify ESLint passes on changed `shared/**` files.

## i18n Message Types

- Message label types in `shared/locale/types/` must not reference frontend view types or GraphQL codegen types.
- Define canonical status/key unions in `shared/constants/` and use those in message type definitions.

## Translation System (Compile-Time i18n)

### Overview
Kottaby uses a custom **compile-time TypeScript i18n system** in `shared/locale/` (the legacy `next-intl` package has been removed — do not reintroduce it) that provides:
- **Compile-time safety**: `t.x.y` instead of `t("x.y")` — IDE autocomplete + TypeScript errors on missing keys
- **Native TypeScript pluralization**: `(count: number) => string` functions instead of ICU strings
- **Lazy loading**: standard dynamic `import()` per namespace — only loads needed translations
- **SSR & API support**: `getTranslations(locale, namespace)` for server components / API routes
- **GraphQL context integration**: `ctx.t("namespace")` bound to `ctx.locale`
- **SEO routing preserved**: Next.js native `[locale]` segments + middleware

### File Structure
```
shared/locale/
├── AppLocale.ts              ← locale enum & type
├── serverLegacy.ts           ← getTranslations<K>(locale, namespace) for SSR/API
├── server-graphql-legacy.ts  ← getServerTranslations<K>(locale, namespace) for GraphQL/scripts
├── clientLegacy.ts           ← useAppTranslation<K>(namespace) hook for client components
├── index.ts                  ← re-exports
│
├── types/                    ← TypeScript interfaces (the "schema")
│   └── message.ts            ← MessageSchema (top-level map of all namespaces)
│
├── ar/                       ← Arabic implementations
└── en/                       ← English implementations
```

### Rules for All Layers

#### Server Components (`app/**/*.tsx`)
```typescript
// ✅ Correct
import { getTranslations } from "@/shared/locale/server";
const t = await getTranslations(locale, "auth");
return <h1>{t.login.pageTitle}</h1>;

// ❌ Forbidden
import { getTranslations } from "next-intl/server";
const t = await getTranslations({ locale, namespace: "auth.login" });
return <h1>{t("pageTitle")}</h1>;
```

#### Client Components (`frontend/**/*.tsx`)
```typescript
// ✅ Correct
import { useAppTranslation } from "@/shared/locale/client";
const t = useAppTranslation("auth").login;
return <input placeholder={t.email} />;

// ❌ Forbidden
import { useTranslations } from "next-intl";
const t = useTranslations("auth.login");
return <input placeholder={t("email")} />;
```

#### GraphQL Resolvers (`backend/graphql/**/*.mutation.ts`, `*.query.ts`)
```typescript
// ✅ Correct
resolve: async (_parent, args, ctx) => {
  const tErrors = await ctx.t("errors");
  throw new GraphQLError(tErrors.auth.invalidCredentials, ...);
};

// ❌ Forbidden
import { getBackendTranslations } from "@/backend/lib/intl";
const t = await getBackendTranslations({ locale: ctx.locale, namespace: "errors" });
throw new GraphQLError(t("auth.invalidCredentials"), ...);
```

#### API Routes / Scripts / Tests (`app/api/**`, `scripts/**`, `backend/db/test/**`)
```typescript
// ✅ Correct
import { getServerTranslations } from "@/shared/locale/server-graphql";
const t = await getServerTranslations(locale, "errors");
return NextResponse.json({ error: t.auth.notFound }, { status: 404 });
```

### Pluralization Pattern
Replace ICU strings with TypeScript functions in the type schema and implementations:

```typescript
// types/dashboard/students.ts
export interface StudentDirectoryLabels {
  title: string;
  studentCount: (count: number) => string; // Typed function — compile-time safe!
}

// ar/dashboard/students.ts
export const studentDirectory: StudentDirectoryLabels = {
  title: "الطلاب",
  studentCount: (count) => {
    if (count === 0) return "لا يوجد طلاب";
    if (count === 1) return "طالب واحد";
    if (count === 2) return "طالبان";
    if (count >= 3 && count <= 10) return `${count} طلاب`;
    return `${count} طالباً`;
  },
};

// en/dashboard/students.ts
export const studentDirectory: StudentDirectoryLabels = {
  title: "Students",
  studentCount: (count) =>
    count === 0 ? "No students" : count === 1 ? "1 student" : `${count} students`,
};
```

**Usage:** `t.studentDirectory.studentCount(42)` → `"42 طالباً"`

### Interpolation Pattern
Replace `{placeholder}` ICU strings with typed template functions:

```typescript
// types/auth/index.ts
export interface AuthImpersonationLabels {
  bannerLoggedInAs: (name: string) => string;  // was: string with {name}
  bannerViewingAs: (name: string, email: string) => string;
  // static strings stay as string
  returnToNormalLogin: string;
}

// ar/auth/index.ts
export const auth: AuthLabels = {
  impersonation: {
    bannerLoggedInAs: (name) => `أنت مسجل الدخول باسم ${name}.`,
    bannerViewingAs: (name, email) => `أنت تعرض لوحة التحكم باسم ${name} (${email})`,
  }
};
```

**Usage:** `t.impersonation.bannerLoggedInAs("أحمد")`

### Namespace Registration (Required for each new namespace)
1. Add interface to `shared/locale/types/<namespace>/index.ts`
2. Add implementations to `shared/locale/ar/<namespace>/index.ts` and `shared/locale/en/<namespace>/index.ts`
3. Export in `shared/locale/types/message.ts` (add to `MessageSchema`)
4. Add path mapping in `shared/locale/serverLegacy.ts` (`namespacePaths` map)
5. If used in layout SSR, add to `LocaleProvider` translations in `app/[locale]/layout.tsx`

### Public import contract

- **Product code** (`app/`, `frontend/`, `backend/` outside `shared/locale/`) imports **`@/shared/locale`** and **`@/shared/locale/types`** only — never deep paths such as `@/shared/locale/old/**` or `@/shared/locale/beta/**`.
- **`shared/locale/index.ts`** and **`shared/locale/types/index.ts`** are the public barrel — add new canonical exports there when modules land; run `bun tsgo` after barrel changes.
- **Inside `shared/locale/`** implementation files may use relative or deep paths.

### View-layer label types

Canonical `*Labels` interfaces live in `shared/locale/types/**`. View-layer code in `frontend/views/**/types/` may **`Pick`**, **`Omit`**, or compose those canonical types (e.g. `*ShellLabels`, column/filter slices) — do not duplicate string keys. See `frontend/views/AGENTS.md` for placement and grouping thresholds.

### Browser Translation Cache (Hybrid SW + IndexedDB)

- **Primary Path (HTTPS / Secure Contexts)**: Service Worker (`public/sw.js`) intercepts `/_next/static/chunks/*.js` GET requests and caches responses in Cache API store `kottaby-static-chunks-v1`. Per-namespace invalidation happens automatically via Turbopack content hashes in chunk URLs.
- **Fallback Path (HTTP Staging / Insecure Contexts)**: Auto-detected via `window.isSecureContext === false`. Serves JSON snapshots from IndexedDB (`kottaby-locale-snapshots`) keyed by `${BUILD_ID}:${namespaceId}:${locale}`.
- **Build ID Stamping**: Resolved in `next.config.ts` (`NEXT_PUBLIC_BUILD_ID` env → `.next-locale-snapshots-version` content hash → random UUID fallback). Mismatched `BUILD_ID` automatically wipes stale IndexedDB entries on first access.
- **Adding New Namespaces**: Each new `defineNamespace` call in `shared/locale/namespaces/**/*.namespace.ts` MUST pass a stable string ID as the first parameter (e.g. `defineNamespace("dashboard.students.directory", config)`).

## Cross-Layer Shared Types

Canonical entity types live in `backend/types/`; frontend consumers import them type-only when needed.

Key rules:
- Both backend and frontend import from the same canonical file
- Values (enums, constants) needed by both layers live in `shared/constants/`
- `shared/` layer MUST NOT import from `backend/` or `frontend/`
