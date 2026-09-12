/**
 * One extra lifecycle affordance rendered beside the Cancel button (teacher
 * Start/Complete today, the student Confirm tomorrow, the student Rate once
 * the row is dual-confirmed; generically shaped so the row stays
 * role-agnostic). `disabled` is the CALLER'S per-mutation in-flight state —
 * the row never owns mutation bookkeeping. `readOnly` renders a
 * NON-interactive chip instead of a Button (`onIntent` unused) — the
 * write-once end-state of the rate affordance.
 *
 * Exported from `SessionRow.tsx` (re-export) so teacher/student containers
 * keep importing it from the historical `SessionRow` path.
 */
export interface SessionRowAction {
  /** Stable affordance identity (doubles as the render key + testid suffix). */
  readonly id: "start" | "complete" | "confirm" | "rate";
  /** Compile-time i18n copy resolved by the container. */
  readonly label: string;
  /** Disabled while THIS action's own mutation is in flight. */
  readonly disabled?: boolean;
  /**
   * Optional consequence explainer (confirm) — rendered as a
   * tooltip; the row stays a pure affordance either way.
   */
  readonly tooltip?: string;
  /** MUI color token for the CTA (defaults to the lifecycle `primary`). */
  readonly color?: "primary" | "success" | "warning";
  /**
   * Read-only affordance — renders as a non-interactive chip (the rated
   * end-state of the rate affordance); `onIntent` is unused for it.
   */
  readonly readOnly?: boolean;
  /** Activation intent — the container owns the mutation launch. */
  readonly onIntent?: (sessionId: string) => void;
}
