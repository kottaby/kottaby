"use client";

import { LockOutlined } from "@mui/icons-material";
import { Alert, AlertTitle, Box, Button, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Errors, useAppTranslation } from "@/shared/locale";

/**
 * PermissionDeniedFallback — page/section-level `FORBIDDEN` error surface.
 *
 * Rendered when the active role is not permitted to access a gated route
 * (mapGraphQLErrorByCode `FORBIDDEN` branch) so the user ALWAYS gets
 * an explanatory surface — this component never returns bare `null`.
 *
 * Announce semantics: the root IS a MUI v9 `Alert`, whose root element
 * defaults to `role="alert"` internally (`Alert.js` line 165 in v9.3.1) —
 * per `frontend/AGENTS.md` ("Use `<Box component="alert">` instead of
 * `role="alert"` on NON-Alert elements"), no literal `role` prop and no
 * `component="alert"` override are added on top of it.
 *
 * Copy: defaults come from the `errors` namespace handle (property access).
 * The page-deny key `forbiddenRole` titles the fallback; callers may pass
 * explicit localized overrides for query-level vs page-level contexts.
 *
 * Recovery: callers on PAGE-level surfaces may pass `actionLabel` +
 * `onAction` to render a primary recovery affordance inside the card
 * (e.g. "Back to My Children" on the parent portal detail page). Both
 * props are optional and only ever appear together; section-level callers
 * omit them and get the exact pre-existing alert-only surface.
 *
 * Styling: `sx`-only; colors resolve through the MUI theme palette
 * (`error` severity family ONLY) via theme callbacks — no hex, no rgb, no
 * string-based palette access.
 */
interface PermissionDeniedFallbackProps {
  /** Optional override for the localized title (defaults to `errors.forbiddenRole`). */
  readonly title?: string;
  /** Optional override for the localized description (defaults to `errors.forbidden`). */
  readonly description?: string;
  /** Optional localized label for the recovery action (rendered only with `onAction`). */
  readonly actionLabel?: string;
  /** Optional recovery callback (rendered only with `actionLabel`). */
  readonly onAction?: () => void;
}

export function PermissionDeniedFallback({
  title,
  description,
  actionLabel,
  onAction,
}: Readonly<PermissionDeniedFallbackProps>): ReactNode {
  const t = useAppTranslation(Errors);

  const resolvedTitle = title ?? t.forbiddenRole;
  const resolvedDescription = description ?? t.forbidden;
  const showAction = actionLabel !== undefined && onAction !== undefined;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        px: { xs: 2, sm: 3 },
        py: { xs: 4, sm: 8 },
      }}
    >
      <Alert
        icon={<LockOutlined sx={{ fontSize: 28 }} />}
        sx={theme => ({
          width: "100%",
          maxWidth: 520,
          // audit-R7/P1: radius token aligned with the rest of the error-surface
          // family (host toasts / pinned banner / RetryableNotice all use `2`).
          borderRadius: 2,
          alignItems: "center",
          border: "1px solid",
          borderColor: theme.palette.error.main,
          bgcolor: theme.palette.errorContainer,
          color: theme.palette.onErrorContainer,
          "& .MuiAlert-icon": {
            color: theme.palette.onErrorContainer,
          },
        })}
      >
        <AlertTitle sx={{ mb: 0.5 }}>{resolvedTitle}</AlertTitle>
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.onErrorContainer })}>
          {resolvedDescription}
        </Typography>
        {showAction ? (
          <Button
            variant="contained"
            color="error"
            onClick={onAction}
            sx={theme => ({
              mt: 2,
              alignSelf: "flex-start",
              borderRadius: 2,
              bgcolor: theme.palette.error.main,
              "&:hover": { bgcolor: theme.palette.error.dark },
            })}
          >
            {actionLabel}
          </Button>
        ) : null}
      </Alert>
    </Box>
  );
}
