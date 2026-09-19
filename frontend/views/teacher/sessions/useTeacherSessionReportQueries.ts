"use client";

/**
 * useTeacherSessionReportQueries — the parallel `useQuery` bundle for the
 * teacher session-report dialog. Three queries re-keyed by `sessionId`:
 *  - `sessionReport` (the report row, nullable).
 *  - `sessionHomework` (the homework row, nullable).
 *  - `studentHomeworkHistory` (the student's cross-teacher history page).
 * NO `useLazyQuery` — the dialog opens with stateful queries that resolve
 * the mode from the report's existence.
 */

import { useQuery } from "@apollo/client/react";
import {
  sessionHomeworkQueryDocument,
  sessionReportQueryDocument,
  studentHomeworkHistoryQueryDocument,
} from "@/frontend/graphql/sharedDocuments/scheduling/session-report.documents";

export interface TeacherSessionReportQueriesProps {
  readonly sessionId: string;
  readonly studentId: string;
  readonly open: boolean;
}

/** Returns the three queries the dialog composes; each skips when the
 *  dialog is closed (no network round-trip on a closed mount). */
export function useTeacherSessionReportQueries({
  sessionId,
  studentId,
  open,
}: Readonly<TeacherSessionReportQueriesProps>) {
  const reportQuery = useQuery(sessionReportQueryDocument, { variables: { sessionId }, skip: !open });
  const homeworkQuery = useQuery(sessionHomeworkQueryDocument, { variables: { sessionId }, skip: !open });
  const historyQuery = useQuery(studentHomeworkHistoryQueryDocument, {
    variables: { studentId, page: null, pageSize: null },
    skip: !open || !studentId,
  });
  return {
    reportQuery,
    homeworkQuery,
    historyQuery,
    loading: reportQuery.loading || homeworkQuery.loading || historyQuery.loading,
    hasReport: reportQuery.data?.sessionReport != null,
  };
}
