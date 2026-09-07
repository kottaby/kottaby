"use client";

import type { ReactNode } from "react";
import { SessionListLoadingSkeleton } from "@/frontend/components/ui/sessionList";

/**
 * Student sessions loading skeleton — the student-surface slot of the
 * shared `SessionListLoadingSkeleton` (title text + rounded pill + body
 * panel rhythm), pinned to this surface's testId.
 */
export function SessionsLoadingSkeleton(): ReactNode {
  return <SessionListLoadingSkeleton testId="student-sessions-loading" />;
}
