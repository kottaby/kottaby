# Round R3 Review Outcome — DEV3-012

**Iteration:** R3 (independent fresh reviewer; scope `git diff --name-only ffce457`)
**Findings:** 2 NEW —
1. [MEDIUM] The F1 `Exclude<>` exhaustiveness pin in `resolveWaveEnvelope` was VACUOUS (empirically proven: 9th union member still compiled; annotation recomputes against grown union). Fix-round deliverable had not delivered its claimed guarantee.
2. [LOW] `WAVE_CASES` test matrix lacked an exhaustiveness pin.
**Fix:** R3 Fix Round — replaced with 6 explicit request cases + empty-case fall-through (biome/oxlint-cleared) + `never` default mirroring `composeWaveCopy`; test matrix pinned via `satisfies` + `MissingWaveCases` conditional. **Empirical mutation proof recorded:** adding a 9th kind now fails `bun tsgo` at both guard sites + test matrix (exact error lines documented); restore → 0 errors. All suites green (34/0, 59/0/4skip; tsgo 0).
**Remaining:** 0
