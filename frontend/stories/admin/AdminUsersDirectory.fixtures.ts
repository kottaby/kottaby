import type { MockLink } from "@apollo/client/testing";
import {
  type AdminUsersQuery_adminUsers_items,
  type AdminUsersQueryVariables,
  ApplicantStatus,
  Gender,
  UserRole,
} from "@/frontend/graphql/generated/gql/graphql";
import { adminUsersQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";

/**
 * Fixtures for the `Pages/Admin/Users Directory` story — MockLink rows
 * covering the directory's role tiles (admin / teacher ×3 / student / parent),
 * the governance states (active / suspended / blocked), and the null-tolerant
 * fields (missing phone, missing lastActiveAt).
 *
 * `DirectoryUserItem` = `AdminUsersQuery["adminUsers"]["items"][number]`; the
 * fragment selects no `__typename`, so it is pinned on the fixture type.
 */

export type DirectoryUserFixture = AdminUsersQuery_adminUsers_items & {
  readonly __typename: "AdminUserListItem";
};

/** Variables the hook sends on first render (empty filters, page 1, size 10). */
export const DIRECTORY_VARIABLES: AdminUsersQueryVariables = {
  filters: { role: null, governance: null, country: null, search: null },
  page: 1,
  pageSize: 10,
};

/** Deterministic fixture row (all eighteen fragment fields + `__typename`). */
function directoryRow(overrides?: Partial<DirectoryUserFixture>): DirectoryUserFixture {
  return {
    __typename: "AdminUserListItem",
    id: 101,
    fullName: "Omar Al-Farouk",
    email: "omar.farouk@example.com",
    phone: "+201001112222",
    role: UserRole.Admin,
    gender: Gender.Male,
    dateOfBirth: "1985-03-12",
    country: "Egypt",
    isDeleted: false,
    suspended: false,
    isBlocked: false,
    lastActiveAt: "2026-09-01T18:30:00.000Z",
    createdAt: "2025-11-02T09:15:00.000Z",
    applicantStatus: null,
    teacherIsApproved: null,
    teacherIsEvaluator: null,
    studentHasParentLink: null,
    studentHasActiveSubscription: null,
    parentLinkedChildrenCount: null,
    ...overrides,
  };
}

/** Six rows: admin, 3 teachers (certified / pending review / evaluator), student, parent. */
export const POPULATED_ROWS: readonly DirectoryUserFixture[] = [
  // Admin — active, full profile.
  directoryRow(),
  // Teacher — Certified (approved, not evaluator).
  directoryRow({
    id: 102,
    fullName: "Aisha Rahman",
    email: "aisha.rahman@example.com",
    phone: "+966501234567",
    role: UserRole.Teacher,
    gender: Gender.Female,
    country: "Saudi Arabia",
    applicantStatus: ApplicantStatus.Passed,
    teacherIsApproved: true,
    teacherIsEvaluator: false,
    lastActiveAt: "2026-08-31T07:45:00.000Z",
  }),
  // Teacher — Pending Review (no phone on file yet).
  directoryRow({
    id: 103,
    fullName: "Bilal Haddad",
    email: "bilal.haddad@example.com",
    phone: null,
    role: UserRole.Teacher,
    gender: Gender.Male,
    country: "Jordan",
    applicantStatus: ApplicantStatus.Pending,
    teacherIsApproved: false,
    teacherIsEvaluator: false,
  }),
  // Teacher — Certified + Evaluator, currently suspended.
  directoryRow({
    id: 104,
    fullName: "Maryam Suleiman",
    email: "maryam.suleiman@example.com",
    phone: "+971501998877",
    role: UserRole.Teacher,
    gender: Gender.Female,
    country: "United Arab Emirates",
    suspended: true,
    applicantStatus: ApplicantStatus.Passed,
    teacherIsApproved: true,
    teacherIsEvaluator: true,
    lastActiveAt: "2026-08-20T14:05:00.000Z",
  }),
  // Student — parent-linked + active subscription, never logged activity.
  directoryRow({
    id: 105,
    fullName: "Yusuf Al-Amin",
    email: "yusuf.alamin@example.com",
    phone: null,
    role: UserRole.Student,
    gender: Gender.Male,
    dateOfBirth: "2014-06-21",
    country: "Egypt",
    applicantStatus: null,
    teacherIsApproved: null,
    teacherIsEvaluator: null,
    studentHasParentLink: true,
    studentHasActiveSubscription: true,
    lastActiveAt: null,
  }),
  // Parent — two linked children, currently blocked, no phone / last-active.
  directoryRow({
    id: 106,
    fullName: "Huda Nassar",
    email: "huda.nassar@example.com",
    phone: null,
    role: UserRole.Parent,
    gender: Gender.Female,
    dateOfBirth: "1988-09-30",
    country: "Qatar",
    isBlocked: true,
    parentLinkedChildrenCount: 2,
    lastActiveAt: null,
  }),
];

/** Populated page 1 of N — drives the pagination footer off screen 1. */
export const POPULATED_TOTAL_COUNT = 23;

/** Reusable MockLink response — mocks are `Infinity`-usage so refetches stay green. */
export function directoryMock(rows: readonly DirectoryUserFixture[], totalCount: number): MockLink.MockedResponse {
  return {
    request: { query: adminUsersQueryDocument, variables: DIRECTORY_VARIABLES },
    result: {
      data: {
        adminUsers: { __typename: "AdminUserPage", items: [...rows], totalCount, page: 1, pageSize: 10 },
      },
    },
    maxUsageCount: Number.POSITIVE_INFINITY,
  };
}
