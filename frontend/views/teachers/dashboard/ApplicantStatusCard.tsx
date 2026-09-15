"use client";

import { useQuery } from "@apollo/client/react";
import { Alert, Typography } from "@mui/material";
import { type ReactNode, useCallback, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import type { MyApplicantProfileQuery_myApplicantProfile } from "@/frontend/graphql/generated/gql/graphql";
import { myApplicantProfileQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { resolveStatusBody } from "@/frontend/views/teachers/dashboard/ApplicantStatusResolution";
import {
  BranchHeaderRow,
  LoadingSkeleton,
  StatusChip,
  StatusShell,
} from "@/frontend/views/teachers/dashboard/ApplicantStatusShell";
import { CertifiedBranch } from "@/frontend/views/teachers/dashboard/ApplicantStatusZones";
import { VerificationPurchaseDialog } from "@/frontend/views/teachers/dashboard/VerificationPurchaseDialog";
import { Applicant, Errors, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * ApplicantStatusCard — the teacher-applicant verification-lifecycle status
 * card mounted above the fold on `/teacher/dashboard`.
 *
 * Self-contained client component: NO props, NO client-side role logic and
 * NO locally derived lifecycle booleans — the page-level server guards remain
 * the ONLY authorization boundary and the `myApplicantProfile` zero-argument
 * query answers identity server-side; every rendered fact comes straight from
 * the payload.
 *
 * Render branches (visual state matrix):
 *
 * | # | Condition | Surface |
 * |---|-----------|---------|
 * | 1 | query in flight | Skeleton card (`aria-busy`) |
 * | 2 | error code `UNAUTHORIZED` / `FORBIDDEN` | shared `PermissionDeniedFallback` — never bare `null` |
 * | 3 | any other transport error | inline `Alert` carrying `errors.internalServerError` |
 * | 4 | `myApplicantProfile === null` (one answer for never-applied + certified) | certified summary + informational teaching-surfaces hint |
 * | 5 | `Pending` | pending chip + awaiting-purchase prompt + purchase CTA (opens the dialog) |
 * | 6 | `InEvaluation` | info chip + attempt counter + progress hint |
 * | 7 | `Failed` + `cooldownActive` | warning chip + `{cooldownUntil}` expanded via {@link formatApplicantDate} + DISABLED re-apply CTA; `eligibleToReapply` deliberately suppressed — the truthful message is WHEN re-application unlocks |
 * | 8 | `Failed` + `canPurchaseVerification` | success affordance + ENABLED re-apply CTA (opens the dialog) |
 * | 9 | `Passed` (explicit truthfulness branch) | passed chip + certified-summary narrative |
 * | — | unknown status value (defensive; server fails closed) | inline `Alert` carrying `errors.applicantStatusCorrupt` — never crashes |
 *
 * The purchasable branches (5 + 8) open the mounted
 * `VerificationPurchaseDialog`; the dialog owns the purchase mutation, its
 * idempotency-key lifecycle, the localized outcome notices and the success
 * / cooldown-denial profile refetch (the SAME `myApplicantProfile` query
 * handle this card reads — the flip re-renders the branch in place). The
 * cooldown branch (7) keeps its intentionally disabled CTA while the server
 * says `canPurchaseVerification === false`.
 *
 * MUI v9 discipline: `sx`-only styling (no direct style props), colors
 * exclusively through `theme.palette.*` callbacks, `*Outlined` icons only,
 * RTL-safe logical composition (flex/grid mirroring — no physical margins),
 * and every user-facing string resolved through compile-time i18n handles
 * (`useAppTranslation(Applicant)` property access — NEVER `t('key')`).
 *
 * Internal structure: the shell/chrome primitives live in
 * `ApplicantStatusShell.tsx`, the branch-zone compositions in
 * `ApplicantStatusZones.tsx`, and the per-status body resolution in
 * `ApplicantStatusResolution.tsx`; this module is the composing entry point.
 */
export function ApplicantStatusCard(): ReactNode {
  const t = useAppTranslation(Applicant);
  const te = useAppTranslation(Errors);
  const locale = useAppLocale();
  const { data, loading, error, refetch } = useQuery(myApplicantProfileQueryDocument);
  // Purchase-dialog state — opened by the purchasable branch CTAs (5 + 8);
  // the dialog itself owns the mutation + outcome notices + profile refetch.
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const openPurchase = useCallback(() => setPurchaseOpen(true), []);
  const closePurchase = useCallback(() => setPurchaseOpen(false), []);

  // Branch 1 — in flight: skeleton placeholder announces busy semantics.
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Branches 2–3 — settled failures: denial class vs generic surfaced copy.
  if (error) {
    const code = extractErrorCode(error);
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
      return <PermissionDeniedFallback />;
    }
    return (
      <StatusShell>
        <Alert severity="error" variant="outlined">
          {te.internalServerError}
        </Alert>
      </StatusShell>
    );
  }

  // Apollo settles queries with data-or-error; this narrow guard keeps the
  // compiler informed without unsafe assertions.
  if (!data) {
    return <LoadingSkeleton />;
  }

  const profile: MyApplicantProfileQuery_myApplicantProfile | null = data.myApplicantProfile;

  // Branch 4 — the single-null answer: a verified teacher with no
  // applicants row sees the certified summary. NEVER pending/evaluation
  // copy, and NEVER a "passed" claim — null does not distinguish the two.
  if (profile === null) {
    return <CertifiedBranch t={t} showHint />;
  }

  const resolved = resolveStatusBody(profile.status, profile, t, te, locale, openPurchase);

  return (
    <>
      <StatusShell accent={resolved.accent}>
        <BranchHeaderRow chip={<StatusChip label={resolved.chipLabel} Icon={resolved.chipIcon} tone={resolved.tone} />}>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {t.statusCardTitle}
          </Typography>
        </BranchHeaderRow>
        {resolved.content}
      </StatusShell>
      <VerificationPurchaseDialog open={purchaseOpen} onClose={closePurchase} refetchProfile={refetch} />
    </>
  );
}
