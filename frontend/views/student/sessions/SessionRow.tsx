"use client";

import {
  CancelOutlined as CancelledIcon,
  CheckCircleOutlined as CompletedIcon,
  ReportProblemOutlined as DisputedIcon,
  ScheduleOutlined as ScheduledIcon,
  PlayCircleOutlined as StartedIcon,
  type SvgIconComponent,
} from "@mui/icons-material";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { Palette } from "@mui/material/styles";
import type { ReactNode } from "react";
import {
  type MyStudentSessionsQuery_myStudentSessions_items,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import { Sessions, useAppLocale, useAppTranslation } from "@/shared/locale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * SessionRow — ONE student session rendered as a bordered list card.
 *
 * Presentation is 100% payload-driven plus compile-time i18n handles:
 *  - the lifecycle status renders as a container-paired chip whose LABEL and
 *    TONE resolve through `Record<string, …>` lookup tables keyed by the
 *    server enum member strings (oxlint `no-unsafe-enum-comparison` — no
 *    `switch` and no direct enum comparisons);
 *  - the fee renders VERBATIM (decimal string, never parsed — money
 *    discipline in `shared/constants/session-fees.constants.ts`) followed by
 *    the `SESSION_FEE_CURRENCY` label;
 *  - the confirmation deadline + creation moment expand through the shared
 *    locale-aware {@link formatApplicantDate} (byte-consistent with the
 *    server-side lifecycle formatter);
 *  - the booking intent renders verbatim from the payload (server-owned
 *    value — no client-side intent vocabulary exists in `SessionsLabels`).
 *
 * The Cancel CTA renders ONLY while the row's status is `Scheduled` or
 * `Started` (the cancellable-lifecycle lookup table) — the dialog itself,
 * the mutation and every outcome notice live one level up
 * (`CancelSessionConfirmDialog` + the role container), keeping this
 * row a pure affordance. `alertMessage` renders the row-scoped inline alert
 * the container raises (e.g. `SESSION_INVALID_TRANSITION` rejections).
 *
 * Role seam (4.3): the optional `actions` prop adds lifecycle CTAs BESIDE the
 * Cancel button without forking the row — the teacher container passes
 * Start (`Scheduled`) / Complete (`Started`) descriptors, each carrying its
 * own in-flight `disabled` state; terminal statuses receive an empty list.
 * The student path omits the prop entirely, so student behavior and tests are
 * byte-unchanged. A `TeacherSessionRow` wrapper was rejected because the
 * Cancel CTA lives INSIDE this row's action stack — the wrapper would have to
 * duplicate the meta/actions layout to sit next to it.
 *
 * Hover polish: the card shell carries the idle→hover emphasis (elevation
 * + outline transition); the action buttons keep full opacity at idle so
 * no affordance is ever hover-gated.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors through
 * callbacks, `*Outlined` icons only, RTL-safe logical composition (no
 * physical margins), ≥44px touch target on the mobile CTA.
 */

/** Typographic placeholder for nullable payload values (NOT locale copy). */
const NO_VALUE_PLACEHOLDER = "—";

/** Chip label key per lifecycle status (vocabulary-stability pin includes `Disputed`). */
const STATUS_LABEL_KEY: Record<string, keyof SessionsLabels> = {
  [SessionStatus.Scheduled]: "statusScheduled",
  [SessionStatus.Started]: "statusStarted",
  [SessionStatus.Completed]: "statusCompleted",
  [SessionStatus.Cancelled]: "statusCancelled",
  [SessionStatus.Disputed]: "statusDisputed",
};

/** Semantically-matching outlined chip icon per lifecycle status. */
const STATUS_ICON: Record<string, SvgIconComponent> = {
  [SessionStatus.Scheduled]: ScheduledIcon,
  [SessionStatus.Started]: StartedIcon,
  [SessionStatus.Completed]: CompletedIcon,
  [SessionStatus.Cancelled]: CancelledIcon,
  [SessionStatus.Disputed]: DisputedIcon,
};

/** Visual tone family driving the chip's container/on-container pair. */
type StatusTone = "info" | "primary" | "success" | "error" | "warning";

/** Tone per lifecycle status (Scheduled=info, Started=primary, terminal pairs). */
const STATUS_TONE: Record<string, StatusTone> = {
  [SessionStatus.Scheduled]: "info",
  [SessionStatus.Started]: "primary",
  [SessionStatus.Completed]: "success",
  [SessionStatus.Cancelled]: "error",
  [SessionStatus.Disputed]: "warning",
};

/** Tone → Material 3 container/on-container pair (ProfileView pattern). */
const TONE_COLORS: Record<
  string,
  { readonly bg: (palette: Palette) => string; readonly fg: (palette: Palette) => string }
> = {
  info: { bg: p => p.infoContainer, fg: p => p.onInfoContainer },
  primary: { bg: p => p.primaryContainer, fg: p => p.onPrimaryContainer },
  success: { bg: p => p.successContainer, fg: p => p.onSuccessContainer },
  error: { bg: p => p.errorContainer, fg: p => p.onErrorContainer },
  warning: { bg: p => p.warningContainer, fg: p => p.onWarningContainer },
};

/**
 * Cancellable-lifecycle lookup — the Cancel CTA renders ONLY for these
 * statuses (Record lookup, never an enum comparison).
 */
const CANCELLABLE_STATUSES: Record<string, true> = {
  [SessionStatus.Scheduled]: true,
  [SessionStatus.Started]: true,
};

/**
 * One extra lifecycle CTA rendered beside the Cancel button (teacher
 * Start/Complete today; generically shaped so the row stays role-agnostic).
 * `disabled` is the CALLER'S per-mutation in-flight state — the row never
 * owns mutation bookkeeping.
 */
export interface SessionRowAction {
  /** Stable affordance identity (doubles as the render key + testid suffix). */
  readonly id: "start" | "complete";
  /** Compile-time i18n copy resolved by the container. */
  readonly label: string;
  /** Disabled while THIS action's own mutation is in flight. */
  readonly disabled?: boolean;
  /** Activation intent — the container owns the mutation launch. */
  readonly onIntent: (sessionId: string) => void;
}

interface SessionRowProps {
  /**
   * The session payload row (normalized `Session` entity). The student and
   * teacher list item types are structurally identical codegen shapes, so a
   * teacher row passes without a mapping layer.
   */
  readonly session: MyStudentSessionsQuery_myStudentSessions_items;
  /** Row-scoped inline alert copy (e.g. invalid-transition rejection), or absent. */
  readonly alertMessage?: string | null;
  /** Cancel-CTA intent — the container owns dialog open/close state. */
  readonly onCancelIntent: (sessionId: string) => void;
  /** Extra lifecycle CTAs (teacher Start/Complete); the student path omits it. */
  readonly actions?: ReadonlyArray<SessionRowAction>;
}

/** One session list card: status chip + intent title + fee/deadline/created meta. */
export function SessionRow({ session, alertMessage, onCancelIntent, actions }: Readonly<SessionRowProps>): ReactNode {
  const t = useAppTranslation(Sessions);
  const locale = useAppLocale();

  const statusLabelKey = STATUS_LABEL_KEY[session.status];
  const statusLabel = statusLabelKey in t ? t[statusLabelKey] : session.status;
  const statusTone = STATUS_TONE[session.status] ?? "warning";
  const toneColors = TONE_COLORS[statusTone] ?? TONE_COLORS.warning;

  const isCancellable = session.status in CANCELLABLE_STATUSES;

  const feeText = session.fee === null ? NO_VALUE_PLACEHOLDER : `${session.fee} ${SESSION_FEE_CURRENCY}`;
  const deadlineText =
    session.confirmationDeadline === null
      ? NO_VALUE_PLACEHOLDER
      : formatApplicantDate(session.confirmationDeadline, locale);
  const createdText = formatApplicantDate(session.createdAt, locale);
  const intentText = session.intent ?? NO_VALUE_PLACEHOLDER;
  /** Teacher-confirmation moment — rendered ONLY when the lifecycle set it. */
  const teacherConfirmedText =
    session.confirmedByTeacherAt === null ? null : formatApplicantDate(session.confirmedByTeacherAt, locale);

  return (
    <Box
      data-testid={`session-row-${session.id}`}
      sx={theme => ({
        display: "grid",
        gap: 1.5,
        p: { xs: 2.5, sm: 3 },
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
        boxShadow: theme.palette.shadow.card,
        // Hover lift — elevation + outline emphasis ease in together. The
        // emphasis step goes from the rest `outlineVariant` line to the
        // stronger `outline` token (the palette's accent outline).
        transition: theme.transitions.create(["box-shadow", "transform", "border-color"]),
        "&:hover": {
          boxShadow: theme.shadows[4],
          borderColor: theme.palette.outline,
        },
      })}
    >
      <Stack
        sx={{
          gap: 1.5,
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <Stack sx={{ gap: 0.5, minWidth: 0 }}>
          <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.intent}
          </Typography>
          <Typography variant="h6" component="h3" sx={{ fontWeight: 700 }}>
            {intentText}
          </Typography>
        </Stack>
        <Chip
          icon={<StatusChipIcon status={session.status} />}
          label={statusLabel}
          size="small"
          sx={theme => ({
            fontWeight: 600,
            bgcolor: toneColors.bg(theme.palette),
            color: toneColors.fg(theme.palette),
            "& .MuiChip-icon": {
              color: toneColors.fg(theme.palette),
            },
          })}
        />
      </Stack>

      {alertMessage !== undefined && alertMessage !== null && alertMessage !== "" ? (
        <Alert severity="error" variant="outlined">
          {alertMessage}
        </Alert>
      ) : null}

      <Stack
        sx={{
          gap: 2,
          flexDirection: { xs: "column", sm: "row" },
          flexWrap: "wrap",
          alignItems: { xs: "stretch", sm: "flex-end" },
          justifyContent: "space-between",
        }}
      >
        <Stack
          sx={{
            gap: 1.5,
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "baseline",
          }}
        >
          <MetaCell label={t.fee} value={feeText} />
          <MetaCell label={t.deadline} value={deadlineText} />
          <MetaCell label={t.createdAt} value={createdText} />
          {teacherConfirmedText !== null ? (
            <MetaCell label={t.teacherConfirmedAt} value={teacherConfirmedText} />
          ) : null}
        </Stack>
        {/*
         * Row CTAs hold FULL opacity at idle and never dim — the hover
         * affordance lives on the card shell above (elevation + outline),
         * so touch users (who get no hover) always see every action at its
         * normal strength. The ≥44px mobile hit target stays pinned.
         */}
        {(actions ?? []).map(action => (
          <Button
            key={action.id}
            variant="outlined"
            color="primary"
            disabled={action.disabled === true}
            onClick={() => action.onIntent(session.id)}
            data-testid={`session-action-${session.id}-${action.id}`}
            sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
          >
            {action.label}
          </Button>
        ))}
        {isCancellable ? (
          <Button
            variant="outlined"
            color="error"
            onClick={() => onCancelIntent(session.id)}
            sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
          >
            {t.cancelSession}
          </Button>
        ) : null}
      </Stack>
    </Box>
  );
}

interface StatusChipIconProps {
  readonly status: SessionStatus;
}

/**
 * Status chip icon — module-internal so the Record-driven icon lookup stays
 * next to the chip it decorates. Defensive-corrupt arm reuses the disputed
 * icon; unknown values never crash the row.
 */
function StatusChipIcon({ status }: Readonly<StatusChipIconProps>): ReactNode {
  const Icon = STATUS_ICON[status] ?? DisputedIcon;
  return <Icon fontSize="small" />;
}

interface MetaCellProps {
  readonly label: string;
  readonly value: string;
}

/** One label/value meta pair (overline label + body value), wrap-friendly. */
function MetaCell({ label, value }: Readonly<MetaCellProps>): ReactNode {
  return (
    <Stack sx={{ gap: 0.25, minWidth: 0 }}>
      <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary })}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Stack>
  );
}
