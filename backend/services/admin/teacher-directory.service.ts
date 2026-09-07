/**
 * AdminTeacherDirectoryService — business-logic hub for the `adminTeachers`
 * admin directory surface (paginated listing of `teacher` role-child rows
 * joined to their `users` accounts).
 *
 * Single operation: `list` — filter normalization + pagination bounds +
 * row→item projection over `TeacherRepository.listDirectory`.
 *
 * Disciplines enforced here (mirroring `AdminUserManagementService`):
 *  - Defense-in-depth BFLA: `assertActorAdmin` is the FIRST statement —
 *    anonymous callers (`actorId = 0`) receive `UnauthorizedError`;
 *    authenticated non-admins receive `ForbiddenError`. Pure read: denial
 *    and success paths both emit ZERO audit rows and perform ZERO writes.
 *  - Search sanitization boundary: the free-text search term is trimmed,
 *    clamped to a 100-char ceiling, escaped via the canonical
 *    `escapeLikeWildcards` helper AND wrapped as `%…%` BEFORE the repo sees
 *    it — the repo binds the final pattern directly to its `ilike`
 *    predicates (one canonical escape point, one binding point).
 *  - Pagination bounds: `page >= 1`, `pageSize in 1..100` (default 25) via
 *    the shared `resolvePageBounds` helper — out-of-range values reject
 *    with a localized `VALIDATION` error BEFORE any DB read. An
 *    out-of-range page (e.g. page 999 on a 10-page directory) returns
 *    `{ items: [], total, page, pageSize, pageCount }` honestly — never an
 *    error, never clamped.
 *  - `pageCount` is the ceiling division of `total` over the resolved
 *    `pageSize` (an empty directory yields `0`).
 *  - Logging: expected rejections surface through the shared admin gate's
 *    `logger.logDomainError` (ids + codes only — no PII); this service adds
 *    no logging of its own. NEVER `console.*`.
 *  - i18n: pagination validation messages resolve through
 *    `getServerTranslations(locale).errorsTranslations` (property access
 *    only, never `t('key')` string-concatenated lookup).
 */
import { TeacherRepository } from "@/backend/db/repo";
import type { NormalizedAdminTeacherFilters } from "@/backend/db/repo/teachers/teacher.repository";
import { escapeLikeWildcards } from "@/backend/lib/db/escape-like-wildcards";
import { assertActorAdmin } from "@/backend/services/admin/admin-guards.helpers";
import { mapTeacherDirectoryRow } from "@/backend/services/admin/teacher-directory.mappers";
import { resolvePageBounds } from "@/backend/services/admin/user-management.helpers";
import type { AdminTeacherFiltersSubmitInput, AdminTeacherPageReturnType, DBTransaction } from "@/backend/types";

/** Upper bound on the free-text search term length — longer input clamps. */
const MAX_SEARCH_LENGTH = 100;

/**
 * Normalizes a transport-shape filter input into the repo-internal
 * `NormalizedAdminTeacherFilters` shape. Empty / whitespace-only search
 * drops out (the directory falls back to the unfiltered listing rather
 * than erroring); a longer term clamps to the 100-char ceiling BEFORE the
 * LIKE-escape + `%…%`-wrap. Boolean members pass through as `null` when
 * absent (the repo skips them in the WHERE chain).
 */
function normalizeFilters(filters: AdminTeacherFiltersSubmitInput): NormalizedAdminTeacherFilters {
  let searchPattern: string | null = null;
  const trimmedSearch = filters.search?.trim();
  if (trimmedSearch) {
    searchPattern = `%${escapeLikeWildcards(trimmedSearch.slice(0, MAX_SEARCH_LENGTH))}%`;
  }
  return {
    searchPattern,
    isApproved: filters.approval ?? null,
    isOnline: filters.online ?? null,
    isEvaluator: filters.evaluator ?? null,
  };
}

export namespace AdminTeacherDirectoryService {
  /**
   * Lists the teacher directory by filter + page bounds.
   *
   * Pre-DB pagination bounds: `page >= 1`, `pageSize in 1..100`, default
   * `pageSize = 25`. Out-of-range values reject with `VALIDATION`. An
   * out-of-range page returns `{ items: [], total, … }` honestly — never
   * an error, never clamped.
   */
  export async function list(
    filters: AdminTeacherFiltersSubmitInput,
    page: number,
    pageSize: number | undefined,
    locale: string,
    actorId: number,
    outerTx?: DBTransaction
  ): Promise<AdminTeacherPageReturnType> {
    await assertActorAdmin(actorId, locale, outerTx);

    const { resolvedPage, resolvedPageSize, offset } = resolvePageBounds(page, pageSize, locale);
    const normalized = normalizeFilters(filters);
    const { rows, total } = await TeacherRepository.listDirectory(normalized, resolvedPageSize, offset, outerTx);

    const items = rows.map(row => mapTeacherDirectoryRow(row));

    return {
      items,
      total,
      page: resolvedPage,
      pageSize: resolvedPageSize,
      pageCount: Math.ceil(total / resolvedPageSize),
    };
  }
}
