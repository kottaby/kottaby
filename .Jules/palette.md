# Palette's Journal - Critical UX & Accessibility Learnings

## 2026-09-19 - Localize ARIA Labels in Parent Monitoring Surfaces
**Learning:** Hardcoded English ARIA labels (e.g. `aria-label="previous month"`, `aria-label="close"`) in bilingual UI components break accessibility for screen-reader users operating in non-English locales (such as Arabic). Reusing existing keys from `@/shared/locale`'s `Common` namespace (`previousPage`, `nextPage`, `close`) ensures full screen reader localized support without adding redundant i18n keys.
**Action:** Always check `IconButton`s in component templates for hardcoded string `aria-label` attributes and hook them into `Common` or domain-specific translation namespaces.
