import type { ApolloCache } from "@apollo/client";

/**
 * Cache eviction helpers for the session list fields — the shared arm
 * behind the role containers' and the cancel dialog's `SESSION_NOT_FOUND`
 * handling: the list converges WITHOUT any refetch.
 */

/** `__typename` of the normalized `Session` cache entity. */
const SESSION_TYPE_NAME = "Session";

/** List field names carrying the student's session rows. */
export const STUDENT_SESSION_LIST_FIELDS: readonly string[] = ["myStudentSessions"];

/** List field names carrying the teacher's session rows. */
export const TEACHER_SESSION_LIST_FIELDS: readonly string[] = ["myTeacherSessions"];

/**
 * BOTH role list fields — the role-neutral cancel dialog clears the
 * student AND teacher lists so either surface's row disappears.
 */
export const CANCEL_ROLE_SESSION_LIST_FIELDS: readonly string[] = ["myStudentSessions", "myTeacherSessions"];

/**
 * Filters one removed session reference out of a stored paginated list
 * payload (`items` array) — absent fields are skipped by `cache.modify`
 * so the other role's cache is untouched. `keepReference` receives each
 * dangling normalized `Reference` (`__ref`) and decides its survival, so
 * each caller's reference-matching rule stays its own.
 */
export function filterSessionReferenceOutOfList(
  existing: unknown,
  keepReference: (reference: unknown) => boolean,
  sessionId: string
): unknown {
  if (typeof existing !== "object" || existing === null || !("items" in existing)) return existing;
  const items = existing.items;
  if (!Array.isArray(items)) return existing;
  return {
    ...existing,
    items: items.filter(item => {
      if (typeof item !== "object" || item === null) return true;
      // Normalized storage: dangling `Reference` entries carry `__ref`
      // (bracket access — the Apollo wire property is underscore-prefixed,
      // and per oxlint.config.mts the underscored wire property is not ours
      // to rename; biome's unsafe autofix would revert this bracket access
      // back to member access).
      if ("__ref" in item) {
        const reference: unknown = item.__ref;
        return keepReference(reference);
      }
      // Non-normalized storage (defensive): raw payloads carry `id`.
      if ("id" in item) return item.id !== sessionId;
      return true;
    }),
  };
}

/**
 * Removes the missing session from the given cached role list fields
 * (EVERY stored variant of each field), evicts the entity and
 * garbage-collects — the list converges WITHOUT any refetch.
 */
export function evictSessionFromListFields(cache: ApolloCache, sessionId: string, listFields: readonly string[]): void {
  const removedEntityId = cache.identify({ __typename: SESSION_TYPE_NAME, id: sessionId });
  cache.modify({
    id: "ROOT_QUERY",
    fields: Object.fromEntries(
      listFields.map(field => [
        field,
        (existing: unknown): unknown =>
          filterSessionReferenceOutOfList(
            existing,
            reference => removedEntityId === undefined || reference !== removedEntityId,
            sessionId
          ),
      ])
    ),
  });
  if (removedEntityId !== undefined) {
    cache.evict({ id: removedEntityId });
  }
  cache.gc();
}
