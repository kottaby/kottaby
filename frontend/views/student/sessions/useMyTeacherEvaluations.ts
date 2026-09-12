import type { ApolloCache } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { useCallback, useMemo, useState } from "react";
import type {
  MyTeacherEvaluationsQuery_myTeacherEvaluations,
  SubmitTeacherEvaluationMutation,
} from "@/frontend/graphql/generated/gql/graphql";
import { myTeacherEvaluationsQueryDocument } from "@/frontend/graphql/sharedDocuments";

/** `__typename` of the normalized `Evaluation` cache entity. */
const EVALUATION_TYPE_NAME = "Evaluation";

/** The read's own payload row shape (one persisted teacher rating). */
export type TeacherEvaluationRow = MyTeacherEvaluationsQuery_myTeacherEvaluations;

/**
 * Collapses the caller's rating rows into the set of rated session ids the
 * Rate-CTA gate consumes. Rows without a session (`sessionId` null) carry no
 * session to gate and are skipped. Pure — exported for the suite tier.
 */
export function deriveRatedSessionIds(rows: readonly TeacherEvaluationRow[]): ReadonlySet<number> {
  const ratedSessionIds = new Set<number>();
  for (const row of rows) {
    if (row.sessionId !== null) {
      ratedSessionIds.add(row.sessionId);
    }
  }
  return ratedSessionIds;
}

/**
 * Apollo `update` writer for the submit mutation: the returned `Evaluation`
 * row is the student's NEWEST rating (the read orders newest first), so it
 * is PREPENDED to the cached `myTeacherEvaluations` list — the rated set,
 * and with it the row's rated state, converges WITHOUT any refetch. The
 * payload row itself is already normalized into the cache by the mutation
 * write (id-bearing entity, default normalization).
 */
export function updateCacheOnSubmitted(
  cache: ApolloCache,
  result: { data?: SubmitTeacherEvaluationMutation | null }
): void {
  const submitted = result.data?.submitTeacherEvaluation;
  if (submitted === undefined || submitted === null) return;
  const evaluationRef = cache.identify({ __typename: EVALUATION_TYPE_NAME, id: submitted.id });
  if (evaluationRef === undefined) return;
  cache.modify({
    id: "ROOT_QUERY",
    fields: {
      myTeacherEvaluations(existing: unknown) {
        if (!Array.isArray(existing)) return [evaluationRef];
        return [evaluationRef, ...existing];
      },
    },
  });
}

/** State exposed by the rated-set hook. */
export interface MyTeacherEvaluationsState {
  /** Session ids the student has already rated (cache-derived ∪ locally marked). */
  readonly ratedSessionIds: ReadonlySet<number>;
  /**
   * Marks one session rated WITHOUT a cache row — the write-once rejection
   * arm proves the rating exists server-side but carries no `Evaluation`
   * payload to normalize, so the row flips to its rated state through this
   * monotonic local marker instead (cache rows supersede once they land).
   */
  readonly markSessionRated: (sessionId: number) => void;
  readonly loading: boolean;
  readonly error: unknown;
}

/**
 * useMyTeacherEvaluations — the student's own teacher-rating read
 * (`myTeacherEvaluationsQueryDocument`) collapsed into the rated-session-id
 * set the Rate-CTA gate keys off. The sessions-list payload is never
 * widened for it: the rated set lives entirely in this read's cache
 * territory (zero variables — identity is server-derived). A settled
 * failure degrades to the EMPTY set (fail-open): the Rate CTA may then
 * render on an already-rated row, and the submit's write-once rejection
 * arm is the honest recovery (it marks the row rated).
 */
export function useMyTeacherEvaluations(): MyTeacherEvaluationsState {
  const { data, loading, error } = useQuery(myTeacherEvaluationsQueryDocument);

  // Locally-marked rated ids — monotonic bookkeeping for rejections that
  // prove a rating exists without returning its row. Never mutated in
  // place: every marker yields a fresh snapshot.
  const [markedRatedSessionIds, setMarkedRatedSessionIds] = useState<ReadonlySet<number>>(() => new Set());

  const markSessionRated = useCallback((sessionId: number): void => {
    setMarkedRatedSessionIds(prev => {
      if (prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
  }, []);

  const ratedSessionIds = useMemo(() => {
    const rows = data?.myTeacherEvaluations;
    if (rows === undefined) return markedRatedSessionIds;
    if (markedRatedSessionIds.size === 0) return deriveRatedSessionIds(rows);
    return new Set([...deriveRatedSessionIds(rows), ...markedRatedSessionIds]);
  }, [data, markedRatedSessionIds]);

  return { ratedSessionIds, markSessionRated, loading, error };
}
