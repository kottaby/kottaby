"use client";

import { FilterListOutlined } from "@mui/icons-material";
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { type ReactNode, useId } from "react";
import { SessionStickyBar } from "@/frontend/components/ui/sessionList";
import { SessionStatus, SessionType } from "@/frontend/graphql/generated/gql/graphql";
import type {
  DirectoryFilterDraft,
  StatusSummaryCounts,
} from "@/frontend/views/admin/session-governance/AdminSessionGovernanceContainer";
import { STATUS_LABEL_KEY, TONE_COLORS } from "@/frontend/views/student/sessions/sessionRowPresentation";
import { AdminSessionGovernance, useAppTranslation } from "@/shared/locale";
import type { AdminSessionGovernanceLabels } from "@/shared/locale/types/adminSessionGovernance";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminSessionGovernanceChrome — the ALWAYS-ON chrome of the admin session
 * governance directory (`/admin/session-governance`, DEV3-021): the page
 * title over the sticky honest-count bar, the per-status summary strip, and
 * the directory filter bar. It renders in EVERY branch of the body state
 * matrix (skeleton / denial / error / empty / rows) — only the body BELOW
 * it swaps.
 *
 * Summary strip — per-status counts derive from the LOADED directory page
 * (real data only; the container passes the honest server `totalCount` for
 * the sticky bar and nothing is extrapolated across pages). The
 * needs-attention card uses the warning tone (REQ-028 badge family).
 *
 * Filter bar — teacher/student user-id inputs (whole numbers only; the wire
 * members are `Int`), the session-type and session-status selects (token
 * space: an explicit "all" token clears the filter — no enum comparisons),
 * and the half-open creation window (`date` inputs committed as inclusive
 * from-midnight / EXCLUSIVE to-midnight UTC instants). APPLY validates the
 * draft and commits; RESET restores the unfiltered directory. Draft/apply
 * orchestration lives in the container — this bar is a pure affordance.
 *
 * Status vocabulary reuses the shared sessions-namespace status labels via
 * the `STATUS_LABEL_KEY` table; tones/icons come from the shared
 * presentation tables. MUI v9 discipline: `sx`-only styling, colors
 * exclusively through `theme.palette.*` callbacks, `*Outlined` icons only,
 * RTL-safe logical composition (grid + logical alignment, no physical
 * margins).
 */

/** Token that clears a select filter (renders the "all" copy). */
const ALL_TOKEN = "all";

/** Explicit type options — value-driven array, never enum comparisons. */
const TYPE_OPTIONS: readonly {
  readonly value: SessionType;
  readonly labelKey: keyof Pick<
    AdminSessionGovernanceLabels,
    "typeStudentSession" | "typeTeacherEvaluation" | "typeReEvaluation"
  >;
}[] = [
  { value: SessionType.StudentSession, labelKey: "typeStudentSession" },
  { value: SessionType.TeacherEvaluation, labelKey: "typeTeacherEvaluation" },
  { value: SessionType.ReEvaluation, labelKey: "typeReEvaluation" },
];

/** Explicit status options — reuse the shared status label-key table. */
const STATUS_OPTIONS: readonly { readonly value: SessionStatus }[] = [
  { value: SessionStatus.Scheduled },
  { value: SessionStatus.Started },
  { value: SessionStatus.Completed },
  { value: SessionStatus.Cancelled },
  { value: SessionStatus.Disputed },
];

interface AdminSessionGovernanceChromeProps {
  /** Localized page title. */
  readonly title: string;
  /** Localized honest-total line (server `totalCount`). */
  readonly countLine: string;
  /** Per-status counts over the loaded page (real data only). */
  readonly statusCounts: StatusSummaryCounts;
  /** Needs-attention card label (summary strip). */
  readonly needsAttentionLabel: string;
  /** Scope hint — the counts describe the LOADED page. */
  readonly summaryScopeHint: string;
  /** Shared sessions-namespace labels (status chip vocabulary). */
  readonly statusLabels: SessionsLabels;
  readonly filterDraft: DirectoryFilterDraft;
  /** True when the last APPLY carried a non-whole-number id token. */
  readonly filterInvalidId: boolean;
  /** Localized invalid-id message for the offending id field. */
  readonly filterInvalidMessage: string;
  /** Draft edit intent (the container owns validation + commit). */
  readonly onFilterDraftChange: (patch: Partial<DirectoryFilterDraft>) => void;
  readonly onApplyFilters: () => void;
  readonly onResetFilters: () => void;
}

/** Title + sticky honest-count bar + status summary + filter bar. */
export function AdminSessionGovernanceChrome({
  title,
  countLine,
  statusCounts,
  needsAttentionLabel,
  summaryScopeHint,
  statusLabels,
  filterDraft,
  filterInvalidId,
  filterInvalidMessage,
  onFilterDraftChange,
  onApplyFilters,
  onResetFilters,
}: Readonly<AdminSessionGovernanceChromeProps>): ReactNode {
  const t = useAppTranslation(AdminSessionGovernance);
  const typeSelectId = useId();
  const statusSelectId = useId();

  return (
    <Stack sx={{ gap: 2 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <SessionStickyBar>
        <Typography
          variant="body2"
          data-testid="admin-session-governance-count"
          sx={theme => ({ color: theme.palette.text.secondary })}
        >
          {countLine}
        </Typography>
      </SessionStickyBar>

      <Stack
        data-testid="admin-session-governance-summary"
        sx={theme => ({
          display: "grid",
          gap: 1,
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(6, 1fr)" },
          p: 1.5,
          borderRadius: 3,
          border: "1px solid",
          borderColor: theme.palette.outlineVariant,
          bgcolor: theme.palette.surfaceContainerLow,
        })}
      >
        <SummaryCard
          count={statusCounts.scheduled}
          label={statusLabels[STATUS_LABEL_KEY[SessionStatus.Scheduled] ?? "statusScheduled"]}
          tone="info"
        />
        <SummaryCard
          count={statusCounts.started}
          label={statusLabels[STATUS_LABEL_KEY[SessionStatus.Started] ?? "statusStarted"]}
          tone="primary"
        />
        <SummaryCard
          count={statusCounts.completed}
          label={statusLabels[STATUS_LABEL_KEY[SessionStatus.Completed] ?? "statusCompleted"]}
          tone="success"
        />
        <SummaryCard
          count={statusCounts.cancelled}
          label={statusLabels[STATUS_LABEL_KEY[SessionStatus.Cancelled] ?? "statusCancelled"]}
          tone="error"
        />
        <SummaryCard
          count={statusCounts.disputed}
          label={statusLabels[STATUS_LABEL_KEY[SessionStatus.Disputed] ?? "statusDisputed"]}
          tone="warning"
        />
        <SummaryCard count={statusCounts.needsAttention} label={needsAttentionLabel} tone="warning" />
        <Typography
          variant="caption"
          sx={theme => ({ color: theme.palette.text.secondary, gridColumn: "1 / -1", textAlign: "start" })}
        >
          {summaryScopeHint}
        </Typography>
      </Stack>

      <Box
        component="section"
        aria-label={t.filterBarLabel}
        data-testid="admin-session-governance-filters"
        sx={theme => ({
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: theme.palette.outlineVariant,
          bgcolor: theme.palette.surfaceContainerLow,
        })}
      >
        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 1, gridColumn: "1 / -1" }}>
          <FilterListOutlined fontSize="small" sx={theme => ({ color: theme.palette.text.secondary })} />
          <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 700 }}>
            {t.filterBarLabel}
          </Typography>
        </Stack>

        <TextField
          label={t.filterTeacherIdLabel}
          value={filterDraft.teacherUserId}
          onChange={event => onFilterDraftChange({ teacherUserId: event.target.value })}
          error={filterInvalidId}
          helperText={filterInvalidId ? filterInvalidMessage : undefined}
          aria-invalid={filterInvalidId}
          inputMode="numeric"
          data-testid="admin-session-governance-filter-teacher-id"
          slotProps={{ htmlInput: { inputMode: "numeric", autoComplete: "off" } }}
        />
        <TextField
          label={t.filterStudentIdLabel}
          value={filterDraft.studentUserId}
          onChange={event => onFilterDraftChange({ studentUserId: event.target.value })}
          inputMode="numeric"
          data-testid="admin-session-governance-filter-student-id"
          slotProps={{ htmlInput: { inputMode: "numeric", autoComplete: "off" } }}
        />

        <FormControl>
          <InputLabel id={typeSelectId}>{t.filterTypeLabel}</InputLabel>
          <Select
            labelId={typeSelectId}
            label={t.filterTypeLabel}
            value={filterDraft.type ?? ALL_TOKEN}
            onChange={event => {
              const token = event.target.value;
              const match = TYPE_OPTIONS.find(option => option.value === token);
              onFilterDraftChange({ type: token === ALL_TOKEN || match === undefined ? null : match.value });
            }}
            data-testid="admin-session-governance-filter-type"
          >
            <MenuItem value={ALL_TOKEN}>{t.filterTypeAll}</MenuItem>
            {TYPE_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {t[option.labelKey]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl>
          <InputLabel id={statusSelectId}>{t.filterStatusLabel}</InputLabel>
          <Select
            labelId={statusSelectId}
            label={t.filterStatusLabel}
            value={filterDraft.status ?? ALL_TOKEN}
            onChange={event => {
              const token = event.target.value;
              const match = STATUS_OPTIONS.find(option => option.value === token);
              onFilterDraftChange({ status: token === ALL_TOKEN || match === undefined ? null : match.value });
            }}
            data-testid="admin-session-governance-filter-status"
          >
            <MenuItem value={ALL_TOKEN}>{t.filterStatusAll}</MenuItem>
            {STATUS_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {statusLabels[STATUS_LABEL_KEY[option.value] ?? "statusDisputed"]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label={t.filterDateFromLabel}
          type="date"
          value={filterDraft.dateFrom ?? ""}
          onChange={event => onFilterDraftChange({ dateFrom: event.target.value === "" ? null : event.target.value })}
          data-testid="admin-session-governance-filter-date-from"
          slotProps={{ htmlInput: { autoComplete: "off" } }}
        />
        <TextField
          label={t.filterDateToLabel}
          type="date"
          value={filterDraft.dateTo ?? ""}
          onChange={event => onFilterDraftChange({ dateTo: event.target.value === "" ? null : event.target.value })}
          data-testid="admin-session-governance-filter-date-to"
          slotProps={{ htmlInput: { autoComplete: "off" } }}
        />

        <Stack
          sx={{
            flexDirection: { xs: "column", sm: "row" },
            gap: 1.5,
            gridColumn: "1 / -1",
            justifyContent: "flex-end",
            alignItems: { xs: "stretch", sm: "center" },
          }}
        >
          <Button
            variant="outlined"
            onClick={onResetFilters}
            data-testid="admin-session-governance-filters-reset"
            sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
          >
            {t.filterReset}
          </Button>
          <Button
            variant="contained"
            onClick={onApplyFilters}
            data-testid="admin-session-governance-filters-apply"
            sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
          >
            {t.filterApply}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

interface SummaryCardProps {
  readonly count: number;
  readonly label: string;
  readonly tone: "info" | "primary" | "success" | "error" | "warning";
}

/** One status-summary card — count over label on the status tone pair. */
function SummaryCard({ count, label, tone }: Readonly<SummaryCardProps>): ReactNode {
  const toneColors = TONE_COLORS[tone] ?? TONE_COLORS.warning;
  return (
    <Stack
      sx={theme => ({
        gap: 0.5,
        p: 1.25,
        borderRadius: 2,
        alignItems: "flex-start",
        bgcolor: toneColors.bg(theme.palette),
        color: toneColors.fg(theme.palette),
      })}
    >
      <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
        {count}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 600, textAlign: "start" }}>
        {label}
      </Typography>
    </Stack>
  );
}
