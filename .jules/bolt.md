## 2026-09-15 - Single-pass Status Aggregation in Admin Session Governance
**Learning:** React hooks calculating status summary counts over query result lists can avoid Map heap allocations and extra array passes (`.filter()`) by accumulating counters in a single O(n) loop.
**Action:** When summarizing status enums or flags over array data in custom hooks, use a single `for...of` loop with standard integer accumulators rather than allocating `new Map()` or chaining `.filter()`.
