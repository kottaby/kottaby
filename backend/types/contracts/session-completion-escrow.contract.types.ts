/**
 * Dual Confirmation & Escrow Trio contract (Dev 3 → Dev 1 + Dev 2).
 *
 * Escrow-trigger construction requires both party confirmations and is
 * funneled through a single constructor helper; wallet credits are
 * session-linked earnings, immutable post-insert.
 */
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import type { TeacherTransactionSelectType } from "@/backend/types/billing/teacher-transaction.types";
import type { WalletSelectType } from "@/backend/types/billing/wallet.types";
import type { SessionSelectType } from "@/backend/types/classes/session.types";

export const WALLET_CREDIT_TRANSACTION_TYPE = TransactionType.Earning;
export const WALLET_CREDIT_TRANSACTION_STATUS = TransactionStatus.Completed;

/**
 * Caller-timestamp partials advance ONLY their own column;
 * full state is re-read from DB.
 * Escrow trigger NOT constructible from two independent half-confirms
 * — read-modify-write is required.
 */
export interface DualConfirmationState {
  readonly sessionId: SessionSelectType["id"];
  readonly confirmedByTeacherAt: SessionSelectType["confirmedByTeacherAt"];
  readonly confirmedByStudentAt: SessionSelectType["confirmedByStudentAt"];
  readonly confirmationDeadline: NonNullable<SessionSelectType["confirmationDeadline"]>;
}

/**
 * INV-S3 — unconstructible unless BOTH timestamps are non-null.
 * Construct via `buildEscrowTrigger()` ONLY (Decision #3 — constructor-funnel).
 */
export interface EscrowTriggerContract {
  readonly sessionId: SessionSelectType["id"];
  readonly confirmedByTeacherAt: NonNullable<DualConfirmationState["confirmedByTeacherAt"]>;
  readonly confirmedByStudentAt: NonNullable<DualConfirmationState["confirmedByStudentAt"]>;
  readonly idempotencyKey: string;
}

/**
 * INV-W4/W7/W8 — earning-only, session-linked, immutable post-insert (INV-W6).
 * Financial records immutable post-insert — NO `updateWalletCredit` shape may exist
 * anywhere in the library. Non-negative enforced by INV-W8 + DB check (consumer).
 */
export interface WalletCreditContract {
  readonly walletId: WalletSelectType["id"];
  /** INV-W7 — earnings link; narrowed non-null. */
  readonly sessionId: NonNullable<TeacherTransactionSelectType["sessionId"]>;
  /** Decimal string preserved verbatim — REQ-011. */
  readonly amount: TeacherTransactionSelectType["amount"];
  readonly type: typeof WALLET_CREDIT_TRANSACTION_TYPE;
  readonly status: typeof WALLET_CREDIT_TRANSACTION_STATUS;
  /** docs/IDEMPOTENCY.md (REQ-027). */
  readonly idempotencyKey: string;
}

/** REQ-020 — literal union localized ONLY in this file. Reused by DEV3-012/013. */
export type EscrowReleaseReason = "CancellationConfirmed" | "ConfirmationTimeout";

/**
 * Cancellation/auto-timeout release. Cannot carry money —
 * no `amount` or `walletId` fields exist (structurally disjoint from WalletCreditContract).
 *
 * **REQ-040:** `holdIdempotencyKey` identifies the hold being reversed;
 * optional because pre-hold aborts never flow here.
 *
 * **REQ-044 note:** Consumers translating PG 23505 unique-constraint violations
 * into `ConflictError` MUST traverse `Error.cause` chain
 * (see docs/auth/user-registration.md §6). This library does NOT implement
 * that translation — it is a consumer concern.
 */
export interface EscrowReleaseContract {
  readonly sessionId: SessionSelectType["id"];
  readonly releaseReason: EscrowReleaseReason;
  /** REQ-040 — identity of the hold being reversed; optional for pre-hold aborts. */
  readonly holdIdempotencyKey?: string;
  /** docs/IDEMPOTENCY.md (REQ-027). */
  readonly idempotencyKey: string;
}
