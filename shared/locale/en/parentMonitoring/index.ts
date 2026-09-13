import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

export const parentMonitoringEn: ParentMonitoringLabels = {
  // ─── Portal root / linked-children list ─────────────────────────────────
  portalPageTitle: "Your Children",
  portalPageSubtitle: "Follow each child's attendance, reports, homework, evaluations, and progress.",
  childSwitcherLabel: "Select child",
  childrenCount: (count: number) => {
    if (count === 0) return "No linked children";
    if (count === 1) return "1 linked child";
    return `${count} linked children`;
  },
  childrenEmptyTitle: "No linked children yet",
  childrenEmptyBody: "Once your child confirms your link request, they will appear here.",
  childrenEmptyCta: "Send a link request",

  // ─── Detail page header ─────────────────────────────────────────────────
  detailPageTitle: (childName: string) => `${childName}'s progress`,
  detailPageSubtitle: "Read-only monitoring of attendance, reports, homework, evaluations, and progress.",

  // ─── Tab labels ─────────────────────────────────────────────────────────
  tabAttendance: "Attendance",
  tabReports: "Reports",
  tabHomework: "Homework",
  tabEvaluations: "Evaluations",
  tabProgress: "Progress",

  // ─── Homework track vocabulary ──────────────────────────────────────────
  trackJadid: "Jadid (new memorization)",
  trackMadi: "Madi (revision)",
  trackNoneAssigned: "None assigned",

  // ─── Rating / progress / position fallbacks ─────────────────────────────
  ratingNotRated: "Not rated yet",
  ratingColumnLabel: "Rating",
  progressNoRecorded: "No recorded progress yet",
  progressPositionNone: "None",
  progressLatestJadidLabel: "Latest Jadid position",
  progressLatestMadiLabel: "Latest Madi position",

  // ─── Attendance tab ─────────────────────────────────────────────────────
  attendanceSectionTitle: "Attendance history",
  attendanceCount: (count: number) => {
    if (count === 0) return "No sessions";
    if (count === 1) return "1 session";
    return `${count} sessions`;
  },
  attendanceEmptyTitle: "No sessions yet",
  attendanceEmptyBody: "Attendance will appear here once your child's sessions are scheduled.",
  attendanceColumnDate: "Date",
  attendanceColumnStatus: "Status",
  attendanceStatusAttended: "Attended",
  attendanceStatusCancelled: "Cancelled",
  attendanceStatusDisputed: "Disputed",
  attendanceStatusScheduled: "Scheduled",
  attendanceStatusStarted: "In progress",

  // ─── Reports tab ────────────────────────────────────────────────────────
  reportsSectionTitle: "Session reports",
  reportsCount: (count: number) => {
    if (count === 0) return "No reports";
    if (count === 1) return "1 report";
    return `${count} reports`;
  },
  reportsEmptyTitle: "No reports yet",
  reportsEmptyBody: "Teacher notes and ratings will appear here after each completed session.",
  reportsColumnDate: "Date",
  reportsColumnNotes: "Teacher notes",
  reportsColumnRating: "Rating",

  // ─── Homework tab ───────────────────────────────────────────────────────
  homeworkSectionTitle: "Homework",
  homeworkCount: (count: number) => {
    if (count === 0) return "No homework";
    if (count === 1) return "1 homework entry";
    return `${count} homework entries`;
  },
  homeworkEmptyTitle: "No homework yet",
  homeworkEmptyBody: "Jadid and Madi tracks will appear here after each completed session.",
  homeworkColumnDate: "Date",
  homeworkColumnJadid: "Jadid",
  homeworkColumnMadi: "Madi",
  homeworkColumnGrade: "Grade",

  // ─── Evaluations tab ────────────────────────────────────────────────────
  evaluationsSectionTitle: "Teacher evaluations",
  evaluationsCount: (count: number) => {
    if (count === 0) return "No evaluations";
    if (count === 1) return "1 evaluation";
    return `${count} evaluations`;
  },
  evaluationsEmptyTitle: "No evaluations yet",
  evaluationsEmptyBody: "Per-session evaluations will appear here after each completed session.",
  evaluationsColumnDate: "Date",
  evaluationsColumnScore: "Score",
  evaluationsColumnNotes: "Notes",

  // ─── Progress tab ───────────────────────────────────────────────────────
  progressSectionTitle: "Curriculum progress",
  progressRowCount: (count: number) => {
    if (count === 0) return "No recorded progress";
    if (count === 1) return "1 progress entry";
    return `${count} progress entries`;
  },
  progressEmptyTitle: "No recorded progress yet",
  progressEmptyBody: "Curriculum position indicators will appear here once progress is recorded.",

  // ─── Loading / error scaffolding ────────────────────────────────────────
  loadingLabel: "Loading…",
  loadErrorBody: "We couldn't load this information right now. Please try again.",
  refreshLabel: "Refresh",
  lastUpdatedLabel: (timestamp: string): string => `Last updated: ${timestamp}`,
  statTotalChildren: "Total Children",
  statRecentSessions: "Recent Sessions",
  printLabel: "Print / Export",
  printDialogTitle: "Export Reports",
  printOption: "Print",
  exportCsvOption: "Export as CSV",
  exportSuccess: "Exported successfully",
  calendarViewLabel: "Calendar View",
  listViewLabel: "List View",
  calendarMonthLabel: "Month",
  printTimestampLabel: (timestamp: string): string => `Printed on ${timestamp}`,
  csvStatusColumn: "Session Status",
};
