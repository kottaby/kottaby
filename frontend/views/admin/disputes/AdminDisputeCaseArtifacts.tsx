"use client";

import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SessionMetaCell } from "@/frontend/components/ui/sessionList";
import type {
  AdminDisputeCaseQuery_adminDisputeCase,
  AdminDisputeCaseQuery_adminDisputeCase_homework,
  AdminDisputeCaseQuery_adminDisputeCase_recitation,
  AdminDisputeCaseQuery_adminDisputeCase_report,
} from "@/frontend/graphql/generated/gql/graphql";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminDisputeCaseArtifacts — the three evidence-artifact sections of the
 * case-review dialog (teacher report, homework, recitation). Absent
 * artifacts arrive as honest `null`s from the case query and render the
 * localized empty-state line — the dialog NEVER fabricates placeholder
 * data. Present artifacts render VERBATIM (notes, numbers, enum refs —
 * server-owned values, never remapped), with the typographic em-dash
 * placeholder (NOT locale copy) for nullable leaf fields.
 *
 * MUI v9 discipline: `sx`-only styling, colors through `theme.palette.*`.
 */

/** Typographic placeholder for nullable payload values (NOT locale copy). */
const NO_VALUE_PLACEHOLDER = "—";

interface AdminDisputeCaseArtifactsProps {
  /** The settled case payload (its three nullable evidence artifacts). */
  readonly disputeCase: AdminDisputeCaseQuery_adminDisputeCase;
  /** Localized sessions-namespace labels (the case-review vocabulary). */
  readonly t: SessionsLabels;
}

/** One evidence section: overline heading + body or honest empty-state line. */
function CaseSection({
  title,
  emptyText,
  isEmpty,
  testId,
  children,
}: Readonly<{
  title: string;
  emptyText: string;
  isEmpty: boolean;
  testId: string;
  children: ReactNode;
}>): ReactNode {
  return (
    <Stack data-testid={testId} sx={{ gap: 1 }}>
      <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {isEmpty ? (
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
          {emptyText}
        </Typography>
      ) : (
        children
      )}
    </Stack>
  );
}

/** Ayah-range value line — verbatim numbers with the em-dash for unset leaves. */
function homeworkRangeText(from: number | null, to: number | null): string {
  return `${from ?? NO_VALUE_PLACEHOLDER} – ${to ?? NO_VALUE_PLACEHOLDER}`;
}

/** One homework block (current or revision): label over the verbatim evidence line. */
function HomeworkBlock({
  label,
  homework,
  rangeFromKey,
}: Readonly<{
  label: string;
  homework: AdminDisputeCaseQuery_adminDisputeCase_homework;
  rangeFromKey: "current" | "revision";
}>): ReactNode {
  const from = rangeFromKey === "current" ? homework.currentFromAyah : homework.revisionFromAyah;
  const to = rangeFromKey === "current" ? homework.currentToAyah : homework.revisionToAyah;
  const grade = rangeFromKey === "current" ? homework.currentGrade : homework.revisionGrade;
  const surahJuz = rangeFromKey === "current" ? homework.currentSurahJuz : homework.revisionSurahJuz;

  return (
    <SessionMetaCell
      label={label}
      value={`${homeworkRangeText(from, to)} · ${grade ?? NO_VALUE_PLACEHOLDER} · ${surahJuz ?? NO_VALUE_PLACEHOLDER}`}
    />
  );
}

/** The report / homework / recitation sections of the case-review dialog. */
export function AdminDisputeCaseArtifacts({ disputeCase, t }: Readonly<AdminDisputeCaseArtifactsProps>): ReactNode {
  const report: AdminDisputeCaseQuery_adminDisputeCase_report | null = disputeCase.report;
  const homework: AdminDisputeCaseQuery_adminDisputeCase_homework | null = disputeCase.homework;
  const recitation: AdminDisputeCaseQuery_adminDisputeCase_recitation | null = disputeCase.recitation;

  return (
    <Stack sx={{ gap: 3 }}>
      <CaseSection
        title={t.caseReviewReportTitle}
        isEmpty={report === null}
        emptyText={t.caseReviewEmptyReport}
        testId="admin-dispute-case-report"
      >
        {report === null ? null : (
          <Stack sx={{ gap: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {report.teacherNotes}
            </Typography>
            <SessionMetaCell label={t.caseReviewRatingLabel} value={report.studentRatingByTeacher.toString()} />
          </Stack>
        )}
      </CaseSection>
      <CaseSection
        title={t.caseReviewHomeworkTitle}
        isEmpty={homework === null}
        emptyText={t.caseReviewEmptyHomework}
        testId="admin-dispute-case-homework"
      >
        {homework === null ? null : (
          <Stack sx={{ gap: 1.5, flexDirection: "row", flexWrap: "wrap" }}>
            <HomeworkBlock label={t.caseReviewHomeworkCurrentLabel} homework={homework} rangeFromKey="current" />
            <HomeworkBlock label={t.caseReviewHomeworkRevisionLabel} homework={homework} rangeFromKey="revision" />
          </Stack>
        )}
      </CaseSection>
      <CaseSection
        title={t.caseReviewRecitationTitle}
        isEmpty={recitation === null}
        emptyText={t.caseReviewEmptyRecitation}
        testId="admin-dispute-case-recitation"
      >
        {recitation === null ? null : (
          <Stack sx={{ gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {recitation.name}
            </Typography>
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {recitation.description ?? NO_VALUE_PLACEHOLDER}
            </Typography>
          </Stack>
        )}
      </CaseSection>
    </Stack>
  );
}
