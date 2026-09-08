/**
 * Directory URL state — the pure (parse/serialize) half of the shareable
 * filtered-view feature for the admin directory surfaces (`/students`,
 * `/teachers`).
 *
 * The admin directories keep their filter/search/pagination state in React
 * hooks; this module is the URL MIRROR of that state:
 *  - `parse*UrlState` reads a `ReadableSearchParams`-shaped object (the
 *    `useSearchParams()` return satisfies it) into the surface's initial
 *    state, fail-closed: ANY unknown/ill-typed/out-of-range value falls
 *    back to the same default the unshared URL renders — a hand-edited or
 *    stale link can never poison the surface;
 *  - `serialize*UrlState` builds the query string for the CURRENT view,
 *    OMITTING every default (clean URLs: an untouched surface shares as
 *    the bare path) with a stable key order (deterministic tests, stable
 *    `router.replace` comparisons).
 *
 * URL contract (v1 — lowercase keys, 1-based page):
 *  - shared keys  : `q` (applied search substring), `page` (1-based,
 *    omitted at 1), `size` (omitted at 10; whitelisted to the pagination
 *    component's options 10/25/50/100),
 *  - `/users`     : `role` (`admin` | `teacher` | `student` | `parent`),
 *    `governance` (`active` | `suspended` | `blocked` | `deleted`),
 *    `country` (trimmed free text),
 *  - `/students`  : `parent` (`with` | `independent`), `lang` (applied
 *    exact-match language),
 *  - `/teachers`  : `tab` (`applicants`; omitted on the default teachers
 *    tab) — the URL ALWAYS describes the ACTIVE tab's view, so the
 *    teachers-tab keys are `approval` (`approved` | `pending`), `online`
 *    (`online` | `offline`), `evaluator` (`yes` | `no`), while the
 *    applicants tab reuses `q`/`page`/`size` plus `status` (the four
 *    canonical wire values verbatim).
 *
 * The React half (seeding via lazy `useState` initializers + a
 * `router.replace` write effect) lives in the consuming directory hooks —
 * keeping THIS module pure makes the round-trip contract unit-testable
 * without a DOM.
 */

/** Minimal shape this module needs from `useSearchParams()` (dependency-
 * free: tests pass plain objects, the framework passes a live params ref). */
export interface ReadableSearchParams {
  get(name: string): string | null;
}

/** Whitelisted page sizes — mirrors `DirectoryPagination`'s options. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type DirectoryPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const DEFAULT_PAGE_SIZE: DirectoryPageSize = 10;
/** Hard clamp for a hand-edited `page` — a stray `page=99999999` resolves
 * to the last real page server-side anyway; this just keeps arithmetic sane
 * (the 1-BASED page is capped at 10,000, then converted to the 0-based
 * internal index). */
const MAX_PAGE_ONE_BASED = 10_000;

/** Reads one page-int param: 1-based, clamped; `null`/junk → `null` (default). */
function parsePageParam(searchParams: ReadableSearchParams): number | null {
  const raw = searchParams.get("page");
  if (raw === null || raw.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return null;
  }
  // Internal state is 0-based — cap the 1-based page, then shift down.
  return Math.min(parsed, MAX_PAGE_ONE_BASED) - 1;
}

/** Reads one `size` param against the pagination whitelist; junk → `null`. */
function parsePageSizeParam(searchParams: ReadableSearchParams): DirectoryPageSize | null {
  const raw = searchParams.get("size");
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? (parsed as DirectoryPageSize) : null;
}

/**
 * Reads one enum-ish param against an explicit lowercase wire→state map.
 * Unknown values fail safe to the map's absence (`null` = "not shared").
 */
function parseMappedParam<T extends string>(
  searchParams: ReadableSearchParams,
  key: string,
  wireToState: Readonly<Record<string, T>>
): T | null {
  const raw = searchParams.get(key);
  if (raw === null) {
    return null;
  }
  return wireToState[raw] ?? null;
}

/** Shared parse result: the applied search substring + pagination pair. */
export interface BaseDirectoryUrlState {
  readonly q: string;
  readonly page: number;
  readonly pageSize: DirectoryPageSize;
}

/** Shared serializer input — mirrors the listing hooks' applied state. */
interface BaseDirectoryUrlInput {
  readonly q: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Appends the shared `q`/`page`/`size` keys onto `params` — defaults
 * omitted, stable order (q, then surface keys, then page, size).
 */
function appendBaseParams(params: URLSearchParams, input: BaseDirectoryUrlInput): void {
  if (input.q !== "") {
    params.set("q", input.q);
  }
  if (input.page !== 0) {
    params.set("page", String(input.page + 1));
  }
  if (input.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("size", String(input.pageSize));
  }
}

/** Parses the shared trio off a params object. */
function parseBaseParams(searchParams: ReadableSearchParams): Pick<BaseDirectoryUrlState, "q" | "page" | "pageSize"> {
  return {
    q: searchParams.get("q") ?? "",
    page: parsePageParam(searchParams) ?? 0,
    pageSize: parsePageSizeParam(searchParams) ?? DEFAULT_PAGE_SIZE,
  };
}

// ─── /students ───────────────────────────────────────────────────────────────

/** Lowercase wire values for the parent-link union (parse direction). */
const STUDENT_PARENT_WIRE: Readonly<Record<string, "WithParent" | "Independent">> = {
  with: "WithParent",
  independent: "Independent",
};

export interface StudentsDirectoryUrlState extends BaseDirectoryUrlState {
  readonly parent: "WithParent" | "Independent" | "";
  readonly lang: string;
}

/** Parses the `/students` URL contract into the hook's initial state. */
export function parseStudentsUrlState(searchParams: ReadableSearchParams): StudentsDirectoryUrlState {
  return {
    ...parseBaseParams(searchParams),
    parent: parseMappedParam(searchParams, "parent", STUDENT_PARENT_WIRE) ?? "",
    lang: searchParams.get("lang") ?? "",
  };
}

/** Serializes the students hook's APPLIED state into a query string. */
export function serializeStudentsUrlState(input: {
  q: string;
  parent: "WithParent" | "Independent" | "";
  lang: string;
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  appendBaseParams(params, input);
  if (input.parent === "WithParent") {
    params.set("parent", "with");
  } else if (input.parent === "Independent") {
    params.set("parent", "independent");
  }
  if (input.lang !== "") {
    params.set("lang", input.lang);
  }
  return params.toString();
}

// ─── /teachers — shared tab + directory tab ──────────────────────────────────

export type TeachersUrlTab = "teachers" | "applicants";

const TEACHER_APPROVAL_WIRE: Readonly<Record<string, "Approved" | "Pending">> = {
  approved: "Approved",
  pending: "Pending",
};
const TEACHER_ONLINE_WIRE: Readonly<Record<string, "Online" | "Offline">> = {
  online: "Online",
  offline: "Offline",
};
const TEACHER_EVALUATOR_WIRE: Readonly<Record<string, "Evaluator" | "NonEvaluator">> = {
  yes: "Evaluator",
  no: "NonEvaluator",
};

export interface TeachersDirectoryUrlState extends BaseDirectoryUrlState {
  readonly approval: "Approved" | "Pending" | "";
  readonly online: "Online" | "Offline" | "";
  readonly evaluator: "Evaluator" | "NonEvaluator" | "";
}

/** Parses the `/teachers` TEACHERS-tab URL contract. */
export function parseTeachersDirectoryUrlState(searchParams: ReadableSearchParams): TeachersDirectoryUrlState {
  return {
    ...parseBaseParams(searchParams),
    approval: parseMappedParam(searchParams, "approval", TEACHER_APPROVAL_WIRE) ?? "",
    online: parseMappedParam(searchParams, "online", TEACHER_ONLINE_WIRE) ?? "",
    evaluator: parseMappedParam(searchParams, "evaluator", TEACHER_EVALUATOR_WIRE) ?? "",
  };
}

export function serializeTeachersDirectoryUrlState(input: {
  q: string;
  approval: "Approved" | "Pending" | "";
  online: "Online" | "Offline" | "";
  evaluator: "Evaluator" | "NonEvaluator" | "";
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  appendBaseParams(params, input);
  if (input.approval === "Approved") {
    params.set("approval", "approved");
  } else if (input.approval === "Pending") {
    params.set("approval", "pending");
  }
  if (input.online === "Online") {
    params.set("online", "online");
  } else if (input.online === "Offline") {
    params.set("online", "offline");
  }
  if (input.evaluator === "Evaluator") {
    params.set("evaluator", "yes");
  } else if (input.evaluator === "NonEvaluator") {
    params.set("evaluator", "no");
  }
  return params.toString();
}

// ─── /teachers — applicants tab ──────────────────────────────────────────────

/** The four canonical applicant-status wire values (parse direction). */
const APPLICANT_STATUS_WIRE: Readonly<Record<string, "pending" | "in_evaluation" | "failed" | "passed">> = {
  pending: "pending",
  in_evaluation: "in_evaluation",
  failed: "failed",
  passed: "passed",
};

export interface ApplicantsUrlState extends BaseDirectoryUrlState {
  readonly status: "pending" | "in_evaluation" | "failed" | "passed" | "";
}

/** Parses the `/teachers` APPLICANTS-tab URL contract. */
export function parseApplicantsUrlState(searchParams: ReadableSearchParams): ApplicantsUrlState {
  return {
    ...parseBaseParams(searchParams),
    status: parseMappedParam(searchParams, "status", APPLICANT_STATUS_WIRE) ?? "",
  };
}

export function serializeApplicantsUrlState(input: {
  q: string;
  status: "pending" | "in_evaluation" | "failed" | "passed" | "";
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  appendBaseParams(params, input);
  if (input.status !== "") {
    params.set("status", input.status);
  }
  return params.toString();
}

// ─── /users ──────────────────────────────────────────────────────────────────

/** Lowercase wire values for the admin-surface role union (parse direction). */
const USERS_ROLE_WIRE: Readonly<Record<string, "Admin" | "Teacher" | "Student" | "Parent">> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

/** Lowercase wire values for the governance buckets (parse direction). */
const USERS_GOVERNANCE_WIRE: Readonly<Record<string, "Active" | "Suspended" | "Blocked" | "Deleted">> = {
  active: "Active",
  suspended: "Suspended",
  blocked: "Blocked",
  deleted: "Deleted",
};

export interface UsersDirectoryUrlState extends BaseDirectoryUrlState {
  readonly role: "Admin" | "Teacher" | "Student" | "Parent" | "";
  readonly governance: "Active" | "Suspended" | "Blocked" | "Deleted" | "";
  readonly country: string;
}

/** Parses the `/users` URL contract into the hook's initial state. */
export function parseUsersUrlState(searchParams: ReadableSearchParams): UsersDirectoryUrlState {
  return {
    ...parseBaseParams(searchParams),
    role: parseMappedParam(searchParams, "role", USERS_ROLE_WIRE) ?? "",
    governance: parseMappedParam(searchParams, "governance", USERS_GOVERNANCE_WIRE) ?? "",
    country: searchParams.get("country") ?? "",
  };
}

/**
 * Serializes the users hook's APPLIED state into a query string. The country
 * filter is a free-text field committed per keystroke, so the serializer
 * trims it — a whitespace-only draft shares as the default (omitted), and
 * the shared link always carries the exact predicate the query runs.
 */
export function serializeUsersUrlState(input: {
  q: string;
  role: "Admin" | "Teacher" | "Student" | "Parent" | "";
  governance: "Active" | "Suspended" | "Blocked" | "Deleted" | "";
  country: string;
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  appendBaseParams(params, input);
  if (input.role !== "") {
    params.set("role", input.role.toLowerCase());
  }
  if (input.governance !== "") {
    params.set("governance", input.governance.toLowerCase());
  }
  if (input.country.trim() !== "") {
    params.set("country", input.country.trim());
  }
  return params.toString();
}

// ─── tab ─────────────────────────────────────────────────────────────────────

/** Parses the `tab` param — ANY non-`applicants` value (or its absence)
 * resolves to the default teachers tab (fail-safe single-direction flag). */
export function parseTeachersUrlTab(searchParams: ReadableSearchParams): TeachersUrlTab {
  return searchParams.get("tab") === "applicants" ? "applicants" : "teachers";
}

/**
 * Full `/teachers` URL contract: the tab PLUS the active tab's view params.
 * The surface's write effect composes this — `tab` is omitted on the
 * default teachers tab, and ONLY the active tab's filter keys serialize
 * (the hidden tab's state is intentionally not mirrored — the URL always
 * describes what an admin sees).
 */
export function serializeTeachersSurfaceUrlState(input: {
  tab: TeachersUrlTab;
  directory: Parameters<typeof serializeTeachersDirectoryUrlState>[0];
  applicants: Parameters<typeof serializeApplicantsUrlState>[0];
}): string {
  if (input.tab === "applicants") {
    // The tab flag itself is non-default state — it serializes even when
    // the queue view underneath is entirely default (a shared link to
    // `?tab=applicants` must open the QUEUE, not the directory).
    const applicants = serializeApplicantsUrlState(input.applicants);
    return applicants === "" ? "tab=applicants" : withTab(applicants);
  }
  const directory = serializeTeachersDirectoryUrlState(input.directory);
  return directory;
}

/** Prepends `tab=applicants` to a non-empty applicants query string. */
function withTab(applicantsQuery: string): string {
  return `tab=applicants&${applicantsQuery}`;
}
