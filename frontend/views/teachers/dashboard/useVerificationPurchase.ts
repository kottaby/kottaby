/**
 * useVerificationPurchase — the verification-plan purchase write path,
 * extracted from `VerificationPurchaseDialog` (the view-file size split).
 *
 * Owns the `useMutation(purchaseVerificationPlanMutationDocument)` wiring
 * carrying the per-attempt idempotency key via the Apollo context header
 * `x-idempotency-key`: the key is minted once for the mounted dialog and
 * regenerated ONLY after a successful purchase (failed attempts keep the
 * same key so the server-side replay dedupe stays effective), and it never
 * rides an input — the mutation itself is inputless.
 *
 * Cache convergence is a REFETCH: a success re-issues
 * `myApplicantProfileQueryDocument` (the status card flips to in-evaluation),
 * and the cooldown denial re-issues it too (the card's remaining waiting
 * time may have been stale while the dialog was open). Feedback rides the
 * hosting container's notice sink; denial branches on `extensions.code`
 * (`extractErrorCode`) — the cooldown denial is the ONLY server message ever
 * rendered, and it is already localized server-side with the formatted
 * expiry instant. The mock gateway's null `checkoutUrl` never triggers a
 * redirect: this surface performs no navigation at all.
 */

import { useApolloClient, useMutation } from "@apollo/client/react";
import { useCallback, useRef } from "react";
import {
  myApplicantProfileQueryDocument,
  purchaseVerificationPlanMutationDocument,
} from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode, extractErrorMessage } from "@/frontend/lib/graphql-error-utils";
import { logger } from "@/frontend/lib/logger";
import type { PurchaseNotice } from "@/frontend/views/teachers/dashboard/VerificationPurchaseDialog";
import { Applicant, useAppTranslation } from "@/shared/locale";

/** The purchase write path consumed by the confirmation dialog. */
export interface VerificationPurchase {
  /** True while the purchase mutation is in flight (buttons disable). */
  readonly purchasing: boolean;
  /** Confirms the purchase — the only path that fires the mutation. */
  readonly confirmPurchase: () => void;
}

/** Wiring the write path needs from the dialog. */
export interface VerificationPurchaseWiring {
  /** Transient-notice sink owned by the hosting container. */
  readonly onNotice: (notice: PurchaseNotice) => void;
  /** Closes the dialog (success only — failure arms stay open). */
  readonly onClose: () => void;
}

/** The verification-plan purchase write path — see the module docblock. */
export function useVerificationPurchase(wiring: VerificationPurchaseWiring): VerificationPurchase {
  const { onNotice, onClose } = wiring;
  const t = useAppTranslation(Applicant);
  const apolloClient = useApolloClient();

  const attemptKeyRef = useRef<string>(crypto.randomUUID());
  const [purchasePlan, { loading: purchasing }] = useMutation(purchaseVerificationPlanMutationDocument, {
    refetchQueries: [myApplicantProfileQueryDocument],
  });

  const refetchProfile = useCallback((): void => {
    void apolloClient.refetchQueries({ include: [myApplicantProfileQueryDocument] }).catch((error: unknown) => {
      logger.warn(
        { caller: "useVerificationPurchase" },
        "profile refetch after denial failed",
        error instanceof Error ? `${error.name}: ${error.message}` : error
      );
    });
  }, [apolloClient]);

  const confirmPurchase = useCallback((): void => {
    if (purchasing) {
      return;
    }
    const run = async (): Promise<void> => {
      try {
        await purchasePlan({ context: { headers: { "x-idempotency-key": attemptKeyRef.current } } });
        onNotice({ message: t.purchaseSuccess, severity: "success" });
        onClose();
        // Rotation happens ONLY on success — failed attempts keep the same
        // per-attempt key so the server-side replay dedupe stays effective.
        attemptKeyRef.current = crypto.randomUUID();
      } catch (mutationError: unknown) {
        const code = extractErrorCode(mutationError);
        if (code === "APPLICANT_COOLDOWN_ACTIVE") {
          // The single server message rendered verbatim — the localized
          // cooldown copy (server-formatted expiry instant), not raw output.
          onNotice({ message: extractErrorMessage(mutationError) ?? t.purchaseGenericError, severity: "error" });
          refetchProfile();
          return;
        }
        if (code === "DUPLICATE_REQUEST") {
          onNotice({ message: t.purchaseDuplicateInfo, severity: "info" });
          return;
        }
        onNotice({ message: t.purchaseGenericError, severity: "error" });
      }
    };
    void run();
  }, [onClose, onNotice, purchasePlan, purchasing, refetchProfile, t]);

  return { purchasing, confirmPurchase };
}
