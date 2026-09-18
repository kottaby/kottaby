const TAB_KEYS = ["attendance", "reports", "homework", "evaluations", "progress"] as const;
type TabKey = (typeof TAB_KEYS)[number];
const DEFAULT_TAB: TabKey = "attendance";

function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value);
}

export function resolveTab(tab: string | null): TabKey {
  return tab !== null && isTabKey(tab) ? tab : DEFAULT_TAB;
}

export function buildDetailUrl(studentId: string | number, tab: TabKey, session: string | null): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (session !== null) {
    params.set("session", session);
  }
  return `/parent/children/${studentId}?${params.toString()}`;
}

/**
 * Whether a row is the `?session=` deep link's highlight target: the
 * pointer is present and equals the row's owning session id. This is the
 * one match rule every content tab's row (reports, homework, evaluations)
 * applies, so a single link highlights the same session's row on every tab.
 */
export function isDeepLinkTargetRow(deepLinkSessionId: number | null, rowSessionId: number): boolean {
  return deepLinkSessionId !== null && deepLinkSessionId === rowSessionId;
}

export const TAB_LABEL_KEYS: Readonly<
  Record<TabKey, "tabAttendance" | "tabReports" | "tabHomework" | "tabEvaluations" | "tabProgress">
> = {
  attendance: "tabAttendance",
  reports: "tabReports",
  homework: "tabHomework",
  evaluations: "tabEvaluations",
  progress: "tabProgress",
};

export type { TabKey };
export { TAB_KEYS };
