import { SessionStatus, type SurahJuzRef } from "@/frontend/graphql/generated/gql/graphql";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

/**
 * Parent-portal presentation helpers — the pure mapping surface between
 * the read-model GraphQL enum payloads and the localized label slots the
 * `parentMonitoring` namespace exposes.
 *
 * The portal renders two enum vocabularies that arrive over the wire as
 * codegen-generated TS enums (canonical PascalCase members):
 *  - `SessionStatus` — the attendance row's lifecycle status, mapped
 *    one-to-one onto the five `attendanceStatus*` label slots.
 *  - `SurahJuzRef` — a homework/position row's Quranic reference (five
 *    surahs + 30 juz). The codegen members (`Juz1`, `SurahAlFatihah`, …)
 *    are NOT user-presentable as-is; the `parentMonitoring` namespace does
 *    NOT ship per-member localized names (it owns only the track labels
 *    Jadid/Madi and the "none assigned" fallback). This helper shapes the
 *    codegen name into a presentable run (`Juz 1`, `Surah Al Fatihah`)
 *    that is locale-neutral — digits stay Latin under both `en` and `ar`
 *    so the run is bidi-isolated at the call site (the component wraps it
 *    in `dir="auto"`).
 *
 * No React, no hooks, no side effects — pure functions over locale handles
 * and enum members.
 */

/**
 * Lookup table from each `SessionStatus` enum member to its localized
 * attendance label slot. Exhaustive by construction — every member has a
 * paired slot in `ParentMonitoringLabels`; an unforeseen enum extension
 * surfaces as a compile-time error here (the slot list must grow with
 * the enum).
 */
const SESSION_STATUS_LABEL_KEYS: Readonly<Record<SessionStatus, keyof ParentMonitoringLabels>> = {
  [SessionStatus.Completed]: "attendanceStatusAttended",
  [SessionStatus.Cancelled]: "attendanceStatusCancelled",
  [SessionStatus.Disputed]: "attendanceStatusDisputed",
  [SessionStatus.Scheduled]: "attendanceStatusScheduled",
  [SessionStatus.Started]: "attendanceStatusStarted",
};

/**
 * Resolves the localized attendance chip label for one `SessionStatus`
 * member. The label slot lookup is exhaustive (every member has a paired
 * slot); the fallback returns an empty string so a chip never renders a
 * fabricated label, but is unreachable in practice.
 */
export function attendanceStatusLabel(status: SessionStatus, labels: ParentMonitoringLabels): string {
  const slotKey = SESSION_STATUS_LABEL_KEYS[status];
  const value = labels[slotKey];
  return typeof value === "string" ? value : "";
}

/**
 * Formats a `SurahJuzRef` enum member into a presentable, locale-neutral
 * run: inserts a space before each capital letter (except the leading
 * one) and before each digit, so `Juz1` → `Juz 1` and
 * `SurahAlFatihah` → `Surah Al Fatihah`. Digits stay Latin under both
 * locales; the component wraps the result in `dir="auto"` so the run is
 * bidi-isolated inside RTL documents.
 */
export function formatSurahJuzRef(ref: SurahJuzRef): string {
  return ref.replace(/([A-Za-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
}
