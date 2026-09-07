import type { ErrorsLabels } from "@/shared/locale/types/errors";

/**
 * Denial-code → `errors`-namespace copy accessor table for the DEV1-014
 * parent-link surfaces (the notification-type-presentation precedent). Keys
 * are the raw `extensions.code` strings the backend DomainError hierarchy
 * puts on the wire:
 *
 *  - `PARENT_LINK_TARGET_ALREADY_LINKED` / `PARENT_LINK_ALREADY_PENDING` —
 *    the send-affordance conflicts on the parent handshake surface;
 *  - `PARENT_LINK_REQUEST_EXPIRED` / `PARENT_LINK_REQUEST_ALREADY_RESOLVED` /
 *    `PARENT_LINK_REQUEST_NOT_FOUND` — the respond/cancel denials on BOTH
 *    the student incoming queue and the parent outgoing list.
 *
 * Anything unmapped (transport failures, unknown codes) falls back to
 * `internalServerError` — a raw code never reaches the DOM. Shared by the
 * student container, the parent send affordance, and the outgoing section
 * so every surface maps the same wire code to the SAME localized copy
 * (constant-shape denial discipline).
 */
const DENIAL_LABEL_ACCESSORS: Readonly<Record<string, (te: ErrorsLabels) => string>> = {
  PARENT_LINK_TARGET_ALREADY_LINKED: te => te.parentLinkTargetAlreadyLinked,
  PARENT_LINK_ALREADY_PENDING: te => te.parentLinkAlreadyPending,
  PARENT_LINK_REQUEST_EXPIRED: te => te.parentLinkRequestExpired,
  PARENT_LINK_REQUEST_ALREADY_RESOLVED: te => te.parentLinkRequestAlreadyResolved,
  PARENT_LINK_REQUEST_NOT_FOUND: te => te.parentLinkRequestNotFound,
};

/** Localized inline-Alert copy for a parent-link denial (never a raw code). */
export function resolveParentLinkDenialCopy(code: string | null, te: ErrorsLabels): string {
  return resolveParentLinkDenialCopyOrNull(code, te) ?? te.internalServerError;
}

/**
 * Mapped-copy-or-null variant for surfaces that carry their OWN generic
 * failure line: returns `null` when the code chain is absent OR the code
 * misses the table, so the caller can fold onto its localized fallback
 * (the dashboard card's `dashboardCardLoadError`) instead of the shared
 * `internalServerError`. Mapped codes resolve identically to
 * `resolveParentLinkDenialCopy`.
 */
export function resolveParentLinkDenialCopyOrNull(code: string | null, te: ErrorsLabels): string | null {
  if (code === null) {
    return null;
  }
  // Membership guard (not an `=== undefined` comparison — a `Record` index
  // read is statically non-optional): a raw wire code CAN miss the table.
  if (!(code in DENIAL_LABEL_ACCESSORS)) {
    return null;
  }
  return DENIAL_LABEL_ACCESSORS[code](te);
}
