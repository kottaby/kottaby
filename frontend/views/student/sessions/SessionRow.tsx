"use client";

import {
  CancelOutlined as CancelledIcon,
  CheckCircleOutlined as CompletedIcon,
  FlagOutlined as DisputeActionIcon,
  ReportProblemOutlined as DisputedIcon,
  HourglassTopOutlined as PendingConfirmIcon,
  ScheduleOutlined as ScheduledIcon,
  PlayCircleOutlined as StartedIcon,
  type SvgIconComponent,
} from "@mui/icons-material";
import { Alert, Box, Button, Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { Palette } from "@mui/material/styles";
import type { ReactNode } from "react";
import {
  type MyStudentSessionsQuery_myStudentSessions_items,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import { Sessions, useAppLocale, useAppTranslation } from "@/shared/locale";
import type { AppLocale } from "@/shared/locale/AppLocale";
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
 * own in-flight `disabled` state; the DEV3-012 student container passes the
 * Confirm descriptor (`Completed` + stamp unset + hold marked), which may
 * additionally carry a `tooltip` (the financial consequence explainer) and
 * a `color` token; terminal statuses receive an empty list otherwise.
 * The student path historically omitted the prop entirely. A
 * `TeacherSessionRow` wrapper was rejected because the Cancel CTA lives
 * INSIDE this row's action stack — the wrapper would have to duplicate the
 * meta/actions layout to sit next to it.
 *
 * DEV3-012 confirm-state display: the row renders the student-confirmation
 * meta cell whenever the stamp is set (dual-confirmation visibility for
 * BOTH roles) and an "awaiting student confirmation" info pill on the
 * exactly-once pending shape (`Completed` ∧ stamp unset ∧ `feeHeld`) — the
 * teacher surface's explanation of WHY the wallet credit has not fired.
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

/**
 * Status-chip label-key union — the NARROW slice of `SessionsLabels` the
 * lifecycle chip may render. The namespace also carries template-function
 * labels (e.g. `adminDisputesCountLine`) that are NOT renderable as a chip
 * label, so the lookup table is keyed by this Pick-union, never the full
 * `keyof SessionsLabels`.
 */
type StatusChipLabelKey = keyof Pick<
  SessionsLabels,
  "statusScheduled" | "statusStarted" | "statusCompleted" | "statusCancelled" | "statusDisputed"
>;

/** Chip label key per lifecycle status (vocabulary-stability pin includes `Disputed`). */
const STATUS_LABEL_KEY: Record<string, StatusChipLabelKey> = {
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
 * Cancellable-lifecycle lookup — the Cancel CTA renders ENABLED only for
 * these statuses (Record lookup, never an enum comparison). Disputed rows
 * render the CTA DISABLED below (the state machine forbids cancelling a
 * disputed session — R-110).
 */
const CANCELLABLE_STATUSES: Record<string, true> = {
  [SessionStatus.Scheduled]: true,
  [SessionStatus.Started]: true,
};

/**
 * Confirm-pending lookup (DEV3-012) — the student's confirm affordance and
 * the "awaiting student confirmation" hint key off this status via Record
 * lookup (never an enum comparison). The row additionally requires the
 * student stamp to be unset and the hold still marked (below).
 */
const CONFIRM_PENDING_STATUSES: Record<string, true> = {
  [SessionStatus.Completed]: true,
};

/** Disputed token (Record lookup — the disabled-Cancel state below). */
const DISPUTED_STATUS: Record<string, true> = {
  [SessionStatus.Disputed]: true,
};

/**
 * Disputable-lifecycle lookup — the dispute CTA renders ONLY for these
 * statuses (R-110: disputes open from `scheduled` or `started`).
 */
const DISPUTABLE_STATUSES: Record<string, true> = {
  [SessionStatus.Scheduled]: true,
  [SessionStatus.Started]: true,
};

/**
 * One extra lifecycle CTA rendered beside the Cancel button (teacher
 * Start/Complete today, the DEV3-012 student Confirm tomorrow; generically
 * shaped so the row stays role-agnostic). `disabled` is the CALLER'S
 * per-mutation in-flight state — the row never owns mutation bookkeeping.
 */
export interface SessionRowAction {
  /** Stable affordance identity (doubles as the render key + testid suffix). */
  readonly id: "start" | "complete" | "confirm";
  /** Compile-time i18n copy resolved by the container. */
  readonly label: string;
  /** Disabled while THIS action's own mutation is in flight. */
  readonly disabled?: boolean;
  /**
   * Optional consequence explainer (DEV3-012 confirm) — rendered as a
   * tooltip; the row stays a pure affordance either way.
   */
  readonly tooltip?: string;
  /** MUI color token for the CTA (defaults to the lifecycle `primary`). */
  readonly color?: "primary" | "success" | "warning";
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
  /**
   * Dispute-CTA intent (DEV3-005) — the container owns the dispute dialog
   * open/close state. When omitted the dispute affordance never renders
   * (the affordance matrix stays caller-driven).
   */
  readonly onDisputeIntent?: (sessionId: string) => void;
  /**
   * Disabled while THIS row's dispute slot is in flight (per-row slot
   * book, cron-r2 D9-bis mechanism extended with the `dispute` kind).
   */
  readonly disputeDisabled?: boolean;
  /** Extra lifecycle CTAs (teacher Start/Complete); the student path omits it. */
  readonly actions?: ReadonlyArray<SessionRowAction>;
}

/** One session list card: status chip + intent title + fee/deadline/created meta. */
export function SessionRow({
  session,
  alertMessage,
  onCancelIntent,
  onDisputeIntent,
  disputeDisabled = false,
  actions,
}: Readonly<SessionRowProps>): ReactNode {
  const t = useAppTranslation(Sessions);
  const locale = useAppLocale();

  const statusLabelKey = STATUS_LABEL_KEY[session.status];
  const statusLabel = statusLabelKey in t ? t[statusLabelKey] : session.status;
  const statusTone = STATUS_TONE[session.status] ?? "warning";
  const toneColors = TONE_COLORS[statusTone] ?? TONE_COLORS.warning;

  const isCancellable = session.status in CANCELLABLE_STATUSES;
  const isDisputed = session.status in DISPUTED_STATUS;
  const isDisputable = session.status in DISPUTABLE_STATUSES && onDisputeIntent !== undefined;
  const intentText = session.intent ?? NO_VALUE_PLACEHOLDER;

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
        <SessionRowMeta session={session} locale={locale} />
        {/*
         * Persisted cancellation reason (DEV3-005 R-107) — rendered ONLY
         * when the lifecycle set it. Truncated to one line with the FULL
         * reason reachable through the tooltip (min-width:0 keeps the
         * truncation RTL-safe inside the wrap-friendly flex row).
         */}
        {session.cancelReason !== null ? (
          <Tooltip title={session.cancelReason} placement="top">
            <Stack
              data-testid={`session-cancel-reason-${session.id}`}
              sx={{
                gap: 0.5,
                flexDirection: "row",
                alignItems: "baseline",
                minWidth: 0,
                maxWidth: "100%",
              }}
            >
              <Typography variant="overline" sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0 })}>
                {t.cancelReasonLine}
              </Typography>
              <Typography variant="body2" noWrap sx={theme => ({ color: theme.palette.text.secondary })}>
                {session.cancelReason}
              </Typography>
            </Stack>
          </Tooltip>
        ) : null}
        {/*
         * Row CTAs hold FULL opacity at idle and never dim — the hover
         * affordance lives on the card shell above (elevation + outline),
         * so touch users (who get no hover) always see every action at its
         * normal strength. The ≥44px mobile hit target stays pinned.
         */}
        <RowActionButtons actions={actions} sessionId={session.id} />
        {/*
         * Dispute affordance (DEV3-005 R-110) — same visual family as the
         * Cancel CTA (outlined, ≥44px touch target) with the warning/amber
         * accent THROUGH theme tokens, disabled while this row's dispute
         * slot is in flight. Only for disputable lifecycles.
         */}
        {isDisputable && onDisputeIntent !== undefined ? (
          <Button
            variant="outlined"
            color="warning"
            disabled={disputeDisabled}
            onClick={() => onDisputeIntent(session.id)}
            startIcon={<DisputeActionIcon fontSize="small" />}
            data-testid={`session-action-${session.id}-dispute`}
            sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
          >
            {t.openDispute}
          </Button>
        ) : null}
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
        {isDisputed ? (
          //
          // The state machine forbids cancelling a disputed session (the
          // ONLY edge out is admin arbitration) — the CTA stays VISIBLE but
          // disabled, with the reason reachable via tooltip. MUI tooltips
          // need a focusable wrapper around a disabled button, hence the
          // inline span bridge.
          //
          <Tooltip title={t.cancelDisabledDisputed} placement="top">
            <span>
              <Button
                variant="outlined"
                color="error"
                disabled
                data-testid={`session-action-${session.id}-cancel-disabled`}
                sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
              >
                {t.cancelSession}
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * The meta band: fee / deadline / created (+ the teacher & student
 * confirmation moments when the lifecycle set them) and the DEV3-012
 * pending pill. Extracted module-scope so the row's own cognitive
 * complexity stays under the sonar ceiling; the confirm-pending derivation
 * travels WITH the values it decorates.
 */
function SessionRowMeta({
  session,
  locale,
}: Readonly<{ session: MyStudentSessionsQuery_myStudentSessions_items; locale: AppLocale }>): ReactNode {
  const t = useAppTranslation(Sessions);

  const feeText = session.fee === null ? NO_VALUE_PLACEHOLDER : `${session.fee} ${SESSION_FEE_CURRENCY}`;
  const deadlineText =
    session.confirmationDeadline === null
      ? NO_VALUE_PLACEHOLDER
      : formatApplicantDate(session.confirmationDeadline, locale);
  const createdText = formatApplicantDate(session.createdAt, locale);
  /** Teacher-confirmation moment — rendered ONLY when the lifecycle set it. */
  const teacherConfirmedText =
    session.confirmedByTeacherAt === null ? null : formatApplicantDate(session.confirmedByTeacherAt, locale);
  /** Student-confirmation moment (DEV3-012) — rendered ONLY when the stamp is set. */
  const studentConfirmedText =
    session.confirmedByStudentAt === null ? null : formatApplicantDate(session.confirmedByStudentAt, locale);
  /**
   * DEV3-012 confirm-pending state — a completed row whose student stamp is
   * still unset AND whose hold is still marked (the exactly-once financial
   * shape). An arbitration-settled hold (`feeHeld = false`) is NOT pending:
   * the mutation would return the row untouched, so no affordance claims it.
   */
  const isConfirmPending =
    session.status in CONFIRM_PENDING_STATUSES && session.confirmedByStudentAt === null && session.feeHeld;

  return (
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
      {teacherConfirmedText !== null ? <MetaCell label={t.teacherConfirmedAt} value={teacherConfirmedText} /> : null}
      {studentConfirmedText !== null ? <MetaCell label={t.studentConfirmedAt} value={studentConfirmedText} /> : null}
      {isConfirmPending ? (
        <AwaitingConfirmationPill sessionId={session.id} label={t.awaitingStudentConfirmation} />
      ) : null}
    </Stack>
  );
}

/**
 * DEV3-012 pending hint — a completed session whose hold is still marked
 * and whose student stamp is unset. On the teacher surface it explains WHY
 * the wallet credit has not fired; on the student surface it names what the
 * Confirm CTA settles. Info-toned pill through theme tokens (no raw hex).
 */
function AwaitingConfirmationPill({ sessionId, label }: Readonly<{ sessionId: string; label: string }>): ReactNode {
  return (
    <Chip
      icon={<PendingConfirmIcon fontSize="small" />}
      label={label}
      size="small"
      variant="outlined"
      data-testid={`session-awaiting-confirmation-${sessionId}`}
      sx={theme => ({
        alignSelf: "center",
        borderColor: theme.palette.infoContainer,
        bgcolor: theme.palette.surfaceContainerLowest,
        color: theme.palette.onInfoContainer,
        "& .MuiChip-icon": {
          color: theme.palette.onInfoContainer,
        },
      })}
    />
  );
}

/**
 * The caller-supplied lifecycle CTAs (teacher Start/Complete, DEV3-012
 * student Confirm) — module-scope extraction keeps the row's own cognitive
 * complexity under the sonar ceiling while the mapping stays byte-identical.
 * The tooltip-carrying variant (DEV3-012 confirm) rides the SAME
 * testid/button shape as the plain variant so callers and suites stay
 * uniform.
 */
function RowActionButtons({
  actions,
  sessionId,
}: Readonly<{ actions: ReadonlyArray<SessionRowAction> | undefined; sessionId: string }>): ReactNode {
  return (
    <>
      {(actions ?? []).map(action =>
        action.tooltip === undefined ? (
          <Button
            key={action.id}
            variant="outlined"
            color={action.color ?? "primary"}
            disabled={action.disabled === true}
            onClick={() => action.onIntent(sessionId)}
            data-testid={`session-action-${sessionId}-${action.id}`}
            sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
          >
            {action.label}
          </Button>
        ) : (
          <Tooltip key={action.id} title={action.tooltip} placement="top">
            <span>
              <Button
                variant="outlined"
                color={action.color ?? "primary"}
                disabled={action.disabled === true}
                onClick={() => action.onIntent(sessionId)}
                data-testid={`session-action-${sessionId}-${action.id}`}
                sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
              >
                {action.label}
              </Button>
            </span>
          </Tooltip>
        )
      )}
    </>
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
