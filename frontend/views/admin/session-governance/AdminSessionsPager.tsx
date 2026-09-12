"use client";

import { NavigateBeforeOutlined, NavigateNextOutlined } from "@mui/icons-material";
import { IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminSessionsPager — the governance directory's prev/next pager row. It
 * renders ONLY when the honest total spans more than one page (the caller
 * guards that). Extracted verbatim from `AdminSessionsBody`; behavior is
 * unchanged.
 */

interface AdminSessionsPagerProps {
  /** Current 1-based page. */
  readonly page: number;
  /** Honest page count (never below 1). */
  readonly totalPages: number;
  /** Round-trip in flight over the settled payload — both chevrons disable. */
  readonly busy: boolean;
  /** Page-change intent — the container clamps before committing. */
  readonly onPageChange: (nextPage: number) => void;
  /** Shared sessions-namespace labels (pager aria vocabulary). */
  readonly tSessions: SessionsLabels;
}

/**
 * Prev / `page / totalPages` / next pager row (edge-clamped buttons). The
 * chevrons are direction-flipped under RTL (`scaleX(-1)`) — a logical
 * "previous/next" affordance, mirroring the admin user-detail back-link
 * convention. A mid-flight round-trip (`busy`) disables BOTH chevrons so a
 * second click can never fire a duplicate page re-key.
 */
export function AdminSessionsPager({
  page,
  totalPages,
  busy,
  onPageChange,
  tSessions,
}: Readonly<AdminSessionsPagerProps>): ReactNode {
  return (
    <Stack
      data-testid="admin-session-governance-pager"
      sx={{
        gap: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        py: 1,
      }}
    >
      <Tooltip title={tSessions.pagerPreviousLabel}>
        <span>
          <IconButton
            aria-label={tSessions.pagerPreviousLabel}
            data-testid="admin-session-governance-pager-prev"
            disabled={busy || page <= 1}
            onClick={() => onPageChange(page - 1)}
            sx={focusVisibleRingSx}
          >
            <NavigateBeforeOutlined sx={theme => ({ transform: theme.direction === "rtl" ? "scaleX(-1)" : "none" })} />
          </IconButton>
        </span>
      </Tooltip>
      <Typography
        variant="body2"
        sx={theme => ({ color: theme.palette.text.secondary, minWidth: 64, textAlign: "center" })}
      >
        {page} / {totalPages}
      </Typography>
      <Tooltip title={tSessions.pagerNextLabel}>
        <span>
          <IconButton
            aria-label={tSessions.pagerNextLabel}
            data-testid="admin-session-governance-pager-next"
            disabled={busy || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            sx={focusVisibleRingSx}
          >
            <NavigateNextOutlined sx={theme => ({ transform: theme.direction === "rtl" ? "scaleX(-1)" : "none" })} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
