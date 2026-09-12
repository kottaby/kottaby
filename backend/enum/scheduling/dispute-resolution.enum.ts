/**
 * DisputeResolution enum — the admin arbitration vocabulary for exiting the
 * `disputed` lifecycle state. Values are canonical and wire-identical (the
 * GraphQL enum member name and its runtime value are the same string).
 * There is NO pgEnum backing this vocabulary — it is a pure transition
 * selector carried on the arbitration mutation, never stored as a column
 * value (the outcome it selects is recorded in `session.status`).
 *
 * Domain contract: `disputed` is NOT terminal — every disputed session is
 * resolved by an admin to exactly one terminal state. The vocabulary serves
 * the two dispute generations, discriminated by the session's `fee_held`
 * flag at dispute time:
 *
 * Held escrow (the fee is still held when the dispute opens):
 *  - `Cancel`   → the session becomes `cancelled`; the held fee is refunded
 *                 to its recorded provenance lane inside the arbitration
 *                 transaction (the same-lane primitive the participant
 *                 cancel uses).
 *  - `Complete` → the session becomes `completed`; the held fee is
 *                 consumed (`fee_held = false`, no wallet credit). A
 *                 disputed session that never started cannot complete.
 *
 * Consumed escrow (post-confirmation dispute — the fee is already the
 * teacher's credited earning, so an adverse outcome reverses value):
 *  - `Refund`        → the session returns to `completed`; the full
 *                      session fee is reversed from the teacher's wallet
 *                      via a compensating ledger row, and the student's
 *                      recorded provenance lane is restored one session
 *                      credit (lanes are integer credits, so any refund
 *                      degree restores exactly one).
 *  - `PartialRefund` → the session returns to `completed`; a validated
 *                      partial amount is reversed from the teacher's
 *                      wallet the same compensating way, and the
 *                      student's provenance lane is likewise restored one
 *                      full session credit. The amount must be strictly
 *                      between zero and the session fee.
 *  - `Uphold`        → the session returns to `completed` as legitimately
 *                      finished; zero wallet or lane writes.
 */
export enum DisputeResolution {
  Cancel = "Cancel",
  Complete = "Complete",
  Refund = "Refund",
  PartialRefund = "PartialRefund",
  Uphold = "Uphold",
}

/**
 * Type guard for a runtime dispute-resolution value (from a transport
 * payload that may have skipped the GraphQL enum boundary). Returns `true`
 * only for exact member strings — the guard fails closed on any other
 * input (wrong type, case mismatch, whitespace, foreign values) rather
 * than throwing.
 */
export function isDisputeResolution(value: unknown): value is DisputeResolution {
  return typeof value === "string" && (Object.values(DisputeResolution) as string[]).includes(value);
}
