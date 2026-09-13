# Fix-Pattern Playbook

Finding → canonical fix mapping for fix waves. Fixers pick the recipe matching their finding and follow
it — converging on the same shapes across waves instead of inventing per-wave solutions. If no row
matches the finding, say so in the wave report: that gap is a playbook candidate for the evolution log.

| Finding pattern | Usual root cause | Canonical fix | Watch-outs |
|---|---|---|---|
| Horizontal overflow at viewport W | Fixed pixel width on container or child | Replace `width: <px>` with `maxWidth`/`width: "100%"`; `minWidth: 0` on flex/grid children; grid `minmax(0, 1fr)` | Check parents first — overflow is usually inherited |
| Cramped mobile dialog/modal | Desktop-sized Dialog on small screens | `fullScreen` below `theme.breakpoints.down("sm")`, or bottom-sheet composition; sticky footer actions with safe-area padding | Keep the desktop layout untouched |
| Too many competing primary buttons | No action hierarchy decided | ONE contained primary per view; rest `variant="outlined"`/`text`; destructive → `color="error"` | Applies per visible view, not per page |
| Missing/weak summary or status banner | Info buried in body copy | Alert-style surface above the fold: icon + title + one supporting line; tone via `theme.palette.<tone>` tokens | Banner summarizes, never duplicates, the content below |
| Inconsistent spacing | Per-element ad-hoc margins | Parent stack `gap` with theme spacing scale; drop per-child margins; consistent card padding | Prefer fixing the container over each child |
| DataGrid feels crowded/sparse | Default density for the context | `density` prop, hide low-value columns at breakpoints, keep the actions column pinned last | Keep column headers i18n-driven |
| Blank area while loading | No async state design | Skeletons matching the final layout's shape; spinner only for tiny inline regions | Skeleton ≠ spinner; match the real layout |
| Empty list looks broken | No empty state | Composed empty state: icon + heading + one-line guidance + single CTA | Never ship a bare empty table/grid |
| Errors only in console/toast | No error surface | Domain-error band (`Alert severity="error"`) for operations; field-level `helperText` for inputs | Map domain errors via translation functions, never raw messages |
| Mobile form unreadable | Desktop grid kept on mobile | Single-column stacking, label-above-input, full-width inputs, sticky action footer | Test at 390px first, not after desktop |
| Text hierarchy flat | Same variant/weight everywhere | MUI variant scale only (`h6/subtitle1/body2/caption`); weight contrast via `sx={{ fontWeight }}` | No ad-hoc `fontSize` px values |
| Ad-hoc colors in sx | Hex literals / hardcoded palette strings | Theme tokens only: `theme.palette.*` (use theme callback form) | Hex in a diff = automatic wave rejection |
| RTL layout breaks in Arabic | Physical `left`/`right` props | Logical props: `marginInlineStart`, `paddingInlineEnd`, `insetInlineStart`, etc. | Re-check with `globals=locale:ar` capture |
| Hardcoded copy in JSX | String literals in components | All user-visible text via `useAppTranslation` keys with typed interpolation | Includes aria-labels and dialog titles |
| Card/elevation inconsistency | Mixed shadow treatments per card | One card treatment per surface family (hairline border + consistent shadow) | Fix the family, not the instance |
| Numbers/dates formatted ad hoc | Inline `toLocaleString`/`Intl` calls | The project's shared formatters/locale helpers | Date/currency formatting is centralized |
| Bare-text dialog cancel reads as non-interactive | Cancel rendered as a text-only button beside a contained primary | `variant="outlined"` on the Cancel button (keep `color="inherit"`); equal-quality interactive control next to Save | Button order/spacing untouched; still ONE contained primary per dialog |
| Asymmetric dialog gutter | Per-side ad-hoc padding / unpinned DialogContent defaults | Pin a symmetric logical gutter: DialogContent `paddingInline: theme.spacing(3)` | Pixel-verify first — VLM "asymmetry" calls can be misperception; logical props stay RTL-safe |
| Low-contrast select dropdown icon | MUI `.MuiSelect-icon` inherits `action.active` (54% black in light mode) | Scoped `sx={{ "& .MuiSelect-icon": { color: "var(--mui-palette-text-primary)" } }}` on the one select | Mode-aware token clears AA in both schemes; never recolor globally |
| Weak dialog isolation (page behind barely dimmed) | MUI default backdrop (50% scrim, no blur) reads flat over busy pages | Dialog-only `slotProps={{ backdrop: { sx: { backgroundColor: color-mix(...palette-scrim 60%, transparent), backdropFilter: "blur(2px)" } } }}` | Scoped to that dialog's slotProps — never global theme edits |
| Status/type chips all render the same color | Display mappers switch on lowercase values while the wire sends capitalized enums (`"Completed"`) — the default arm swallows everything | Switch on the canonical CAPITALIZED wire values; unit-test mappers with wire-case fixtures, not hand-typed lowercase | Check the HAR/DOM for actual wire values before writing cases |
| Adjacent chip columns with colliding hues (type vs status) | Dark-mode container pairs (primaryContainer vs surfaceContainerHighest) are near-identical navy | Categorical separation: one family outlined (transparent fill + `tone.main` border/text), the other filled — add an `outlined` variant to the shared chip | Keep ONE filled family for the semantic statuses |
| Confirm/decline button pair equal weight | Both rendered as identical outlined buttons on a consequential action | Confirm = contained primary, Decline = outlined error; gap ≥ 12px | One contained primary per view still holds |
| Disabled destructive submit loses its error identity | MUI disabled wash flattens `color="error"` to neutral gray | Disabled + error: `bgcolor: errorContainer, color: onErrorContainer, opacity: .6` so intent reads before the form is valid | Only for `color="error"` submits; primary submits keep the standard wash |
| Money columns left-aligned | Default cell alignment makes decimals fail to stack | Right-align header + cells, `fontVariantNumeric: "tabular-nums"`, weight 700 on amounts; pass `align` through the shared header cell | Header must get the same alignment as cells |
| Closed Select shows an empty value area for the "" option | MUI does not call `renderValue` for `value=""` | Add `displayEmpty` so the "" MenuItem text renders in the closed control | Keep the shrunk label so the field still names itself |
| Autocomplete renders as a plain text input (no chevron) | `renderInput`'s explicit `slotProps` REPLACES the spread `params.slotProps`, dropping the endAdornment | Merge: `slotProps={{ ...params.slotProps, htmlInput: {...} }}` | Also lift `.MuiAutocomplete-popupIndicator` color off `action.active` on dark surfaces |
| Multiline outlined field with forced shrunk label clips glyphs | Forced `inputLabel: { shrink: true }` on `multiline` mis-positions the notch label | Don't force shrink on multiline fields; the un-shrunk in-field label is the hint | Single-line fields keep the forced shrink fine |

## Convergence rule

When two findings on different screens share a root cause in a shared primitive (grid, container,
toolbar), escalate to the orchestrator as a CROSS-FILE decision — one fix in the primitive, not
local patches per screen.
