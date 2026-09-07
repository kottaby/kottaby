## 2026-09-07 - Wrapping Disabled IconButtons in Tooltips
**Learning:** MUI `<Tooltip>` doesn't trigger on disabled `<IconButton>` elements because disabled buttons block pointer events. Wrapping disabled `IconButton`s in a `<span>` element allows the tooltip to remain accessible on hover/focus even when the button is disabled.
**Action:** Always wrap `IconButton` in `<span>` inside `<Tooltip>` if the button can be `disabled` (e.g., pager bounds or action loaders).
