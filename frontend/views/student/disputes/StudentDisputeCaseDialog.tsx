"use client";

import { useQuery } from "@apollo/client/react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { SessionMetaCell } from "@/frontend/components/ui/sessionList";
import type { StudentDisputeCaseQuery } from "@/frontend/graphql/generated/gql/graphql";
import { studentDisputeCaseQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { mapGraphQLErrorByCode, normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import { AdminDisputeEscrowChip } from "@/frontend/views/admin/disputes/AdminDisputeEscrowChip";
import { resolutionOutcomeLabel } from "@/frontend/views/student/sessions/SessionRowResolutionNote";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import { Common, Sessions, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * StudentDisputeCaseDialog — the session's OWN student's (the filing
 * participant's) case read, the exact mirror of
 * `TeacherDisputeCaseDialog` (the student sessions surface, "Case details"
 * on any row that carries dispute history): a single stateful
 * `studentDisputeCase` query renders the participant-side bundle — the
 * session detail (escrow class, fee, dispute moment + the FULL filed
 * reason), the arbitration decision (outcome + the FULL note + the
 * resolved moment, or the honest pending line while the case awaits
 * arbitration) and the participant-owned artifacts (the teacher's authored
 * report, the homework row, the recitation record) with the teacher
 * display name resolved server-side.
 *
 * Honesty contract: absent evidence artifacts arrive as honest `null`s and
 * render as localized empty-state lines — the dialog NEVER fabricates
 * placeholder data. The state matrix mirrors the teacher dialog: `aria-busy`
 * skeleton → denial fallback (`PermissionDeniedFallback` for the
 * mapping-table denial family — the participant gate is SERVER-owned, this
 * surface carries no role logic) → generic inline alert → the bundle.
 *
 * Vocabulary seam: the arbitration vocabulary (the escrow chip, the outcome
 * labels, the decision section) is the SAME surface-neutral vocabulary both
 * participant dialogs speak — the escrow chip is imported from the admin
 * disputes view and the outcome labels from the shared resolution note, so
 * the tri-party story (admin queue → teacher dialog → student dialog) never
 * forks its copy. Only the perspective-keyed labels differ (`studentCase*`:
 * the counterparty label, the report title, the rating attribution).
 *
 * Mobile: the SAME responsive dialog geometry the dispute family already
 * ships (fullWidth + theme-aware paper, ≥44px touch target on the close
 * action) — no route or navigation additions.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors through
 * callbacks, RTL-safe logical composition, ≥44px touch target on the close
 * action.
 */

/** Typographic placeholder for nullable payload values (NOT locale copy). */
const NO_VALUE_PLACEHOLDER = "—";

interface StudentDisputeCaseDialogProps {
  /** Id of the session whose case is on view (the case query's closed variable). */
  readonly sessionId: string;
  readonly open: boolean;
  /** Dismiss intent — the close action and the dismissal gate both route here. */
  readonly onClose: () => void;
}

/** One evidence section: overline heading + body or honest empty-state line. */
function CaseSection({
  title,
  testId,
  children,
}: Readonly<{
  title: string;
  testId: string;
  children: ReactNode;
}>): ReactNode {
  return (
    <Stack data-testid={testId} sx={{ gap: 1 }}>
      <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {children}
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
  homework: NonNullable<StudentDisputeCaseQuery["studentDisputeCase"]["homework"]>;
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

/** The student case dialog: one query, session facts + decision + artifacts, honest nulls. */
export function StudentDisputeCaseDialog({
  sessionId,
  open,
  onClose,
}: Readonly<StudentDisputeCaseDialogProps>): ReactNode {
  const t = useAppTranslation(Sessions);
  const tc = useAppTranslation(Common);
  const locale = useAppLocale();

  const { data, loading, error } = useQuery(studentDisputeCaseQueryDocument, {
    variables: { id: sessionId },
  });

  let body: ReactNode;
  if (loading && data === undefined) {
    // First fetch for this case: the `aria-busy` skeleton — no fabricated
    // section shells that could be mistaken for empty artifacts.
    body = <StudentDisputeCaseLoading />;
  } else if (error) {
    const rawCode = extractErrorCode(error);
    const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
    const action = mapGraphQLErrorByCode(code, { contextKind: "query", hasForm: false });
    body =
      action?.kind === "permission-fallback" || action?.kind === "auth-recovery" ? (
        <PermissionDeniedFallback />
      ) : (
        <Stack data-testid="student-dispute-case-error" sx={{ py: 4 }}>
          <Alert severity="error" variant="outlined">
            {t.genericError}
          </Alert>
        </Stack>
      );
  } else if (!data) {
    body = <StudentDisputeCaseLoading />;
  } else {
    const disputeCase: StudentDisputeCaseQuery["studentDisputeCase"] = data.studentDisputeCase;
    const session = disputeCase.session;
    const feeText = session.fee === null ? NO_VALUE_PLACEHOLDER : `${session.fee} ${SESSION_FEE_CURRENCY}`;
    const disputedText =
      session.disputedAt === null ? NO_VALUE_PLACEHOLDER : formatApplicantDate(session.disputedAt, locale);
    const teacherLabel = disputeCase.teacherName ?? `#${session.teacherId}`;
    const isResolved = session.resolvedAt !== null;
    const report = disputeCase.report;
    const homework = disputeCase.homework;
    const recitation = disputeCase.recitation;

    body = (
      <Stack sx={{ gap: 3 }}>
        {/* Session facts — the same arbitration vocabulary the queue row speaks. */}
        <Stack data-testid="student-dispute-case-session" sx={{ gap: 1.5 }}>
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
            <SessionMetaCell label={t.studentCaseTeacherLabel} value={teacherLabel} />
          </Stack>
        </Stack>

        {/* The FULL filed reason — never truncated inside the case dialog. */}
        {session.disputeReason !== null ? (
          <Stack data-testid="student-dispute-case-reason" sx={{ gap: 0.5 }}>
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
        <CaseSection title={t.teacherCaseResolutionTitle} testId="student-dispute-case-resolution">
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
            <Alert severity="info" variant="outlined" data-testid="student-dispute-case-pending">
              {t.teacherCasePendingLine}
            </Alert>
          )}
        </CaseSection>

        {/* The participant-owned artifacts (honest nulls — never fabricated).
            The report is the TEACHER's authored evidence — the student reads
            it with the perspective-keyed attribution labels. */}
        <CaseSection title={t.studentCaseReportTitle} testId="student-dispute-case-report">
          {report === null ? (
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {t.caseReviewEmptyReport}
            </Typography>
          ) : (
            <Stack sx={{ gap: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {report.teacherNotes}
              </Typography>
              <SessionMetaCell label={t.studentCaseRatingLabel} value={report.studentRatingByTeacher.toString()} />
            </Stack>
          )}
        </CaseSection>

        <CaseSection title={t.caseReviewHomeworkTitle} testId="student-dispute-case-homework">
          {homework === null ? (
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {t.caseReviewEmptyHomework}
            </Typography>
          ) : (
            <Stack sx={{ gap: 1.5, flexDirection: "row", flexWrap: "wrap" }}>
              <HomeworkBlock label={t.caseReviewHomeworkCurrentLabel} homework={homework} rangeFromKey="current" />
              <HomeworkBlock label={t.caseReviewHomeworkRevisionLabel} homework={homework} rangeFromKey="revision" />
            </Stack>
          )}
        </CaseSection>

        <CaseSection title={t.caseReviewRecitationTitle} testId="student-dispute-case-recitation">
          {recitation === null ? (
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {t.caseReviewEmptyRecitation}
            </Typography>
          ) : (
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      scroll="paper"
      data-testid="student-dispute-case-dialog"
      aria-labelledby="student-dispute-case-title"
    >
      <DialogTitle id="student-dispute-case-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.teacherCaseTitle}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 3 }}>{body}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button
          onClick={onClose}
          data-testid="student-dispute-case-close"
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {tc.close}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Stable skeleton keys — never the render-time array index. */
const CASE_LOADING_KEYS: readonly string[] = [
  "student-case-loading-session",
  "student-case-loading-decision",
  "student-case-loading-report",
];

/** The case dialog's `aria-busy` loading slot — bare skeleton lines. */
function StudentDisputeCaseLoading(): ReactNode {
  return (
    <Stack aria-busy="true" data-testid="student-dispute-case-loading" sx={{ gap: 2, py: 2 }}>
      {CASE_LOADING_KEYS.map(key => (
        <Skeleton key={key} variant="rounded" sx={{ height: 56 }} />
      ))}
    </Stack>
  );
}
