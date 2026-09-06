/**
 * Teacher sessions — shared slot-book vocabulary and pure helpers.
 *
 * Extracted verbatim from `TeacherSessionsContainer` (the max-lines split):
 * the per-row in-flight slot book (`Record<sessionId, Set<actionKind>>`),
 * its immutable open/close/predicate helpers, the row-alert dropper, and
 * the module-scope constants shared by the container, its hooks, and the
 * mutation error-arm router. All functions here are PURE — no React, no
 * Apollo — so every `setState` consumer stays on stable `useCallback` deps.
 */

import { createSessionSlotBook, type InFlightSlotBook } from "@/frontend/views/student/sessions/sessionRowSlotBook";

/** Snackbar autohide — parity with the app-scope `GraphQLErrorSurfaceHost` toasts. */
export const SNACKBAR_AUTOHIDE_MS = 6000;

/** `__typename` of the normalized `Session` cache entity. */
export const SESSION_TYPE_NAME = "Session";

/** Unmapped lifecycle-reject code (the mapping table defines NO row for it). */
export const SESSION_INVALID_TRANSITION_CODE = "SESSION_INVALID_TRANSITION";

/** Unmapped certification-reject code (no mapping row — caller-kept arm). */
export const TEACHER_NOT_CERTIFIED_CODE = "TEACHER_NOT_CERTIFIED";

/** One transient container-level notice rendered in the MUI Snackbar slot. */
export interface ContainerNotice {
  readonly message: string;
  readonly severity: "success" | "info" | "error";
}

/**
 * Per-row lifecycle action kinds tracked in the container's in-flight slots.
 * `cancel` is reserved for the dialog-owned mutation (its busy state lives
 * inside `CancelSessionConfirmDialog`); `dispute` marks the row whose
 * dispute dialog is open (dialog-owned mutation — the slot book extended
 * with the dispute kind); the container slots start/complete.
 */
export type RowActionKind = "start" | "complete" | "cancel" | "dispute";

/**
 * In-flight slot book — sessionId → the set of action kinds currently in
 * flight FOR THAT ROW. Immutable records + copied sets only: the
 * React state is never mutated in place, so every `setState` yields a new
 * snapshot and per-row slots clear independently of their siblings. The
 * open/close/predicate mechanics delegate to the role-neutral slot book in
 * the student folder's `sessionRowSlotBook`, binding THIS role's kind
 * vocabulary.
 */
export type InFlightSlots = InFlightSlotBook<RowActionKind>;

/** Removes one row-scoped alert entry (pure — stable `useCallback` deps). */
export function dropRowAlert(
  alerts: Readonly<Record<string, string>>,
  sessionId: string
): Readonly<Record<string, string>> {
  if (!(sessionId in alerts)) return alerts;
  return Object.fromEntries(Object.entries(alerts).filter(([id]) => id !== sessionId));
}

/** The slot book bound to the teacher's kind vocabulary. */
const slotHelpers = createSessionSlotBook<RowActionKind>();

/** Opens a row+kind slot / closes it / tests membership (pure — see `sessionRowSlotBook`). */
export const { addInFlightAction, removeInFlightAction, isInFlight } = slotHelpers;
