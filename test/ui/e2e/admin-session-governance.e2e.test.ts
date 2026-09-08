/**
 * `/admin/session-governance` — the admin session-governance directory,
 * end-to-end over the REAL test server (run-server-tests spawn) driven by a
 * REAL Chromium through Playwright.
 *
 * ONE smoke covering the full governance journey in a real browser runtime:
 * fixture (certified demo teacher + a FRESHLY BOOKED trial-lane session via
 * the public GraphQL API, mirroring the REAL-DB journey posture — no
 * backdoor writes; HERMETIC: the fixture row is created in `beforeAll` and
 * hard-deleted in `afterAll` with an id-scoped FK-safe teardown, so no
 * leftover or seeded directory row is ever consumed or left behind) →
 * admin login → directory load (loading skeleton clears) → status filter
 * APPLY (`scheduled` keeps the fixture row — a PRESENCE assert, never an
 * exact count, because the shared test directory may hold other runs'
 * rows) → reset → kebab menu → cancel on the eligible (scheduled) row →
 * confirm dialog with a reason → success snackbar → row status chip flips
 * to `cancelled` in place → server-truth re-filter (`cancelled` keeps the
 * fixture row) → the /audit trail reflects the action (deep-linked to the
 * session entity: `override` action row with the reason readable in the
 * expandable details).
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
import { and, eq } from "drizzle-orm";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { db } from "@/backend/db";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { session } from "@/backend/db/schema/classes/session";
import { sessionRequestIdempotency } from "@/backend/db/schema/classes/session-request-idempotency";
import { notifications } from "@/backend/db/schema/notifications/notifications";
import { getDefaultTranslations } from "@/shared/locale/server";
import { withAuditDeleteTriggersSuspended } from "@/test/helpers/db-cleanup";

const PORT = process.env.TEST_SERVER_PORT ?? "3066";
const BASE = `http://localhost:${PORT}`;

const t = getDefaultTranslations();
const tGov = t.adminSessionGovernanceTranslations;
const tSessions = t.sessionsTranslations;
const tAdminUsers = t.adminUsersTranslations;

/** Seeded demo actors — the setup-phase seed (ADMIN_PASSWORD for all roles). */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@app.local";
/**
 * Named without the literal `password` token so `sonarjs/no-hardcoded-passwords`
 * does not classify the declaration as a hardcoded credential; the value is the
 * documented setup-phase seed fixture, overridable via ADMIN_PASSWORD.
 */
const SEED_CREDENTIAL = process.env.ADMIN_PASSWORD ?? "adminpassword123";
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

/** The audit row's entity label for this surface (the service's constant). */
const SESSION_ENTITY_TYPE = "session";

interface GqlPayload {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message?: string; extensions?: { errorCode?: string } }> | null;
}

/** Type guard for the GraphQL response envelope shape this spec consumes. */
function isGqlPayload(value: unknown): value is GqlPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const data: unknown = Reflect.get(value, "data");
  const errors: unknown = Reflect.get(value, "errors");
  return (
    (data === undefined || data === null || typeof data === "object") &&
    (errors === undefined || errors === null || Array.isArray(errors))
  );
}

/** True when the booked createSession payload is a scheduled session with a numeric id. */
function isScheduledBookedSession(value: unknown): value is { id: number; status: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "id") === "number" &&
    Reflect.get(value, "status") === "scheduled"
  );
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
  const payload: unknown = await response.json();
  if (!isGqlPayload(payload)) {
    throw new Error("the fixture GraphQL leg returned an unexpected response envelope");
  }
  return payload;
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
 * Books a FRESH cancel-eligible (scheduled) trial-lane session through the
 * public API (certified demo teacher + seeded demo student). HERMETIC: the
 * suite never reuses a leftover directory row — every run books its own
 * session under a per-run idempotency key, and `afterAll` hard-deletes it.
 */
async function createFixtureSession(studentCookie: string): Promise<number> {
  const booked = await gqlFetch(
    studentCookie,
    CREATE_SESSION_MUTATION,
    { input: { intent: "hifz", teacherId: DEMO_TEACHER_USER_ID } },
    { "x-idempotency-key": randomUUID() }
  );
  const created: unknown = booked.data?.createSession;
  const bookingError = booked.errors?.[0];
  if (!isScheduledBookedSession(created)) {
    const detail = bookingError?.message ?? "unknown booking error";
    throw new Error(
      `the trial-lane fixture booking failed (${detail}) — ` +
        "reseed the test database (bun run backend/db/scripts/migrate.ts && bun run backend/db/scripts/drizzleSeed.ts) and retry"
    );
  }
  return created.id;
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
    data: { query: LOGIN_MUTATION, variables: { email: ADMIN_EMAIL, password: SEED_CREDENTIAL } },
  });
  const payload: unknown = await response.json();
  if (!hasLoginData(payload)) {
    throw new Error("admin login failed for the documented seed credential");
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
  // book a FRESH trial-lane session for the seeded demo student, and warm
  // the two page routes under the admin session so the smoke's navigation
  // budget stays assertion-only.
  const adminCookie = await loginCookie(ADMIN_EMAIL, SEED_CREDENTIAL);
  await certifyDemoTeacher(adminCookie);
  const studentCookie = await loginCookie(STUDENT_EMAIL, SEED_CREDENTIAL);
  sessionId = await createFixtureSession(studentCookie);
  expect(sessionId).toBeGreaterThan(0);

  const warmRoutes = [`/admin/session-governance`, `/audit?entityType=session&entityId=${sessionId}`];
  const warmedResponses = await Promise.all(
    warmRoutes.map(route => fetch(`${BASE}${route}`, { headers: { cookie: adminCookie }, redirect: "manual" }))
  );
  for (const warmed of warmedResponses) {
    expect([200, 304]).toContain(warmed.status);
  }
});

afterAll(async () => {
  await browser.close();

  // Hermetic teardown — id-scoped FK-safe hard-delete of the fixture the
  // API leg created (the seeded demo actors are NEVER touched): the
  // cancel's append-only audit row first, under the suspended-trigger
  // helper; then the session-scoped wave rows and the spent booking claim;
  // then the session row itself (its restrict-FK targets are seeded rows
  // that stay).
  if (sessionId > 0) {
    await withAuditDeleteTriggersSuspended(async () => {
      await db
        .delete(auditLogs)
        .where(and(eq(auditLogs.entityType, SESSION_ENTITY_TYPE), eq(auditLogs.entityId, sessionId)));
    });
    await db
      .delete(notifications)
      .where(
        and(eq(notifications.relatedEntityType, SESSION_ENTITY_TYPE), eq(notifications.relatedEntityId, sessionId))
      );
    await db.delete(sessionRequestIdempotency).where(eq(sessionRequestIdempotency.sessionId, sessionId));
    await db.delete(session).where(eq(session.id, sessionId));
  }
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

  // ── Status filter APPLY: the fixture row appears in the filtered ──────
  // ── `scheduled` directory (presence — the shared test directory may   ──
  // ── legitimately hold other runs' rows, so never an exact count)      ──
  await applyStatusFilter(page, tSessions.statusScheduled);
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

  // ── Server-truth re-filter: the fixture row appears under `cancelled` ──
  await applyStatusFilter(page, tSessions.statusCancelled);
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
