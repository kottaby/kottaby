/**
 * Session-report notification seam — the emit primitive for the
 * session-report lifecycle: ONE wave-context read, up to TWO engine
 * emissions (the student always; the linked parent only when the stored
 * parent link exists), and the delivery receipts handed back for the caller
 * to publish after its own commit.
 *
 * Governance: this module performs NO governance/role checks — it emits for
 * RECIPIENTS, never for the actor. Governance is an actor-facing concern:
 * the calling flow has already re-checked the acting teacher's governance
 * state and gated the write before reaching this seam, and the recipients
 * here (the session's student and linked parent) have no governance posture
 * of their own to re-check — a report that lawfully committed still notifies
 * the session's participants. Keeping the check out of this seam is what
 * keeps it a pure emit primitive for any caller that has already gated its
 * actor (review note: do not "add" governance here).
 *
 * Recipient derivation: the ONLY caller input is the session id. Both
 * recipients — and the sole gate for the parent emission, the stored
 * `students.parent_id` link surfaced through the joined read's LEFT JOINed
 * parent leg — resolve server-side from the persisted rows inside the
 * caller's transaction, so no caller can smuggle or redirect a recipient.
 * A missing session row rejects fail-closed with `SESSION_NOT_FOUND` (the
 * calling flow reaches this seam behind the gate's row lock, so the miss is
 * only reachable through direct misuse of the seam).
 *
 * Receipt producer contract: this module NEVER publishes. Every emission
 * rides the caller's transaction through `NotificationEngine.emitForUser`
 * and the receipts are returned VERBATIM; the caller publishes via
 * `NotificationEngine.publishReceipts` strictly AFTER its own transaction
 * has committed (publish-after-commit — nothing is ever pushed for a
 * rolled-back emit).
 *
 * Localization: the engine stores copy verbatim and NEVER translates, so
 * the per-recipient composition is THIS module's obligation: the student
 * copy is composed in the student's persisted locale and the parent copy in
 * the parent's persisted locale (falling back to the platform default when
 * a user row carries none). The `locale` parameter is the requester's
 * locale and only resolves the typed denial copy.
 *
 * Privacy (copy hygiene): the bodies interpolate ONLY the counterparty full
 * names from the joined read — never ids, grades, or note content; the body
 * is a link invite, not a content mirror.
 *
 * Logging: this module logs NOTHING. It has no actor-facing denial of its
 * own (the caller owns every actor-facing log line), and notification copy
 * never belongs in logs (PII minimization).
 */
import { SessionRepository } from "@/backend/db/repo";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { DomainError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { NotificationEngine, type NotificationEngineCallOptions } from "@/backend/services/notifications";
import { isPositiveSafeInt } from "@/backend/services/notifications/emit-validation";
import type {
  DBTransaction,
  NotificationDeliveryReceipt,
  NotificationEmitInput,
  SessionReportWaveContext,
  SessionReportWaveContextRow,
} from "@/backend/types";
import { defaultLocale } from "@/shared/locale/AppLocale";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * Maps the raw joined read row onto the guard-validated wave view. The
 * parent leg is present ONLY when the LEFT JOIN produced BOTH the parent
 * user id AND the parent full name: an incomplete leg cannot prove the
 * stored parent link, so it fails closed to "unlinked" — the INV-P1 gate
 * reads only the stored linkage and a half-joined leg is never patched up
 * with a fabricated name.
 */
function reportWaveContextOf(row: SessionReportWaveContextRow): SessionReportWaveContext {
  return {
    sessionId: row.sessionId,
    student: { userId: row.studentUserId, fullName: row.studentFullName, locale: row.studentLocale },
    teacher: { userId: row.teacherUserId, fullName: row.teacherFullName, locale: row.teacherLocale },
    parent:
      row.parentUserId !== null && row.parentFullName !== null
        ? { userId: row.parentUserId, fullName: row.parentFullName, locale: row.parentLocale }
        : null,
  };
}

/**
 * One engine emission on the caller's transaction: the composed copy goes in
 * verbatim, the delivery receipt comes back verbatim and is NEVER published
 * here. The engine's caller-tx path is contract-pinned to the receipt shape
 * — a bare row would be an engine breach surfaced as a typed internal error.
 */
async function emitReportReadyNotification(
  input: NotificationEmitInput,
  recipientLocale: string,
  tx: DBTransaction,
  options: NotificationEngineCallOptions | undefined,
  requesterLocale: string
): Promise<NotificationDeliveryReceipt> {
  const result = await NotificationEngine.emitForUser(input, recipientLocale, tx, options);
  if (!("notifications" in result)) {
    throw new DomainError(
      "INTERNAL_SERVER_ERROR",
      getServerTranslations(requesterLocale).errorsTranslations.internalServerError
    );
  }
  return result;
}

/**
 * Field-by-field emit input for one report-ready recipient (BOPLA): the
 * emission type, the related session pointer, and the deterministic
 * idempotency key are identical for both recipients — the engine binds the
 * recipient id into its claim digest, so each recipient claims separately
 * under the same raw key.
 */
function reportReadyEmitInput(userId: number, title: string, body: string, sessionId: number): NotificationEmitInput {
  return {
    userId,
    type: NotificationType.SessionCompletion,
    title,
    body,
    relatedEntityType: "session",
    relatedEntityId: sessionId,
    idempotencyKey: `session:${sessionId}:report`,
  };
}

export namespace SessionReportNotificationService {
  /**
   * Emits the report-ready notifications for one session and returns the
   * delivery receipts WITHOUT publishing: the student emission always goes
   * out (copy in the student's persisted locale, body naming the teacher);
   * the parent emission goes out only when the wave context carries the
   * student's stored parent link (copy in the parent's persisted locale,
   * body naming the student and the teacher). The caller publishes the
   * returned receipts after its own commit.
   *
   * @param sessionId The session whose report became ready (positive safe
   *     integer — validated before any database read).
   * @param locale The requester's locale — resolves ONLY the typed denial
   *     copy; recipient copy is composed per recipient (see above).
   * @param tx The caller's transaction — REQUIRED: every emission rides it,
   *     so a rollback of the caller's unit erases the emissions too.
   * @param options Engine call options (injected transport / idempotency
   *     claim cache), passed through to the engine untouched.
   * @returns One receipt per emission, in emission order
   *     (student first, then the linked parent when present).
   */
  export async function notifySessionReportReady(
    sessionId: number,
    locale: string,
    tx: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt[]> {
    const tErrors = getServerTranslations(locale).errorsTranslations;

    if (!isPositiveSafeInt(sessionId)) {
      throw new ValidationError(tErrors.validation);
    }

    const row = await SessionRepository.findReportWaveContextById(sessionId, tx);
    if (row === null) {
      throw new NotFoundError("SESSION", tErrors.sessionNotFound);
    }
    const wave = reportWaveContextOf(row);

    const studentLocale = wave.student.locale ?? defaultLocale;
    const studentLabels = getServerTranslations(studentLocale).notificationsTranslations;
    const studentReceipt = await emitReportReadyNotification(
      reportReadyEmitInput(
        wave.student.userId,
        studentLabels.eventSessionReportReadyTitle,
        studentLabels.eventSessionReportReadyBody(wave.teacher.fullName),
        sessionId
      ),
      studentLocale,
      tx,
      options,
      locale
    );

    const parent = wave.parent;
    if (parent === null) {
      return [studentReceipt];
    }

    const parentLocale = parent.locale ?? defaultLocale;
    const parentLabels = getServerTranslations(parentLocale).notificationsTranslations;
    const parentReceipt = await emitReportReadyNotification(
      reportReadyEmitInput(
        parent.userId,
        parentLabels.eventSessionReportReadyTitle,
        parentLabels.eventSessionReportReadyParentBody(wave.student.fullName, wave.teacher.fullName),
        sessionId
      ),
      parentLocale,
      tx,
      options,
      locale
    );

    return [studentReceipt, parentReceipt];
  }
}
