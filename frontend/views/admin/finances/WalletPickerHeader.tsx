"use client";

/**
 * WalletPickerHeader — the teacher picker + adjustment trigger row of the
 * admin wallet inspector (`/admin/finances`, wallet tab), extracted from
 * the panel as a focused sibling component.
 *
 * The picker offers the first page's verified teachers (the EXISTING admin
 * teachers directory query — owned by the panel; no new read surface) and
 * the outlined button opens the manual wallet-adjustment dialog.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors.
 */

import { Autocomplete, Button, Stack, TextField } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminTeachersQuery_adminTeachers_items } from "@/frontend/graphql/generated/gql/graphql";
import { useAppTranslation } from "@/shared/locale";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";

/** The wallet picker + adjustment trigger row. */
export function WalletPickerHeader({
  teacherOptions,
  pickedTeacher,
  onPick,
  adjustDisabled,
  onAdjustOpen,
}: Readonly<{
  teacherOptions: readonly AdminTeachersQuery_adminTeachers_items[];
  pickedTeacher: AdminTeachersQuery_adminTeachers_items | null;
  onPick: (teacher: AdminTeachersQuery_adminTeachers_items | null) => void;
  adjustDisabled: boolean;
  onAdjustOpen: () => void;
}>): ReactNode {
  const t = useAppTranslation(AdminFinance);

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      sx={{ gap: 2, alignItems: { sm: "flex-end" }, justifyContent: "space-between" }}
    >
      <Autocomplete
        fullWidth
        options={[...teacherOptions]}
        value={pickedTeacher}
        getOptionLabel={option => option.name}
        onChange={(_event, value) => {
          onPick(value);
        }}
        renderInput={params => (
          <TextField
            {...params}
            label={t.teacherPickerLabel}
            placeholder={t.teacherPickerPlaceholder}
            data-testid="admin-finances-teacher-picker"
            slotProps={{
              htmlInput: { ...params.slotProps?.htmlInput, "aria-label": t.teacherPickerLabel },
            }}
          />
        )}
        sx={{ maxWidth: { sm: 480 } }}
      />
      <Button
        variant="outlined"
        disabled={adjustDisabled}
        onClick={onAdjustOpen}
        data-testid="admin-finances-adjust-open"
        sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
      >
        {t.adjustDialogTitle}
      </Button>
    </Stack>
  );
}
