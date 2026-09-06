"use client";

import type { ReactNode } from "react";
import { SessionListLoadingSkeleton } from "@/frontend/components/ui/sessionList";

/**
 * Teacher sessions loading skeleton — the teacher-surface slot of the
 * shared `SessionListLoadingSkeleton` (title text + rounded pill + body
 * panel rhythm), pinned to this surface's testId. Extracted verbatim from
 * `TeacherSessionsContainer` (the max-lines split).
 */
export function TeacherSessionsLoadingSkeleton(): ReactNode {
  return <SessionListLoadingSkeleton testId="teacher-sessions-loading" />;
}
