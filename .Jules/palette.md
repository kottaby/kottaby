## 2026-03-31 - MUI v9 IconButton Keyboard Focus Indicators
**Learning:** MUI v9 `IconButton` does not provide default visible keyboard focus styles (`.Mui-focusVisible`), which fails WCAG 2.4.7 (Focus Visible) on raw `IconButton` elements across the application.
**Action:** Always spread `...focusVisibleRingSx` on raw MUI `IconButton` components to ensure a consistent, accessible copper focus ring indicator on keyboard navigation.
