import type { UpNextLabels } from "@/shared/locale/types/upNext";

export const upNextEn: UpNextLabels = {
  upNextTitle: "What's next",
  upcomingHeading: "Upcoming sessions",
  upcomingEmpty: "No upcoming sessions yet — sessions you book will appear here.",
  sessionLine: (id: number) => `Session #${id}`,
  bookedPrefix: "Booked",
  sessionsCta: "View sessions",
  homeworkHeading: "Homework",
  homeworkPendingLine: (count: number) =>
    count === 1 ? "1 assignment awaiting grade" : `${count} assignments awaiting grade`,
  homeworkAllGraded: "All caught up — nothing awaiting grade",
  loadingLabel: "Loading your next steps",
  errorBody: "Could not load your next steps.",
};
