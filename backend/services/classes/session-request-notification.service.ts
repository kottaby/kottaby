/**
 * Session-request notification wave emitters — the internal engine-facing
 * library for the six session-request lifecycle waves (one teacher-facing
 * request wave, five student-facing outcome waves) plus the three admin
 * session-governance waves (reschedule / cancel / teacher reassignment).
 *
 * Recipient derivation: the ONLY caller input is the session id. Both
 * participants resolve server-side from the persisted session row inside the
 * caller's transaction through the repository's joined read, so no caller can
 * smuggle or redirect a recipient identity. Every persisted row is written
 * exclusively through the notification engine (single-writer rule).
 *
 * Receipt producer contract: every emitter returns the engine's delivery
 * receipt VERBATIM and NEVER publishes. A caller that hands in its own
 * transaction owns the commit; it publishes afterwards via
 * `NotificationEngine.publishReceipts` strictly AFTER its own transaction has
 * committed (publish-after-commit — nothing is ever pushed for a rolled-back
 * emit). On the transaction-less path the engine commits the row, stores the
 * claim receipt, and publishes exactly once internally; this module then wraps
 * the freshly inserted row into the receipt shape.
 *
 * Authorization: these emitters are internal primitives — they perform NO
 * role/permission gating of their own. The owning session-intake /
 * accept-decline flow gates who may trigger a wave before calling in.
 *
 * Localization: the engine stores copy verbatim and NEVER translates, so the
 * per-recipient locale composition is THIS module's obligation: title and body
 * are composed in the RECIPIENT's persisted locale (falling back to the
 * platform default locale when the user row carries none), and that same
 * locale is handed to the engine.
 */
import { SessionRepository, UserRepository } from "@/backend/db/repo";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { DomainError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { NotificationEngine, type NotificationEngineCallOptions } from "@/backend/services/notifications";
import { isPositiveSafeInt } from "@/backend/services/notifications/emit-validation";
import {
  type DBTransaction,
  isSessionIntent,
  type NotificationDeliveryReceipt,
  type NotificationEmitInput,
  type SessionGovernanceWaveKind,
  type SessionRequestWaveKind,
  type SessionWaveContext,
  type SessionWaveParticipantContext,
} from "@/backend/types";
import { defaultLocale } from "@/shared/locale/AppLocale";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * Fail-closed participant resolution: validates the session id BEFORE any
 * database read, loads the joined wave context, and maps the stored intent
 * through the canonical guard. A missing row rejects with `SESSION_NOT_FOUND`;
 * a non-member (or null) stored intent fails closed with
 * `SESSION_INTENT_CORRUPT` — each with exactly one bounded domain log.
 */
async function resolveWaveContext(
  sessionId: number,
  locale: string,
  tx: DBTransaction | undefined
): Promise<SessionWaveContext> {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  if (!isPositiveSafeInt(sessionId)) {
    throw new ValidationError(tErrors.validation);
  }

  const row = await SessionRepository.findWaveContextById(sessionId, tx);
  if (row === null) {
    logger.logDomainError("Session not found for notification wave", {
      code: "SESSION_NOT_FOUND",
      entity: "session",
      entityId: sessionId,
      locale,
    });
    throw new NotFoundError("SESSION", tErrors.sessionNotFound);
  }

  if (row.intent === null || !isSessionIntent(row.intent)) {
    logger.logDomainError("Session intent corrupt for notification wave", {
      code: "SESSION_INTENT_CORRUPT",
      entity: "session",
      entityId: sessionId,
      locale,
    });
    throw new ValidationError("SESSION_INTENT_CORRUPT", tErrors.sessionIntentCorrupt);
  }

  return {
    sessionId: row.sessionId,
    intent: row.intent,
    student: { userId: row.studentUserId, fullName: row.studentFullName, locale: row.studentLocale },
    teacher: { userId: row.teacherUserId, fullName: row.teacherFullName, locale: row.teacherLocale },
  };
}

/** Localized intent label — exhaustive over every SessionIntent member. */
function resolveIntentLabel(
  intent: SessionIntent,
  tNotifications: ReturnType<typeof getServerTranslations>["notificationsTranslations"]
): string {
  switch (intent) {
    case SessionIntent.Hifz:
      return tNotifications.intentHifz;
    case SessionIntent.Tajweed:
      return tNotifications.intentTajweed;
    case SessionIntent.Evaluation:
      return tNotifications.intentEvaluation;
    default: {
      // Exhaustiveness guard — the enum union makes this unreachable.
      const exhaustive: never = intent;
      throw new Error(`Unexpected session intent: ${String(exhaustive)}`);
    }
  }
}

/**
 * Composes the wave's title/body from the notifications namespace in the
 * recipient's locale. The counterparty's display name is the only participant
 * detail that ever appears in copy (plus the intent label on the request
 * wave).
 */
function composeWaveCopy(
  waveKind: SessionRequestWaveKind,
  wave: SessionWaveContext,
  counterparty: SessionWaveParticipantContext,
  tNotifications: ReturnType<typeof getServerTranslations>["notificationsTranslations"]
): { readonly title: string; readonly body: string } {
  switch (waveKind) {
    case "teacher_request":
      return {
        title: tNotifications.eventSessionRequestTitle,
        body: tNotifications.eventSessionRequestBody(
          counterparty.fullName,
          resolveIntentLabel(wave.intent, tNotifications)
        ),
      };
    case "outcome_accepted":
      return {
        title: tNotifications.eventSessionAcceptedTitle,
        body: tNotifications.eventSessionAcceptedBody(counterparty.fullName),
      };
    case "outcome_declined":
      return {
        title: tNotifications.eventSessionDeclinedTitle,
        body: tNotifications.eventSessionDeclinedBody(counterparty.fullName),
      };
    case "outcome_auto_rejected":
      return {
        title: tNotifications.eventSessionAutoRejectedTitle,
        body: tNotifications.eventSessionAutoRejectedBody(counterparty.fullName),
      };
    case "outcome_queued":
      return {
        title: tNotifications.eventSessionQueuedTitle,
        body: tNotifications.eventSessionQueuedBody(counterparty.fullName),
      };
    case "outcome_alternatives_offered":
      return {
        title: tNotifications.eventSessionAlternativesOfferedTitle,
        body: tNotifications.eventSessionAlternativesOfferedBody(counterparty.fullName),
      };
    default: {
      // Exhaustiveness guard — the wave-kind union makes this unreachable.
      const exhaustive: never = waveKind;
      throw new Error(`Unexpected wave kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * Delivers one wave through the engine and returns its delivery receipt.
 *
 * Caller-tx: the engine persists inside the caller's transaction and returns
 * the unpublished receipt (its shape is contract-pinned; any deviation is an
 * engine breach surfaced as a typed internal error) — this module NEVER
 * publishes on that path. Transaction-less: the engine commits and publishes
 * exactly once on its own; a replay resolves to the stored prior receipt,
 * while a fresh emission returns the inserted row wrapped into receipt shape.
 */
async function emitWave(
  sessionId: number,
  waveKind: SessionRequestWaveKind,
  recipientSide: "student" | "teacher",
  locale: string,
  tx: DBTransaction | undefined,
  options: NotificationEngineCallOptions | undefined
): Promise<NotificationDeliveryReceipt> {
  const wave = await resolveWaveContext(sessionId, locale, tx);
  const recipient = recipientSide === "teacher" ? wave.teacher : wave.student;
  const counterparty = recipientSide === "teacher" ? wave.student : wave.teacher;
  const recipientLocale = recipient.locale ?? defaultLocale;
  const { title, body } = composeWaveCopy(
    waveKind,
    wave,
    counterparty,
    getServerTranslations(recipientLocale).notificationsTranslations
  );

  const input: NotificationEmitInput = {
    userId: recipient.userId,
    type: NotificationType.SessionRequest,
    title,
    body,
    relatedEntityType: "session",
    relatedEntityId: sessionId,
    idempotencyKey: `session:${sessionId}:${waveKind}`,
  };

  if (tx !== undefined) {
    const result = await NotificationEngine.emitForUser(input, recipientLocale, tx, options);
    if (!("notifications" in result)) {
      throw new DomainError(
        "INTERNAL_SERVER_ERROR",
        getServerTranslations(locale).errorsTranslations.internalServerError
      );
    }
    return result;
  }

  const result = await NotificationEngine.emitForUser(input, recipientLocale, undefined, options);
  if ("notifications" in result) {
    return result;
  }
  return { notifications: [result], recipientUserIds: [recipient.userId] };
}

/**
 * Maps a governance wave kind onto the engine's closed notification-type
 * vocabulary: the cancel wave rides the dedicated cancellation type (its
 * feed label matches the event), while the reschedule and reassignment
 * waves ride the session-request envelope — the same session-domain wave
 * carrier every participant flow uses.
 */
function toGovernanceNotificationType(waveKind: SessionGovernanceWaveKind): NotificationType {
  return waveKind === "sessionGovernance.cancelled"
    ? NotificationType.SessionCancellation
    : NotificationType.SessionRequest;
}

/**
 * Composes a governance wave's title/body from the notifications namespace.
 * The copy is plain and factual — no participant names, no timing values,
 * no refund promises; the inbox links back to the session where the current
 * state is rendered. Exhaustive over the governance wave-kind union.
 */
function composeGovernanceWaveCopy(
  waveKind: SessionGovernanceWaveKind,
  tNotifications: ReturnType<typeof getServerTranslations>["notificationsTranslations"]
): { readonly title: string; readonly body: string } {
  switch (waveKind) {
    case "sessionGovernance.rescheduled":
      return {
        title: tNotifications.eventSessionGovernanceRescheduledTitle,
        body: tNotifications.eventSessionGovernanceRescheduledBody,
      };
    case "sessionGovernance.cancelled":
      return {
        title: tNotifications.eventSessionGovernanceCancelledTitle,
        body: tNotifications.eventSessionGovernanceCancelledBody,
      };
    case "sessionGovernance.teacherReassigned":
      return {
        title: tNotifications.eventSessionGovernanceTeacherReassignedTitle,
        body: tNotifications.eventSessionGovernanceTeacherReassignedBody,
      };
    default: {
      // Exhaustiveness guard — the wave-kind union makes this unreachable.
      const exhaustive: never = waveKind;
      throw new Error(`Unexpected governance wave kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * Resolves one governance-wave participant that is NOT derivable from the
 * session row's CURRENT state (the outgoing teacher after a reassignment
 * swap): reads the user row for the persisted locale. A vanished row is a
 * broken-contract situation mid-mutation and fails closed — the wave is
 * all-or-nothing with the mutation that caused it.
 */
async function resolveGovernanceParticipant(
  userId: number,
  locale: string,
  tx: DBTransaction | undefined
): Promise<SessionWaveParticipantContext> {
  const row = await UserRepository.findById(userId, tx);
  if (row === null) {
    logger.logDomainError("Session governance wave denied: recipient user row vanished", {
      code: "INTERNAL_SERVER_ERROR",
      entity: "session",
      entityId: userId,
      locale,
    });
    throw new DomainError("INTERNAL_SERVER_ERROR", getServerTranslations(locale).errorsTranslations.internalServerError);
  }
  return { userId: row.id, fullName: row.fullName, locale: row.locale };
}

/** One recipient's fully-composed, locale-resolved emit — no I/O left but the engine call. */
interface GovernanceEmitPlan {
  readonly input: NotificationEmitInput;
  readonly recipientLocale: string;
  readonly recipientUserId: number;
}

/**
 * Composes every recipient's emit plan synchronously (copy in the
 * RECIPIENT's persisted locale; the engine's claim recipe folds the
 * recipient cohort into the hashed claim identity, so one wave-level key
 * stays per-recipient deterministic).
 */
function planGovernanceWave(
  wave: SessionWaveContext,
  waveKind: SessionGovernanceWaveKind,
  recipients: readonly SessionWaveParticipantContext[]
): GovernanceEmitPlan[] {
  const type = toGovernanceNotificationType(waveKind);
  return recipients.map(recipient => {
    const recipientLocale = recipient.locale ?? defaultLocale;
    const { title, body } = composeGovernanceWaveCopy(
      waveKind,
      getServerTranslations(recipientLocale).notificationsTranslations
    );
    return {
      input: {
        userId: recipient.userId,
        type,
        title,
        body,
        relatedEntityType: "session",
        relatedEntityId: wave.sessionId,
        idempotencyKey: `session:${wave.sessionId}:${waveKind}`,
      },
      recipientLocale,
      recipientUserId: recipient.userId,
    } satisfies GovernanceEmitPlan;
  });
}

/**
 * Head-first sequential receipt walk over the composed emit plans (the
 * recursive-helper shape of the shared refund walk: every engine call
 * happens ACROSS an await, never inside a loop body). Caller-tx emissions
 * return the engine's unpublished receipt verbatim; transaction-less
 * emissions normalize the engine's single-row return into receipt shape.
 */
async function emitGovernanceReceiptsFrom(
  plans: readonly GovernanceEmitPlan[],
  index: number,
  tx: DBTransaction | undefined,
  options: NotificationEngineCallOptions | undefined
): Promise<NotificationDeliveryReceipt[]> {
  if (index >= plans.length) {
    return [];
  }
  const plan = plans[index];
  const rest = await emitGovernanceReceiptsFrom(plans, index + 1, tx, options);
  if (tx !== undefined) {
    const result = await NotificationEngine.emitForUser(plan.input, plan.recipientLocale, tx, options);
    if (!("notifications" in result)) {
      throw new DomainError(
        "INTERNAL_SERVER_ERROR",
        getServerTranslations(plan.recipientLocale).errorsTranslations.internalServerError
      );
    }
    return [result, ...rest];
  }
  const result = await NotificationEngine.emitForUser(plan.input, plan.recipientLocale, undefined, options);
  if ("notifications" in result) {
    return [result, ...rest];
  }
  return [{ notifications: [result], recipientUserIds: [plan.recipientUserId] }, ...rest];
}

/**
 * Delivers one governance wave to EVERY recipient and returns the delivery
 * receipts in recipient order. See the module docblock: the receipts are
 * UNPUBLISHED on the caller-transaction path — the calling flow publishes
 * strictly after its own commit via `NotificationEngine.publishReceipts`.
 */
async function emitGovernanceWave(
  wave: SessionWaveContext,
  waveKind: SessionGovernanceWaveKind,
  recipients: readonly SessionWaveParticipantContext[],
  tx: DBTransaction | undefined,
  options: NotificationEngineCallOptions | undefined
): Promise<NotificationDeliveryReceipt[]> {
  return emitGovernanceReceiptsFrom(planGovernanceWave(wave, waveKind, recipients), 0, tx, options);
}

export namespace SessionRequestNotificationService {
  /** Teacher-facing wave: a student requested a session. */
  export async function notifyTeacherOfSessionRequest(
    sessionId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt> {
    return emitWave(sessionId, "teacher_request", "teacher", locale, tx, options);
  }

  /** Student-facing wave: the teacher accepted the request. */
  export async function notifyStudentOfSessionAccepted(
    sessionId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt> {
    return emitWave(sessionId, "outcome_accepted", "student", locale, tx, options);
  }

  /** Student-facing wave: the teacher declined the request. */
  export async function notifyStudentOfSessionDeclined(
    sessionId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt> {
    return emitWave(sessionId, "outcome_declined", "student", locale, tx, options);
  }

  /** Student-facing wave: the request was auto-rejected by the teacher's preference. */
  export async function notifyStudentOfSessionAutoRejected(
    sessionId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt> {
    return emitWave(sessionId, "outcome_auto_rejected", "student", locale, tx, options);
  }

  /** Student-facing wave: the request was queued for the teacher. */
  export async function notifyStudentOfSessionQueued(
    sessionId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt> {
    return emitWave(sessionId, "outcome_queued", "student", locale, tx, options);
  }

  /** Student-facing wave: alternative teachers were offered. */
  export async function notifyStudentOfAlternativesOffered(
    sessionId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt> {
    return emitWave(sessionId, "outcome_alternatives_offered", "student", locale, tx, options);
  }

  /**
   * Admin-governance wave: the session's timing pair was rescheduled.
   * Recipients: the student and the (current) teacher, each in their own
   * persisted locale. The calling flow owns the gate and the publish —
   * this emitter only persists the receipts.
   */
  export async function notifySessionGovernanceRescheduled(
    sessionId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt[]> {
    const wave = await resolveWaveContext(sessionId, locale, tx);
    return emitGovernanceWave(wave, "sessionGovernance.rescheduled", [wave.student, wave.teacher], tx, options);
  }

  /**
   * Admin-governance wave: the session was cancelled by an administrator.
   * Recipients: the student and the (current) teacher, each in their own
   * persisted locale. The calling flow owns the gate and the publish.
   */
  export async function notifySessionGovernanceCancelled(
    sessionId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt[]> {
    const wave = await resolveWaveContext(sessionId, locale, tx);
    return emitGovernanceWave(wave, "sessionGovernance.cancelled", [wave.student, wave.teacher], tx, options);
  }

  /**
   * Admin-governance wave: the session's teacher was reassigned. Recipients:
   * the student, the OUTGOING teacher (resolved by id — the row no longer
   * references them after the guarded swap), and the incoming teacher, each
   * in their own persisted locale. The calling flow owns the gate and the
   * publish.
   */
  export async function notifySessionGovernanceTeacherReassigned(
    sessionId: number,
    outgoingTeacherUserId: number,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt[]> {
    const wave = await resolveWaveContext(sessionId, locale, tx);
    const outgoing = await resolveGovernanceParticipant(outgoingTeacherUserId, locale, tx);
    return emitGovernanceWave(
      wave,
      "sessionGovernance.teacherReassigned",
      [wave.student, outgoing, wave.teacher],
      tx,
      options
    );
  }
}
