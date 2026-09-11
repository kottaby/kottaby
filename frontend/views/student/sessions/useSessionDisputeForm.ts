import { useMutation } from "@apollo/client/react";
import { type SubmitEvent, useState } from "react";
import { openSessionDisputeMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { handleDisputeSessionMutationError } from "@/frontend/views/student/sessions/sessionDialogErrorArms";
import { Errors, Sessions, useAppTranslation } from "@/shared/locale";

/** UI-seam cap for the required dispute reason (mirrors the backend contract). */
export const MAX_DISPUTE_REASON_LENGTH = 500;

export interface UseSessionDisputeFormOptions {
  /** Id of the session being disputed. */
  readonly sessionId: string;
  /** Dismiss intent (cancel Button / backdrop click / Escape). */
  readonly onClose: () => void;
  /** Success — the cache already carries the disputed state. */
  readonly onDisputed: (sessionId: string) => void;
  /** `SESSION_NOT_FOUND` — error snackbar; the row stays. */
  readonly onSessionMissing: (sessionId: string) => void;
  /** `SESSION_INVALID_TRANSITION` — error snackbar; the row stays. */
  readonly onInvalidTransition: (sessionId: string) => void;
  /** Everything else — error toast; the dialog stays open for a retry. */
  readonly onFailure: (message: string) => void;
}

export interface UseSessionDisputeFormResult {
  readonly reason: string;
  readonly reasonInvalid: boolean;
  readonly loading: boolean;
  readonly handleReasonChange: (value: string) => void;
  readonly handleSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  readonly handleDialogClose: () => void;
}

/**
 * Custom hook encapsulating state management, validation, and GraphQL mutation logic
 * for the session dispute form.
 */
export function useSessionDisputeForm({
  sessionId,
  onClose,
  onDisputed,
  onSessionMissing,
  onInvalidTransition,
  onFailure,
}: Readonly<UseSessionDisputeFormOptions>): UseSessionDisputeFormResult {
  const t = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);

  const [reason, setReason] = useState("");
  const [reasonInvalid, setReasonInvalid] = useState(false);

  const [openDispute, { loading }] = useMutation(openSessionDisputeMutationDocument, {
    update(cache, { data }) {
      const disputed = data?.openSessionDispute;
      if (!disputed) return;
      cache.modify({
        id: cache.identify({ __typename: "Session", id: disputed.id }),
        fields: {
          status: () => disputed.status,
          disputeReason: () => disputed.disputeReason,
          disputedAt: () => disputed.disputedAt,
        },
      });
    },
    onCompleted: data => {
      onDisputed(data.openSessionDispute.id);
    },
    onError: error => {
      handleDisputeSessionMutationError(error, {
        sessionId,
        onSessionMissing,
        onInvalidTransition,
        onFailure,
        validationCopy: te.validation,
        forbiddenCopy: te.forbidden,
        genericErrorCopy: t.genericError,
      });
    },
  });

  const handleReasonChange = (value: string): void => {
    setReason(value);
    setReasonInvalid(false);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading) return;
    const trimmed = reason.trim();
    if (trimmed.length < 1 || trimmed.length > MAX_DISPUTE_REASON_LENGTH) {
      setReasonInvalid(true);
      return;
    }
    setReasonInvalid(false);
    void openDispute({ variables: { id: sessionId, reason: trimmed } });
  };

  const handleDialogClose = (): void => {
    if (!loading) {
      onClose();
    }
  };

  return {
    reason,
    reasonInvalid,
    loading,
    handleReasonChange,
    handleSubmit,
    handleDialogClose,
  };
}
