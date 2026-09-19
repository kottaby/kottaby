"use client";

import {
  AssignmentOutlined,
  AutoStoriesOutlined,
  HourglassEmptyOutlined,
  ReplayOutlined,
  TaskAltOutlined,
} from "@mui/icons-material";
import { Box, Card, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import type { MyHomeworkQuery_myHomework_items } from "@/frontend/graphql/generated/gql/graphql";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { DashboardStatCard } from "@/frontend/views/dashboard/home/DashboardStatCard";
import { HomeworkTrackBlock } from "@/frontend/views/parent/monitoring/HomeworkTab.parts.helpers";
import { computeHomeworkSummary, type HomeworkSummary } from "@/frontend/views/student/homework/homework.helpers";
import { useAllMyHomeworkPages } from "@/frontend/views/student/homework/useAllMyHomeworkPages";
import { Common, Errors, Homework, useAppLocale, useAppTranslation } from "@/shared/locale";
import type { HomeworkLabels } from "@/shared/locale/types/homework";

/**
 * HomeworkContainer — the client orchestrator behind `/homework`, the
 * student's own homework history: an always-on chrome (title) over a
 * branch-matrix body (summary strip + assignment list).
 *
 * Data — the shared fetch-all-pages chain over `myHomework` (the student
 * id is server-derived; the read has zero caller-supplied identity). The
 * summary strip partitions the WHOLE history honestly: graded = at least
 * one track grade recorded, pending = nothing graded yet; both buckets
 * render even at zero.
 *
 * Track blocks — the SHARED `HomeworkTrackBlock` presentation (the same
 * component the parent portal's homework tab renders), fed namespace-local
 * copy so the two homework surfaces speak one Jadid/Madi vocabulary
 * without forking the projection.
 *
 * Render branches (the chrome renders in EVERY branch; only the body
 * swaps — the teacher schedule container's branch matrix precedent):
 *
 * | # | Condition | Body |
 * |---|-----------|------|
 * | 1 | query in flight | skeleton (`aria-busy` + `loadingLabel`) |
 * | 2 | query error | retryable `ErrorRetryAlert` |
 * | 3 | zero rows | shared `IconCircleEmptyState` |
 * | 4 | rows present | summary strip + assignment cards |
 *
 * MUI v6 discipline: `sx`-only styling, theme-palette tokens only,
 * `*Outlined` icons only, RTL-safe logical composition.
 */
export function HomeworkContainer(): ReactNode {
  const t = useAppTranslation(Homework);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  const { data, loading, error, refetch } = useAllMyHomeworkPages();
  const rows = data?.myHomework?.items;
  // The student read is zero-identity, so a 403 can only mean a stale
  // role claim — the generic retryable alert covers it (no foreign-id
  // permission-fallback surface exists to disambiguate).
  const isError = error !== undefined && extractErrorCode(error) !== null;

  return (
    <Stack data-testid="student-homework-view" sx={{ gap: 3 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {t.pageTitle}
      </Typography>
      <HomeworkBody
        loading={loading}
        isError={isError}
        refetch={refetch}
        errorTitle={te.internalServerError}
        errorBody={t.errorBody}
        retryLabel={commonT.retry}
        loadingLabel={t.loadingLabel}
        emptyTitle={t.emptyTitle}
        emptyBody={t.emptyBody}
        rows={rows}
        labels={t}
        locale={locale}
      />
    </Stack>
  );
}

/** The branch-matrix body — the chrome stays mounted above it. */
function HomeworkBody(
  props: Readonly<{
    loading: boolean;
    isError: boolean;
    refetch: () => Promise<unknown>;
    errorTitle: string;
    errorBody: string;
    retryLabel: string;
    loadingLabel: string;
    emptyTitle: string;
    emptyBody: string;
    rows: readonly MyHomeworkQuery_myHomework_items[] | undefined;
    labels: HomeworkLabels;
    locale: string;
  }>
): ReactNode {
  const { rows, labels: t, locale } = props;
  if (rows === undefined) {
    if (props.isError) {
      return (
        <ErrorRetryAlert
          title={props.errorTitle}
          retryLabel={props.retryLabel}
          retryPending={props.loading}
          onRetry={() => {
            void props.refetch();
          }}
        >
          <Typography variant="body2">{props.errorBody}</Typography>
        </ErrorRetryAlert>
      );
    }
    return <HomeworkSkeleton loadingLabel={props.loadingLabel} />;
  }
  const summary = computeHomeworkSummary(rows);
  return (
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <SummaryStrip summary={summary} labels={t} />
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Typography variant="h6" component="h2" sx={theme => ({ fontWeight: 700, color: theme.palette.text.primary })}>
          {t.listHeading}
        </Typography>
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })} aria-live="polite">
          {t.countLine(rows.length)}
        </Typography>
        {rows.length === 0 ? (
          <IconCircleEmptyState
            testId="student-homework-empty"
            icon={<AssignmentOutlined sx={{ fontSize: 36 }} />}
            title={props.emptyTitle}
            body={props.emptyBody}
          />
        ) : (
          rows.map(row => <HomeworkRow key={row.id} row={row} labels={t} locale={locale} />)
        )}
      </Stack>
    </Stack>
  );
}

/** The three-card honest partition strip (total / graded / pending). */
function SummaryStrip({
  summary,
  labels: t,
}: Readonly<{ summary: HomeworkSummary; labels: HomeworkLabels }>): ReactNode {
  const cards = [
    { label: t.summaryTotalLabel, value: summary.total, Icon: AssignmentOutlined },
    { label: t.summaryGradedLabel, value: summary.graded, Icon: TaskAltOutlined },
    { label: t.summaryPendingLabel, value: summary.pending, Icon: HourglassEmptyOutlined },
  ] as const;
  return (
    <Box
      data-testid="student-homework-summary"
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
      }}
    >
      {cards.map(card => (
        <DashboardStatCard key={card.label} stat={{ label: card.label, value: String(card.value), Icon: card.Icon }} />
      ))}
    </Box>
  );
}

/**
 * One assignment card: the honest meta line (assignment date + owning
 * session), then the two parallel track blocks — the SAME shared
 * presentation the parent portal renders, primary-accented for Jadid and
 * secondary-accented for Madi.
 */
function HomeworkRow({
  row,
  labels: t,
  locale,
}: Readonly<{ row: MyHomeworkQuery_myHomework_items; labels: HomeworkLabels; locale: string }>): ReactNode {
  return (
    <Card
      variant="outlined"
      data-testid="student-homework-row"
      sx={theme => ({
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        padding: 2,
        borderRadius: 2,
        borderColor: theme.palette.border.main,
        bgcolor: theme.palette.surfaceContainerLowest,
        transition: theme.transitions.create(["box-shadow", "border-color"], {
          duration: theme.transitions.duration.short,
          easing: theme.transitions.easing.easeOut,
        }),
        "&:hover": {
          boxShadow: theme.shadows[1],
          borderColor: theme.palette.outline,
        },
      })}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, minWidth: 0 }}>
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, fontWeight: 600 })}>
          {t.assignedPrefix} {formatApplicantDate(row.createdAt, locale)}
        </Typography>
        <Typography
          variant="caption"
          sx={theme => ({
            color: theme.palette.text.secondary,
            fontVariantNumeric: "tabular-nums",
            border: "1px solid",
            borderColor: theme.palette.outlineVariant,
            borderRadius: 999,
            px: 1,
            py: 0.25,
          })}
        >
          {t.sessionLine(row.sessionId)}
        </Typography>
      </Stack>
      <HomeworkTrackBlock
        track={row.jadid}
        trackLabel={t.trackJadid}
        noneLabel={t.trackNoneAssigned}
        columnGradeLabel={t.gradeLabel}
        icon={<AutoStoriesOutlined fontSize="small" />}
        accentColor="primary.main"
      />
      <HomeworkTrackBlock
        track={row.madi}
        trackLabel={t.trackMadi}
        noneLabel={t.trackNoneAssigned}
        columnGradeLabel={t.gradeLabel}
        icon={<ReplayOutlined fontSize="small" />}
        accentColor="secondary.main"
      />
    </Card>
  );
}

/** Linear skeleton (summary strip + three list rows) — `aria-busy` + label. */
function HomeworkSkeleton({ loadingLabel }: Readonly<{ loadingLabel: string }>): ReactNode {
  const SKELETON_ROW_KEYS = ["homework-row-skeleton-1", "homework-row-skeleton-2", "homework-row-skeleton-3"] as const;
  return (
    <Stack
      spacing={2}
      aria-busy="true"
      aria-label={loadingLabel}
      data-testid="student-homework-loading"
      sx={{ minWidth: 0 }}
    >
      <Stack direction="row" spacing={1.5}>
        {[1, 2, 3].map(n => (
          <Skeleton key={n} variant="rounded" sx={{ height: 56, borderRadius: 2, flex: 1 }} />
        ))}
      </Stack>
      {SKELETON_ROW_KEYS.map(key => (
        <Stack key={key} spacing={1}>
          <Skeleton variant="text" sx={{ fontSize: "0.9rem", maxWidth: 220 }} />
          <Skeleton variant="rounded" sx={{ height: 44, borderRadius: 1.5 }} />
          <Skeleton variant="rounded" sx={{ height: 44, borderRadius: 1.5 }} />
        </Stack>
      ))}
    </Stack>
  );
}
