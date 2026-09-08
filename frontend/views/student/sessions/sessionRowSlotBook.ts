/**
 * sessionRowSlotBook — the role-neutral per-row in-flight slot book shared
 * by the student and teacher sessions surfaces.
 *
 * sessionId → the set of action kinds currently in flight FOR THAT ROW.
 * Immutable records + copied sets only: the React state is never mutated in
 * place, so every `setState` yields a new snapshot and per-row slots clear
 * independently. The row-action kind vocabulary is generic (`K extends
 * string`) — each role binds its own union (student: cancel/dispute/
 * confirm; teacher: start/complete/cancel/dispute) while the open/close/
 * predicate semantics stay byte-identical for both.
 */

/** The immutable in-flight slot book state shape, generic over the kind vocabulary. */
export type InFlightSlotBook<K extends string> = Readonly<Record<string, ReadonlySet<K>>>;

/** Opens a row+kind slot (pure — returns a new record, never mutating). */
function addInFlightSlot<K extends string>(
  slots: InFlightSlotBook<K>,
  sessionId: string,
  kind: K
): InFlightSlotBook<K> {
  const next = new Set<K>(slots[sessionId] ?? []);
  next.add(kind);
  return { ...slots, [sessionId]: next };
}

/** Closes a row+kind slot, dropping the entry once its set drains (pure). */
function removeInFlightSlot<K extends string>(
  slots: InFlightSlotBook<K>,
  sessionId: string,
  kind: K
): InFlightSlotBook<K> {
  const previous = slots[sessionId];
  if (!previous?.has(kind)) return slots;
  const next = new Set(previous);
  next.delete(kind);
  if (next.size === 0) {
    return Object.fromEntries(Object.entries(slots).filter(([id]) => id !== sessionId));
  }
  return { ...slots, [sessionId]: next };
}

/** Whether THIS row's slot for THIS action kind is currently in flight. */
export function isSlotInFlight<K extends string>(slots: InFlightSlotBook<K>, sessionId: string, kind: K): boolean {
  return slots[sessionId]?.has(kind) ?? false;
}

/** The role-facing slot-book API (the historical per-role export names). */
export interface SlotBookHelpers<K extends string> {
  readonly addInFlightAction: (slots: InFlightSlotBook<K>, sessionId: string, kind: K) => InFlightSlotBook<K>;
  readonly removeInFlightAction: (slots: InFlightSlotBook<K>, sessionId: string, kind: K) => InFlightSlotBook<K>;
  readonly isInFlight: (slots: InFlightSlotBook<K>, sessionId: string, kind: K) => boolean;
}

/**
 * Binds the generic slot mechanics to ONE role's kind vocabulary — each
 * role module calls this ONCE and exports the bound helpers under its
 * historical names (open / close / predicate semantics stay byte-identical
 * across roles through the shared engine).
 */
export function createSessionSlotBook<K extends string>(): SlotBookHelpers<K> {
  return {
    addInFlightAction: (slots, sessionId, kind) => addInFlightSlot(slots, sessionId, kind),
    removeInFlightAction: (slots, sessionId, kind) => removeInFlightSlot(slots, sessionId, kind),
    isInFlight: (slots, sessionId, kind) => isSlotInFlight(slots, sessionId, kind),
  };
}
