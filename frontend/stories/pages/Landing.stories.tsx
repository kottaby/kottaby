import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { AuthContext, type AuthContextType } from "@/frontend/context/AuthContext";
import { StoryApolloProvider } from "@/frontend/stories/lib/storyHarness";
import { LandingPage } from "@/frontend/views/landing";

/**
 * Storybook surface for `LandingPage` — the public marketing page rendered by
 * `app/page.tsx` at `/`.
 *
 * The page is a static marketing surface by design: hero, hijri/prayer strip,
 * stats, features, recitations, how-it-works, roles, testimonials, FAQ,
 * newsletter, CTA, footer, plus the floating WhatsApp / cookie-consent /
 * back-to-top affordances. Copy comes from `useAppTranslation` (locale
 * decorator) and theming from the MUI decorator.
 *
 * Two providers the global decorators do NOT supply:
 *  - `AuthContext` — `LandingNav`'s `LocaleSwitcher` calls `useAuth()`, which
 *    throws outside a provider. The story presents the anonymous visitor:
 *    `user: null`, so `LocaleSwitcher` takes its cookie-only path (the
 *    write-through mutation never fires).
 *  - `StoryApolloProvider([])` — `LocaleSwitcher` also calls
 *    `useApolloClient`/`useMutation`; an empty-mock client satisfies the
 *    hooks without any network shape (the mutation only fires for a signed-in
 *    user, never here).
 */

/** Anonymous-visitor auth context — mirrors the real logged-out landing page. */
const ANONYMOUS_AUTH: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  login: () => Promise.resolve(false),
  logout: () => undefined,
};

/** Harness: anonymous AuthContext + empty-mock Apollo client around the page. */
function LandingHarness(): ReactNode {
  return (
    <AuthContext.Provider value={ANONYMOUS_AUTH}>
      <StoryApolloProvider mocks={[]}>
        <LandingPage />
      </StoryApolloProvider>
    </AuthContext.Provider>
  );
}

const meta = {
  title: "Pages/Landing",
  component: LandingHarness,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof LandingHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The full landing page exactly as anonymous visitors see it at `/`. */
export const Default: Story = {};
