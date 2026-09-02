"use client";

/**
 * State banners for the platform-analytics dashboard (DEV3-022c): the
 * denied (governed-reader) notice and the load-error alert + Retry CTA.
 * Raw server error text is NEVER rendered (REQ-053) — only localized
 * namespace copy shows.
 */

import { Alert, Button, Typography } from "@mui/material";
import type { ReactElement } from "react";
import { useAppTranslation } from "@/shared/locale/client/use-app-translation";
import { Analytics } from "@/shared/locale/namespaces/analytics";

/** The governed-reader edge: localized warning notice, in-container. */
export function DeniedNotice(): ReactElement {
  const t = useAppTranslation(Analytics);
  return (
    <Alert severity="warning" sx={{ marginBlockEnd: 2 }}>
      <Typography variant="subtitle2" component="h2">
        {t.deniedTitle}
      </Typography>
      <Typography variant="body2">{t.deniedBody}</Typography>
    </Alert>
  );
}

/** Any non-denied failure: localized error alert + Retry (≥44px target). */
export function LoadErrorAlert({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  const t = useAppTranslation(Analytics);
  return (
    <Alert
      severity="error"
      sx={{ marginBlockEnd: 2 }}
      action={
        <Button color="inherit" size="small" onClick={onRetry} sx={{ minHeight: 44 }}>
          {t.retryAction}
        </Button>
      }
    >
      <Typography variant="subtitle2" component="h2">
        {t.loadErrorTitle}
      </Typography>
      <Typography variant="body2">{t.loadErrorBody}</Typography>
    </Alert>
  );
}
