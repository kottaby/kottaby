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
 *
 * Layout: the implementation is split across the `directory-url-state/`
 * siblings (shared primitives + one module per surface); this entry stays
 * the public barrel — consumers import from here only.
 */

export type {
  BaseDirectoryUrlState,
  DirectoryPageSize,
  ReadableSearchParams,
} from "@/frontend/views/admin/directory-url-state/shared";

export {
  parseStudentsUrlState,
  type StudentsDirectoryUrlState,
  serializeStudentsUrlState,
} from "@/frontend/views/admin/directory-url-state/students";

export {
  type ApplicantsUrlState,
  parseApplicantsUrlState,
  serializeApplicantsUrlState,
} from "@/frontend/views/admin/directory-url-state/teachers-applicants";

export {
  parseTeachersDirectoryUrlState,
  serializeTeachersDirectoryUrlState,
  type TeachersDirectoryUrlState,
} from "@/frontend/views/admin/directory-url-state/teachers-directory";

export {
  parseTeachersUrlTab,
  serializeTeachersSurfaceUrlState,
  type TeachersUrlTab,
} from "@/frontend/views/admin/directory-url-state/teachers-surface";

export {
  parseUsersUrlState,
  serializeUsersUrlState,
  type UsersDirectoryUrlState,
} from "@/frontend/views/admin/directory-url-state/users";
