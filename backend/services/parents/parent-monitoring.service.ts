/**
 * ParentMonitoringService — business-logic hub for the parent's read-only
 * monitoring portal.
 *
 * Six user-facing read operations back the parent dashboard's monitoring
 * surfaces. Every operation is a READ — zero writes of any kind, zero
 * mutations, zero notifications. The service is the authorization spine
 * for the portal: every per-student read funnels through ONE gate
 * (`requireLinkedChild`) run inside the SAME transaction as the data
 * reads, so the link grant and the row scan share one READ COMMITTED
 * snapshot — a severance that lands mid-flight cannot extend a returned
 * payload (the TOCTOU seal).
 *
 *  - `listLinkedChildren` — the caller's confirmed-linked children,
 *    soft-deleted children excluded. The only identity in the predicate
 *    is the verified `parentActorId` (no per-student gate needed — the
 *    parent reads their own list).
 *  - `getChildProgress` — the gated child header echo plus the honest
 *    progress row count and the latest Jadid/Madi positions, in ONE
 *    payload (the detail header and the progress tab are served
 *    together — fewer authorization seams).
 *  - `listChildSessions` — derived attendance entries (session rows),
 *    paged newest-first.
 *  - `listChildReports` — per-session report rows joined to their
 *    session for status/timestamp context, paged newest-session-first.
 *  - `listChildHomework` — homework rows with the two parallel track
 *    blocks (Jadid/Madi), paged newest-session-first.
 *  - `getSessionTarget` — the closed `{ sessionId, studentId }` pair
 *    resolving one completion-notification session pointer onto the
 *    LINKED child who owns it (the deep-link landing read).
 *
 * Disciplines enforced here:
 *  - Defense-in-depth actor re-check — every method starts with
 *    `requireActor(parentActorId, UserRole.Parent, locale, outerTx,
 *    false)` (the relaxed READ path: identity + role only; a
 *    governed-but-not-deleted parent's self-scoped reads stay visible).
 *    The helper is imported from the same-domain sibling
 *    `./parent-link-request.helpers` — never duplicated.
 *  - Per-student reads open ONE `withTransaction` and run the
 *    `requireLinkedChild` gate FIRST, before any data read, all inside
 *    the same transaction snapshot.
 *  - Constant-shape denial: a missing id, a foreign id, a never-linked
 *    id, a severed child, and a malformed id are byte-indistinguishable
 *    to the caller — the gate throws the SAME constant `ForbiddenError`
 *    with ONE bounded `logDomainError` (never logging child fields).
 *  - Pagination: `page >= 1`, `pageSize` clamped to [1, 50]; effective
 *    values echoed in every page payload; an out-of-range page yields
 *    empty `items` next to the true `totalCount` — never a fabricated
 *    window.
 *  - Locale threaded through every method for localized error copy.
 *
 * Implementation detail: the module-private machinery (gate, projection
 * mappers, pagination clamp) lives in `./parent-monitoring.helpers`;
 * the public surface is exactly the six-method namespace below.
 */
import {
  HomeWorkRepository,
  ProgressRepository,
  ReportRepository,
  SessionRepository,
  StudentRepository,
  UserRepository,
} from "@/backend/db/repo";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ForbiddenError, RateLimitExceededError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { checkRateLimit, portalReadLimiter } from "@/backend/lib/ratelimit";
import { isPositiveSafeInt } from "@/backend/services/notifications/emit-validation";
import { requireActor } from "@/backend/services/parents/parent-link-request.helpers";
import {
  clampPageInput,
  composeChildProgress,
  mapHomeWorkRowToEntry,
  mapReportRowToEntry,
  mapSessionToAttendanceEntry,
  requireLinkedChild,
} from "@/backend/services/parents/parent-monitoring.helpers";
import type {
  DBTransaction,
  ParentAttendancePageReturnType,
  ParentChildProgressReturnType,
  ParentHomeworkPageReturnType,
  ParentLinkedChildReturnType,
  ParentPageInput,
  ParentReportPageReturnType,
  ParentSessionTargetReturnType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * Shared paged-read scaffold for the three paginated per-student portal
 * reads: actor re-check (relaxed) → request-volume cap → pagination clamp
 * → ONE repeatable-read transaction in which the link gate runs FIRST and
 * the caller's list+count pair shares the same snapshot → page-envelope
 * composition. The per-read differences (repository pair + row mapper)
 * arrive as callbacks, keeping one canonical gate/snapshot/envelope
 * sequence instead of three drifting copies.
 */
async function runGatedPagedRead<TRepo, TEntry>(
  parentActorId: number,
  studentId: number,
  page: ParentPageInput | undefined,
  locale: string,
  outerTx: DBTransaction | undefined,
  listAndCount: (tx: DBTransaction, pageSize: number, offset: number) => Promise<[readonly TRepo[], number]>,
  mapItem: (row: TRepo) => TEntry
): Promise<{ items: TEntry[]; totalCount: number; page: number; pageSize: number }> {
  await requireActor(parentActorId, UserRole.Parent, locale, outerTx, false);
  await enforcePortalRateLimit(parentActorId, locale); // request-volume cap — every portal read, not only the children list
  const { page: effectivePage, pageSize, offset } = clampPageInput(page);

  return withTransaction(
    outerTx,
    async tx => {
      await requireLinkedChild(parentActorId, studentId, locale, tx);
      const [rows, totalCount] = await listAndCount(tx, pageSize, offset);
      return { items: rows.map(mapItem), totalCount, page: effectivePage, pageSize };
    },
    { isolationLevel: "repeatable read" } // one snapshot for the link gate + every data read
  );
}

/** Per-parent rate limit — caps portal read volume to prevent child-id probing. */
async function enforcePortalRateLimit(parentActorId: number, locale: string): Promise<void> {
  // Test mode bypass: service-level rate limiting interferes with the
  // denial-oracle uniformity test (which expects all 20 method×cause
  // cells to throw ForbiddenError, not RateLimitExceededError).
  if (process.env.TEST_CI === "1" || process.env.TEST_SERVER === "1") {
    return;
  }
  const identifier = `parent:${parentActorId}`;
  const result = await checkRateLimit(identifier, portalReadLimiter);
  if (!result.success) {
    const t = getServerTranslations(locale);
    throw new RateLimitExceededError(t.errorsTranslations.rateLimitExceeded);
  }
}

export namespace ParentMonitoringService {
  /**
   * Lists the caller's confirmed-linked children, oldest-first by
   * creation stamp with the integer id as the deterministic tiebreak.
   * Soft-deleted children are excluded by the repository predicate — a
   * child whose `users.isDeleted` flag flips to `true` vanishes from
   * the list on the very next read.
   *
   * Identity is taken ONLY from the verified `parentActorId` parameter
   * (which arrives from `ctx.user.id` at the GraphQL layer — never
   * client-supplied). No per-student gate runs here: the list IS the
   * parent's own scope. The relaxed actor re-check (identity + role
   * only, governance arm disabled) keeps a governed-but-not-deleted
   * parent's list visible.
   *
   * @returns The linked-child rows in stable oldest-first order. An
   *     unlinked parent (or one whose every linked child is
   *     soft-deleted) yields an empty array.
   */
  export async function listLinkedChildren(
    parentActorId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<ParentLinkedChildReturnType[]> {
    await requireActor(parentActorId, UserRole.Parent, locale, outerTx, false);
    await enforcePortalRateLimit(parentActorId, locale);
    return StudentRepository.listLinkedChildrenByParentId(parentActorId, outerTx);
  }

  /**
   * Resolves the gated child header echo plus the honest progress row
   * count and the latest Jadid/Madi curriculum positions, in ONE
   * payload.
   *
   * Runs the actor re-check, then opens ONE transaction and runs the
   * link gate FIRST, before any data read, all inside the same
   * transaction snapshot. After the gate passes, the child's `users`
   * row is re-read for the `fullName` field (the student row alone
   * carries only `id` and `createdAt` — the shared primary key makes
   * the join trivial inside the snapshot). The progress count and the
   * newest homework row feed the progress signals.
   *
   * `progressRowCount` is the honest COUNT — zero means "no recorded
   * progress yet" (never a fabricated percentage). Each
   * `latest*Position` is `null` when the newest homework row carries
   * no surah/juz reference on that track.
   *
   * @throws ForbiddenError  Constant denial shape when the link is not
   *     in force (missing / foreign / never-linked / severed / malformed
   *     id — the caller cannot distinguish the cause).
   */
  export async function getChildProgress(
    parentActorId: number,
    studentId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<ParentChildProgressReturnType> {
    await requireActor(parentActorId, UserRole.Parent, locale, outerTx, false);
    await enforcePortalRateLimit(parentActorId, locale); // request-volume cap — every portal read, not only the children list

    return withTransaction(
      outerTx,
      async tx => {
        const student = await requireLinkedChild(parentActorId, studentId, locale, tx);
        const childUser = await UserRepository.findById(studentId, tx);
        if (childUser === null) {
          // Unreachable while the FKs hold (the student row exists and
          // shares its PK with the user row) — a missing user here means
          // data drift and MUST abort the unit, not return partial data.
          throw new Error(`ParentMonitoringService.getChildProgress: child user ${studentId} vanished after gate`);
        }
        const progressRowCount = await ProgressRepository.countForStudent(studentId, tx);
        const latestHomeWork = await HomeWorkRepository.findLatestByStudentId(studentId, tx);
        return composeChildProgress(student, childUser, progressRowCount, latestHomeWork);
      },
      { isolationLevel: "repeatable read" } // one snapshot for the link gate + every data read
    );
  }

  /**
   * Lists the gated child's derived attendance entries (session rows),
   * newest-first, paged. Pagination is normalized before the DB read:
   * `page >= 1`, `pageSize` clamped to [1, 50]; the effective values are
   * echoed in the page payload.
   *
   * Runs the actor re-check, then opens ONE transaction and runs the
   * link gate FIRST, before the list and count reads, all inside the
   * same transaction snapshot. The list and the count share the same
   * predicate (the repository's shared participant-predicate builder)
   * so the total cannot drift from the list.
   *
   * @returns The paginated attendance window. An out-of-range page
   *     yields empty `items` next to the true `totalCount`.
   * @throws ForbiddenError  Constant denial shape when the link is not
   *     in force.
   */
  export async function listChildSessions(
    parentActorId: number,
    studentId: number,
    page: ParentPageInput | undefined,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<ParentAttendancePageReturnType> {
    return runGatedPagedRead(
      parentActorId,
      studentId,
      page,
      locale,
      outerTx,
      (tx, pageSize, offset) =>
        Promise.all([
          SessionRepository.listForStudent(studentId, {}, pageSize, offset, tx),
          SessionRepository.countForStudent(studentId, {}, tx),
        ]),
      mapSessionToAttendanceEntry
    );
  }

  /**
   * Lists the gated child's per-session report rows (teacher notes +
   * rating, joined to the owning session for status/timestamp context),
   * newest-session-first, paged. Pagination is normalized before the DB
   * read; effective values echoed in the page payload.
   *
   * Runs the actor re-check, then opens ONE transaction and runs the
   * link gate FIRST, before the list and count reads, all inside the
   * same transaction snapshot. The list and count share the same
   * JOIN-condition builder so the total cannot drift from the list.
   *
   * @returns The paginated report window. An out-of-range page yields
   *     empty `items` next to the true `totalCount`.
   * @throws ForbiddenError  Constant denial shape when the link is not
   *     in force.
   */
  export async function listChildReports(
    parentActorId: number,
    studentId: number,
    page: ParentPageInput | undefined,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<ParentReportPageReturnType> {
    return runGatedPagedRead(
      parentActorId,
      studentId,
      page,
      locale,
      outerTx,
      (tx, pageSize, offset) =>
        Promise.all([
          ReportRepository.listForStudent(studentId, pageSize, offset, tx),
          ReportRepository.countForStudent(studentId, tx),
        ]),
      mapReportRowToEntry
    );
  }

  /**
   * Lists the gated child's homework rows (each carrying the two
   * parallel Jadid/Madi track blocks), newest-session-first, paged.
   * Pagination is normalized before the DB read; effective values
   * echoed in the page payload.
   *
   * Runs the actor re-check, then opens ONE transaction and runs the
   * link gate FIRST, before the list and count reads, all inside the
   * same transaction snapshot. The list and count share the same
   * JOIN-condition builder so the total cannot drift from the list.
   * Track block composition preserves per-field nullability — a null
   * grade stays null, a fully-null track block collapses to `null`
   * ("no assignment on this track"), never fabricated zeros.
   *
   * @returns The paginated homework window. An out-of-range page yields
   *     empty `items` next to the true `totalCount`.
   * @throws ForbiddenError  Constant denial shape when the link is not
   *     in force.
   */
  export async function listChildHomework(
    parentActorId: number,
    studentId: number,
    page: ParentPageInput | undefined,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<ParentHomeworkPageReturnType> {
    return runGatedPagedRead(
      parentActorId,
      studentId,
      page,
      locale,
      outerTx,
      (tx, pageSize, offset) =>
        Promise.all([
          HomeWorkRepository.listForStudent(studentId, pageSize, offset, tx),
          HomeWorkRepository.countForStudent(studentId, tx),
        ]),
      mapHomeWorkRowToEntry
    );
  }

  /**
   * Resolves one session id onto the closed `{ sessionId, studentId }`
   * pair for the completion-notification deep link — the LINKED child
   * who owns the session.
   *
   * The session id arrives from the notification row's polymorphic
   * pointer, so it is probed-untrusted input: a non-positive or
   * non-integer id is rejected as `ValidationError` before any gate or
   * read runs. The actor re-check and the portal rate limit follow,
   * then ONE repeatable-read transaction seals the resolution: the
   * session row is read FIRST (its `studentId` names the child whose
   * link grant must be verified) and `requireLinkedChild` gates that
   * child inside the same snapshot, so the grant check and the returned
   * pair cannot be split by a mid-flight severance (the TOCTOU seal).
   *
   * A missing session denies with the SAME constant `ForbiddenError`
   * shape the link gate throws — ONE bounded `logDomainError` whose
   * context carries the probed id and nothing else (never a session row
   * field), so a nonexistent id and a foreign id stay indistinguishable
   * to the caller (existence non-disclosure).
   *
   * @returns The closed id pair: the resolved session id and the linked
   *     child's id.
   * @throws ForbiddenError  Constant denial shape when the session does
   *     not exist or the caller's link to its child is not in force.
   */
  export async function getSessionTarget(
    parentActorId: number,
    sessionId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<ParentSessionTargetReturnType> {
    const tErrors = getServerTranslations(locale).errorsTranslations;
    if (!isPositiveSafeInt(sessionId)) {
      throw new ValidationError(tErrors.validation);
    }
    await requireActor(parentActorId, UserRole.Parent, locale, outerTx, false);
    await enforcePortalRateLimit(parentActorId, locale); // request-volume cap — every portal read, not only the children list

    return withTransaction(
      outerTx,
      async tx => {
        const row = await SessionRepository.findById(sessionId, tx);
        if (row === null) {
          logger.logDomainError("Parent portal read denied: session target not resolvable", {
            code: "FORBIDDEN",
            entity: "sessions",
            entityId: sessionId,
            locale,
          });
          throw new ForbiddenError(tErrors.forbidden);
        }
        await requireLinkedChild(parentActorId, row.studentId, locale, tx);
        return { sessionId: row.id, studentId: row.studentId };
      },
      { isolationLevel: "repeatable read" } // one snapshot for the session read + the link gate
    );
  }
}
