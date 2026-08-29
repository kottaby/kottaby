"use client";

import {
  CalendarMonthOutlined as CalendarIcon,
  ChevronRightOutlined as ChevronRightIcon,
  HistoryOutlined as HistoryIcon,
  NotificationsOutlined as NotificationsIcon,
  SchoolOutlined as SchoolIcon,
  PaymentsOutlined as WalletIcon,
} from "@mui/icons-material";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/frontend/hooks/useAuth";
import { type DashboardNavItem, getNavItemsForRole, resolveNavItemLabel } from "@/frontend/views/dashboard/navItems";
import { Dashboard, useAppTranslation } from "@/shared/locale";
import type { DashboardLabels } from "@/shared/locale/types/dashboard";

/** Stat card shape — used by the dashboard's stat strip. */
interface DashboardStat {
  readonly label: string;
  readonly value: string;
  readonly Icon: typeof SchoolIcon;
}

interface DashboardViewProps {
  /**
   * Role-specific content slot mounted between the welcome header and the
   * stat grid (the teacher dashboard passes
   * `<ApplicantStatusCard />` so the lifecycle status card sits above the
   * fold, under the page header). The SERVER composition decides what — if
   * anything — goes here per role; this view adds no client-side gating of
   * its own and other roles pass nothing (slot stays empty).
   */
  readonly statusSlot?: ReactNode;
}

/**
 * DashboardView — landing view shown at `/dashboard` (and the role-specific
 * dashboard routes).
 *
 * Composition (top → bottom):
 *  1. Welcome header (role-adaptive greeting + academy title).
 *  2. Role status slot (teacher → applicant lifecycle card).
 *  3. Stat strip — 4 KPI tiles; 2×2 on phones, 4-across from `sm` up.
 *  4. Quick actions — role-aware navigation tiles reused from the sidebar
 *     nav map (dashboard/profile self-links excluded), so every dashboard
 *     exposes its destinations as one-tap cards.
 *  5. Recent activity — empty-state panel; wired to real activity feeds as
 *     those subsystems land.
 *
 * MUI v9 patterns: `sx` callback only, `*Outlined` icons, theme palette
 * colors. Grids use `display: grid` with responsive `gridTemplateColumns`.
 */
export function DashboardView({ statusSlot }: Readonly<DashboardViewProps>): ReactNode {
  const t = useAppTranslation(Dashboard);
  const { user } = useAuth();

  const welcomeText = user ? t.welcome(user.fullName) : t.title;

  const stats: readonly DashboardStat[] = [
    { label: t.sessionsCompleted, value: "0", Icon: SchoolIcon },
    { label: t.balance, value: "0", Icon: WalletIcon },
    { label: t.upcoming, value: "0", Icon: CalendarIcon },
    { label: t.notifications, value: "0", Icon: NotificationsIcon },
  ];

  return (
    <Box>
      <Stack spacing={1} sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}>
          {welcomeText}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.title}
        </Typography>
      </Stack>

      {statusSlot ? <Box sx={{ mb: 4 }}>{statusSlot}</Box> : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, 1fr)" },
          gap: { xs: 1.5, sm: 2 },
          mb: 4,
        }}
      >
        {stats.map(stat => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </Box>

      <QuickActionsSection t={t} />

      <RecentActivitySection t={t} />
    </Box>
  );
}

interface StatCardProps {
  readonly stat: DashboardStat;
}

/** Renders a single stat card (compact on phones so 2 fit per row). */
function StatCard({ stat }: Readonly<StatCardProps>): ReactNode {
  const { label, value, Icon } = stat;
  return (
    <Card
      elevation={0}
      sx={theme => ({
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
        transition: theme.transitions.create(["border-color"], {
          duration: theme.transitions.duration.short,
        }),
        "&:hover": {
          borderColor: theme.palette.primary.main,
        },
      })}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 }, "&:last-child": { pb: { xs: 2, sm: 3 } } }}>
        <Stack spacing={2} sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              noWrap
              sx={theme => ({
                color: theme.palette.text.secondary,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
                display: "block",
              })}
            >
              {label}
            </Typography>
            <Typography
              variant="h4"
              sx={theme => ({
                fontWeight: 700,
                color: theme.palette.text.primary,
                mt: 0.5,
                fontSize: { xs: "1.6rem", sm: "2.125rem" },
              })}
            >
              {value}
            </Typography>
          </Box>
          <Box
            sx={theme => ({
              width: { xs: 38, sm: 44 },
              height: { xs: 38, sm: 44 },
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: theme.palette.primaryContainer,
              color: theme.palette.onPrimaryContainer,
              flexShrink: 0,
            })}
          >
            <Icon fontSize="medium" />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Quick-actions tile grid — the role's navigation destinations as one-tap
 * cards (the sidebar nav map reused; dashboard/profile self-links excluded
 * so the strip only exposes MOVES, not where the user already is).
 */
function QuickActionsSection({ t }: Readonly<{ t: DashboardLabels }>): ReactNode {
  const { user } = useAuth();
  const actions = getNavItemsForRole(user?.role ?? null)
    .filter(item => item.labelKey !== "dashboard" && item.labelKey !== "profile")
    .slice(0, 4);

  if (actions.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {t.quickActionsTitle}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, 1fr)" },
          gap: { xs: 1.5, sm: 2 },
        }}
      >
        {actions.map(item => (
          <QuickActionTile key={item.route} item={item} label={resolveNavItemLabel(item, t)} />
        ))}
      </Box>
    </Box>
  );
}

/** One-tap navigation tile (whole card is the link). */
function QuickActionTile({ item, label }: Readonly<{ item: DashboardNavItem; label: string }>): ReactNode {
  const { Icon } = item;
  return (
    <Card
      elevation={0}
      component={Link}
      href={item.route}
      sx={theme => ({
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
        textDecoration: "none",
        transition: theme.transitions.create(["border-color", "transform", "box-shadow"], {
          duration: theme.transitions.duration.short,
        }),
        "&:hover": {
          borderColor: theme.palette.primary.main,
          transform: "translateY(-2px)",
          boxShadow: theme.palette.shadow?.card ?? theme.shadows[2],
        },
      })}
    >
      <CardContent
        sx={{
          p: { xs: 2, sm: 2.5 },
          "&:last-child": { pb: { xs: 2, sm: 2.5 } },
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
        }}
      >
        <Box
          sx={theme => ({
            width: 40,
            height: 40,
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: theme.palette.primaryContainer,
            color: theme.palette.onPrimaryContainer,
          })}
        >
          <Icon fontSize="small" />
        </Box>
        <Stack
          spacing={0.5}
          sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 1 }}
        >
          <Typography variant="body2" noWrap sx={theme => ({ fontWeight: 600, color: theme.palette.text.primary })}>
            {label}
          </Typography>
          <Box sx={theme => ({ color: theme.palette.text.secondary, display: "flex", flexShrink: 0 })}>
            <ChevronIcon />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Direction-aware forward chevron — mirrors in RTL so the "go" affordance
 * points along the reading direction in both locales.
 */
function ChevronIcon(): ReactNode {
  return (
    <ChevronRightIcon
      fontSize="small"
      sx={theme => ({ transform: theme.direction === "rtl" ? "scaleX(-1)" : "none" })}
    />
  );
}

/**
 * Recent-activity panel — a polished empty state until the activity-feed
 * subsystem lands (sessions history, subscription events, notifications).
 */
function RecentActivitySection({ t }: Readonly<{ t: DashboardLabels }>): ReactNode {
  return (
    <Box>
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {t.recentActivityTitle}
      </Typography>
      <Card
        elevation={0}
        sx={theme => ({
          borderRadius: 3,
          border: "1px dashed",
          borderColor: theme.palette.outlineVariant,
          bgcolor: "transparent",
        })}
      >
        <CardContent
          sx={{
            py: { xs: 5, sm: 6 },
            px: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 1,
          }}
        >
          <Box
            aria-hidden
            sx={theme => ({
              width: 64,
              height: 64,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              bgcolor: theme.palette.surfaceContainerHighest,
              color: theme.palette.text.secondary,
              mb: 0.5,
            })}
          >
            <HistoryIcon />
          </Box>
          <Typography variant="subtitle1" component="p" sx={{ fontWeight: 700 }}>
            {t.recentActivityEmptyTitle}
          </Typography>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 460 })}>
            {t.recentActivityEmptyBody}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
