"use client";

import { FilterListOutlined } from "@mui/icons-material";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { AdminSessionFilterFields } from "@/frontend/views/admin/session-governance/AdminSessionFilterFields";
import type { DirectoryFilterDraft } from "@/frontend/views/admin/session-governance/AdminSessionGovernanceContainer";
import { AdminSessionGovernance, useAppTranslation } from "@/shared/locale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminSessionFilterBar — the directory filter bar of the admin session
 * governance surface (`/admin/session-governance`): the section
 * shell over the teacher/student user-id inputs (whole numbers only; the
 * wire members are `Int`), the {@link AdminSessionFilterFields} selects +
 * creation window, and the APPLY/RESET action row. APPLY validates the
 * draft and commits; RESET restores the unfiltered directory. Draft/apply
 * orchestration lives in the container — this bar is a pure affordance.
 */

interface AdminSessionFilterBarProps {
  readonly filterDraft: DirectoryFilterDraft;
  /** True when the last APPLY carried a non-whole-number TEACHER id token. */
  readonly filterInvalidTeacherId: boolean;
  /** True when the last APPLY carried a non-whole-number STUDENT id token. */
  readonly filterInvalidStudentId: boolean;
  /** Localized invalid-id message for the offending id field. */
  readonly filterInvalidMessage: string;
  /** Draft edit intent (the container owns validation + commit). */
  readonly onFilterDraftChange: (patch: Partial<DirectoryFilterDraft>) => void;
  readonly onApplyFilters: () => void;
  readonly onResetFilters: () => void;
  /** Shared sessions-namespace labels (status select vocabulary). */
  readonly statusLabels: SessionsLabels;
}

/** The filter section: id inputs + selects/dates + apply/reset actions. */
export function AdminSessionFilterBar({
  filterDraft,
  filterInvalidTeacherId,
  filterInvalidStudentId,
  filterInvalidMessage,
  onFilterDraftChange,
  onApplyFilters,
  onResetFilters,
  statusLabels,
}: Readonly<AdminSessionFilterBarProps>): ReactNode {
  const t = useAppTranslation(AdminSessionGovernance);

  return (
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
        error={filterInvalidTeacherId}
        helperText={filterInvalidTeacherId ? filterInvalidMessage : undefined}
        aria-invalid={filterInvalidTeacherId}
        inputMode="numeric"
        data-testid="admin-session-governance-filter-teacher-id"
        slotProps={{ htmlInput: { inputMode: "numeric", autoComplete: "off" } }}
      />
      <TextField
        label={t.filterStudentIdLabel}
        value={filterDraft.studentUserId}
        onChange={event => onFilterDraftChange({ studentUserId: event.target.value })}
        error={filterInvalidStudentId}
        helperText={filterInvalidStudentId ? filterInvalidMessage : undefined}
        aria-invalid={filterInvalidStudentId}
        inputMode="numeric"
        data-testid="admin-session-governance-filter-student-id"
        slotProps={{ htmlInput: { inputMode: "numeric", autoComplete: "off" } }}
      />

      <AdminSessionFilterFields
        filterDraft={filterDraft}
        onFilterDraftChange={onFilterDraftChange}
        statusLabels={statusLabels}
      />

      <FilterActions onApplyFilters={onApplyFilters} onResetFilters={onResetFilters} />
    </Box>
  );
}

interface FilterActionsProps {
  readonly onApplyFilters: () => void;
  readonly onResetFilters: () => void;
}

/** The apply/reset action row (apply = contained, reset = quiet outline). */
function FilterActions({ onApplyFilters, onResetFilters }: Readonly<FilterActionsProps>): ReactNode {
  const t = useAppTranslation(AdminSessionGovernance);

  return (
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
        sx={theme => ({
          minHeight: { xs: 44, sm: 40 },
          px: 3,
          // MUI's default outlined treatment (primary.main text + 50%-alpha
          // border) sinks into the dark filter card (~3.4:1) — quiet must
          // stay legible, so the reset rides the near-white text + solid
          // outline pair instead.
          color: theme.palette.text.primary,
          borderColor: theme.palette.outline,
          "&:hover": {
            borderColor: theme.palette.primary.main,
            backgroundColor: "transparent",
          },
        })}
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
  );
}
