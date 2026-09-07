/**
 * Per-row in-flight slot book for the student sessions container —
 * sessionId → the set of action kinds currently in flight FOR THAT ROW.
 * Immutable records + copied sets only: the React state is never mutated
 * in place, so every `setState` yields a new snapshot and per-row slots
 * clear independently. The open/close/predicate mechanics delegate to the
 * role-neutral slot book in `sessionRowSlotBook` binding the student's
 * `RowActionKind` vocabulary.
 */

import { createSessionSlotBook, type InFlightSlotBook } from "@/frontend/views/student/sessions/sessionRowSlotBook";

/**
 * Per-row action kinds tracked in the container's in-flight slots. `cancel`
 * is reserved for the dialog-owned mutation (its busy state lives inside
 * `CancelSessionConfirmDialog`); `dispute` marks the row whose dispute
 * dialog is open (the dialog-owned mutation — the per-row slot book
 * extended with the dispute kind); `confirm` marks the row whose
 * confirm mutation is in flight (container-owned, no dialog).
 */
type RowActionKind = "cancel" | "dispute" | "confirm";

/** The immutable in-flight slot book state shape. */
export type InFlightSlots = InFlightSlotBook<RowActionKind>;

/** The slot book bound to the student's kind vocabulary. */
const slotHelpers = createSessionSlotBook<RowActionKind>();

/** Opens a row+kind slot / closes it / tests membership (pure — see `sessionRowSlotBook`). */
export const { addInFlightAction, removeInFlightAction, isInFlight } = slotHelpers;
