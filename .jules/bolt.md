## 2026-09-19 - Short-circuiting callbacks in search filter predicates
**Learning:** Evaluation order in array filter callbacks matters significantly when one predicate branch executes expensive operations (such as `Intl.DateTimeFormat` date formatting). Evaluating predicate functions eagerly before checking simple text equality bypasses boolean short-circuiting and causes unnecessary CPU load per filtered row.
**Action:** Always structure filter conditions so that fast text or property equality checks execute first and short-circuit expensive callback predicates.
