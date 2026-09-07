import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

export const adminTeachersEn: AdminTeachersLabels = {
  title: "Teachers",
  subtitle: "Read-only directory of every teacher account on the platform.",
  headers: {
    name: "Name",
    status: "Status",
    rating: "Rating",
    subjects: "Subjects",
    joined: "Joined",
  },
  statusPills: {
    approved: "Approved",
    pending: "Pending",
    deleted: "Deleted",
    suspended: "Suspended",
    blocked: "Blocked",
    online: "Online",
    offline: "Offline",
    evaluator: "Evaluator",
  },
  filters: {
    search: "Search",
    searchPlaceholder: "Search by name or email",
    approval: "Approval",
    online: "Presence",
    evaluator: "Evaluator",
    clear: "Clear filters",
    refresh: "Refresh",
  },
  filterOptions: {
    all: "All",
    nonEvaluator: "Non-evaluator",
  },
  emptyState: {
    title: "No teachers yet",
    message: "Teacher accounts will appear here once they register on the platform.",
    filteredTitle: "No teachers match your filters",
    filteredMessage: "Adjust the filters above or clear them to see every teacher.",
  },
  errorState: {
    title: "Could not load teachers",
    message: "Something went wrong while fetching the teacher directory. Try again.",
    retry: "Retry",
  },
  loading: "Loading teachers",
  quickActions: {
    copyEmail: "Copy email address",
    emailCopied: "Email address copied to clipboard.",
  },
  pagination: {
    page: "Page",
    showingPrefix: "Showing",
    of: "of",
    total: "Total",
    next: "Next page",
    previous: "Previous page",
    pageSize: "Rows per page",
  },
};
