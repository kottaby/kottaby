"use client";

/**
 * AdminStudentDrawerPrimitives — the shared building blocks of the admin
 * student detail drawer's section cards, extracted from
 * `AdminStudentDetailDrawer` (same visual output):
 *  - `DrawerSection`: radius 12 card with `border.light` outline and an
 *    uppercase pinned header,
 *  - `LabelValueRow`: the `ProfileInfoCard` caption/value row recipe,
 *  - `EmptyValue`: the honest null — the em-dash is a display affordance,
 *    not a value.
 */

import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface DrawerSectionProps {
  readonly label: string;
  readonly children: ReactNode;
}

/** Section card — radius 12, `border.light` outline, uppercase pinned header. */
export function DrawerSection({ label, children }: DrawerSectionProps): ReactNode {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        bgcolor: theme.palette.background.paper,
        p: 2,
      })}
    >
      <Typography
        variant="overline"
        component="h3"
        sx={theme => ({
          display: "block",
          color: theme.palette.text.secondary,
          fontWeight: 700,
          letterSpacing: "0.06em",
          marginBottom: 1,
        })}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}

interface LabelValueRowProps {
  readonly label: string;
  /** Latin-contact values (email/phone) are LTR data — pinned via the HTML attribute. */
  readonly ltr?: boolean;
  readonly children: ReactNode;
}

/**
 * Caption/value row (the `ProfileInfoCard` recipe): fixed 40% label column
 * in `text.secondary`, value flexing with 500 weight.
 */
export function LabelValueRow({ label, ltr = false, children }: LabelValueRowProps): ReactNode {
  return (
    <Stack direction="row" spacing={2} sx={theme => ({ py: 1, borderTop: `1px solid ${theme.palette.divider}` })}>
      <Typography
        variant="body2"
        sx={theme => ({ color: theme.palette.text.secondary, flexBasis: "40%", flexShrink: 0 })}
      >
        {label}
      </Typography>
      <Box
        {...(ltr ? { dir: "ltr" } : {})}
        sx={theme => ({
          flex: 1,
          minWidth: 0,
          fontWeight: 500,
          color: theme.palette.text.primary,
          ...(ltr && { unicodeBidi: "isolate", textAlign: "start" }),
        })}
      >
        {children}
      </Box>
    </Stack>
  );
}

/** Honest null — the em-dash is a display affordance, not a value. */
export function EmptyValue(): ReactNode {
  return (
    <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
      —
    </Typography>
  );
}
