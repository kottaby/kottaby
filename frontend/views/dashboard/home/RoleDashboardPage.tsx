import { Stack } from "@mui/material";
import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { DashboardView } from "@/frontend/views/dashboard";
import { HandshakeCodeCard, PendingParentLinkRequestsCard } from "@/frontend/views/students/dashboard";
import { ApplicantStatusCard } from "@/frontend/views/teachers/dashboard";

/**
 * Shared role-gated dashboard page factory.
 *
 * Creates a Server Component page that:
 *  1. Calls `withPageAuth({ roles: [role] })` — verifies the caller is
 *     authenticated AND holds the specified role. Anonymous callers redirect
 *     to `/login?redirect=<path>`; role mismatches redirect to `/dashboard`.
 *  2. Renders the `DashboardView` client component, composing a
 *     role-specific content slot ABOVE the stat grid:
 *
 *     - Teacher → `<ApplicantStatusCard />`. The card is
 *       a pure UI affordance: the page guard above stays the only server-side
 *       boundary, the zero-argument `myApplicantProfile` query answers
 *       identity server-side, and applicant vs certified presentation comes
 *       entirely from the query payload. No new routes, no
 *       extra guard logic.
 *     - Student → `<HandshakeCodeCard />` + `<PendingParentLinkRequestsCard />`
 *       composed as siblings inside a Stack (DEV1-015 plan D6). Same additive
 *       pattern: both cards are zero-prop client components whose zero-argument
 *       queries (`myHandshakeCode`, `myIncomingParentLinkRequests`) answer
 *       identity server-side (no student-id props), and they mount inside the
 *       EXISTING student dashboard surface (no new student route, no
 *       `DashboardView` contract change). The pending-requests card renders
 *       `null` when the actionable queue is empty, so the slot degrades to the
 *       handshake card alone. The hook lives INSIDE each card component —
 *       composition here is plain JSX, so no conditional-hook surface exists.
 *     - Other roles → nothing (slot empty; their dashboards unchanged).
 *
 * Extracted to eliminate jscpd duplicates across the 4 role dashboard pages
 * (student, teacher, parent, admin).
 */
export async function createRoleDashboardPage(role: UserRole, path: string): Promise<React.ReactElement> {
  await withPageAuth({ roles: [role], redirectTo: path });
  return <DashboardView statusSlot={resolveStatusSlot(role)} />;
}

/**
 * Server-side composition of the role-specific dashboard content slot —
 * this factory adds no client-side gating of its own; the page guard above
 * stays the only authorization boundary.
 */
function resolveStatusSlot(role: UserRole): React.ReactNode {
  switch (role) {
    case UserRole.Teacher:
      return <ApplicantStatusCard />;
    case UserRole.Student:
      return (
        <Stack sx={theme => ({ display: "flex", flexDirection: "column", gap: theme.spacing(2) })}>
          <HandshakeCodeCard />
          <PendingParentLinkRequestsCard />
        </Stack>
      );
    default:
      return undefined;
  }
}

/** Metadata helper for role dashboard pages. */
export function roleDashboardMetadata(): Metadata {
  return { title: "Kottaby Academy" };
}
