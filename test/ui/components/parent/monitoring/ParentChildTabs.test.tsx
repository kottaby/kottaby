/**
 * ParentChildDetailContainer tab components — the five-tab state matrix.
 *
 * Each of the five portal tabs (Progress, Attendance, Reports, Homework,
 * Evaluations) is mounted directly with a mocked Apollo provider and
 * driven through its four rendering branches:
 *
 *   loading → skeleton region (`aria-busy`, `data-testid="parent-<tab>-loading"`)
 *   empty   → `IconCircleEmptyState` (`data-testid="parent-<tab>-empty"`)
 *   data    → per-row Card list (`data-testid="parent-<tab>-list"` + rows)
 *   FORBIDDEN → `PermissionDeniedFallback` (the server's raw message NEVER renders)
 *
 * Plus the per-child re-keying proof: switching the `studentId` prop
 * re-issues the tab's query with the new id (Apollo cache isolation —
 * a previously rendered child's rows never appear under the new one).
 *
 * The suite runs across BOTH locales (RTL `ar` + LTR `en`) for at least
 * one tab per state, verifying the full namespace copy renders under
 * each directionality.
 *
 * Network discipline: every render mounts a RECORDING `ApolloLink` in
 * front of the `MockLink`; the read-only posture assertion inspects
 * real link traffic — ZERO mutation operations may cross the wire (the
 * portal is a pure read surface, REQ-023.4).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { AttendanceTab } from "@/frontend/views/parent/monitoring/AttendanceTab";
import { EvaluationsTab } from "@/frontend/views/parent/monitoring/EvaluationsTab";
import { HomeworkTab } from "@/frontend/views/parent/monitoring/HomeworkTab";
import { ProgressTab } from "@/frontend/views/parent/monitoring/ProgressTab";
import { ReportsTab } from "@/frontend/views/parent/monitoring/ReportsTab";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Errors as ErrorsNs } from "@/shared/locale/namespaces/errors";
import { ParentMonitoring as ParentMonitoringNs } from "@/shared/locale/namespaces/parentMonitoring";
import { getTranslations } from "@/shared/locale/server";
import {
  attendanceRowFixture,
  createNetworkTraffic,
  expectZeroMutations,
  homeworkFailureMock,
  homeworkInFlightMock,
  homeworkMock,
  homeworkRowFixture,
  linkedChildFixture,
  progressFailureMock,
  progressFixture,
  progressInFlightMock,
  progressMock,
  renderPortal,
  reportRowFixture,
  reportsFailureMock,
  reportsInFlightMock,
  reportsMock,
  sessionsFailureMock,
  sessionsInFlightMock,
  sessionsMock,
  settleNetwork,
} from "@/test/ui/components/parent/monitoring/helpers";
import { resetNavigationCalls } from "@/test/ui/components/translation-preload";

/** The active child id used across the tab suites (numeric — the tab prop shape). */
const ACTIVE_STUDENT_ID = 401;

/** A second child id used for the per-child re-keying proof. */
const FOREIGN_STUDENT_ID = 402;

/** Never rendered — the raw transport message stays behind the `extractErrorCode` boundary. */
const RAW_TRANSPORT_MESSAGE_SENTINEL = "FORBIDDEN (masked transport surface)";

afterEach(() => {
  cleanup();
  resetNavigationCalls();
});

// ─── ProgressTab — four-state matrix ─────────────────────────────────────────

describe("ProgressTab — state matrix", () => {
  for (const locale of ["ar", "en"] as AppLocale[]) {
    const t = ParentMonitoringNs.getLabels(getTranslations(locale));
    const te = ErrorsNs.getLabels(getTranslations(locale));

    describe(`locale=${locale}`, () => {
      test("loading → skeleton region with aria-busy; ZERO mutations on the wire", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <ProgressTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [progressInFlightMock(ACTIVE_STUDENT_ID)],
          locale
        );

        const skeleton = screen.getByTestId("parent-progress-loading");
        expect(skeleton.getAttribute("aria-busy")).toBe("true");

        // The section heading renders even during cold load.
        expect(screen.getByText(t.progressSectionTitle)).toBeDefined();

        // No list, no empty state — the skeleton is the body.
        expect(screen.queryByTestId("parent-progress-list")).toBeNull();
        expect(screen.queryByTestId("parent-progress-empty")).toBeNull();

        await settleNetwork();
        expectZeroMutations(traffic);
      });

      test("empty → IconCircleEmptyState with localized title + body (zero progress, null positions)", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <ProgressTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [
            progressMock(ACTIVE_STUDENT_ID, {
              progressRowCount: 0,
              child: linkedChildFixture(),
              latestJadidPosition: null,
              latestMadiPosition: null,
            }),
          ],
          locale
        );

        await waitFor(() => {
          expect(screen.getByTestId("parent-progress-empty")).toBeDefined();
        });
        expect(screen.getByText(t.progressEmptyTitle)).toBeDefined();

        // No list, no skeleton on the empty branch.
        expect(screen.queryByTestId("parent-progress-list")).toBeNull();
        expect(screen.queryByTestId("parent-progress-loading")).toBeNull();

        expectZeroMutations(traffic);
      });

      test("data → progress list with row count heading + Jadid/Madi position blocks", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <ProgressTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [progressMock(ACTIVE_STUDENT_ID, progressFixture())],
          locale
        );

        const list = await screen.findByTestId("parent-progress-list");
        expect(list.getAttribute("aria-label")).toBe(t.progressSectionTitle);

        // The row-count heading renders verbatim.
        expect(screen.getByText(t.progressRowCount(progressFixture().progressRowCount))).toBeDefined();

        // The Jadid + Madi track labels render.
        expect(screen.getByText(t.progressLatestJadidLabel)).toBeDefined();
        expect(screen.getByText(t.progressLatestMadiLabel)).toBeDefined();

        expectZeroMutations(traffic);
      });

      test("FORBIDDEN → PermissionDeniedFallback replaces the tab; raw transport message NEVER renders", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <ProgressTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [progressFailureMock(ACTIVE_STUDENT_ID, "FORBIDDEN")],
          locale
        );

        await waitFor(() => {
          expect(screen.getByText(te.forbiddenRole)).toBeDefined();
        });
        expect(screen.getByText(te.forbidden)).toBeDefined();

        // No tab chrome, no list, no skeleton — the denial IS the surface.
        expect(screen.queryByTestId("parent-progress-list")).toBeNull();
        expect(screen.queryByTestId("parent-progress-loading")).toBeNull();
        expect(screen.queryByText(RAW_TRANSPORT_MESSAGE_SENTINEL)).toBeNull();

        expectZeroMutations(traffic);
      });
    });
  }
});

// ─── AttendanceTab — four-state matrix ───────────────────────────────────────

describe("AttendanceTab — state matrix", () => {
  for (const locale of ["ar", "en"] as AppLocale[]) {
    const t = ParentMonitoringNs.getLabels(getTranslations(locale));
    const te = ErrorsNs.getLabels(getTranslations(locale));

    describe(`locale=${locale}`, () => {
      test("loading → skeleton region with aria-busy; ZERO mutations on the wire", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <AttendanceTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [sessionsInFlightMock(ACTIVE_STUDENT_ID)],
          locale
        );

        const skeleton = screen.getByTestId("parent-attendance-loading");
        expect(skeleton.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByText(t.attendanceSectionTitle)).toBeDefined();
        expect(screen.queryByTestId("parent-attendance-list")).toBeNull();

        await settleNetwork();
        expectZeroMutations(traffic);
      });

      test("empty → IconCircleEmptyState with localized title", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <AttendanceTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [sessionsMock(ACTIVE_STUDENT_ID, [])],
          locale
        );

        await waitFor(() => {
          expect(screen.getByTestId("parent-attendance-empty")).toBeDefined();
        });
        expect(screen.getByText(t.attendanceEmptyTitle)).toBeDefined();
        expect(screen.queryByTestId("parent-attendance-list")).toBeNull();

        expectZeroMutations(traffic);
      });

      test("data → attendance list with row count heading + per-row cards", async () => {
        const traffic = createNetworkTraffic();
        const row = attendanceRowFixture({ startedAt: "2026-09-05T09:00:00.000Z" });
        renderPortal(
          <AttendanceTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [sessionsMock(ACTIVE_STUDENT_ID, [row])],
          locale
        );

        const list = await screen.findByTestId("parent-attendance-list");
        expect(list.getAttribute("aria-label")).toBe(t.attendanceSectionTitle);
        expect(screen.getByText(t.attendanceCount(1))).toBeDefined();

        expectZeroMutations(traffic);
      });

      test("FORBIDDEN → PermissionDeniedFallback; raw transport message NEVER renders", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <AttendanceTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [sessionsFailureMock(ACTIVE_STUDENT_ID, "FORBIDDEN")],
          locale
        );

        await waitFor(() => {
          expect(screen.getByText(te.forbiddenRole)).toBeDefined();
        });
        expect(screen.getByText(te.forbidden)).toBeDefined();
        expect(screen.queryByTestId("parent-attendance-list")).toBeNull();
        expect(screen.queryByText(RAW_TRANSPORT_MESSAGE_SENTINEL)).toBeNull();

        expectZeroMutations(traffic);
      });
    });
  }
});

// ─── ReportsTab — four-state matrix ──────────────────────────────────────────

describe("ReportsTab — state matrix", () => {
  for (const locale of ["ar", "en"] as AppLocale[]) {
    const t = ParentMonitoringNs.getLabels(getTranslations(locale));
    const te = ErrorsNs.getLabels(getTranslations(locale));

    describe(`locale=${locale}`, () => {
      test("loading → skeleton region with aria-busy; ZERO mutations on the wire", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <ReportsTab studentId={ACTIVE_STUDENT_ID} session={null} />,
          traffic,
          [reportsInFlightMock(ACTIVE_STUDENT_ID)],
          locale
        );

        const skeleton = screen.getByTestId("parent-reports-loading");
        expect(skeleton.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByText(t.reportsSectionTitle)).toBeDefined();
        expect(screen.queryByTestId("parent-reports-list")).toBeNull();

        await settleNetwork();
        expectZeroMutations(traffic);
      });

      test("empty → IconCircleEmptyState with localized title", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <ReportsTab studentId={ACTIVE_STUDENT_ID} session={null} />,
          traffic,
          [reportsMock(ACTIVE_STUDENT_ID, [])],
          locale
        );

        await waitFor(() => {
          expect(screen.getByTestId("parent-reports-empty")).toBeDefined();
        });
        expect(screen.getByText(t.reportsEmptyTitle)).toBeDefined();
        expect(screen.queryByTestId("parent-reports-list")).toBeNull();

        expectZeroMutations(traffic);
      });

      test("data → reports list with row count heading + per-row cards", async () => {
        const traffic = createNetworkTraffic();
        const row = reportRowFixture({ studentRatingByTeacher: 5, teacherNotes: "Great work" });
        renderPortal(
          <ReportsTab studentId={ACTIVE_STUDENT_ID} session={null} />,
          traffic,
          [reportsMock(ACTIVE_STUDENT_ID, [row])],
          locale
        );

        const list = await screen.findByTestId("parent-reports-list");
        expect(list.getAttribute("aria-label")).toBe(t.reportsSectionTitle);
        expect(screen.getByText(t.reportsCount(1))).toBeDefined();

        expectZeroMutations(traffic);
      });

      test("FORBIDDEN → PermissionDeniedFallback; raw transport message NEVER renders", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <ReportsTab studentId={ACTIVE_STUDENT_ID} session={null} />,
          traffic,
          [reportsFailureMock(ACTIVE_STUDENT_ID, "FORBIDDEN")],
          locale
        );

        await waitFor(() => {
          expect(screen.getByText(te.forbiddenRole)).toBeDefined();
        });
        expect(screen.getByText(te.forbidden)).toBeDefined();
        expect(screen.queryByTestId("parent-reports-list")).toBeNull();
        expect(screen.queryByText(RAW_TRANSPORT_MESSAGE_SENTINEL)).toBeNull();

        expectZeroMutations(traffic);
      });
    });
  }
});

// ─── HomeworkTab — four-state matrix ─────────────────────────────────────────

describe("HomeworkTab — state matrix", () => {
  for (const locale of ["ar", "en"] as AppLocale[]) {
    const t = ParentMonitoringNs.getLabels(getTranslations(locale));
    const te = ErrorsNs.getLabels(getTranslations(locale));

    describe(`locale=${locale}`, () => {
      test("loading → skeleton region with aria-busy; ZERO mutations on the wire", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <HomeworkTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [homeworkInFlightMock(ACTIVE_STUDENT_ID)],
          locale
        );

        const skeleton = screen.getByTestId("parent-homework-loading");
        expect(skeleton.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByText(t.homeworkSectionTitle)).toBeDefined();
        expect(screen.queryByTestId("parent-homework-list")).toBeNull();

        await settleNetwork();
        expectZeroMutations(traffic);
      });

      test("empty → IconCircleEmptyState with localized title", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <HomeworkTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [homeworkMock(ACTIVE_STUDENT_ID, [])],
          locale
        );

        await waitFor(() => {
          expect(screen.getByTestId("parent-homework-empty")).toBeDefined();
        });
        expect(screen.getByText(t.homeworkEmptyTitle)).toBeDefined();
        expect(screen.queryByTestId("parent-homework-list")).toBeNull();

        expectZeroMutations(traffic);
      });

      test("data → homework list with row count heading + per-row cards", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <HomeworkTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [homeworkMock(ACTIVE_STUDENT_ID, [homeworkRowFixture()])],
          locale
        );

        const list = await screen.findByTestId("parent-homework-list");
        expect(list.getAttribute("aria-label")).toBe(t.homeworkSectionTitle);
        expect(screen.getByText(t.homeworkCount(1))).toBeDefined();

        expectZeroMutations(traffic);
      });

      test("FORBIDDEN → PermissionDeniedFallback; raw transport message NEVER renders", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <HomeworkTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [homeworkFailureMock(ACTIVE_STUDENT_ID, "FORBIDDEN")],
          locale
        );

        await waitFor(() => {
          expect(screen.getByText(te.forbiddenRole)).toBeDefined();
        });
        expect(screen.getByText(te.forbidden)).toBeDefined();
        expect(screen.queryByTestId("parent-homework-list")).toBeNull();
        expect(screen.queryByText(RAW_TRANSPORT_MESSAGE_SENTINEL)).toBeNull();

        expectZeroMutations(traffic);
      });
    });
  }
});

// ─── EvaluationsTab — four-state matrix (shares parentChildReports query) ─────

describe("EvaluationsTab — state matrix (shares parentChildReports query)", () => {
  for (const locale of ["ar", "en"] as AppLocale[]) {
    const t = ParentMonitoringNs.getLabels(getTranslations(locale));
    const te = ErrorsNs.getLabels(getTranslations(locale));

    describe(`locale=${locale}`, () => {
      test("loading → skeleton region with aria-busy; ZERO mutations on the wire", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <EvaluationsTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [reportsInFlightMock(ACTIVE_STUDENT_ID)],
          locale
        );

        const skeleton = screen.getByTestId("parent-evaluations-loading");
        expect(skeleton.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByText(t.evaluationsSectionTitle)).toBeDefined();
        expect(screen.queryByTestId("parent-evaluations-list")).toBeNull();

        await settleNetwork();
        expectZeroMutations(traffic);
      });

      test("empty → IconCircleEmptyState with localized title", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <EvaluationsTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [reportsMock(ACTIVE_STUDENT_ID, [])],
          locale
        );

        await waitFor(() => {
          expect(screen.getByTestId("parent-evaluations-empty")).toBeDefined();
        });
        expect(screen.getByText(t.evaluationsEmptyTitle)).toBeDefined();
        expect(screen.queryByTestId("parent-evaluations-list")).toBeNull();

        expectZeroMutations(traffic);
      });

      test("data → evaluations list with row count heading + per-row cards", async () => {
        const traffic = createNetworkTraffic();
        const row = reportRowFixture({ studentRatingByTeacher: 4, teacherNotes: "Good effort" });
        renderPortal(
          <EvaluationsTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [reportsMock(ACTIVE_STUDENT_ID, [row])],
          locale
        );

        const list = await screen.findByTestId("parent-evaluations-list");
        expect(list.getAttribute("aria-label")).toBe(t.evaluationsSectionTitle);
        expect(screen.getByText(t.evaluationsCount(1))).toBeDefined();

        expectZeroMutations(traffic);
      });

      test("FORBIDDEN → PermissionDeniedFallback; raw transport message NEVER renders", async () => {
        const traffic = createNetworkTraffic();
        renderPortal(
          <EvaluationsTab studentId={ACTIVE_STUDENT_ID} />,
          traffic,
          [reportsFailureMock(ACTIVE_STUDENT_ID, "FORBIDDEN")],
          locale
        );

        await waitFor(() => {
          expect(screen.getByText(te.forbiddenRole)).toBeDefined();
        });
        expect(screen.getByText(te.forbidden)).toBeDefined();
        expect(screen.queryByTestId("parent-evaluations-list")).toBeNull();
        expect(screen.queryByText(RAW_TRANSPORT_MESSAGE_SENTINEL)).toBeNull();

        expectZeroMutations(traffic);
      });
    });
  }
});

// ─── Per-child re-keying proof (Apollo cache isolation) ──────────────────────

describe("per-child re-keying — switching studentId re-issues the query with the new id", () => {
  test("ProgressTab: a studentId change re-keys the query (the foreign child's rows never appear under the new id)", async () => {
    const traffic = createNetworkTraffic();
    const activePayload = progressFixture();
    const foreignPayload = progressFixture({
      child: linkedChildFixture({ id: "402", fullName: "Foreign Child" }),
      progressRowCount: 99,
    });

    // Two mocks consumed in order: the first for the initial studentId,
    // the second for the re-keyed query after the prop changes.
    renderPortal(
      <ProgressTabRekeyWrapper initialId={ACTIVE_STUDENT_ID} nextId={FOREIGN_STUDENT_ID} />,
      traffic,
      [progressMock(ACTIVE_STUDENT_ID, activePayload), progressMock(FOREIGN_STUDENT_ID, foreignPayload)],
      "en"
    );

    // The initial child's row count renders first.
    await waitFor(() => {
      expect(screen.getByText(tEn.progressRowCount(activePayload.progressRowCount))).toBeDefined();
    });

    // Trigger the re-key (the wrapper flips the prop).
    const rekeyButton = screen.getByTestId("rekey-trigger");
    rekeyButton.click();

    // After the re-key, the foreign child's row count renders (NOT the
    // initial child's — Apollo cache isolation holds).
    await waitFor(() => {
      expect(screen.getByText(tEn.progressRowCount(foreignPayload.progressRowCount))).toBeDefined();
    });

    // Both queries carried their OWN studentId — the foreign child's
    // rows never appeared under the initial child's id.
    expect(traffic.capturedVariables).toContainEqual({ studentId: ACTIVE_STUDENT_ID });
    expect(traffic.capturedVariables).toContainEqual({ studentId: FOREIGN_STUDENT_ID });

    expectZeroMutations(traffic);
  });
});

// ─── Test-only wrapper for the re-keying proof ───────────────────────────────

const tEn = ParentMonitoringNs.getLabels(getTranslations("en"));

/** A test-only wrapper that flips the `studentId` prop on click. */
function ProgressTabRekeyWrapper(props: Readonly<{ initialId: number; nextId: number }>): ReactElement {
  const [id, setId] = useState(props.initialId);
  return (
    <>
      <button type="button" data-testid="rekey-trigger" onClick={() => setId(props.nextId)}>
        rekey
      </button>
      <ProgressTab studentId={id} />
    </>
  );
}
