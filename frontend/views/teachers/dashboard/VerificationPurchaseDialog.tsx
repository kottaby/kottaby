"use client";

/**
 * VerificationPurchaseDialog — the confirmation dialog behind the teacher
 * dashboard's purchase entry points (the pending prompt CTA and the
 * eligible re-apply CTA).
 *
 * The plan descriptor is REAL catalog data: the plan-catalog query runs
 * only while the dialog is open (`skip`) and the active row is
 * title-matched on the shared verification-plan title constant — no plan
 * value is ever hardcoded client-side. A missing active row disables the
 * confirm affordance and renders the generic error copy.
 *
 * Confirm delegates to {@link useVerificationPurchase} (the write path with
 * the per-attempt idempotency header and the code-branched denial notices).
 * Feedback rides the hosting container's notice sink — the dialog renders
 * no snackbar of its own because the notice must survive the success close.
 * Failure arms keep the dialog open (honest retry surface). The mock
 * gateway's null checkout URL triggers no redirect: this surface performs
 * no navigation. MUI v9 `sx`-only styling, theme-palette callbacks only,
 * RTL-safe logical layout (flex/grid gaps, no directional margins).
 */

import { useQuery } from "@apollo/client/react";
import {
  CloseRounded as CloseIcon,
  LockOutlined as ConfirmIcon,
  SchoolOutlined as PlanIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import type { PlanCatalogQuery_planCatalog } from "@/frontend/graphql/generated/gql/graphql";
import { planCatalogQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { useVerificationPurchase } from "@/frontend/views/teachers/dashboard/useVerificationPurchase";
import { VERIFICATION_PLAN_TITLE } from "@/shared/constants/verification-plan.constants";
import { Applicant, Common, useAppTranslation } from "@/shared/locale";
import type { ApplicantLabels } from "@/shared/locale/types/applicant";

/** The transient notice shape the hosting container stores. */
export interface PurchaseNotice {
  readonly message: string;
  readonly severity: "success" | "info" | "error";
}

interface VerificationPurchaseDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Transient-notice sink owned by the hosting container (survives unmount). */
  readonly onNotice: (notice: PurchaseNotice) => void;
}

interface PlanSlotProps {
  readonly verificationPlan: PlanCatalogQuery_planCatalog | null;
  readonly planLoaded: boolean;
  readonly t: ApplicantLabels;
}

/** Plan descriptor slot: in-flight probe, missing-plan denial, or the line. */
function PlanSlot({ verificationPlan, planLoaded, t }: Readonly<PlanSlotProps>): ReactNode {
  if (!planLoaded) {
    return <CircularProgress size={18} sx={theme => ({ color: theme.palette.onSurfaceVariant })} />;
  }
  if (verificationPlan === null) {
    return (
      <Alert severity="error" variant="outlined">
        {t.purchaseGenericError}
      </Alert>
    );
  }
  return (
    <Box
      sx={theme => ({
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        p: 2,
        borderRadius: 2,
        bgcolor: theme.palette.primaryContainer,
        color: theme.palette.onPrimaryContainer,
      })}
    >
      <PlanIcon fontSize="small" />
      <Typography variant="body2">
        {t.purchasePlanLine(
          verificationPlan.title,
          verificationPlan.price,
          verificationPlan.currency,
          verificationPlan.sessionCount,
          verificationPlan.intervalDays
        )}
      </Typography>
    </Box>
  );
}

/** The verification-plan purchase confirmation dialog — see the module docblock. */
export function VerificationPurchaseDialog({
  open,
  onClose,
  onNotice,
}: Readonly<VerificationPurchaseDialogProps>): ReactNode {
  const t = useAppTranslation(Applicant);
  const tc = useAppTranslation(Common);
  const { purchasing, confirmPurchase } = useVerificationPurchase({ onNotice, onClose });
  const { data } = useQuery(planCatalogQueryDocument, { skip: !open });

  const verificationPlan = data?.planCatalog.find(planRow => planRow.title === VERIFICATION_PLAN_TITLE) ?? null;
  const confirmDisabled = purchasing || verificationPlan === null;

  return (
    <Dialog
      data-testid="verification-purchase-dialog"
      open={open}
      onClose={purchasing ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, fontWeight: 700 }}
      >
        {t.purchaseDialogTitle}
        <IconButton aria-label={tc.close} onClick={onClose} disabled={purchasing} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <DialogContentText>{t.purchaseDialogDescription}</DialogContentText>
        <PlanSlot verificationPlan={verificationPlan} planLoaded={data !== undefined} t={t} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={purchasing} sx={{ minHeight: 44 }}>
          {t.purchaseCancelCta}
        </Button>
        <Button
          data-testid="verification-purchase-confirm"
          onClick={confirmPurchase}
          disabled={confirmDisabled}
          variant="contained"
          startIcon={<ConfirmIcon />}
          sx={{ minHeight: 44 }}
        >
          {t.purchaseConfirmCta}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
