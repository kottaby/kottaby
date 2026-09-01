/**
 * ParentLinkRequestService — business-logic hub for the parent→child link
 * request workflow (DEV1-014; plan §4.2/§4.3).
 *
 * Five operations compose the `parent_link_requests` append-and-transition
 * repository with the guarded student link write and the real-time
 * notification engine:
 *
 *  - `requestLink` — a parent submits a handshake code; the pipeline is
 *    STRICTLY ordered (REQ-011): normalize+validate the code PRE-DB, fresh
 *    actor re-check, then ONE `withTransaction`: one captured `now`, target
 *    discovery, governance collapse, already-linked / already-pending
 *    conflicts (with the partial-unique 23505 arbiter as the race backstop),
 *    field-by-field insert, recipient-locale copy composition, in-tx emit;
 *    the realtime publish happens ONLY on the own-commit path.
 *  - `respondToLinkRequest` — the deciding student accepts or rejects via
 *    the guarded claim; the accept branch writes the link through
 *    `StudentRepository.linkParentIfUnlinked` (the ONLY production writer of
 *    a non-null `students.parent_id`) whose zero-row collapse THROWS and
 *    rolls back the whole transaction (ghost confirmations are impossible),
 *    then expires sibling pendings; the reject branch writes nothing but the
 *    claim. The parent is notified in the parent's persisted locale, in-tx.
 *  - `cancelLinkRequest` — the requesting parent withdraws a live pending
 *    request; withdrawal FOLDS the row to `rejected` and is SILENT (zero
 *    notifications, zero publishes — REQ-018).
 *  - `listMyOutgoing` / `listMyIncoming` — self-scoped history reads with a
 *    RELAXED actor re-check (identity + role; governance state must not
 *    hide the actor's own request history from him), render-time expiry
 *    mapping (a stored `pending` row whose `expiresAt <= now` surfaces as
 *    `LinkStatus.Expired` WITHOUT any write — read purity, REQ-015).
 *
 * Disciplines enforced here:
 *  - Defense-in-depth actor re-check (REQ-031) — ONE module-private function
 *    used by every mutation and read: a FRESH `UserRepository.findById` of
 *    the actor id; missing or non-positive id → `UnauthorizedError`; role
 *    mismatch → `ForbiddenError`; governed (deleted/blocked/suspended) →
 *    `ForbiddenError` with the SAME constant copy (no branch disclosure).
 *    Every denial logs exactly ONE bounded `logDomainError` and performs
 *    ZERO writes and ZERO notifications. Mutations enforce the governance
 *    arm; the relaxed reads do not (they are self-scoped on the verified id).
 *  - Constant-shape not-found (REQ-034): a request id that does not resolve
 *    for the actor is denied exactly like a nonexistent id — foreign ≡
 *    nonexistent, byte-shaped — never an oracle for id enumeration.
 *  - Copy composition: recipient locale is resolved at the EMITTER
 *    (`UserRepository.findLocalesByIds` + `defaultLocale` fallback) and the
 *    `eventParentLink*` copy is composed through
 *    `getServerTranslations(recipientLocale).notificationsTranslations` —
 *    never the caller's locale, never hardcoded strings.
 *  - Notifications: `NotificationEngine.emitForUser(..., tx, options)` writes
 *    the inbox row INSIDE the transaction (single-writer rule);
 *    `NotificationEngine.publishReceipts` runs ONLY when this call owned the
 *    commit (outerTx === undefined) — a caller-owned transaction NEVER
 *    publishes (the caller owns the commit boundary).
 *  - Log hygiene (REQ-054): happy paths emit NOTHING; every expected denial
 *    emits exactly ONE `logDomainError` whose context bag is EXACTLY
 *    `{ code, entity: "parent_link_requests" | "students" | "users",
 *    entityId?, locale }` — NEVER a name, an email, or the submitted
 *    handshake code.
 *  - Zero audit rows: nothing on this surface writes `audit_logs` (the
 *    journey's Step-9 integrity probe depends on it).
 *
 * Implementation detail: the module-private machinery (actor re-check,
 * collapse classifier, denial raiser, tx pipeline halves, read renderers)
 * lives in `./parent-link-request.helpers` — extracted solely to honor the
 * repo's `max-lines`/`max-lines-per-function` budgets; the public surface is
 * exactly the five-operation namespace below.
 */

import {
  type IncomingParentLinkRequestRow,
  type OutgoingParentLinkRequestRow,
  ParentLinkRequestRepository,
  StudentRepository,
  UserRepository,
} from "@/backend/db/repo";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { LinkStatus } from "@/backend/enum/shared/link-status.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import {
  NotificationEngine,
  type NotificationEngineCallOptions,
} from "@/backend/services/notifications/notification-engine.service";
import {
  classifyUnclaimableRequest,
  emitRequestNotificationTx,
  insertPendingRequestTx,
  isDeliveryReceipt,
  mapIncoming,
  mapOutgoing,
  PARENT_LINK_RELATED_ENTITY_TYPE,
  raiseUnclaimableDenial,
  requireActor,
  toCanonicalLinkStatus,
  type UnclaimableDenial,
} from "@/backend/services/parents/parent-link-request.helpers";
import type {
  DBTransaction,
  IncomingParentLinkRequestReturnType,
  NotificationDeliveryReceipt,
  OutgoingParentLinkRequestReturnType,
} from "@/backend/types";
import { isHandshakeCode, normalizeHandshakeCode } from "@/shared/constants/handshake-code.constants";
import { maskFullName } from "@/shared/lib/mask-full-name";
import { defaultLocale } from "@/shared/locale/AppLocale";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Internal respond outcome — the claimed success payload, or the classified denial. */
type RespondOutcome =
  | {
      kind: "claimed";
      row: IncomingParentLinkRequestRow;
      receipt: NotificationDeliveryReceipt;
      parentLocale: string;
    }
  | { kind: "denied"; denial: UnclaimableDenial };

/** Internal cancel outcome — the folded row, or the classified denial. */
type CancelOutcome =
  | { kind: "cancelled"; row: OutgoingParentLinkRequestRow }
  | { kind: "denied"; denial: UnclaimableDenial };

export namespace ParentLinkRequestService {
  /**
   * A parent submits a link request for the student owning `code`.
   *
   * Ordered pipeline (REQ-011 — each step strictly before the next):
   *  1. Normalize (trim, uppercase) + validate the code — a malformed input
   *     rejects with a localized `ValidationError` BEFORE any database read;
   *     the submitted string is never logged.
   *  2. Fresh parent re-check (identity + role + governance).
   *  3. ONE `withTransaction(outerTx, …)` with ONE captured `now`:
   *     discovery → null-collapse (missing ≡ governed, REQ-012) →
   *     already-linked conflict → already-pending conflict (pre-check + the
   *     partial-unique 23505 arbiter) → field-by-field insert →
   *     recipient-locale copy → in-tx emit.
   *  4. Own-commit path ONLY: one post-commit `publishReceipts`.
   *
   * @returns The outgoing payload (masked student name, verbatim inserted
   *     timestamps), or `null` when the code matches no eligible student —
   *     byte-identical for a missing code and a governed child.
   * @throws ValidationError  malformed code (pre-DB).
   * @throws ConflictError    `PARENT_LINK_TARGET_ALREADY_LINKED` or
   *     `PARENT_LINK_ALREADY_PENDING` (pre-check or 23505 arbiter).
   */
  export async function requestLink(
    code: string,
    parentActorId: number,
    locale: string,
    outerTx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<OutgoingParentLinkRequestReturnType | null> {
    const t = getServerTranslations(locale).errorsTranslations;

    // 1. Normalize THEN validate — strictly before any database read.
    const normalized = normalizeHandshakeCode(code);
    if (!isHandshakeCode(normalized)) {
      logger.logDomainError("Parent-link request rejected: malformed handshake code submitted", {
        code: "VALIDATION",
        entity: "students",
        locale,
      });
      throw new ValidationError(t.handshakeCodeInvalid);
    }

    // 2. Fresh actor re-check (parent) — governance enforced on mutations.
    const actor = await requireActor(parentActorId, UserRole.Parent, locale, outerTx, true);

    // 3. ONE atomic unit — own commit or the caller's savepoint.
    const outcome = await withTransaction(outerTx, async tx => {
      const inserted = await insertPendingRequestTx(normalized, parentActorId, locale, tx);
      if (inserted === null) {
        return null;
      }
      const emitted = await emitRequestNotificationTx(
        inserted.studentId,
        inserted.created.id,
        actor.fullName,
        tx,
        options
      );
      return {
        created: inserted.created,
        targetFullName: inserted.targetFullName,
        receipt: emitted.receipt,
        recipientLocale: emitted.recipientLocale,
      };
    });

    if (outcome === null) {
      return null;
    }

    // 4. Publish AFTER commit — and only when THIS call owns the commit.
    if (outerTx === undefined) {
      await NotificationEngine.publishReceipts([outcome.receipt], outcome.recipientLocale, options);
    }

    return {
      id: outcome.created.id,
      status: toCanonicalLinkStatus(outcome.created.status, outcome.created.id),
      studentMaskedName: maskFullName(outcome.targetFullName),
      createdAt: outcome.created.createdAt,
      expiresAt: outcome.created.expiresAt,
      respondedAt: outcome.created.respondedAt,
    };
  }

  /**
   * The deciding student accepts (`accept = true`) or rejects
   * (`accept = false`) one of his incoming requests.
   *
   * The guarded claim is the FIRST statement inside the transaction; its
   * zero-row collapse is re-classified via `findById` (nonexistent ≡ foreign
   * → constant `PARENT_LINK_REQUEST_NOT_FOUND`; resolved →
   * `PARENT_LINK_REQUEST_ALREADY_RESOLVED`; pending-but-stale → the expiry is
   * MATERIALIZED in a unit that SURVIVES the denial (REQ-094 — the row
   * persists as `expired`) then `PARENT_LINK_REQUEST_EXPIRED`). The accept branch then
   * writes the link through the guarded `linkParentIfUnlinked` — a zero-row
   * collapse there THROWS and rolls back the ENTIRE transaction (claim
   * included; ghost confirmations are impossible) — and expires the
   * student's sibling pendings. Both branches notify the PARENT in the
   * parent's persisted locale, in-tx; publish on own-commit only.
   *
   * @returns The incoming payload re-read via `findIncomingRowById` (carries
   *     the parent's full display name).
   */
  export async function respondToLinkRequest(
    requestId: number,
    accept: boolean,
    studentActorId: number,
    locale: string,
    outerTx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<IncomingParentLinkRequestReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    // Fresh actor re-check (student) — governance enforced on mutations.
    const actor = await requireActor(studentActorId, UserRole.Student, locale, outerTx, true);

    const outcome = await withTransaction(outerTx, async (tx): Promise<RespondOutcome> => {
      const now = new Date(); // ONE captured instant: claim stamp + liveness.

      const claim = await ParentLinkRequestRepository.respondToPendingForStudent(
        requestId,
        studentActorId,
        accept ? LinkStatus.Confirmed : LinkStatus.Rejected,
        now,
        tx
      );

      if (claim === null) {
        // Zero-row collapse — classify honestly and READ-ONLY inside the
        // unit; the denial itself is raised AFTER the boundary so the
        // REQ-094 expiry fold can survive the throw (own-commit path).
        const denial = await classifyUnclaimableRequest(requestId, studentActorId, "student", tx);
        return { kind: "denied", denial };
      }

      if (accept) {
        // The guarded link write is the FINAL arbiter (D3): a zero-row
        // collapse means the student was linked concurrently — the THROW
        // rolls back the whole transaction (claim + expiry + notification).
        const linked = await StudentRepository.linkParentIfUnlinked(studentActorId, claim.parentId, tx);
        if (linked === null) {
          logger.logDomainError("Parent-link confirm rejected: the student is already linked", {
            code: "PARENT_LINK_TARGET_ALREADY_LINKED",
            entity: "students",
            entityId: studentActorId,
            locale,
          });
          throw new ConflictError("PARENT_LINK_TARGET_ALREADY_LINKED", t.parentLinkTargetAlreadyLinked);
        }
        // REQ-091: sibling pendings of the winner's student are terminal.
        await ParentLinkRequestRepository.expireSiblingPendingsForStudent(studentActorId, claim.id, tx);
      }
      // Reject branch: NO students write, NO sibling expiry — rejection
      // leaves the student's other pendings live ("children choose parents").

      // The PARENT is the notified party (accepted and rejected copy alike),
      // in the PARENT's persisted locale.
      const parentLocales = await UserRepository.findLocalesByIds([claim.parentId], tx);
      const parentLocale = parentLocales.get(claim.parentId) ?? defaultLocale;
      const parentCopy = getServerTranslations(parentLocale).notificationsTranslations;

      const emitted = await NotificationEngine.emitForUser(
        {
          userId: claim.parentId,
          type: NotificationType.ParentLinkRequest,
          title: accept ? parentCopy.eventParentLinkAcceptedTitle : parentCopy.eventParentLinkRejectedTitle,
          body: accept
            ? parentCopy.eventParentLinkAcceptedBody(actor.fullName)
            : parentCopy.eventParentLinkRejectedBody(actor.fullName),
          relatedEntityType: PARENT_LINK_RELATED_ENTITY_TYPE,
          relatedEntityId: claim.id,
        },
        parentLocale,
        tx,
        options
      );
      if (!isDeliveryReceipt(emitted)) {
        throw new Error(
          "ParentLinkRequestService.respondToLinkRequest: in-tx emit returned a row instead of the receipt"
        );
      }

      const row = await ParentLinkRequestRepository.findIncomingRowById(claim.id, tx);
      if (row === null) {
        throw new Error("ParentLinkRequestService.respondToLinkRequest: claimed row vanished before the read-back");
      }

      return { kind: "claimed", row, receipt: emitted, parentLocale };
    });

    if (outcome.kind === "denied") {
      throw await raiseUnclaimableDenial(requestId, outcome.denial, locale, outerTx);
    }

    if (outerTx === undefined) {
      await NotificationEngine.publishReceipts([outcome.receipt], outcome.parentLocale, options);
    }

    return mapIncoming(outcome.row, new Date());
  }

  /**
   * The requesting parent withdraws one of his live pending requests.
   *
   * The withdrawal FOLDS the row to `rejected` (the flipped row persists
   * forever as request history) and is SILENT: zero notifications, zero
   * publishes, on success AND on every denial arm (REQ-018). Zero-row
   * collapse re-classifies exactly like the respond path (constant not-found
   * shape; already-resolved conflict; pending-but-stale materializes the
   * expiry first).
   *
   * @returns The outgoing payload re-read via `findOutgoingRowById`.
   */
  export async function cancelLinkRequest(
    requestId: number,
    parentActorId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<OutgoingParentLinkRequestReturnType> {
    // Fresh actor re-check (parent) — governance enforced on mutations.
    await requireActor(parentActorId, UserRole.Parent, locale, outerTx, true);

    const outcome = await withTransaction(outerTx, async (tx): Promise<CancelOutcome> => {
      const now = new Date();

      const cancelled = await ParentLinkRequestRepository.cancelPendingForParent(requestId, parentActorId, now, tx);
      if (cancelled === null) {
        // Zero-row collapse — classify READ-ONLY here; the denial (and the
        // REQ-094 expiry fold on the expired arm) is raised after the
        // boundary so the fold survives the throw on the own-commit path.
        const denial = await classifyUnclaimableRequest(requestId, parentActorId, "parent", tx);
        return { kind: "denied", denial };
      }

      const row = await ParentLinkRequestRepository.findOutgoingRowById(requestId, tx);
      if (row === null) {
        throw new Error("ParentLinkRequestService.cancelLinkRequest: cancelled row vanished before the read-back");
      }
      return { kind: "cancelled", row };
    });

    if (outcome.kind === "denied") {
      throw await raiseUnclaimableDenial(requestId, outcome.denial, locale, outerTx);
    }

    // Silent withdrawal: NO emit, NO publish — on this and every arm.
    return mapOutgoing(outcome.row, new Date());
  }

  /**
   * The requesting parent's link-request history (newest first, LIMIT 50),
   * self-scoped on the VERIFIED actor id. Relaxed re-check: identity + role
   * only — a governed parent still sees his own history. Render-time expiry:
   * a stored `pending` row with `expiresAt <= now` surfaces
   * `LinkStatus.Expired` WITHOUT any write (read purity, REQ-015). Reads
   * never publish.
   */
  export async function listMyOutgoing(
    parentActorId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<OutgoingParentLinkRequestReturnType[]> {
    await requireActor(parentActorId, UserRole.Parent, locale, tx, false);
    const rows = await ParentLinkRequestRepository.listOutgoingForParent(parentActorId, tx);
    const now = new Date(); // ONE render instant for the whole page.
    return rows.map(row => mapOutgoing(row, now));
  }

  /**
   * The deciding student's incoming link-request history (newest first,
   * LIMIT 50), self-scoped on the VERIFIED actor id. Relaxed re-check and
   * render-time expiry mapping exactly like `listMyOutgoing`; each row
   * carries the requesting parent's FULL display name (the deciding student
   * must know who is asking). Reads never publish.
   */
  export async function listMyIncoming(
    studentActorId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<IncomingParentLinkRequestReturnType[]> {
    await requireActor(studentActorId, UserRole.Student, locale, tx, false);
    const rows = await ParentLinkRequestRepository.listIncomingForStudent(studentActorId, tx);
    const now = new Date(); // ONE render instant for the whole page.
    return rows.map(row => mapIncoming(row, now));
  }
}
