## 2025-02-14 - Deduplicate MUI `@keyframes` in `.map()` renders

**Learning:** Embedding `@keyframes` inside item `sx` objects within array `.map()` iterations causes MUI/Emotion CSS-in-JS to serialize and inject N identical duplicate `@keyframes` CSS rules into the document head.
**Action:** Always declare `@keyframes` on the parent container element's `sx` prop (or a single static component), allowing descendant items to reference the keyframe animation name without duplicating keyframe CSS definitions.
