# Palette's Journal - UX & Accessibility Learnings

## 2026-03-31 - Visible Focus Rings on Icon-Only Buttons in Custom Shared Components
**Learning:** In MUI v9, custom icon-only button wrappers (like `DirectoryCopyEmailButton` and `DirectoryViewDetailsButton`) do not automatically receive focus-visible outlines unless `focusVisibleRingSx` from `@/frontend/components/ui/focusRing` is explicitly spread into their `sx` prop. Adding this ensures keyboard navigation users see a clear, high-contrast copper focus indicator (satisfying WCAG 2.4.7 Focus Visible).
**Action:** Always spread `focusVisibleRingSx` when building or refining custom shared `<IconButton>` components.
