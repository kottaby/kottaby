import type { HomeworkLabels } from "@/shared/locale/types/homework";

export const homeworkEn: HomeworkLabels = {
  pageTitle: "Homework",
  listHeading: "Your assignments",
  summaryTotalLabel: "Assignments",
  summaryGradedLabel: "Graded",
  summaryPendingLabel: "Awaiting grade",
  trackJadid: "Jadid (new memorization)",
  trackMadi: "Madi (revision)",
  trackNoneAssigned: "None assigned",
  gradeLabel: "Grade",
  assignedPrefix: "Assigned",
  sessionLine: (id: number) => `Session #${id}`,
  countLine: (count: number) => (count === 1 ? "1 assignment" : `${count} assignments`),
  emptyTitle: "No homework yet",
  emptyBody:
    "Assignments appear here after a session is completed — your teacher records the new memorization and revision passages, then grades them as you progress.",
  errorTitle: "Could not load your homework",
  errorBody: "Something went wrong. Please try again.",
  loadingLabel: "Loading homework",
};
