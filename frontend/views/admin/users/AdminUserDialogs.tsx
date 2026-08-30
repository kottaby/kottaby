"use client";

/**
 * AdminUserDialogs — shared mutation dialogs for the admin user-management
 * surface.
 *
 * Used by BOTH the directory container (row-level actions in
 * `AdminUsersDirectoryContainer`) and the detail container (inline header
 * actions in `AdminUserDetailContainer`), so the edit / soft-delete /
 * reactivate UX is identical on both surfaces.
 *
 * Error-propagation contract (deliberate):
 *  - The caller's `onSubmit` / `onConfirm` MUST let rejections PROPAGATE —
 *    do NOT swallow them in a try/catch at the call site. The dialog's own
 *    submit/confirm handler catches the rejection and projects it:
 *      • VALIDATION field errors → inline `helperText` under the offending
 *        input (via `extractFieldErrors` on `extensions.fields`);
 *      • `USER_SELF_DEACTIVATION_FORBIDDEN` → the in-dialog warning alert
 *        (dialog stays open so the alert is visible);
 *      • any other code → the dialog simply stays open (the caller's UI
 *        state is unchanged; the admin can retry or cancel).
 *  - The dialog closes ONLY when the caller resolves — i.e. on success the
 *    caller flips its open-target state AFTER awaiting the mutation.
 *
 * All chrome copy comes from the `AdminUsers` locale namespace (passed from
 * the server as `labels`). MUI v9 `sx`-only discipline; `*Outlined` icons in
 * the callers; ≥44px touch targets on every button.
 */

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { type ReactNode, type SubmitEventHandler, useState } from "react";
import type { Gender } from "@/frontend/graphql/generated/gql/graphql";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { useAdminUserFormFeedback } from "@/frontend/views/admin/users/useAdminUserFormFeedback";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

/**
 * Minimal shape `EditUserDialog` needs from its target user. Both the
 * directory list item (`AdminUserListItemFields` — gender + dateOfBirth were
 * added to the list fragment exactly for this purpose) and the detail
 * projection (`AdminUserDetailFields`) structurally satisfy this interface,
 * so the dialog is reusable from either surface without adapter objects.
 */
export interface AdminUserEditTarget {
  readonly id: number;
  readonly fullName: string;
  readonly phone: string | null;
  readonly country: string | null;
  readonly gender: Gender | null | undefined;
  readonly dateOfBirth: string | null | undefined;
}

/**
 * Minimal shape `DeleteConfirmDialog` needs from its target user. The
 * governance boolean decides whether the dialog presents soft-delete or
 * reactivate copy.
 */
export interface AdminUserDeleteTarget {
  readonly id: number;
  readonly isDeleted: boolean | null | undefined;
}

/** Whitelist patch payload the edit dialog hands back to its caller. */
export interface AdminEditUserPatchInput {
  readonly fullName?: string;
  readonly phone?: string;
  readonly country?: string;
  readonly gender?: "Male" | "Female" | "Other";
  readonly dateOfBirth?: string;
}

interface EditDialogProps {
  readonly labels: AdminUsersLabels;
  readonly user: AdminUserEditTarget;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: AdminEditUserPatchInput) => Promise<void>;
}

export function EditUserDialog({ labels, user, loading, onClose, onSubmit }: EditDialogProps): ReactNode {
  const EDIT_GENDER_ID = "admin-users-edit-gender";
  const [form, setForm] = useState({
    fullName: user.fullName,
    phone: user.phone ?? "",
    country: user.country ?? "",
    // Pre-fill gender + dateOfBirth from the target row so admins see the
    // current value when patching. The list fragment carries these two safe
    // `users` columns to avoid a second round-trip to the detail endpoint.
    // `null` / `undefined` map to the empty select value.
    gender: (user.gender ?? "") as "" | "Male" | "Female" | "Other",
    dateOfBirth: user.dateOfBirth ?? "",
  });
  const { fieldErrors, formError, runWithFeedback } = useAdminUserFormFeedback();

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async e => {
    e.preventDefault();
    await runWithFeedback(() =>
      onSubmit({
        fullName: form.fullName || undefined,
        phone: form.phone || undefined,
        country: form.country || undefined,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
      })
    );
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{labels.editDialog.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label={labels.editDialog.fullName}
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              error={!!fieldErrors.fullName}
              helperText={fieldErrors.fullName}
            />
            <TextField
              label={labels.editDialog.phone}
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              error={!!fieldErrors.phone}
              helperText={fieldErrors.phone}
            />
            <TextField
              label={labels.editDialog.country}
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
              error={!!fieldErrors.country}
              helperText={fieldErrors.country}
            />
            <AdminUserGenderSelect
              labels={labels}
              id={EDIT_GENDER_ID}
              label={labels.editDialog.gender}
              value={form.gender}
              onChange={gender => setForm({ ...form, gender })}
              error={fieldErrors.gender}
            />
            <TextField
              label={labels.editDialog.dateOfBirth}
              type="date"
              value={form.dateOfBirth}
              onChange={e => setForm({ ...form, dateOfBirth: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              error={!!fieldErrors.dateOfBirth}
              helperText={fieldErrors.dateOfBirth}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={loading} sx={{ minHeight: 44 }}>
            {labels.editDialog.cancel}
          </Button>
          <Button type="submit" variant="contained" disabled={loading} sx={{ minHeight: 44 }}>
            {labels.editDialog.submit}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

interface DeleteDialogProps {
  readonly labels: AdminUsersLabels;
  readonly user: AdminUserDeleteTarget;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
}

export function DeleteConfirmDialog({ labels, user, loading, onClose, onConfirm }: DeleteDialogProps): ReactNode {
  const isReactivate = user.isDeleted ?? false;
  const [selfDeactivationAlert, setSelfDeactivationAlert] = useState(false);

  const handleConfirm = async () => {
    setSelfDeactivationAlert(false);
    try {
      await onConfirm();
    } catch (err) {
      // `err` is `unknown` in a catch block (strict mode) — no `as unknown`
      // cast needed before passing to the error-code extractor.
      const code = extractErrorCode(err);
      if (code === "USER_SELF_DEACTIVATION_FORBIDDEN") {
        setSelfDeactivationAlert(true);
      }
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{isReactivate ? labels.reactivateConfirm.title : labels.deleteConfirm.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {selfDeactivationAlert && <Alert severity="warning">{labels.selfDeactivationAlert.message}</Alert>}
          <Typography>{isReactivate ? labels.reactivateConfirm.message : labels.deleteConfirm.message}</Typography>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {isReactivate ? labels.reactivateConfirm.confirm : labels.deleteConfirm.consequences}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading} sx={{ minHeight: 44 }}>
          {isReactivate ? labels.reactivateConfirm.cancel : labels.deleteConfirm.cancel}
        </Button>
        <Button
          onClick={handleConfirm}
          color={isReactivate ? "success" : "error"}
          variant="contained"
          disabled={loading}
          sx={{ minHeight: 44 }}
        >
          {isReactivate ? labels.reactivateConfirm.confirm : labels.deleteConfirm.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Gender option values shared by the create- and edit-user dialogs. */
type AdminUserGenderValue = "" | "Male" | "Female" | "Other";

interface AdminUserGenderSelectProps {
  readonly labels: AdminUsersLabels;
  /** Stable element id wiring `InputLabel htmlFor` ↔ `Select id` (a11y). */
  readonly id: string;
  /** Visible label — the caller picks its own namespace block
   *  (`editDialog.gender` vs `createDialog.gender`). */
  readonly label: string;
  readonly value: AdminUserGenderValue;
  readonly onChange: (value: AdminUserGenderValue) => void;
  /**
   * Field-error string, `undefined` when the field has no VALIDATION error.
   * The create dialog always passes `undefined` (its gender select renders
   * without the error affordance); the edit dialog projects
   * `fieldErrors.gender` (red select + message below it), so the two
   * dialogs' pre-extraction behavior is preserved exactly.
   */
  readonly error: string | undefined;
}

/**
 * Gender select shared by `EditUserDialog` (here) and the directory's
 * `CreateUserDialog` — identical option set, option copy, and label wiring
 * on both surfaces (single source for the four `genderOptions` MenuItems).
 * `Select`'s generic is pinned by the `value` prop type, so
 * `e.target.value` arrives already typed as `AdminUserGenderValue` — no
 * `as` cast at the caller.
 */
export function AdminUserGenderSelect({
  labels,
  id,
  label,
  value,
  onChange,
  error,
}: AdminUserGenderSelectProps): ReactNode {
  return (
    <FormControl fullWidth error={!!error}>
      <InputLabel htmlFor={id}>{label}</InputLabel>
      <Select id={id} value={value} label={label} onChange={e => onChange(e.target.value)}>
        <MenuItem value="">{labels.genderOptions.unspecified}</MenuItem>
        <MenuItem value="Male">{labels.genderOptions.male}</MenuItem>
        <MenuItem value="Female">{labels.genderOptions.female}</MenuItem>
        <MenuItem value="Other">{labels.genderOptions.other}</MenuItem>
      </Select>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  );
}

interface AdminUserSuccessSnackbarProps {
  /** `null` keeps the snackbar closed; any string renders it. */
  readonly message: string | null;
  readonly onClose: () => void;
}

/**
 * Success-feedback snackbar shared by the directory and the detail
 * containers — identical open/close semantics (4s auto-hide, bottom-center
 * anchor, filled success alert with an explicit close affordance) after
 * every completed admin write (create / update / soft-delete / reactivate /
 * clipboard copy).
 */
export function AdminUserSuccessSnackbar({ message, onClose }: AdminUserSuccessSnackbarProps): ReactNode {
  return (
    <Snackbar
      open={message !== null}
      autoHideDuration={4000}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="success" variant="filled" onClose={onClose}>
        {message}
      </Alert>
    </Snackbar>
  );
}
