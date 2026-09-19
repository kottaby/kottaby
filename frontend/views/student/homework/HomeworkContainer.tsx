"use client";

import {
  AssignmentOutlined,
  AutoStoriesOutlined,
  HourglassEmptyOutlined,
  PrintOutlined,
  ReplayOutlined,
  SearchOffOutlined,
  TaskAltOutlined,
} from "@mui/icons-material";
import { Box, ButtonBase, Card, Chip, IconButton, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import type { MyHomeworkQuery_myHomework_items } from "@/frontend/graphql/generated/gql/graphql";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { DashboardStatCard } from "@/frontend/views/dashboard/home/DashboardStatCard";
import { HomeworkTrackBlock } from "@/frontend/views/parent/monitoring/HomeworkTab.parts.helpers";
import { SearchFilterBar } from "@/frontend/views/parent/monitoring/SearchFilterBar";
import { DEFAULT_SORT, type SearchFilterState } from "@/frontend/views/parent/monitoring/SearchFilterBar.helpers";
import { type PrintableRow, PrintExportDialog } from "@/frontend/views/shared/print-export/PrintExportDialog";
import {
  computeHomeworkSummary,
  filterHomeworkByQuery,
  filterHomeworkByStatus,
  type HomeworkStatusFilter,
  type HomeworkSummary,
  toggleHomeworkFilter,
  toPrintableRows,
} from "@/frontend/views/student/homework/homework.helpers";
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
 * Search + filter — TWO composable lenses over the same rows: the summary
 * cards toggle the status bucket (the same predicate the strip computes)
 * and the shared `SearchFilterBar` free-text lens matches passage refs /
 * the locale-rendered date. The bar is the SHARED component the parent
 * portal's homework tab renders (search-only here — the rating/sort
 * selects stay parent-owned), fed namespace-local copy; the matching
 * predicate is the same shared one, so the two homework surfaces can
 * never disagree on what "matches".
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
  const [printOpen, setPrintOpen] = useState(false);
  const printableRows = useMemo(
    () => (rows !== undefined ? toPrintableRows(rows, iso => formatApplicantDate(iso, locale)) : []),
    [rows, locale]
  );
  // The student read is zero-identity, so a 403 can only mean a stale
  // role claim — the generic retryable alert covers it (no foreign-id
  // permission-fallback surface exists to disambiguate).
  const isError = error !== undefined && extractErrorCode(error) !== null;
  const [statusFilter, setStatusFilter] = useState<HomeworkStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const onSearchChange = (next: SearchFilterState) => {
    setSearchQuery(next.query);
  };

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
        printOpen={printOpen}
        onPrintOpenChange={setPrintOpen}
        printableRows={printableRows}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
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
    printOpen: boolean;
    onPrintOpenChange: (open: boolean) => void;
    printableRows: readonly PrintableRow[];
    statusFilter: HomeworkStatusFilter;
    onStatusFilter: (filter: HomeworkStatusFilter) => void;
    searchQuery: string;
    onSearchChange: (next: SearchFilterState) => void;
  }>
): ReactNode {
  const { rows, labels: t, locale, searchQuery } = props;
  // The composed view: status bucket FIRST (the summary strip's own
  // predicate), then the free-text lens. Computed before the branch
  // matrix — hooks may not sit behind conditional returns.
  const visibleRows = useMemo(() => {
    if (rows === undefined) {
      return undefined;
    }
    const statusFiltered = filterHomeworkByStatus(rows, props.statusFilter);
    return filterHomeworkByQuery(statusFiltered, searchQuery, (row, q) =>
      formatApplicantDate(row.createdAt, locale).toLowerCase().includes(q)
    );
  }, [rows, props.statusFilter, searchQuery, locale]);
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
  const settledVisibleRows = visibleRows ?? rows;
  return (
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <SummaryStrip summary={summary} labels={t} active={props.statusFilter} onToggle={props.onStatusFilter} />
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Typography
            variant="h6"
            component="h2"
            sx={theme => ({ fontWeight: 700, color: theme.palette.text.primary })}
          >
            {t.listHeading}
          </Typography>
          <Tooltip title={t.printLabel} arrow>
            <IconButton
              aria-label={t.printLabel}
              onClick={() => {
                props.onPrintOpenChange(true);
              }}
              size="small"
              sx={theme => ({
                color: theme.palette.primary.main,
                border: "1px solid",
                borderColor: theme.palette.outlineVariant,
                borderRadius: 1.5,
                "&:hover": { bgcolor: theme.palette.action.hover },
              })}
            >
              <PrintOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        {rows.length > 0 ? (
          <SearchFilterBar
            state={{ query: searchQuery, ratingFilter: null, sort: DEFAULT_SORT }}
            labels={t}
            onChange={props.onSearchChange}
            resultCount={settledVisibleRows.length}
            totalCount={rows.length}
            showRatingFilter={false}
            showSortFilter={false}
          />
        ) : null}
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })} aria-live="polite">
          {t.countLine(settledVisibleRows.length)}
        </Typography>
        {rows.length === 0 ? (
          <IconCircleEmptyState
            testId="student-homework-empty"
            icon={<AssignmentOutlined sx={{ fontSize: 36 }} />}
            title={props.emptyTitle}
            body={props.emptyBody}
          />
        ) : (
          <HomeworkListBody visibleRows={settledVisibleRows} labels={t} locale={locale} searchQuery={searchQuery} />
        )}
      </Stack>
      {props.printOpen ? (
        <PrintExportDialog
          open={props.printOpen}
          onClose={() => {
            props.onPrintOpenChange(false);
          }}
          rows={props.printableRows}
          metaSubject={t.pageTitle}
          title={t.printDialogTitle}
          colHeaders={[t.csvColumnDate, t.csvColumnJadid, t.csvColumnMadi, t.csvColumnGrade]}
          countLabel={t.countLine}
          filePrefix="student-homework"
          labels={{ printOption: t.printOption, exportCsvOption: t.exportCsvOption }}
        />
      ) : null}
    </Stack>
  );
}

/**
 * The list body under the "all" history: three empty arms, honestly
 * distinguished — a zero-match SEARCH keeps the state explicit (the bar
 * stays mounted above it, so the query is always clearable), a zero-match
 * STATUS bucket explains the toggle, and rows render with their per-card
 * status chips otherwise.
 */
function HomeworkListBody({
  visibleRows,
  labels: t,
  locale,
  searchQuery,
}: Readonly<{
  visibleRows: readonly MyHomeworkQuery_myHomework_items[];
  labels: HomeworkLabels;
  locale: string;
  searchQuery: string;
}>): ReactNode {
  if (visibleRows.length === 0) {
    if (searchQuery.trim() !== "") {
      return (
        <IconCircleEmptyState
          testId="student-homework-search-empty"
          icon={<SearchOffOutlined sx={{ fontSize: 36 }} />}
          title={t.searchNoResults}
          body={t.searchEmptyBody}
        />
      );
    }
    return (
      <IconCircleEmptyState
        testId="student-homework-filtered-empty"
        icon={<TaskAltOutlined sx={{ fontSize: 36 }} />}
        title={t.filterEmptyTitle}
        body={t.filterEmptyBody}
      />
    );
  }
  return (
    <>
      {visibleRows.map(row => (
        <HomeworkRow
          key={row.id}
          row={row}
          labels={t}
          locale={locale}
          graded={(row.jadid?.grade ?? null) !== null || (row.madi?.grade ?? null) !== null}
        />
      ))}
    </>
  );
}

/**
 * The three-card honest partition strip (total / graded / pending) — and
 * the status filter: each card is a toggle button over the SAME partition
 * the list filters by, so the cards and the list can never disagree. The
 * active bucket gets a primary ring + tint; clicking it again returns to
 * the unfiltered view (aria-pressed communicates the toggle state).
 */
function SummaryStrip({
  summary,
  labels: t,
  active,
  onToggle,
}: Readonly<{
  summary: HomeworkSummary;
  labels: HomeworkLabels;
  active: HomeworkStatusFilter;
  onToggle: (filter: HomeworkStatusFilter) => void;
}>): ReactNode {
  const cards = [
    { key: "all", label: t.summaryTotalLabel, value: summary.total, Icon: AssignmentOutlined, aria: t.filterAllLabel },
    {
      key: "graded",
      label: t.summaryGradedLabel,
      value: summary.graded,
      Icon: TaskAltOutlined,
      aria: t.filterGradedLabel,
    },
    {
      key: "pending",
      label: t.summaryPendingLabel,
      value: summary.pending,
      Icon: HourglassEmptyOutlined,
      aria: t.filterPendingLabel,
    },
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
      {cards.map(card => {
        const selected = active === card.key;
        return (
          <ButtonBase
            key={card.key}
            component="button"
            type="button"
            aria-pressed={selected}
            aria-label={card.aria}
            onClick={() => {
              onToggle(toggleHomeworkFilter(active, card.key));
            }}
            sx={theme => ({
              display: "block",
              width: "100%",
              textAlign: "inherit",
              borderRadius: 3,
              transition: theme.transitions.create(["box-shadow", "border-color", "background-color"], {
                duration: theme.transitions.duration.short,
                easing: theme.transitions.easing.easeOut,
              }),
            })}
          >
            <DashboardStatCard
              stat={{ label: card.label, value: String(card.value), Icon: card.Icon }}
              selected={selected}
            />
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/**
 * One assignment card: the honest meta line (assignment date + owning
 * session + status chip), then the two parallel track blocks — the SAME
 * shared presentation the parent portal renders, primary-accented for
 * Jadid and secondary-accented for Madi.
 */
function HomeworkRow({
  row,
  labels: t,
  locale,
  graded,
}: Readonly<{
  row: MyHomeworkQuery_myHomework_items;
  labels: HomeworkLabels;
  locale: string;
  graded: boolean;
}>): ReactNode {
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
        <Chip
          size="small"
          label={graded ? t.statusGradedChip : t.statusPendingChip}
          sx={theme => ({
            ml: "auto",
            fontWeight: 700,
            borderRadius: 999,
            bgcolor: graded ? theme.palette.successContainer : theme.palette.action.hover,
            color: graded ? theme.palette.onSuccessContainer : theme.palette.text.secondary,
          })}
        />
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
