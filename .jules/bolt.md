## 2026-09-12 - Memoization of Notification List and Rows
**Learning:** In notification feed lists, parent component state updates (such as snackbar visibility or pagination/filter metadata changes) cause unmemoized list and row components to re-render every item in the feed window.
**Action:** Wrap list container (`NotificationList`) and list item (`NotificationRow`) components in `React.memo` to skip re-rendering unchanged notification entries.
