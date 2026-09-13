"use client";

/**
 * PendingPurchaseZone — the pending-branch body of the applicant status
 * card: the awaiting-purchase prompt panel plus the ENABLED purchase entry
 * CTA that opens the verification-purchase confirmation dialog. The CTA is
 * a working entry point, not an affordance placeholder — the purchase
 * surface it opens lives beside the card in the same dashboard slot.
 */

import { PaymentOutlined as PurchaseIcon } from "@mui/icons-material";
import { Button, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { PromptPanel } from "@/frontend/views/teachers/dashboard/ApplicantStatusZones";

/** Shared CTA metrics — comfortable ≥44px touch target. */
const purchaseButtonSx = { minHeight: 44, px: 3 } as const;

interface PendingZoneProps {
  /** The awaiting-purchase explanatory copy (`pendingPrompt`). */
  readonly promptText: string;
  /** The purchase entry label (`purchaseCta`). */
  readonly ctaLabel: string;
  /** Opens the verification-purchase confirmation dialog. */
  readonly onPurchaseIntent: () => void;
}

/** Pending body — prompt panel plus the working purchase entry CTA. */
export function PendingZone({ promptText, ctaLabel, onPurchaseIntent }: Readonly<PendingZoneProps>): ReactNode {
  return (
    <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
      <PromptPanel>{promptText}</PromptPanel>
      <Button variant="contained" startIcon={<PurchaseIcon />} onClick={onPurchaseIntent} sx={{ ...purchaseButtonSx }}>
        {ctaLabel}
      </Button>
    </Stack>
  );
}
