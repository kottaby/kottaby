"use client";

/**
 * BroadcastComposeContainer — root client container for the admin broadcast
 * compose surface (`/admin/broadcasts`).
 *
 * Owns the compose flow end-to-end:
 *  - the controlled compose draft (title/body copy + audience selector +
 *    companion values) and the plans query fed by the EXISTING
 *    `adminPlansQueryDocument` (skipped unless the Plan kind is selected);
 *  - `useMutation(adminBroadcastNotificationMutationDocument)` carrying the
 *    compose-session idempotency key via the Apollo context header
 *    `x-idempotency-key` — the key is minted once per compose session and
 *    regenerated ONLY after a successful send (failed submits keep the same
 *    key so the server-side replay dedupe stays effective), and it never
 *    rides the input DTO;
 *  - the confirmation dialog gating the send, the client-side title
 *    validation (`titleRequired` inline copy), VALIDATION field-error
 *    projection through `projectMutationFieldErrors` (never a bespoke
 *    renderer), and the success Snackbar with the pluralized
 *    `successToast(count)` label carrying the server-returned recipient
 *    count, then a draft reset.
 *
 * The presentational pieces live beside this file (`BroadcastComposeHeader`,
 * `BroadcastComposeForm`, `BroadcastComposeFields`,
 * `BroadcastComposeCompanions`, `BroadcastComposeConfirmDialog`,
 * `BroadcastComposeSuccessSnackbar`) with pure plumbing in
 * `broadcast-compose.helpers.ts` and `sx` tokens in
 * `broadcast-compose-skin.ts`. ZERO hardcoded user-facing strings — every
 * label flows from the `AdminBroadcasts` / `Common` namespace handles
 * (role-cohort option labels come from the admin directory's `roleLabels`
 * group, consumed inside `BroadcastComposeCompanions`).
 */

import { useMutation, useQuery } from "@apollo/client/react";
import { SendOutlined } from "@mui/icons-material";
import { Box, CircularProgress } from "@mui/material";
import { type ReactNode, useRef, useState } from "react";
import { BroadcastAudienceType } from "@/frontend/graphql/generated/gql/graphql";
import { adminPlansQueryDocument } from "@/frontend/graphql/sharedDocuments/billing";
import { adminBroadcastNotificationMutationDocument } from "@/frontend/graphql/sharedDocuments/notifications/broadcast.documents";
import { BroadcastComposeConfirmDialog } from "@/frontend/views/admin/broadcasts/BroadcastComposeConfirmDialog";
import { BroadcastComposeForm } from "@/frontend/views/admin/broadcasts/BroadcastComposeForm";
import { BroadcastComposeHeader } from "@/frontend/views/admin/broadcasts/BroadcastComposeHeader";
import { BroadcastComposeSuccessSnackbar } from "@/frontend/views/admin/broadcasts/BroadcastComposeSuccessSnackbar";
import {
  applyBroadcastFieldErrors,
  buildAudienceInput,
  type ComposeFieldErrors,
  type ComposeState,
  initialComposeState,
  isAudienceReady,
  randomUUID,
  trimmedOrNullable,
} from "@/frontend/views/admin/broadcasts/broadcast-compose.helpers";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminBroadcasts } from "@/shared/locale/namespaces/adminBroadcasts";
import { Common } from "@/shared/locale/namespaces/common";

export function BroadcastComposeContainer(): ReactNode {
  const t = useAppTranslation(AdminBroadcasts);
  const tc = useAppTranslation(Common);

  const composeKeyRef = useRef(randomUUID());
  const [compose, setCompose] = useState<ComposeState>(initialComposeState);
  const [fieldErrors, setFieldErrors] = useState<ComposeFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [broadcastMutation, { loading: sending }] = useMutation(adminBroadcastNotificationMutationDocument);

  const plansQuery = useQuery(adminPlansQueryDocument, {
    variables: { includeInactive: false },
    skip: compose.audienceType !== BroadcastAudienceType.Plan,
  });

  const audienceReady = isAudienceReady(compose);

  const changeDraft = (patch: Partial<ComposeState>): void => setCompose(current => ({ ...current, ...patch }));

  const changeAudienceKind = (kind: BroadcastAudienceType): void => {
    setCompose({ ...initialComposeState, audienceType: kind });
    setFieldErrors({});
  };

  /** Client-side inline validation; the confirmation gate opens when valid. */
  const handleFormSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const titleError = compose.title.trim() === "" ? t.titleRequired : undefined;
    setFieldErrors(titleError === undefined ? {} : { title: titleError });
    if (sending || !audienceReady || titleError !== undefined) {
      return;
    }
    setConfirmOpen(true);
  };

  /** Dialog confirmation — the only path that fires the mutation. */
  const handleConfirmSend = (): void => {
    if (sending) {
      return;
    }
    void (async () => {
      setFormError(null);
      try {
        const result = await broadcastMutation({
          variables: {
            input: {
              title: compose.title.trim(),
              body: trimmedOrNullable(compose.body),
              audience: buildAudienceInput(compose),
            },
          },
          context: { headers: { "x-idempotency-key": composeKeyRef.current } },
        });
        const deliveredCount = result.data?.adminBroadcastNotification;
        if (typeof deliveredCount === "number") {
          setConfirmOpen(false);
          setSuccessCount(deliveredCount);
          setCompose(initialComposeState);
          // Rotation happens ONLY on success — failed submits keep the same
          // compose-session key so the server-side replay dedupe stays effective.
          composeKeyRef.current = randomUUID();
          return;
        }
        setConfirmOpen(false);
        setFormError(t.errorTitle);
      } catch (mutationError: unknown) {
        setConfirmOpen(false);
        // Server tier FIRST: project VALIDATION `extensions.fields[]` pairs
        // through the shared mapping (whitelisted paths only, first-wins);
        // per-field mapping REPLACES the global-form fallback copy.
        if (!applyBroadcastFieldErrors(mutationError, setFieldErrors)) {
          setFormError(t.errorTitle);
        }
      }
    })();
  };

  const sendIcon = sending ? <CircularProgress size={18} color="inherit" /> : <SendOutlined />;

  return (
    <Box sx={{ marginInline: "auto", maxWidth: 720, paddingBlock: 4, paddingInline: 2 }}>
      <BroadcastComposeHeader labels={t} />
      <BroadcastComposeForm
        compose={compose}
        fieldErrors={fieldErrors}
        formError={formError}
        sending={sending}
        audienceReady={audienceReady}
        plansLoading={plansQuery.loading}
        plans={plansQuery.data?.adminPlans ?? []}
        labels={t}
        sendIcon={sendIcon}
        onDraftChange={changeDraft}
        onAudienceKindChange={changeAudienceKind}
        onSubmit={handleFormSubmit}
      />
      <BroadcastComposeConfirmDialog
        open={confirmOpen}
        sending={sending}
        sendIcon={sendIcon}
        labels={t}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSend}
      />
      <BroadcastComposeSuccessSnackbar
        count={successCount}
        labels={t}
        closeLabel={tc.close}
        onClose={() => setSuccessCount(null)}
      />
    </Box>
  );
}
