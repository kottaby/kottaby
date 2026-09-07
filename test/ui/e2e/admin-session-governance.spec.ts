/**
 * `/admin/session-governance` — the admin session-governance directory,
 * end-to-end over the REAL test server (run-server-tests spawn) driven by a
 * REAL Chromium through Playwright.
 *
 * ONE smoke covering the full governance journey in a real browser runtime:
 * fixture (certified demo teacher + booked trial-lane session via the public
 * GraphQL API, mirroring the REAL-DB journey posture — no backdoor writes) →
 * admin login → directory load (loading skeleton clears) → status filter
 * APPLY (`scheduled` keeps the row; honest total echo) → reset → kebab menu →
 * cancel on the eligible (scheduled) row → confirm dialog with a reason →
 * success snackbar → row status chip flips to `cancelled` in place →
 * server-truth re-filter (`cancelled` keeps the row) → the /audit trail
 * reflects the action (deep-linked to the session entity: `override` action
 * row with the reason readable in the expandable details).
 *
 * All user-facing text asserted through the translation system
 * (`getDefaultTranslations()` — the app default locale); no hardcoded UI
 * strings. Auto-waiting Playwright locators only — no fixed waits.
 *
 * Runs via the server-test runner (scoped):
 * `TEST_SERVER_MODE=production bun run test/scripts/run-server-tests.ts --e2e test/ui/e2e/admin-session-governance.spec.ts`
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { type Browser, type BrowserContext, chromium, type Locator, type Page } from "playwright";
import { getDefaultTranslations } from "@/shared/locale/server";

const PORT = process.env.TEST_SERVER_PORT ?? "3066";
const BASE = `http://localhost:${PORT}`;

const t = getDefaultTranslations();
const tGov = t.adminSessionGovernanceTranslations;
const tSessions = t.sessionsTranslations;
const tAdminUsers = t.adminUsersTranslations;

/** Seeded demo actors — the setup-phase seed (ADMIN_PASSWORD for all roles). */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@app.local";
const SEED_PASSWORD = process.env.ADMIN_PASSWORD ?? "adminpassword123";
const STUDENT_EMAIL = "student@draftacademy.local";
/** The seeded demo teacher's user id (users.email = teacher@draftacademy.local). */
const DEMO_TEACHER_USER_ID = "2";

const LOGIN_MUTATION = /* GraphQL */ `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      user {
        id
        email
        role
      }
      accessToken
      refreshToken
    }
  }
`;

const CERTIFY_TEACHER_MUTATION = /* GraphQL */ `
  mutation CertifyTeacher($userId: Int!) {
    adminCertifyTeacherColdStart(userId: $userId, makeEvaluator: true) {
      id
    }
  }
`;

const CREATE_SESSION_MUTATION = /* GraphQL */ `
  mutation CreateSession($input: CreateSessionInput!) {
    createSession(input: $input) {
      id
      status
    }
  }
`;

const SCHEDULED_DIRECTORY_QUERY = /* GraphQL */ `
  query AdminSessionsScheduled {
    adminSessions(filter: { status: "scheduled" }, page: 1, pageSize: 1) {
      items {
        id
        status
      }
    }
  }
`;

interface GqlPayload {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message?: string; extensions?: { errorCode?: string } }> | null;
}

/** True when a parsed GraphQL response carries a successful `login` payload. */
function hasLoginData(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const data: unknown = Reflect.get(value, "data");
  return typeof data === "object" && data !== null && Reflect.get(data, "login") != null;
}

/** Flattens a fetch response's Set-Cookie list into one Cookie header value. */
function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(";")[0] ?? "")
    .filter(pair => pair.length > 0)
    .join("; ");
}

/** Server-side GraphQL POST (fixture leg) — Bun.fetch with an explicit cookie. */
async function gqlFetch(
  cookie: string | null,
  query: string,
  variables: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<GqlPayload> {
  const response = await fetch(`${BASE}/api/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie === null ? {} : { cookie }),
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as GqlPayload;
}

/** Logs one seeded user in over the wire; returns the auth Cookie header. */
async function loginCookie(email: string, password: string): Promise<string> {
  const response = await fetch(`${BASE}/api/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: LOGIN_MUTATION, variables: { email, password } }),
  });
  const payload = (await response.json()) as unknown;
  if (!hasLoginData(payload)) {
    throw new Error(`seed login failed for ${email}`);
  }
  const cookie = cookieHeaderFrom(response);
  if (cookie.length === 0) {
    throw new Error(`seed login returned no auth cookies for ${email}`);
  }
  return cookie;
}

/**
 * Returns a CANCEL-ELIGIBLE (scheduled) session id: an existing directory row
 * when a previous run left one behind, otherwise a freshly booked trial-lane
 * session (certified demo teacher + seeded demo student, public API only).
 */
async function resolveFixtureSessionId(adminCookie: string): Promise<number> {
  const existing = await gqlFetch(adminCookie, SCHEDULED_DIRECTORY_QUERY, {});
  const page = existing.data?.adminSessions as { items?: Array<{ id: unknown }> } | undefined;
  const reusable = page?.items?.[0]?.id;
  if (typeof reusable === "number" && Number.isSafeInteger(reusable)) {
    return reusable;
  }

  const studentCookie = await loginCookie(STUDENT_EMAIL, SEED_PASSWORD);
  const booked = await gqlFetch(
    studentCookie,
    CREATE_SESSION_MUTATION,
    { input: { intent: "hifz", teacherId: DEMO_TEACHER_USER_ID } },
    { "x-idempotency-key": randomUUID() }
  );
  const session = booked.data?.createSession as { id?: unknown; status?: unknown } | undefined;
  const bookingError = booked.errors?.[0];
  if (typeof session?.id !== "number" || session.status !== "scheduled") {
    const detail = bookingError?.message ?? "unknown booking error";
    throw new Error(
      `no scheduled session available and the trial booking failed (${detail}) — ` +
        "reseed the test database (bun run backend/db/scripts/migrate.ts && bun run backend/db/scripts/drizzleSeed.ts) and retry"
    );
  }
  return session.id;
}

/** Certified-teacher bootstrap for the booking leg (idempotent on re-runs). */
async function certifyDemoTeacher(adminCookie: string): Promise<void> {
  const payload = await gqlFetch(adminCookie, CERTIFY_TEACHER_MUTATION, { userId: Number(DEMO_TEACHER_USER_ID) });
  const alreadyCertified = payload.errors?.some(error => (error.message ?? "").toUpperCase().includes("CERTIFIED"));
  if (payload.data == null && alreadyCertified !== true) {
    throw new Error(`demo teacher certification failed: ${payload.errors?.[0]?.message ?? "unknown error"}`);
  }
}

/** Authenticated admin browser contexts (mirrors the sibling e2e spec). */
async function loginAdmin(context: BrowserContext): Promise<void> {
  const response = await context.request.post(`${BASE}/api/graphql`, {
    data: { query: LOGIN_MUTATION, variables: { email: ADMIN_EMAIL, password: SEED_PASSWORD } },
  });
  const payload: unknown = await response.json();
  if (!hasLoginData(payload)) {
    throw new Error("admin login failed for the documented seed credential");
  }
}

/** Polls a locator's text until it equals the expected value (auto-wait). */
async function awaitText(locator: Locator, expected: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const current = await locator.textContent();
    if (current === expected) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`text condition not met in time: expected "${expected}", saw "${current}"`);
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}

/** Opens the status combobox and applies one status option (MUI v9 select). */
async function applyStatusFilter(page: Page, statusLabel: string): Promise<void> {
  await page.getByRole("combobox", { name: tGov.filterStatusLabel }).click();
  await page.getByRole("option", { name: statusLabel }).click();
  await page.getByTestId("admin-session-governance-filters-apply").click();
}

let browser: Browser;
let sessionId = 0;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });

  // Fixture leg over the public API — certify the demo teacher (idempotent),
  // resolve a scheduled session, and warm the two page routes under the
  // admin session so the smoke's navigation budget stays assertion-only.
  const adminCookie = await loginCookie(ADMIN_EMAIL, SEED_PASSWORD);
  await certifyDemoTeacher(adminCookie);
  sessionId = await resolveFixtureSessionId(adminCookie);
  expect(sessionId).toBeGreaterThan(0);

  for (const route of [`/admin/session-governance`, `/audit?entityType=session&entityId=${sessionId}`]) {
    const warmed = await fetch(`${BASE}${route}`, { headers: { cookie: adminCookie }, redirect: "manual" });
    expect([200, 304]).toContain(warmed.status);
  }
});

afterAll(async () => {
  await browser.close();
});

test("admin session governance — filter → cancel → audit trail smoke", async () => {
  const context: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAdmin(context);

  // ── Directory load: the loading skeleton clears, the row is scheduled ──
  await page.goto(`${BASE}/admin/session-governance`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const view = page.getByTestId("admin-session-governance-view");
  await view.waitFor({ state: "visible", timeout: 90000 });
  await page.getByTestId("admin-session-governance-loading").waitFor({ state: "hidden", timeout: 60000 });

  const row = page.getByTestId(`admin-session-row-${sessionId}`);
  await row.waitFor({ state: "visible", timeout: 60000 });
  await row.getByText(tSessions.statusScheduled, { exact: true }).waitFor({ state: "visible", timeout: 30000 });

  // ── Status filter APPLY: `scheduled` keeps the row, honest total is 1 ──
  await applyStatusFilter(page, tSessions.statusScheduled);
  await awaitText(page.getByTestId("admin-session-governance-count"), tGov.countLine(1));
  await row.waitFor({ state: "visible", timeout: 60000 });

  // ── Reset: the unfiltered directory shows the row again ────────────────
  await page.getByTestId("admin-session-governance-filters-reset").click();
  await row.waitFor({ state: "visible", timeout: 60000 });

  // ── Kebab → cancel (eligible on a scheduled row) → confirm with reason ──
  await page.getByTestId(`admin-session-actions-${sessionId}`).click();
  const cancelItem = page.getByTestId(`admin-session-action-${sessionId}-cancel`);
  await cancelItem.waitFor({ state: "visible", timeout: 30000 });
  await cancelItem.click();

  const dialog = page.getByRole("dialog", { name: tGov.cancelTitle });
  await dialog.waitFor({ state: "visible", timeout: 30000 });
  const reason = `e2e governance smoke ${randomUUID()}`;
  await dialog.getByLabel(tGov.cancelReasonLabel).fill(reason);
  await page.getByTestId(`cancel-session-submit-${sessionId}`).click();

  // ── Success feedback + in-place chip flip (cache-normalized row) ────────
  const toast = page.locator(".MuiSnackbar-root .MuiAlert-success");
  await toast.waitFor({ state: "visible", timeout: 30000 });
  expect((await toast.textContent()) ?? "").toContain(tGov.cancelSuccess);
  await dialog.waitFor({ state: "hidden", timeout: 30000 });
  await row.getByText(tSessions.statusCancelled, { exact: true }).waitFor({ state: "visible", timeout: 30000 });

  // ── Server-truth re-filter: `cancelled` keeps the row (honest total 1) ──
  await applyStatusFilter(page, tSessions.statusCancelled);
  await awaitText(page.getByTestId("admin-session-governance-count"), tGov.countLine(1));
  await row.waitFor({ state: "visible", timeout: 60000 });
  await row.getByText(tSessions.statusCancelled, { exact: true }).waitFor({ state: "visible", timeout: 30000 });

  // ── Audit-visible: the trail lists the override row for this session ────
  await page.goto(`${BASE}/audit?entityType=session&entityId=${sessionId}&actionType=override`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const trailRow = page
    .getByRole("row")
    .filter({ has: page.getByText(String(sessionId), { exact: true }) })
    .first();
  await trailRow.waitFor({ state: "visible", timeout: 90000 });
  await trailRow
    .getByText(tAdminUsers.activity.actionOverride, { exact: true })
    .waitFor({ state: "visible", timeout: 30000 });

  const detailsToggle = trailRow.getByRole("button", { name: tAdminUsers.auditTrail.table.detailsShowLabel });
  await detailsToggle.click();
  await trailRow.getByText(reason).waitFor({ state: "visible", timeout: 30000 });

  await context.close();
});
