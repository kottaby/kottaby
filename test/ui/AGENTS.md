# UI Test Rules (`test/ui/`)

E2E tests under `test/ui/` default to **dev mode** (`TEST_SERVER_MODE=dev`). When a dev server is already running on port 3000, E2E tests reuse it instead of spawning a separate test server — this avoids the Next.js 16 dist-dir conflict that prevents a second dev server from starting. If no dev server is running, a separate test dev server is spawned on port 3099. To run E2E against a production build instead, set `TEST_SERVER_MODE=production` and run `bun run build:test` first.

## Prerequisites

**Dev mode (default):**
- Start the dev server first: `bun run dev` (port 3000)
- E2E tests will automatically detect and reuse the running dev server
- No build step required — the dev server compiles routes on-demand
- Route warmup is performed automatically (see `E2E_WARMUP_ROUTES` in `@/test/helpers`)

**Production mode (optional, set `TEST_SERVER_MODE=production`):**

Before E2E tests in production mode, build the test production bundle:

```bash
bun run build:test
```

- Output directory: `.next-test-prod` (override with `TEST_SERVER_DIST_DIR`)
- Uses **only** `.env.test` — injected into the `next build` / `next start` process env (no parent shell env). Keys already set in `process.env` are not overridden by `.env.local` or other files on disk (Next.js test env rules)
- Tests do **not** run `next build` automatically; missing build fails fast with a clear error

**Rebuild `build:test` after changes to:** server code, auth/cookies, middleware, API routes, or anything that affects the running Next.js app. (Only needed for production mode — dev mode hot-reloads automatically.)

## Test Layers

| Layer | Path | Server | Notes |
|-------|------|--------|-------|
| E2E | `test/ui/e2e/` | Dev (default) or Production (`next start`) | Playwright via `bun:test`. Uses `setupBrowserLifecycle()` → `setupTestServerLifecycle()`. |

E2E tests in production mode require `build:test`. There is no static/component UI test layer — UI verification is E2E-only.

## Commands

```bash
bun run dev                 # Start dev server on port 3000 (required for dev-mode E2E)
bun run build:test          # Build .next-test-prod (required for production-mode E2E)
bun run test:ui:e2e         # Playwright E2E (dev server by default, reuses port 3000 if running)
bun run test:ui:e2e:paymob  # Paymob live checkout E2E
bun run test:ui:kill        # Kill test servers on port 3099 only (never dev:3000 or start:4000)
```

All `test:ui*` scripts preload `test/ui/test-env.ts`, which sets `TEST_SERVER_MODE=dev` by default. Override with `TEST_SERVER_MODE=production` for production-mode E2E.

## Shared Test Server Infrastructure

E2E reuses the GraphQL test harness in `frontend/graphql/test/`:

- `lifecycle.ts` — `setupTestServerLifecycle()` (port allocation, start/stop, dev-server reuse)
- `testServer.ts` — in dev mode, detects and reuses a running dev server on port 3000; otherwise spawns a separate test server. In production mode, spawns `next start` on the test port.
- `testPort.ts` — `getTestServerMode()` defaults to dev for `test/ui/` runs; `isServerRunningOnPort()` detects an existing dev server

**Dev-server reuse behavior:** When `TEST_SERVER_MODE=dev` and a dev server is already running on port 3000, the E2E test harness sets the test port to 3000 and skips spawning a separate server. The `stopTestServer()` function detects this case and does **not** kill the externally-managed dev server — only the Playwright browser is closed.

**GraphQL integration tests** (`frontend/graphql/test/`) use the **dev** server by default. This is the same default as E2E tests.

## E2E Conventions

- Import lifecycle from `@/test/ui/e2e/lifecycle` — call `setupBrowserLifecycle()` at module scope
- Login helpers: `test/ui/e2e/helpers.ts` (`loginAsDemoUser` via `Bun.fetch`, not Playwright `context.request`)
- No `happydom-preload` in E2E — conflicts with Playwright
- No `waitForTimeout` / `networkidle` — use auto-waiting Playwright assertions
- Auth cookies: `AUTH_COOKIE_SECURE=false` in `.env.test` so `http://localhost` works in both dev and production modes
- **Never stop the dev server (port 3000)** — E2E tests reuse it when running in dev mode

### E2E Translation Rules (CRITICAL — No Hardcoded Strings)

**NEVER hardcode user-facing text strings in E2E test assertions.** All text that appears in the UI must be obtained via the translation system. This is a strict requirement — no exceptions.

E2E tests are **server-side tests** (they run in Node/Bun, not the browser DOM). They use `getDefaultTranslations()` from `@/shared/locale/server` — a **no-parameter** function that returns translations for the app's default locale. The locale is determined by the app's default locale setting, not by the test.

**Never pass a specific locale to `getTranslations("ar")` or `getTranslations("en")` unless the test explicitly tests locale-switching behavior.** The default locale comes from the translation/locale provider — it's not a secret.

```typescript
import { getDefaultTranslations } from "@/shared/locale/server";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const tr = (s: string): RegExp => new RegExp(escapeRegExp(s), "i");

const T = getDefaultTranslations().dashboardTranslations;
const dashboard = T.studentPortalDashboard;
const NEXT_CLASS = tr(dashboard.nextClass);
```

**For exact match (e.g., button text):**
```typescript
const trExact = (s: string): RegExp => new RegExp(`^${escapeRegExp(s)}$`, "i");
const JOIN_BUTTON = trExact(dashboard.joinNow);
```

**For functional translations (functions that return strings):**
```typescript
const resultsCountPattern = escapeRegExp(sched.resultsCount("\\d+", "\\d+")).replace(/\\\\d\+/g, "\\d+");
const SEARCH_OUTCOME = new RegExp(`${resultsCountPattern}|${escapeRegExp(sched.noResults)}`, "i");
```

**For `selectOption({ label })`:** Use the raw string value (not a regex):
```typescript
await attendanceSelect.selectOption({ label: lr.present });
```

**For `aria-label` selectors:** Use `escapeRegExp` on the translation value:
```typescript
page.locator(`button[aria-label="${escapeRegExp(common.notifications)}"]`)
```

**Access pattern:**
- `getDefaultTranslations()` returns the full `Translations` object
- Access via `.<domain>Translations.<namespace>.<key>` (e.g., `.dashboardTranslations.<namespace>.<key>`)
- Other top-level: `.commonTranslations`, `.uiTranslations.phoneInput`, `.errorsTranslations`

### What Counts as "Hardcoded" in E2E (Prohibited)

- **Arabic/English UI labels** — e.g., `"متصل"`, `"Connected"` — must come from `getDefaultTranslations()`
- **Button text, badge text, headings, descriptions** — any text rendered by the app
- **Alert/error messages** — use translated strings from the appropriate namespace

### What is Acceptable in E2E (NOT "Hardcoded")

- **Technical test data** — URLs, HTTP status codes, error codes
- **Person names in test input** — input data, not rendered translations
- **Provider names** — e.g., `"Zoom"`, `"Google Meet"` are brand names, not translatable UI text

## Agent Browser Login (manual/E2E-style verification)

AI layers redact real email addresses in prompts, so email+password login typed via browser automation fails schema validation. Use `scripts/browser-login.ts` instead:

```bash
bun run scripts/browser-login.ts                       # login + write .browser-auth/ artifacts
bun run scripts/browser-login.ts --inject              # + inject cookies into $AGENT_BROWSER_SESSION
```

### Screenshot & Visual Inspection Context Isolation (CRITICAL)

- **Do NOT call `ReadMediaFile` directly in the main test/orchestrator context** for browser screenshots.
- In multi-step browser verification runs, calling `ReadMediaFile` repeatedly accumulates multiple images into the conversation history, creating multi-megabyte payloads that cause upstream LLM timeouts and stream drops (`Stream ended before producing a non-ping SSE event`).
- **Use DOM/Text verification first**: `agent-browser snapshot -i -c`, `agent-browser eval`, and console/network logs.
- **Isolate Visual Checks**: If an image requires visual LLM inspection, spawn a dedicated short-lived subagent that opens the single image with `ReadMediaFile` and returns a text-only summary. The main session receives only the text summary, keeping context clean and fast.

## Linting Rules

- NEVER use `oxlint-disable` comments — fix the root cause of the error instead.
