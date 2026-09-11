"use client";

import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { HandshakeCodeSearchForm } from "@/frontend/views/parent/handshake/HandshakeCodeSearchForm";
import { HandshakeResultRegion } from "@/frontend/views/parent/handshake/HandshakeResultRegion";
import { SendRequestAffordance } from "@/frontend/views/parent/handshake/HandshakeSendRequestAffordance";
import { OutgoingLinkRequestsSection } from "@/frontend/views/parent/handshake/OutgoingLinkRequestsSection";
import { useHandshakeDiscovery } from "@/frontend/views/parent/handshake/useHandshakeDiscovery";
import { Errors, HandshakeCode, ParentLink, useAppTranslation } from "@/shared/locale";

/**
 * HandshakeDiscoveryContainer — the client heart of `/parent/handshake`.
 *
 * A parent submits a student's handshake code; the code is normalized and
 * validated CLIENT-side through the shared canonical gate.
 *
 * Outcome state machine (derived per render — no stored result state):
 *
 * | # | Condition | Result region |
 * |---|-----------|---------------|
 * | 1 | `validatedCode` unset | nothing (idle — the page description above the form is the empty state) |
 * | 2 | query error `UNAUTHORIZED`/`FORBIDDEN` | shared `PermissionDeniedFallback` replaces the whole container (never bare `null`) |
 * | 3 | query error `VALIDATION` (server-side re-judgment) | nothing here — the error surfaces INLINE on the field with the same format-teaching copy as the client gate |
 * | 4 | any other query error | inline `Alert` carrying `errors.internalServerError` (form stays retryable) |
 * | 5 | query in flight | result-region skeleton (`aria-busy`) |
 * | 6 | resolved `null` | neutral inline not-found state — deliberately NOT error styling (a miss is a first-class UI state, indistinguishable for every miss reason) |
 * | 7 | resolved payload | masked-name result card; `linkable`-driven copy; on a `linkable: true` result ALSO the send affordance — see `SendRequestAffordance` |
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, logical properties for RTL mirroring; every
 * user-facing string resolves through the compile-time `HandshakeCode` /
 * `ParentLink` / `Errors` namespace handles (property access only).
 */
export function HandshakeDiscoveryContainer(props: Readonly<HandshakeDiscoveryContainerProps>): ReactNode {
  const t = useAppTranslation(HandshakeCode);
  const te = useAppTranslation(Errors);
  const tp = useAppTranslation(ParentLink);

  const {
    codeInput,
    formatError,
    serverValidationError,
    errorCode,
    resultState,
    sendOutcome,
    sendToast,
    handleCodeInputChange,
    handleSubmit,
    handleSend,
    handleToastClose,
  } = useHandshakeDiscovery();

  // Denial class — replaces the whole container, mirroring the denial-surface
  // precedent on the sibling student handshake-code card.
  if (errorCode === "UNAUTHORIZED" || errorCode === "FORBIDDEN") {
    return <PermissionDeniedFallback />;
  }

  return (
    <Stack spacing={3} sx={{ width: "100%", maxWidth: 640, mx: "auto" }}>
      <Box component="header">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {props.pageTitle}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {props.pageDescription}
        </Typography>
      </Box>
      <HandshakeCodeSearchForm
        codeInput={codeInput}
        error={formatError || serverValidationError}
        onCodeInputChange={handleCodeInputChange}
        onSubmit={handleSubmit}
      />
      <HandshakeResultRegion
        state={resultState}
        genericErrorCopy={te.internalServerError}
        notFoundTitle={t.notFoundTitle}
        notFoundDescription={t.notFoundDescription}
      />
      {resultState.kind === "found" && resultState.linkable ? (
        <SendRequestAffordance
          outcome={sendOutcome}
          labels={tp}
          errorLabels={te}
          onSend={handleSend}
          onToastClose={handleToastClose}
          toastCopy={sendToast}
        />
      ) : null}
      <OutgoingLinkRequestsSection />
    </Stack>
  );
}

/** Shell labels for the static page header — server-translated props. */
interface HandshakeDiscoveryContainerProps {
  /** Discovery page heading (`handshakeCode.pageTitle`). */
  readonly pageTitle: string;
  /** Discovery page intro copy (`handshakeCode.pageDescription`). */
  readonly pageDescription: string;
}
