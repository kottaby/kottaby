"use client";

import { StarOutlined } from "@mui/icons-material";
import { Button, Chip, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import type { SessionRowAction } from "@/frontend/views/student/sessions/sessionRowAction";
import { TONE_COLORS } from "@/frontend/views/student/sessions/sessionRowPresentation";

/**
 * The caller-supplied lifecycle affordances (teacher Start/Complete, student
 * Confirm, student Rate — plus the read-only rated chip that replaces the
 * Rate CTA once the session is rated). Interactive descriptors render as
 * buttons (the tooltip-carrying variant rides the SAME testid/button shape
 * so callers and suites stay uniform); `readOnly` descriptors render as
 * non-interactive chips carrying the success container tone pair.
 */
export function SessionRowActions({
  actions,
  sessionId,
}: Readonly<{ actions: ReadonlyArray<SessionRowAction> | undefined; sessionId: string }>): ReactNode {
  return (
    <>
      {(actions ?? []).map(action => {
        if (action.readOnly === true) {
          const tone = TONE_COLORS.success;
          return (
            <Chip
              key={action.id}
              icon={<StarOutlined fontSize="small" />}
              label={action.label}
              size="small"
              data-testid={`session-action-${sessionId}-${action.id}`}
              sx={theme => ({
                fontWeight: 600,
                bgcolor: tone.bg(theme.palette),
                color: tone.fg(theme.palette),
                "& .MuiChip-icon": {
                  color: tone.fg(theme.palette),
                },
              })}
            />
          );
        }
        const cta = (
          <Button
            key={action.id}
            variant="outlined"
            color={action.color ?? "primary"}
            disabled={action.disabled === true}
            onClick={() => action.onIntent?.(sessionId)}
            data-testid={`session-action-${sessionId}-${action.id}`}
            sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
          >
            {action.label}
          </Button>
        );
        return action.tooltip === undefined ? (
          cta
        ) : (
          <Tooltip key={action.id} title={action.tooltip} placement="top">
            <span>{cta}</span>
          </Tooltip>
        );
      })}
    </>
  );
}
