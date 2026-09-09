## 2025-05-18 - Single-Pass Cookie and Header Parsing in GraphQL Context Factory
**Learning:** In GraphQL request handling, `createGraphQLContext` previously parsed cookies twice per request (once for context object generation and once inside `extractAccessToken`), and executed regex matching over raw cookie headers for locale extraction. Passing pre-parsed cookies and fast-pathing `Bearer ` header strings avoids duplicate parsing and allocations on hot request paths.
**Action:** When inspecting per-request gateway factories, reuse parsed headers/cookies across sub-extractors and fast-path standard header prefixes.

## 2026-09-09 - Zero-Allocation Single-Pass Cookie Parsing Optimization
**Learning:** `parseCookies` in `backend/lib/auth/cookies.ts` previously split the `Cookie` header string by `;` on every request, creating intermediate array allocations and string slices, while wrapping `decodeURIComponent` in a `try...catch` block. Switching to a single-pass character index scan and bypassing `decodeURIComponent` + `try...catch` when no `%` character exists in cookie values improves cookie parsing throughput by ~3.3x without altering RFC 6265 behavior or triggering ESLint cognitive complexity warnings.
**Action:** Use index scanning over string `.split()` for hot request header parsing loops and fast-path URI decoding for unescaped tokens.
