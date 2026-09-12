import type { DisputeResolution } from "@/backend/enum/scheduling/dispute-resolution.enum";
import type { AdminAuditLogEntryReturnType } from "@/backend/types/audit/audit-trail.types";
import type { HomeWorkReturnType } from "@/backend/types/classes/home-work.types";
import type { RecitationReturnType } from "@/backend/types/classes/recitation.types";
import type { ReportReturnType } from "@/backend/types/classes/report.types";
import type { SessionReturnType, SessionSelectType } from "@/backend/types/classes/session.types";

/**
 * Post-confirmation session arbitration — the canonical types for the
 * consumed-escrow dispute path.
 *
 * A dual-confirmed session (`completed`, escrow consumed, teacher wallet
 * credited) may be disputed by the student; an admin then arbitrates with a
 * binding outcome out of the consumed-escrow `DisputeResolution` members
 * (`Refund` | `PartialRefund` | `Uphold`). The held-escrow dispute
 * generation (`scheduled`/`started` rows, resolved with `Cancel`/`Complete`)
 * shares the vocabulary but none of these types — its machinery lives in the
 * shipped session lifecycle.
 *
 * Every shape here is a read/call contract between the service layer and its
 * callers (GraphQL resolvers, sibling services): nothing in this file is
 * exposed to clients directly — the GraphQL surface binds its own object
 * types to these canonical shapes.
 */

/**
 * Arbitration classification probe: the escrow-focused column projection a
 * service reads to classify a disputed row before arbitrating it — row
 * identity, lifecycle state, both participants, and the financial facts that
 * discriminate the two dispute generations and drive the outcome legs
 * (`fee` amount, `feeHeld` hold marker, the permanent provenance lane, and
 * the student's dual-confirmation stamp). Extends the shipped transition
 * probe convention: a minimal `Pick` projection of the select row, read on
 * the cold path only — a probe read never gates or feeds a write.
 *
 * Member types flow straight from the schema select row: `fee` is the
 * decimal string (money is never re-typed), `feeHeld` stays column-nullable,
 * `heldBalanceLane` carries the `HeldBalanceLane | null` provenance
 * vocabulary via the column's type binding (NULL only while no fee was ever
 * held), and `confirmedByStudentAt` is `Date | null`.
 */
export type SessionArbitrationProbeType = Pick<
  SessionSelectType,
  "id" | "status" | "studentId" | "teacherId" | "fee" | "feeHeld" | "heldBalanceLane" | "confirmedByStudentAt"
>;

/**
 * The strict arbitration payload for the consumed-escrow outcomes: the
 * acting admin's identity, the target session, the binding outcome, the
 * optional free-text resolution note, the optional partial-refund amount,
 * and the copy locale for localized rejections.
 *
 * `adminId` is the authenticated actor resolved server-side — never a
 * client assertion. `resolution` is the outcome selector only; which
 * members are legal for a given row is a service-layer classification
 * decision (held escrow stays on `Cancel`/`Complete`, consumed escrow on
 * `Refund`/`PartialRefund`/`Uphold`), enforced before any write.
 * `note` and `partialAmount` are explicit `string | null` — never
 * `undefined` — so an absent amount is distinguishable from a lost field.
 * `partialAmount` is a decimal string carried verbatim (two-fraction
 * money, strictly between zero and the session fee, legal only with the
 * partial outcome); the amount's validation and the wallet/lane legs it
 * drives are service concerns, not payload concerns.
 */
export interface ArbitrateDisputeInput {
  readonly adminId: number;
  readonly sessionId: number;
  readonly resolution: DisputeResolution;
  readonly note: string | null;
  readonly partialAmount: string | null;
  readonly locale: string;
}

/**
 * Admin case-review read: the complete evidence bundle an admin's
 * arbitration decision is based on, in one response — the full session row
 * (dispute reason, stamps, fee, hold marker, provenance lane), the session
 * report with its homework row, the recitation record, and the
 * session-scoped audit trail.
 *
 * Absent artifacts are honest `null`s — a session with no submitted report,
 * homework, or recitation renders no fabricated placeholder. The audit
 * trail entries are the canonical rendered admin-trail rows
 * (`AdminAuditLogEntryReturnType`), newest-first, and carry no note content
 * beyond what the audit convention already records.
 */
export interface AdminDisputeCaseReturnType {
  readonly session: SessionReturnType;
  readonly report: ReportReturnType | null;
  readonly homework: HomeWorkReturnType | null;
  readonly recitation: RecitationReturnType | null;
  readonly auditTrail: readonly AdminAuditLogEntryReturnType[];
}
