"use client";

import { AssignmentOutlined, HourglassEmptyOutlined, PrintOutlined, TaskAltOutlined } from "@mui/icons-material";
import { Box, ButtonBase, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import type { MyHomeworkQuery_myHomework_items } from "@/frontend/graphql/generated/gql/graphql";
import { DashboardStatCard } from "@/frontend/views/dashboard/home/DashboardStatCard";
import { SearchFilterBar } from "@/frontend/views/parent/monitoring/SearchFilterBar";
import { DEFAULT_SORT } from "@/frontend/views/parent/monitoring/SearchFilterBar.helpers";
import { HomeworkListBody } from "@/frontend/views/student/homework/HomeworkContainer.parts";
import {
  type HomeworkStatusFilter,
  type HomeworkSummary,
  toggleHomeworkFilter,
} from "@/frontend/views/student/homework/homework.helpers";
import type { HomeworkLabels } from "@/shared/locale/types/homework";

/**
 * The three-card honest partition strip (total / graded / pending) — and
 * the status filter: each card is a toggle button over the SAME partition
 * the list filters by, so the cards and the list can never disagree. The
 * active bucket gets a primary ring + tint; clicking it again returns to
 * the unfiltered view (aria-pressed communicates the toggle state).
 */
export function SummaryStrip({
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
 * The assignment-list section: the heading with the print entry point,
 * the shared search bar (search-only here — the rating/sort selects stay
 * parent-owned), the live count line, and the empty/list swap.
 */
export function HomeworkListSection({
  labels: t,
  locale,
  rows,
  settledVisibleRows,
  searchQuery,
  onSearchChange,
  onPrintOpenChange,
  emptyTitle,
  emptyBody,
}: Readonly<{
  labels: HomeworkLabels;
  locale: string;
  rows: readonly MyHomeworkQuery_myHomework_items[];
  settledVisibleRows: readonly MyHomeworkQuery_myHomework_items[];
  searchQuery: string;
  onSearchChange: (next: { query: string }) => void;
  onPrintOpenChange: (open: boolean) => void;
  emptyTitle: string;
  emptyBody: string;
}>): ReactNode {
  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h6" component="h2" sx={theme => ({ fontWeight: 700, color: theme.palette.text.primary })}>
          {t.listHeading}
        </Typography>
        <Tooltip title={t.printLabel} arrow>
          <IconButton
            aria-label={t.printLabel}
            onClick={() => {
              onPrintOpenChange(true);
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
          onChange={onSearchChange}
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
          icon={<TaskAltOutlined sx={{ fontSize: 36 }} />}
          title={emptyTitle}
          body={emptyBody}
        />
      ) : (
        <HomeworkListBody visibleRows={settledVisibleRows} labels={t} locale={locale} searchQuery={searchQuery} />
      )}
    </Stack>
  );
}
