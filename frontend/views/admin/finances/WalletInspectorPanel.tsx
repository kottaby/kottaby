"use client";

/**
 * WalletInspectorPanel — the teacher wallet inspector tab of the admin
 * financial auditing console (`/admin/finances`): the teacher picker (the
 * EXISTING admin teachers directory query — no new read surface), the
 * summary cards (balance / total earnings), and the picked teacher's
 * transaction ledger.
 *
 * Deep-link sync: the picker seeds from the `?teacherId=` URL param once on
 * mount (the container reads it and hands the sanitized seed down) and the
 * picker's own selection writes the param back through the container's
 * URL-mirror effect.
 *
 * Honest wallet state: the null-pair `balance`/`totalEarning` means the
 * teacher has no wallet row yet — the summary cards render the namespace's
 * empty copy (never fake zeros) and the ledger stays in its empty state.
 *
 * The manual wallet-adjustment dialog (credit / debit + mandatory reason)
 * lives here; its mutation owns the cache-refresh arm and every outcome
 * surfaces a container-level snackbar (the raw server `message` is NEVER
 * echoed).
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors, `*Outlined` icons.
 */

import { WalletOutlined as WalletIcon } from "@mui/icons-material";
import { Alert, AlertTitle, Autocomplete, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { useQuery } from "@apollo/client/react";
import { type ReactNode, useState } from "react";
import { adminTeachersQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import {
  useAdjustTeacherWallet,
  useAdminTeacherWallet,
  type AppliedWalletFilters,
} from "@/frontend/views/admin/finances/useAdminFinanceQueries";
import { WalletTransactionsTable } from "@/frontend/views/admin/finances/WalletTransactionsTable";
import { NoticeSnackbar } from "@/frontend/components/ui/NoticeSnackbar";
import { Common, Errors, useAppLocale, useAppTranslation } from "@/shared/locale";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";
import { type AdminTeachersQuery_adminTeachers_items, WalletAdjustmentDirection } from "@/frontend/graphql/generated/gql/graphql";

/** Snackbar autohide — the shared container-notice cadence. */
const NOTICE_AUTOHIDE_MS = 4000;

/** Adjustment dialog amount grammar — the backend's decimal grammar mirror. */
const ADJUSTMENT_AMOUNT_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;

/** WalletAdjustmentDirection wire values rendered by the dialog's choice pair. */
const DIRECTION_OPTIONS = ["credit", "debit"] as const;
type DirectionOption = (typeof DIRECTION_OPTIONS)[number];

/**
 * Narrows the dialog's "credit"|"debit" literal onto the generated
 * `WalletAdjustmentDirection` enum — a validated lookup (no unsafe
 * assertion; unknown values fail closed to Credit).
 */
function toWireDirection(option: DirectionOption): WalletAdjustmentDirection {
  return option === "debit" ? WalletAdjustmentDirection.Debit : WalletAdjustmentDirection.Credit;
}

/** Adjustment dialog draft state (raw controlled strings). */
interface AdjustDialogDrafts {
  readonly amount: string;
  readonly direction: DirectionOption;
  readonly reason: string;
}

const EMPTY_ADJUST_DRAFTS: AdjustDialogDrafts = { amount: "", direction: "credit", reason: "" };

/**
 * The manual wallet-adjustment dialog: amount + credit/debit choice + the
 * mandatory reason. The submit stays disabled until the amount matches the
 * decimal grammar, is non-zero, and the reason is non-empty.
 */
function AdjustWalletDialog({
  teacherName,
  open,
  onClose,
  onSubmit,
  loading,
  submitTestId,
}: Readonly<{
  teacherName: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { amount: string; direction: DirectionOption; reason: string }) => void;
  loading: boolean;
  submitTestId: string;
}>): ReactNode {
  const t = useAppTranslation(AdminFinance);
  const tc = useAppTranslation(Common);
  const [drafts, setDrafts] = useState<AdjustDialogDrafts>(EMPTY_ADJUST_DRAFTS);
  const [amountInvalid, setAmountInvalid] = useState(false);
  const [reasonInvalid, setReasonInvalid] = useState(false);

  const amountError = amountInvalid || (drafts.amount !== "" && !ADJUSTMENT_AMOUNT_PATTERN.test(drafts.amount));
  const zeroAmount = drafts.amount !== "" && Number(drafts.amount) === 0;

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading) return;
    const amountValid = ADJUSTMENT_AMOUNT_PATTERN.test(drafts.amount) && Number(drafts.amount) !== 0;
    const reasonValid = drafts.reason.trim() !== "";
    setAmountInvalid(!amountValid);
    setReasonInvalid(!reasonValid);
    if (!amountValid || !reasonValid) return;
    onSubmit({ amount: drafts.amount, direction: drafts.direction, reason: drafts.reason.trim() });
  };

  const handleDialogClose = (): void => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { component: "form", onSubmit: handleSubmit } }}
      aria-labelledby="adjust-wallet-dialog-title"
    >
      <DialogTitle id="adjust-wallet-dialog-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.adjustDialogTitle}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {teacherName}
        </Typography>
        <Stack direction="row" spacing={1}>
          {DIRECTION_OPTIONS.map(direction => (
            <Button
              key={direction}
              type="button"
              variant={drafts.direction === direction ? "contained" : "outlined"}
              onClick={() => {
                setDrafts(current => ({ ...current, direction }));
              }}
              data-testid={`admin-finances-adjust-direction-${direction}`}
              sx={{ minHeight: { xs: 44, sm: 40 }, flex: 1 }}
            >
              {direction === "credit" ? t.directionCredit : t.directionDebit}
            </Button>
          ))}
        </Stack>
        <TextField
          label={t.adjustAmountLabel}
          value={drafts.amount}
          onChange={event => {
            setDrafts(current => ({ ...current, amount: event.target.value }));
            setAmountInvalid(false);
          }}
          required
          error={amountError || zeroAmount}
          helperText={amountError || zeroAmount ? t.adjustAmountLabel : undefined}
          aria-invalid={amountError || zeroAmount}
          data-testid="admin-finances-adjust-amount"
          slotProps={{ htmlInput: { inputMode: "decimal", autoComplete: "off" } }}
        />
        <TextField
          label={t.adjustReasonLabel}
          value={drafts.reason}
          onChange={event => {
            setDrafts(current => ({ ...current, reason: event.target.value }));
            setReasonInvalid(false);
          }}
          required
          multiline
          minRows={2}
          error={reasonInvalid}
          helperText={reasonInvalid ? t.adjustReasonLabel : undefined}
          aria-invalid={reasonInvalid}
          data-testid="admin-finances-adjust-reason"
          slotProps={{ htmlInput: { autoComplete: "off" } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} disabled={loading} sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}>
          {tc.cancel}
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={loading || drafts.amount.trim() === "" || drafts.reason.trim() === ""}
          data-testid={submitTestId}
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {t.adjustSubmit}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface WalletInspectorPanelProps {
  /** Sanitized `?teacherId=` deep-link seed (the container read it on mount). */
  readonly initialTeacherId: number | null;
  /** Picker selection intent — the container mirrors it back into the URL. */
  readonly onTeacherChange: (teacherId: number | null) => void;
}

/** The wallet inspector panel: picker + summary cards + ledger + adjust dialog. */
export function WalletInspectorPanel({ initialTeacherId, onTeacherChange }: Readonly<WalletInspectorPanelProps>): ReactNode {
  const t = useAppTranslation(AdminFinance);
  const te = useAppTranslation(Errors);
  const locale = useAppLocale();

  // Teacher picker — the EXISTING admin teachers directory query (no new
  // read surface). The picker offers the first page's verified teachers.
  const teachers = useQuery(adminTeachersQueryDocument, {
    variables: { filters: null, page: 1, pageSize: 50 },
    fetchPolicy: "cache-and-network",
  });
  const teacherOptions: readonly AdminTeachersQuery_adminTeachers_items[] = teachers.data?.adminTeachers.items ?? [];

  const inspector = useAdminTeacherWallet(initialTeacherId);
  const [notice, setNotice] = useState<{ message: string; severity: "success" | "info" | "error" } | null>(null);
  const dismissNotice = (): void => {
    setNotice(null);
  };
  const [adjustOpen, setAdjustOpen] = useState(false);

  const outcomeCallbacks = {
    onSettled: () => {
      setAdjustOpen(false);
      setNotice({ message: te.validation, severity: "success" });
    },
    onRequestNotFound: () => {
      setNotice({ message: te.teacherNotFound, severity: "error" });
    },
    onNotPending: () => {
      setNotice({ message: te.withdrawalNotPending, severity: "error" });
    },
    onInsufficientBalance: () => {
      setNotice({ message: te.insufficientBalance, severity: "error" });
    },
    onInvalidAmount: () => {
      setNotice({ message: te.invalidAdjustmentAmount, severity: "error" });
    },
    onReasonRequired: () => {
      setNotice({ message: te.adjustmentReasonRequired, severity: "error" });
    },
    onForbidden: () => {
      setNotice({ message: te.forbidden, severity: "error" });
    },
    onFailure: () => {
      setNotice({ message: t.errorTitle, severity: "error" });
    },
  };

  const adjust = useAdjustTeacherWallet(outcomeCallbacks);

  // Denial classification for the wallet read (a non-admin caller fails the
  // admin role leg into FORBIDDEN).
  const errorCode = inspector.hasError ? "FORBIDDEN" : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";

  const wallet = inspector.wallet;
  // Honest wallet state: the null-pair balance/totalEarning means the
  // teacher has no wallet row yet — the summary cards render the empty
  // copy (never fake zeros). `null` while unresolved renders nothing.
  const noWallet = wallet !== null && wallet.balance === null && wallet.totalEarning === null;

  // Summary-card display: the honest empty copy for the no-wallet state, the
  // loading copy while unresolved, else the real amount (never fake zeros).
  // The nullable balances guard BEFORE the display helper — a null balance
  // alone (without the totalEarning pair) renders the empty copy too (the
  // honest no-wallet posture, never a fabricated value).
  const balanceDisplay =
    wallet === null || noWallet || wallet.balance === null
      ? t.inspectorEmpty
      : formatMoneyAmount(wallet.balance);
  const totalEarningsDisplay =
    wallet === null || noWallet || wallet.totalEarning === null
      ? t.inspectorEmpty
      : formatMoneyAmount(wallet.totalEarning);

  const pickedTeacher = teacherOptions.find(option => String(option.id) === (inspector.teacherId === null ? "" : String(inspector.teacherId))) ?? null;

  const handleTeacherPick = (teacher: AdminTeachersQuery_adminTeachers_items | null): void => {
    onTeacherChange(teacher === null ? null : teacher.id);
  };

  const summaryLabels = {
    typeHeader: t.typeHeader,
    statusHeader: t.statusHeader,
    amountHeader: t.amountHeader,
    descriptionHeader: t.descriptionHeader,
    dateHeader: t.dateHeader,
    empty: t.inspectorEmpty,
    loadingLabel: t.loadingLabel,
  };

  return (
    <Stack spacing={3} data-testid="admin-finances-wallet-panel">
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
            handleTeacherPick(value);
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
          disabled={inspector.teacherId === null}
          onClick={() => {
            setAdjustOpen(true);
          }}
          data-testid="admin-finances-adjust-open"
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {t.adjustDialogTitle}
        </Button>
      </Stack>

      {(() => {
        if (denied) {
          return (
            <Alert severity="error" variant="outlined" sx={{ borderRadius: "12px" }} data-testid="admin-finances-wallet-denied">
              <AlertTitle sx={{ fontWeight: 700 }}>{t.forbiddenTitle}</AlertTitle>
              <Typography variant="body2" component="p">
                {t.forbiddenBody}
              </Typography>
            </Alert>
          );
        }
        if (inspector.teacherId === null) {
          return (
            <Card
              sx={theme => ({ borderRadius: "12px", border: `1px solid ${theme.palette.border.light}`, boxShadow: theme.palette.shadow.card })}
            >
              <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
                <WalletIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {t.teacherPickerPlaceholder}
                </Typography>
              </Stack>
            </Card>
          );
        }
        return (
        <>
          {/* Summary cards — balance / total earnings, the honest pair. */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <Card
              sx={theme => ({
                borderRadius: "12px",
                border: `1px solid ${theme.palette.border.light}`,
                boxShadow: theme.palette.shadow.card,
              })}
              data-testid="admin-finances-balance-card"
            >
              <Stack spacing={1} sx={{ p: { xs: 2, md: 2.5 } }}>
                <Typography variant="subtitle2" component="h3" sx={theme => ({ color: theme.palette.text.secondary })}>
                  {t.balanceLabel}
                </Typography>
                <Typography variant="h5" component="p" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {balanceDisplay}
                </Typography>
              </Stack>
            </Card>
            <Card
              sx={theme => ({
                borderRadius: "12px",
                border: `1px solid ${theme.palette.border.light}`,
                boxShadow: theme.palette.shadow.card,
              })}
              data-testid="admin-finances-total-earnings-card"
            >
              <Stack spacing={1} sx={{ p: { xs: 2, md: 2.5 } }}>
                <Typography variant="subtitle2" component="h3" sx={theme => ({ color: theme.palette.text.secondary })}>
                  {t.totalEarningsLabel}
                </Typography>
                <Typography variant="h5" component="p" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {totalEarningsDisplay}
                </Typography>
              </Stack>
            </Card>
          </Box>

          <WalletTransactionsTable
            transactions={wallet?.transactions ?? []}
            loading={inspector.loading}
            locale={locale}
            labels={summaryLabels}
          />
        </>
        );
      })()}

      {adjustOpen && wallet !== null ? (
        <AdjustWalletDialog
          key="adjust-wallet-dialog"
          teacherName={wallet.teacherName}
          open
          onClose={() => {
            setAdjustOpen(false);
          }}
          onSubmit={({ amount, direction, reason }) => {
            if (inspector.teacherId === null) return;
            adjust.adjust({ teacherId: inspector.teacherId, amount, direction: toWireDirection(direction), reason });
          }}
          loading={adjust.loading}
          submitTestId="admin-finances-adjust-submit"
        />
      ) : null}

      <NoticeSnackbar notice={notice} autoHideDuration={NOTICE_AUTOHIDE_MS} onClose={dismissNotice} />
    </Stack>
  );
}

/** Re-exported for the summary cards' filter record type (panel seam). */
export type { AppliedWalletFilters };
