import type { MockLink } from "@apollo/client/testing";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { adminUsersQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import {
  DIRECTORY_VARIABLES,
  directoryMock,
  POPULATED_ROWS,
  POPULATED_TOTAL_COUNT,
} from "@/frontend/stories/admin/AdminUsersDirectory.fixtures";
import { DashboardStoryFrame, StoryApolloProvider } from "@/frontend/stories/lib/storyHarness";
import { AdminUsersDirectoryContainer } from "@/frontend/views/admin/users/directory";
import { adminUsersEn } from "@/shared/locale/en/adminUsers";

/**
 * Storybook surface for the `/admin/users` directory page
 * (`AdminUsersDirectoryContainer` + `useAdminUsersDirectory`).
 *
 * The real page (`app/(dashboard)/admin/users/page.tsx`) passes the
 * `AdminUsers` locale leaf from the server; the story binds the real English
 * bundle (`adminUsersEn`) directly. Data rides a real `ApolloClient` over
 * `MockLink` (production cache) via `StoryApolloProvider`; mocks carry the
 * exact first-render variables `{ filters: {…null}, page: 1, pageSize: 10 }`
 * and are `maxUsageCount: Infinity` so filter/pagination refetches never fall
 * off the mock queue.
 */

function DirectoryHarness({ mocks }: Readonly<{ mocks: readonly MockLink.MockedResponse[] }>): ReactNode {
  return (
    <StoryApolloProvider mocks={mocks}>
      <DashboardStoryFrame>
        <AdminUsersDirectoryContainer labels={adminUsersEn} />
      </DashboardStoryFrame>
    </StoryApolloProvider>
  );
}

const meta = {
  title: "Pages/Admin/Users Directory",
  component: DirectoryHarness,
  parameters: {
    layout: "fullscreen",
    controls: { exclude: ["mocks"] },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DirectoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Populated page 1 of N — mixed roles, governance states, and sparse fields. */
export const Default: Story = {
  args: { mocks: [directoryMock(POPULATED_ROWS, POPULATED_TOTAL_COUNT)] },
};

/** Never-resolving list fetch — the skeleton branch (desktop + mobile). */
export const Loading: Story = {
  args: {
    mocks: [
      {
        request: { query: adminUsersQueryDocument, variables: DIRECTORY_VARIABLES },
        result: {
          data: { adminUsers: { __typename: "AdminUserPage", items: [], totalCount: 0, page: 1, pageSize: 10 } },
        },
        delay: Number.POSITIVE_INFINITY,
        maxUsageCount: Number.POSITIVE_INFINITY,
      },
    ],
  },
};

/** Transport failure — the translated error alert above the results. */
export const LoadError: Story = {
  args: {
    mocks: [
      {
        request: { query: adminUsersQueryDocument, variables: DIRECTORY_VARIABLES },
        error: new Error("mocked transport failure"),
        maxUsageCount: Number.POSITIVE_INFINITY,
      },
    ],
  },
};

/** Zero rows with no filters — the translated empty state + create CTA. */
export const Empty: Story = {
  args: { mocks: [directoryMock([], 0)] },
};
