## 2026-09-17 - Disabled MUI IconButtons and Tooltips

**Learning:** Material UI disables pointer events on `disabled` `<IconButton>` components, which prevents hover and focus events from reaching parent `<Tooltip>` components, causing tooltips to not render when buttons are disabled.
**Action:** Always wrap disabled or conditionally disabled Material UI `<IconButton>` components in an inline `<span>` element when inside a `<Tooltip>`.
