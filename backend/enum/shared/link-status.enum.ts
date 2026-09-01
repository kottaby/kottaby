/**
 * LinkStatus enum — mirrors the `link_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 * Currently unused by any table but kept for parity with the schema.
 */
export enum LinkStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Rejected = "rejected",
  Expired = "expired",
}

/**
 * Type guard for a runtime link-status value (from a pgEnum row or a
 * transport payload). Returns `true` only for exact member strings — the
 * guard fails closed on any other input (wrong type, case mismatch,
 * whitespace, foreign values) rather than throwing.
 */
export function isLinkStatus(value: unknown): value is LinkStatus {
  return typeof value === "string" && (Object.values(LinkStatus) as string[]).includes(value);
}
