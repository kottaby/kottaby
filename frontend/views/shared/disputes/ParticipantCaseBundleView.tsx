"use client";

import { Alert, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SessionMetaCell } from "@/frontend/components/ui/sessionList";
import type { StudentDisputeCaseQuery } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { AdminDisputeEscrowChip } from "@/frontend/views/admin/disputes/AdminDisputeEscrowChip";
import {
  CaseSection,
  DisputeCaseHomeworkBlock,
  DisputeCaseRecitationBlock,
  DisputeCaseReportBlock,
  NO_VALUE_PLACEHOLDER,
} from "@/frontend/views/shared/disputes/DisputeCasePrimitives";
import { resolutionOutcomeLabel } from "@/frontend/views/student/sessions/SessionRowResolutionNote";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import type { AppLocale } from "@/shared/locale/AppLocale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * ParticipantCaseBundleView — the settled case bundle both participant
 * mirrors render (session facts + the FULL filed reason + the arbitration
 * decision + the participant-owned artifacts). The student and teacher
 * dialogs are the SAME surface modulo WHICH counterparty they address, so
 * the sections render from the surface-agnostic `ParticipantCaseView` with
 * the perspective attribution labels passed in — the family's arbitration
 * vocabulary never forks.
 *
 * Honesty contract: absent artifacts arrive as honest `null`s and render
 * as localized empty-state lines — the view NEVER fabricates placeholder
 * data.
 */

/** The surface-agnostic case view projected from either participant envelope. */
export interface ParticipantCaseView {
  readonly session: StudentDisputeCaseQuery["studentDisputeCase"]["session"];
  readonly counterpartyName: string | null;
  readonly counterpartyId: string;
  readonly report: StudentDisputeCaseQuery["studentDisputeCase"]["report"];
  readonly homework: StudentDisputeCaseQuery["studentDisputeCase"]["homework"];
  readonly recitation: StudentDisputeCaseQuery["studentDisputeCase"]["recitation"];
}

interface ParticipantCaseBundleSectionsProps {
  /** The surface identity — the testid prefix (`<surface>-dispute-case-*`). */
  readonly surface: "student" | "teacher";
  readonly caseView: ParticipantCaseView;
  /** Localized sessions-namespace labels (the arbitration vocabulary). */
  readonly t: SessionsLabels;
  readonly locale: AppLocale;
  /** Perspective attribution: the counterparty meta label + report/rating keys. */
  readonly counterpartyLabelText: string;
  readonly reportTitleText: string;
  readonly ratingLabelText: string;
}

/** The settled bundle: session facts, reason, decision, artifacts. */
export function ParticipantCaseBundleSections({
  surface,
  caseView,
  t,
  locale,
  counterpartyLabelText,
  reportTitleText,
  ratingLabelText,
}: Readonly<ParticipantCaseBundleSectionsProps>): ReactNode {
  const tid = (suffix: string) => `${surface}-dispute-case-${suffix}`;
  const session = caseView.session;
  const feeText = session.fee === null ? NO_VALUE_PLACEHOLDER : `${session.fee} ${SESSION_FEE_CURRENCY}`;
  const disputedText =
    session.disputedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(session.disputedAt, locale);
  const counterpartyLabel = caseView.counterpartyName ?? `#${caseView.counterpartyId}`;
  const isResolved = session.resolvedAt !== null;
  const report = caseView.report;
  const homework = caseView.homework;
  const recitation = caseView.recitation;

  return (
    <Stack sx={{ gap: 3 }}>
      {/* Session facts — the same arbitration vocabulary the queue row speaks. */}
      <Stack data-testid={tid("session")} sx={{ gap: 1.5 }}>
        <Stack
          sx={{
            gap: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <Typography variant="h6" component="h3" sx={{ fontWeight: 700 }}>
            {session.intent ?? NO_VALUE_PLACEHOLDER}
          </Typography>
          <AdminDisputeEscrowChip feeHeld={session.feeHeld} t={t} />
        </Stack>
        <Stack sx={{ gap: 1.5, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}>
          <SessionMetaCell label={t.fee} value={feeText} />
          <SessionMetaCell label={t.disputedAtLabel} value={disputedText} />
          <SessionMetaCell label={counterpartyLabelText} value={counterpartyLabel} />
        </Stack>
      </Stack>

      {/* The FULL filed reason — never truncated inside the case dialog. */}
      {session.disputeReason !== null ? (
        <Stack data-testid={tid("reason")} sx={{ gap: 0.5 }}>
          <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.disputeReasonMeta}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {session.disputeReason}
          </Typography>
        </Stack>
      ) : null}

      {/* The arbitration decision: the FULL outcome + note once resolved,
          the honest pending line while the case awaits arbitration. */}
      <CaseSection title={t.teacherCaseResolutionTitle} testId={tid("resolution")}>
        {isResolved ? (
          <Stack sx={{ gap: 1.5 }}>
            <SessionMetaCell
              label={t.arbitrationOutcomeLine}
              value={resolutionOutcomeLabel(session.resolutionOutcome, t)}
            />
            {session.resolutionNote !== null ? (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {session.resolutionNote}
              </Typography>
            ) : null}
            <SessionMetaCell
              label={t.teacherCaseResolvedAtLabel}
              value={
                session.resolvedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(session.resolvedAt, locale)
              }
            />
          </Stack>
        ) : (
          <Alert severity="info" variant="outlined" data-testid={tid("pending")}>
            {t.teacherCasePendingLine}
          </Alert>
        )}
      </CaseSection>

      {/* The participant-owned artifacts (honest nulls — never fabricated). */}
      <CaseSection title={reportTitleText} testId={tid("report")}>
        {report === null ? (
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.caseReviewEmptyReport}
          </Typography>
        ) : (
          <DisputeCaseReportBlock
            notes={report.teacherNotes}
            rating={report.studentRatingByTeacher}
            ratingLabel={ratingLabelText}
          />
        )}
      </CaseSection>

      <CaseSection title={t.caseReviewHomeworkTitle} testId={tid("homework")}>
        {homework === null ? (
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.caseReviewEmptyHomework}
          </Typography>
        ) : (
          <Stack sx={{ gap: 1.5, flexDirection: "row", flexWrap: "wrap" }}>
            <DisputeCaseHomeworkBlock label={t.caseReviewHomeworkCurrentLabel} homework={homework} rangeFromKey="current" />
            <DisputeCaseHomeworkBlock
              label={t.caseReviewHomeworkRevisionLabel}
              homework={homework}
              rangeFromKey="revision"
            />
          </Stack>
        )}
      </CaseSection>

      <CaseSection title={t.caseReviewRecitationTitle} testId={tid("recitation")}>
        {recitation === null ? (
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.caseReviewEmptyRecitation}
          </Typography>
        ) : (
          <DisputeCaseRecitationBlock recitation={recitation} />
        )}
      </CaseSection>
    </Stack>
  );
}
