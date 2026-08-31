"use client";

/**
 * TeacherWalletContainer — the teacher's self-service wallet surface
 * (DEV3-013, R-306): the balance header, the withdrawal-request dialog,
 * and the newest-first transaction ledger.
 *
 * Data flow (mirrors the sessions containers):
 *  - `myWallet` useQuery — the always-on read; the wallet row is ensured
 *    server-side so a brand-new teacher renders an honest zeroed wallet.
 *  - `requestWithdrawal` useMutation — the payout write. The returned
 *    `Wallet!` payload carries `id` FIRST, so Apollo normalizes the
 *    post-debit balance + refreshed ledger onto `Wallet:<id>` WITHOUT a
 *    refetch; the `update` callback is the belt-and-braces `cache.modify`
 *    that keeps the normalized fields converged even if the automatic
 *    merge were bypassed.
 *  - Error arms map the typed `extensions.code` vocabulary: the
 *    `WALLET_INSUFFICIENT_FUNDS` conflict and the `WALLET_INVALID_AMOUNT`
 *    validation keep the dialog OPEN for a retry (with the in-dialog
 *    alert), while permission/identity classes fall through to the shared
 *    `mapGraphQLErrorByCode` fallbacks.
 *
 * Money discipline: amounts are decimal STRINGS rendered verbatim — no
 * numeric parse, no arithmetic. The signed ledger amount is a string
 * PREFIX (`+` / `-`) concatenated for display only. The client-side
 * amount validation is a UX-only MIRROR of the server's R-303 matrix
 * (same grammar, same positivity rule) — the server remains the sole
 * authority; the mirror only spares an obvious round-trip.
 *
 * i18n: `useAppTranslation(Wallet | Errors)` property access ONLY.
 * Feedback surfaces use plain MUI `Snackbar`/`Alert` (no notistack).
 * All interactive elements are ≥44px touch targets and RTL-safe (no
 * directional margins — Stack gaps only).
 */

import { useMutation, useQuery } from "@apollo/client/react";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import ArrowOutwardOutlinedIcon from "@mui/icons-material/ArrowOutwardOutlined";
import CardGiftcardOutlinedIcon from "@mui/icons-material/CardGiftcardOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Palette } from "@mui/material/styles";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import {
  type MyWalletQuery,
  type MyWalletQuery_myWallet_transactions,
  TransactionStatus as WireTransactionStatus,
  TransactionType as WireTransactionType,
} from "@/frontend/graphql/generated/gql/graphql";
import { myWalletQueryDocument, requestWithdrawalMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { mapGraphQLErrorByCode, normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import { SessionsEmptyState } from "@/frontend/views/student/sessions/SessionsEmptyState";
import { Common, Errors, useAppLocale, useAppTranslation, Wallet } from "@/shared/locale";
import type { CommonLabels } from "@/shared/locale/types/common";
import type { WalletLabels } from "@/shared/locale/types/wallet";

/** Snackbar autohide — parity with the sessions containers. */
const SNACKBAR_AUTOHIDE_MS = 4000;

/** The Apollo `__typename` of the normalized wallet entity. */
const WALLET_TYPE_NAME = "Wallet";

/**
 * UX-only mirror of the server's withdrawal-amount grammar (R-303):
 * 1-7 integer digits, an optional 1-2 digit fraction. The server matrix
 * stays the authority — this only gates the submit button + inline hint.
 */
const WITHDRAWAL_AMOUNT_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;

/** One transient container-level notice rendered in the MUI Snackbar slot. */
interface ContainerNotice {
  readonly message: string;
  readonly severity: "success" | "info" | "error";
}

/** Ledger row visual vocabulary — type → (icon, tinted avatar colors). */
function ledgerRowVisual(type: MyWalletQuery_myWallet_transactions["type"]): {
  readonly Icon: typeof AddCircleOutlineOutlinedIcon;
  readonly color: "success" | "error" | "info";
} {
  switch (type) {
    case WireTransactionType.Earning:
      return { Icon: AddCircleOutlineOutlinedIcon, color: "success" };
    case WireTransactionType.Withdrawal:
      return { Icon: ArrowOutwardOutlinedIcon, color: "error" };
    case WireTransactionType.Bonus:
      return { Icon: CardGiftcardOutlinedIcon, color: "info" };
  }
  const exhaustive: never = type;
  throw new Error(`Unexpected transaction type: ${String(exhaustive)}`);
}

/** Ledger status chip color vocabulary. */
function ledgerStatusColor(status: MyWalletQuery_myWallet_transactions["status"]): "warning" | "success" | "error" {
  switch (status) {
    case WireTransactionStatus.Pending:
      return "warning";
    case WireTransactionStatus.Completed:
      return "success";
    case WireTransactionStatus.Failed:
      return "error";
  }
  const exhaustive: never = status;
  throw new Error(`Unexpected transaction status: ${String(exhaustive)}`);
}

/** Signed ledger amount — a string PREFIX for display only (never math). */
function signedAmount(row: MyWalletQuery_myWallet_transactions): string {
  return row.type === WireTransactionType.Withdrawal ? `-${row.amount}` : `+${row.amount}`;
}

/**
 * Amount color tone — the MUI palette token per ledger type (ProfileView
 * palette-callback pattern). Exhaustive switch, no nested ternaries.
 */
function amountTone(type: MyWalletQuery_myWallet_transactions["type"], palette: Palette): string {
  switch (type) {
    case WireTransactionType.Earning:
      return palette.success.main;
    case WireTransactionType.Withdrawal:
      return palette.error.main;
    case WireTransactionType.Bonus:
      return palette.info.main;
  }
  const exhaustive: never = type;
  throw new Error(`Unexpected transaction type: ${String(exhaustive)}`);
}

/**
 * Ledger avatar tone — the Material 3 container/on-container pair per
 * ledger type (ProfileView pattern). Exhaustive switch.
 */
function avatarTone(
  type: MyWalletQuery_myWallet_transactions["type"],
  palette: Palette
): { readonly bgcolor: string; readonly color: string } {
  switch (type) {
    case WireTransactionType.Earning:
      return { bgcolor: palette.secondaryContainer, color: palette.onSecondaryContainer };
    case WireTransactionType.Withdrawal:
      return { bgcolor: palette.errorContainer, color: palette.onErrorContainer };
    case WireTransactionType.Bonus:
      return { bgcolor: palette.surfaceContainerHighest, color: palette.onSurfaceVariant };
  }
  const exhaustive: never = type;
  throw new Error(`Unexpected transaction type: ${String(exhaustive)}`);
}

/**
 * Client-side mirror of the server's positivity rule: the grammar matched
 * AND at least one nonzero digit present. Pure string predicates — no
 * numeric parse of a money value.
 */
function isClientValidAmount(trimmed: string): boolean {
  return WITHDRAWAL_AMOUNT_PATTERN.test(trimmed) && /[1-9]/.test(trimmed);
}

/**
 * The wallet view: ALWAYS-ON chrome (title + balance cards) over a
 * swapping body — skeleton / permission fallback / error notice / ledger
 * — plus the withdrawal dialog and the snackbar chrome.
 */
export function TeacherWalletContainer(): ReactNode {
  const t = useAppTranslation(Wallet);
  const te = useAppTranslation(Errors);
  const tc = useAppTranslation(Common);
  const locale = useAppLocale();

  // Withdrawal-dialog open slot + the in-flight submit marker.
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [notice, setNotice] = useState<ContainerNotice | null>(null);

  const { data, loading, error } = useQuery(myWalletQueryDocument);

  const dismissNotice = useCallback((): void => {
    setNotice(null);
  }, []);

  const openDialog = useCallback((): void => {
    setWithdrawDialogOpen(true);
  }, []);

  const closeDialog = useCallback((): void => {
    setWithdrawDialogOpen(false);
  }, []);

  // Single in-flight slot for the withdrawal submit — the dialog CTA
  // disables while the request is on the wire, and the dialog stays open
  // through any failure arm for an honest retry.
  const [inFlight, setInFlight] = useState(false);

  const [requestWithdrawal] = useMutation(requestWithdrawalMutationDocument);

  const handleWithdraw = useCallback(
    (rawAmount: string): void => {
      const trimmed = rawAmount.trim();
      // Client mirror first (UX); the server re-validates authoritatively.
      if (!isClientValidAmount(trimmed)) {
        setNotice({ message: te.walletInvalidAmount, severity: "error" });
        return;
      }
      setInFlight(true);
      void requestWithdrawal({
        variables: { input: { amount: trimmed } },
        // Cache NORMALIZE — the payload carries `id` first, so Apollo
        // merges the post-debit balance + refreshed ledger onto
        // `Wallet:<id>`. The explicit modify is belt-and-braces; NO refetch.
        update(cache, { data: resultData }) {
          const updated = resultData?.requestWithdrawal;
          if (!updated) return;
          cache.modify({
            id: cache.identify({ __typename: WALLET_TYPE_NAME, id: updated.id }),
            fields: {
              balance: () => updated.balance,
              totalEarning: () => updated.totalEarning,
              transactions: () => updated.transactions,
            },
          });
        },
        onCompleted: () => {
          setInFlight(false);
          setWithdrawDialogOpen(false);
          setNotice({ message: t.withdrawSuccessNotice, severity: "success" });
        },
        onError: mutationError => {
          setInFlight(false);
          const rawCode = extractErrorCode(mutationError);
          const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
          if (code === "WALLET_INSUFFICIENT_FUNDS") {
            // The dialog STAYS OPEN for a retry; the localized funds denial
            // rides the snackbar (the shared error surface).
            setNotice({ message: te.insufficientBalance, severity: "error" });
            return;
          }
          setNotice({ message: t.genericError, severity: "error" });
        },
      });
    },
    [requestWithdrawal, te, t]
  );

  const walletRow = data?.myWallet;

  return (
    <Stack data-testid="wallet-page" spacing={3} sx={{ p: { xs: 2, sm: 3 }, width: "100%" }}>
      {/* ── Balance header ─────────────────────────────────────────────── */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: "stretch" }}>
        <BalanceCard
          testId="wallet-balance-card"
          label={t.balanceLabel}
          value={walletRow?.balance}
          currency={walletRow?.currency}
          loading={loading && walletRow === undefined}
          icon={<AccountBalanceWalletOutlinedIcon fontSize="small" />}
        />
        <BalanceCard
          testId="wallet-earning-card"
          label={t.totalEarningLabel}
          value={walletRow?.totalEarning}
          currency={walletRow?.currency}
          loading={loading && walletRow === undefined}
          icon={<SavingsOutlinedIcon fontSize="small" />}
        />
      </Stack>

      {/* ── Primary CTA ────────────────────────────────────────────────── */}
      <Button
        data-testid="wallet-request-withdrawal"
        variant="contained"
        size="large"
        onClick={openDialog}
        disabled={loading || error !== undefined || walletRow === undefined}
        startIcon={<AccountBalanceWalletOutlinedIcon />}
        sx={{ alignSelf: "flex-start", minHeight: 44, px: 3 }}
      >
        {t.requestWithdrawal}
      </Button>

      {/* ── Swapping body ──────────────────────────────────────────────── */}
      <WalletBody error={error} loading={loading} data={data} locale={locale} t={t} />

      {/* ── Withdrawal dialog (single slot) ────────────────────────────── */}
      {withdrawDialogOpen && walletRow !== undefined ? (
        <WithdrawDialog
          open={withdrawDialogOpen}
          balance={walletRow.balance}
          inFlight={inFlight}
          onClose={closeDialog}
          onSubmit={handleWithdraw}
          t={t}
          tc={tc}
        />
      ) : null}

      {/* ── Snackbar chrome ────────────────────────────────────────────── */}
      <Snackbar
        open={notice !== null}
        autoHideDuration={SNACKBAR_AUTOHIDE_MS}
        onClose={dismissNotice}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {notice === null ? undefined : (
          <Alert onClose={dismissNotice} severity={notice.severity} variant="filled">
            {notice.message}
          </Alert>
        )}
      </Snackbar>
    </Stack>
  );
}

// ─── Balance card ────────────────────────────────────────────────────────────

interface BalanceCardProps {
  readonly testId: string;
  readonly label: string;
  readonly value: string | undefined;
  readonly currency: string | undefined;
  readonly loading: boolean;
  readonly icon: ReactNode;
}

/**
 * One tinted-icon balance summary card. The value renders VERBATIM (a
 * decimal string) beside the currency label — never reformatted, never
 * computed.
 */
function BalanceCard({ testId, label, value, currency, loading, icon }: Readonly<BalanceCardProps>): ReactNode {
  return (
    <Paper
      data-testid={testId}
      variant="outlined"
      sx={theme => ({
        p: 2.5,
        flex: 1,
        display: "flex",
        gap: 2,
        alignItems: "center",
        borderRadius: 3,
        bgcolor: theme.palette.surfaceContainerLow,
      })}
    >
      <Avatar
        variant="rounded"
        sx={theme => ({
          bgcolor: theme.palette.secondaryContainer,
          color: theme.palette.onSecondaryContainer,
          width: 44,
          height: 44,
          borderRadius: 2,
        })}
      >
        {icon}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={theme => ({ mb: 0.5, color: theme.palette.onSurfaceVariant })}>
          {label}
        </Typography>
        {loading && value === undefined ? (
          <Skeleton width={96} height={32} />
        ) : (
          <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
            <Typography
              data-testid={`${testId}-value`}
              variant="h5"
              sx={theme => ({ fontWeight: 700, color: theme.palette.onSurface, fontVariantNumeric: "tabular-nums" })}
            >
              {value}
            </Typography>
            {currency !== undefined ? (
              <Typography variant="caption" sx={theme => ({ fontWeight: 600, color: theme.palette.onSurfaceVariant })}>
                {currency}
              </Typography>
            ) : null}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}

// ─── Swapping body ───────────────────────────────────────────────────────────

interface WalletBodyProps {
  readonly loading: boolean;
  readonly error: unknown;
  readonly data: MyWalletQuery | undefined;
  readonly locale: string;
  readonly t: WalletLabels;
}

/**
 * The swapping body BELOW the chrome — skeleton / permission fallback /
 * error notice / ledger list. Pure presentational resolver (module-scope,
 * mirroring the sessions containers).
 */
function WalletBody({ loading, error, data, locale, t }: Readonly<WalletBodyProps>): ReactNode {
  if (loading && data === undefined) {
    return (
      <Stack spacing={1.5} data-testid="wallet-loading-skeleton">
        {[0, 1, 2].map(index => (
          <Skeleton key={index} variant="rounded" height={64} />
        ))}
      </Stack>
    );
  }
  if (error !== undefined) {
    const rawCode = extractErrorCode(error);
    const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
    const action = mapGraphQLErrorByCode(code, { contextKind: "query", hasForm: false });
    if (action?.kind === "permission-fallback" || action?.kind === "auth-recovery") {
      return <PermissionDeniedFallback />;
    }
    return (
      <Alert data-testid="wallet-error-notice" severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
        {t.genericError}
      </Alert>
    );
  }
  if (data === undefined) {
    return null;
  }
  const transactions = data.myWallet.transactions;
  if (transactions.length === 0) {
    return (
      <SessionsEmptyState
        testId="wallet-ledger-empty"
        icon={AccountBalanceWalletOutlinedIcon}
        title={t.ledgerEmptyTitle}
        body={t.ledgerEmptyBody}
      />
    );
  }
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Stack
        direction="row"
        spacing={1}
        sx={theme => ({
          px: 2.5,
          py: 1.5,
          alignItems: "center",
          bgcolor: theme.palette.surfaceContainerLow,
        })}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t.ledgerTitle}
        </Typography>
      </Stack>
      <Divider />
      <List data-testid="wallet-ledger" disablePadding>
        {transactions.map((row, index) => {
          const visual = ledgerRowVisual(row.type);
          return (
            <ListItem
              key={row.id}
              data-testid={`wallet-ledger-row-${row.id}`}
              divider={index < transactions.length - 1}
              secondaryAction={
                <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
                  <Typography
                    data-testid={`wallet-ledger-row-${row.id}-amount`}
                    sx={theme => ({
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: amountTone(row.type, theme.palette),
                    })}
                  >
                    {signedAmount(row)}
                  </Typography>
                  <Chip
                    data-testid={`wallet-ledger-row-${row.id}-status`}
                    label={ledgerStatusLabel(row.status, t)}
                    color={ledgerStatusColor(row.status)}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              }
              sx={{ pr: { xs: 14, sm: 16 } }}
            >
              <ListItemAvatar>
                <Avatar variant="rounded" sx={theme => ({ borderRadius: 2, ...avatarTone(row.type, theme.palette) })}>
                  <visual.Icon fontSize="small" />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={ledgerTypeLabel(row.type, t)}
                secondary={
                  row.description === null
                    ? formatApplicantDate(row.createdAt, locale)
                    : `${row.description} · ${formatApplicantDate(row.createdAt, locale)}`
                }
                slotProps={{
                  primary: { variant: "body2", sx: { fontWeight: 600 } },
                  secondary: { variant: "caption" },
                }}
              />
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );
}

/** Ledger type label — exhaustive over the wire enum via the labels map. */
function ledgerTypeLabel(type: MyWalletQuery_myWallet_transactions["type"], t: WalletLabels): string {
  switch (type) {
    case WireTransactionType.Earning:
      return t.typeEarning;
    case WireTransactionType.Withdrawal:
      return t.typeWithdrawal;
    case WireTransactionType.Bonus:
      return t.typeBonus;
  }
  const exhaustive: never = type;
  throw new Error(`Unexpected transaction type: ${String(exhaustive)}`);
}

/** Ledger status label — exhaustive over the wire enum via the labels map. */
function ledgerStatusLabel(status: MyWalletQuery_myWallet_transactions["status"], t: WalletLabels): string {
  switch (status) {
    case WireTransactionStatus.Pending:
      return t.statusPending;
    case WireTransactionStatus.Completed:
      return t.statusCompleted;
    case WireTransactionStatus.Failed:
      return t.statusFailed;
  }
  const exhaustive: never = status;
  throw new Error(`Unexpected transaction status: ${String(exhaustive)}`);
}

// ─── Withdrawal dialog ───────────────────────────────────────────────────────

interface WithdrawDialogProps {
  readonly open: boolean;
  readonly balance: string;
  readonly inFlight: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (rawAmount: string) => void;
  readonly t: WalletLabels;
  readonly tc: CommonLabels;
}

/**
 * The withdrawal-request dialog. The amount field is a plain controlled
 * TextField (inputMode decimal); the live hint renders the available
 * balance; the submit CTA disables while the input fails the client
 * mirror OR the request is in flight. Failure arms keep the dialog open
 * (honest retry surface) and surface the denial through the container
 * snackbar.
 */
function WithdrawDialog({
  open,
  balance,
  inFlight,
  onClose,
  onSubmit,
  t,
  tc,
}: Readonly<WithdrawDialogProps>): ReactNode {
  const [amount, setAmount] = useState("");

  const trimmed = useMemo(() => amount.trim(), [amount]);
  const clientValid = isClientValidAmount(trimmed);
  const submitDisabled = inFlight || !clientValid;

  const handleSubmit = useCallback((): void => {
    if (!clientValid) return;
    onSubmit(trimmed);
  }, [clientValid, onSubmit, trimmed]);

  return (
    <Dialog
      data-testid="wallet-withdraw-dialog"
      open={open}
      onClose={inFlight ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>{t.withdrawDialogTitle}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t.withdrawDialogBody}</DialogContentText>
        <TextField
          data-testid="wallet-amount-input"
          autoFocus
          fullWidth
          label={t.amountLabel}
          placeholder={t.amountPlaceholder}
          value={amount}
          onChange={event => setAmount(event.target.value)}
          inputMode="decimal"
          error={trimmed !== "" && !clientValid}
          helperText={trimmed !== "" && !clientValid ? t.invalidAmount : t.availableBalanceHint(balance)}
          disabled={inFlight}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
            }
          }}
        />
        {inFlight ? (
          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
            <CircularProgress size={18} />
            <Typography variant="caption" sx={theme => ({ color: theme.palette.onSurfaceVariant })}>
              {t.withdrawSubmit}
            </Typography>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={inFlight} sx={{ minHeight: 44 }}>
          {tc.cancel}
        </Button>
        <Button
          data-testid="wallet-withdraw-submit"
          onClick={handleSubmit}
          disabled={submitDisabled}
          variant="contained"
          sx={{ minHeight: 44 }}
        >
          {t.withdrawSubmit}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
