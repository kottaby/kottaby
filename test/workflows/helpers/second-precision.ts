/**
 * Second-precision floor — one canonical definition, shared by the session
 * journey suites, of the timestamp resolution `session` timestamps survive
 * a write/read round-trip at (sub-second digits do not). Pure math: no db,
 * no framework, no imports.
 */

/**
 * Epoch ms floored to the timestamps' stored second resolution — the
 * precision cross-source timestamp comparisons in a journey agree at (a
 * service call's returned instant reports second resolution even though
 * the stored row keeps the full precision), and the resolution fabricated
 * fixture stamps must be built at so the written value and every later
 * read-back of it agree exactly.
 *
 * Accepts the instant in either representation — a `Date` (a read-back or
 * service-returned value) or raw epoch ms (a capture instant such as
 * `Date.now()`) — and returns the floored epoch ms; wrap it in
 * `new Date(...)` when a fixture stamp needs the `Date` shape.
 */
export function secondPrecisionMs(instant: Date | number): number {
  return Math.floor((instant instanceof Date ? instant.getTime() : instant) / 1000) * 1000;
}
