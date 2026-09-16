/**
 * CreateUserCredentialField — component test suite.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

const { cleanup, fireEvent, screen } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { CreateUserCredentialField } from "@/frontend/views/admin/users/dialogs/CreateUserCredentialField";
import { AdminUsers as AdminUsersNs } from "@/shared/locale/namespaces/adminUsers";
import { Auth as AuthNs } from "@/shared/locale/namespaces/auth";
import { getTranslations } from "@/shared/locale/server";

afterEach(cleanup);

describe("CreateUserCredentialField", () => {
  test("renders label and password field with visibility toggle", () => {
    const labels = AdminUsersNs.getLabels(getTranslations("en"));
    const authLabels = AuthNs.getLabels(getTranslations("en"));
    const handleChange = mock(() => undefined);

    renderWithWrapper(
      <CreateUserCredentialField labels={labels} value="secret123" onChange={handleChange} error={undefined} />,
      { locale: "en" }
    );

    const toggleBtn = screen.getByRole("button", { name: authLabels.showPassword });
    expect(toggleBtn).toBeDefined();

    // Toggle visibility
    fireEvent.click(toggleBtn);

    const hideToggleBtn = screen.getByRole("button", { name: authLabels.hidePassword });
    expect(hideToggleBtn).toBeDefined();
  });
});
