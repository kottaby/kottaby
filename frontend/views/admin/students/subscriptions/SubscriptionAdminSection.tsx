"use client";

/**
 * SubscriptionAdminSection — the admin student drawer's subscription-
 * management surface. Renders the addressed student's
 * subscriptions (the `adminStudentSubscriptions` read, newest-first) with
 * per-status lifecycle actions, and hosts the four action dialogs
 * (extend / renew / cancel / change plan) plus the shared feedback
 * snackbar.
 *
 * Mount point: `AdminStudentDetailDrawer`, directly below the balances
 * section — the page is `withPageAuth([Admin])`-gated, so the section (and
 * its mutations) only ever render inside the admin directory drawer.
 *
 * Data flow: the section is the query host (the drawer itself stays
 * presentational); rows come from the shared `TypedDocumentNode` document
 * with `cache-and-network` so refetches after a mutation keep the current
 * rows visible while the fresh list streams in. The admin plan catalog
 * feeds the change-plan selector (client-side same-lane eligibility via
 * the pure helper — cross-lane migration is out of scope server-side).
 *
 * Errors: the read surfaces through the directory error-alert recipe
 * (title/message/retry + the canonical code suffix); mutation denials
 * arrive server-localized and render inside their dialog until dismissed.
 * Successes report through the shared snackbar with the namespace's copy —
 * the plan-change toast carries the payload's proration numbers.
 *
 * MUI v9 `sx`-only styling, theme tokens only, every string through the
 * `subscriptionAdmin` namespace (`common` for the dialog dismiss label).
 */
import { useQuery } from "@apollo/client/react";
import { type ReactNode, useState } from "react";
import { adminStudentSubscriptionsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { adminPlansQueryDocument } from "@/frontend/graphql/sharedDocuments/billing";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { DirectoryDrawerSection } from "@/frontend/views/admin/directory-shared/DirectoryDrawerPrimitives";
import { DirectoryFeedbackSnackbar } from "@/frontend/views/admin/directory-shared/DirectoryFeedbackSnackbar";
import { SubscriptionActionDialogs } from "@/frontend/views/admin/students/subscriptions/dialogs/SubscriptionActionDialogs";
import { useSubscriptionAdminActions } from "@/frontend/views/admin/students/subscriptions/hooks/useSubscriptionAdminActions";
import { useSubscriptionDialogController } from "@/frontend/views/admin/students/subscriptions/hooks/useSubscriptionDialogController";
import { SubscriptionRowsView } from "@/frontend/views/admin/students/subscriptions/SubscriptionRowsView";
import { sortNewestFirst } from "@/frontend/views/admin/students/subscriptions/subscriptionAdmin.helpers";
import type { DirectorySnackbar } from "@/frontend/views/admin/users/directory";
import { SubscriptionAdmin, useAppLocale, useAppTranslation } from "@/shared/locale";

interface SubscriptionAdminSectionProps {
  /** The addressed student's user id (the read surface's owner argument). */
  readonly userId: string | number;
}

export function SubscriptionAdminSection({ userId }: SubscriptionAdminSectionProps): ReactNode {
  const labels = useAppTranslation(SubscriptionAdmin);
  const locale = useAppLocale();
  const [snackbar, setSnackbar] = useState<DirectorySnackbar | null>(null);

  const {
    data,
    previousData,
    loading,
    error: queryError,
    refetch,
  } = useQuery(adminStudentSubscriptionsQueryDocument, {
    variables: { userId },
    fetchPolicy: "cache-and-network",
  });

  // The admin plan catalog feeds the change-plan selector (active plans
  // only — the eligibility helper re-filters per source row anyway).
  const { data: plansData } = useQuery(adminPlansQueryDocument, {
    variables: { includeInactive: false },
    fetchPolicy: "cache-and-network",
  });

  const actions = useSubscriptionAdminActions({
    refetch: () => {
      void refetch();
    },
    onSuccess: message => {
      setSnackbar({ message, severity: "success" });
    },
    labels,
  });

  // The lifecycle-dialog state machine: which dialog is open for which
  // row, plus the shared submit pipeline every dialog flows through.
  const dialogs = useSubscriptionDialogController();

  // `errorPolicy: "none"` (the default) drops `data` on a failed refetch;
  // `previousData` keeps the last good list visible beside the alert.
  const rows = sortNewestFirst((data ?? previousData)?.adminStudentSubscriptions ?? []);

  const retryQuery = (): void => {
    void refetch();
  };

  return (
    <DirectoryDrawerSection label={labels.title}>
      <SubscriptionRowsView
        rows={rows}
        loading={loading}
        hasQueryError={Boolean(queryError)}
        errorCode={queryError ? extractErrorCode(queryError) : null}
        labels={labels}
        locale={locale}
        onOpenDialog={dialogs.openDialogFor}
        onRetry={retryQuery}
      />
      <SubscriptionActionDialogs controller={dialogs} actions={actions} plans={plansData?.adminPlans ?? []} />
      <DirectoryFeedbackSnackbar snackbar={snackbar} onClose={() => setSnackbar(null)} />
    </DirectoryDrawerSection>
  );
}
