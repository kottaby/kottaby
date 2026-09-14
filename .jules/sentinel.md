## 2026-09-14 - CORS Origin Hostname Parsing
**Vulnerability:** Simple `endsWith(".domain.com")` string comparison on the `Origin` header ignored the apex domain `https://domain.com` and relied on raw string matching rather than formal URL origin parsing.
**Learning:** Checking origins with raw string suffixes can lead to misconfigurations and unhandled domain variations.
**Prevention:** Always parse the origin with `new URL(origin)` and compare `hostname === domain` or `hostname.endsWith("." + domain)`.
