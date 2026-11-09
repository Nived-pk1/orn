# Step 8.4d notes (design language and app frame) — resume file

Start: HEAD e0ddf47 + reference commit 2296ced; tree clean; no stashes. Speed (`node -e`, ms): 0 (2026-11-08).
Reference screenshots: screenshots/reference-light.png, reference-dark.png (1280 x 6733; Playwright full page, Chromium).

## Part 0 fact sheet
1. Tokens: `src/ui/design/tokens.css` (8.4a names: `--color-paper/surface/ink/ink-2/rule/accent/warning/error/review/on-accent/hover/scrim`,
   21 `--color-tone-*`, `--font-sans/mono`, `--text-12..32`, `--space-4..48`, `--radius-4/8/pill`, `--motion-fast/slow`, `--hit-min`,
   `--focus-ring-*`). Raw colours only there (scripts/check-colours.mjs, part of `npm run check`). No dark theme.
2. Fonts: IBM Plex Sans 400/600 and Mono 400, self-hosted through @fontsource CSS imports in `src/ui/design/index.ts` (served from the
   origin, font-src 'self'); system fallbacks in `--font`. Kept as is.
3. Icons: `src/ui/primitives/icons.tsx`, 16 inline-SVG paths (16 px box, stroke 1.5). Text glyphs elsewhere (☰, ›, ↻).
4. Palette: `src/features/search/palette.tsx` (cmdk inside native Dialog), lazy via `src/app/window/lazy-palette.tsx`; opened by Ctrl/Cmd K
   (window.tsx keydown) and the top bar Search icon; lists search hits, recent searches, and `>` commands (palette-commands.ts).
5. Header/rail/status: `src/ui/shell/shell.tsx` (+ mode-rail.tsx, shell.module.css 399 lines), top controls `src/app/window/top-bar.tsx`,
   notice band `src/app/window/notice-band*.tsx`, toast `src/ui/primitives/toast.tsx`, banner.tsx; tests shell*.test.tsx, top-bar.test.tsx.
6. Breadcrumb inputs: active mode id + MODES labels (modes.ts); record name lives in navigator/inspector stores (to be read in Part C).
7. Boot: `main.tsx` awaits `createAppServices` (reads uiState via bootReport) BEFORE `createRoot().render`; panels store is created
   from the boot report first. So a stored theme can be applied before first paint with no localStorage (8.4f).

## Part A red line (before any source touched)
`npx vitest run src/ui/design/tokens-v2.test.ts` -> `Tests 6 failed | 4 passed (10)` (no theme blocks in tokens.css, no
`--d-*`/`--s-*`/`--r-*` names, index.html has no data-theme, base.css focus ring is an outline, not `--focus`).

## Part A done
Tokens v2: tokens.css regenerated from the reference blocks (light + dark, copied verbatim; `data-theme="light"` in index.html).
8.4a names kept as aliases (`--color-paper` -> `--surface`, `--color-surface` -> `--canvas`, `--color-ink` -> `--text`, `--color-rule` ->
`--line-strong`, ...). App extras in both themes: `--success-ink/--warning-ink/--danger-ink/--review-violet` (the reference role
colours fail 4.5:1 as small text on white: warning 3.98, success 4.34) and the 7 family tones (dark values solid hex).
One global focus ring (`:focus-visible { box-shadow: var(--focus) }`) in base.css; body on `--canvas`.
GREEN: tokens-v2.test.ts 10/10; tokens.test.ts 74 pass (changed: stated-value test now pins the alias mapping; reduced-motion test
also covers `--d-*`; contrast pairs read the resolved aliases; added dark-theme pairs).
Reference gap: `--text-3` is 3.3:1 on white (light) and 4.05:1 on surface (dark): used for icons, hints and separators only, never for
text that carries meaning (dark `text-3 on surface` pair left out of the test on purpose; REVIEW REQUIRED).

## Part B red line (before icons.tsx / public/icons touched)
`npx vitest run tests/integration/icons-guard.test.ts src/ui/primitives/icons.test.tsx` -> `Tests 8 failed` (Icon is an inline <svg>,
expected SPAN; no ICON_NAMES list; no public/icons, LICENSE.txt, favicon.svg/png; no Lucide credit in DEPENDENCIES/About).

## Part B (icons) built; guard 'every vendored icon is used' goes green with Parts C and D (bell, chevron-right, rail icons, ...)
Vendored 29 SVG files (27 from the reference sprite renamed to Lucide names, redo mirrored from undo, panel-right, pencil drawn in the
same style; mark.svg is the hexagon). favicon.svg + favicon-32.png from the mark. Call sites renamed (close->x, zoom-in->plus,
zoom-out->minus, fit->scan, families->layers, explore->compass, chapters->book-open, inspector->panel-right); icon sizes 16|20 only.

## Part C red lines (before shell.tsx / mode-rail.tsx / frame-title.ts touched)
`npx vitest run src/app/window/frame-title.test.ts src/ui/shell` -> `Tests 9 failed | 40 passed`, `Cannot find module './frame-title'`
(shell-frame.test.tsx: no groups, no icons, no Collapse/Expand, no breadcrumb, no command box, no skip link).
Decision: the stored panels field stays `railHidden` (no schema/uiState change); in 8.4d it means "rail collapsed to icons". The
8.4a "hide fully + ☰ menu" behaviour is replaced by Collapse/Expand (changed tests: shell-frame.test.tsx "view list" block).

## Part C progress (shell, bell, palette)
RED lines: shell-frame.test.tsx 9 failed (above); notice-bell-button.test.tsx `Failed to resolve import "./notice-bell-button"`;
palette-commands-go.test.ts, palette-model.test.ts (suggested), palette-suggest.test.tsx written before palette-commands/model/palette changed.
Contract amendment (PaletteCommand, src/features/search/contracts.ts): optional `suggest?: boolean` (additive; no schema impact).
Changed tests and why: top-bar.test.tsx (bell stubbed: it reads the whole app status); palette-window.test.tsx + window.test.tsx (the
top-bar Search icon is now the box "Search or jump to…"); study-dataset / edition-window / map-multiselect tests (prefetch the lazy
bell chunk in their module registry, like the band); navigator-interaction.test.tsx (the rail has Collapse/Expand now: the check is
scoped to <main>); phone-window.test.tsx (phone bar shows the page name, spec C1); palette-commands-{lists,named,reagents}.test.ts
(titles "Open X" -> "Go to X"); shell-frame.test.tsx (8.4a Hide/☰ block replaced by Collapse/Expand).

## Part D red lines (before count.tsx / list-row.tsx / Button size)
`npx vitest run src/ui/primitives/count.test.tsx list-row.test.tsx button.test.tsx` -> `Failed to resolve import "./count"`,
`"./list-row"`, and button.test.tsx "small is a size" `expected null to be 'sm'` (1 failed | 8 passed). GREEN after the three files.
Toast: plain result 5 s (was 6), with an action 10 s (data-exchange was 20 s): editor-host.test.tsx + toast-auto-close.test.tsx updated.
Toast is now the dark pill (kind icon for warning/error, hidden kind word); Banner has its kind icon + hidden word.
css-scale guard (8.4a) now also accepts the reference names (--t-N, --s-N, --r-control/card/panel/pill) + 4 reasoned exceptions.

## Part E red lines
E1: review-mark-of.test.ts `knownReviewStatus is not a function`; review-mark.test.tsx `expected <span role="img"> to be null`.
E2: reactions-view.test.tsx compact row `expected [] to have a length of 1 but got +0` (3 failed | 36 passed).
E1 green: `knownReviewStatus`, `ReviewMark status={undefined}` -> null, study inspector passes the real status only.
E2 green: compact rows draw `ReviewMark` from the record's own review status.
E3: red `state machine failed at seed 1, step 20 (open a family page)`; green after use-bridge.ts: opening a family page selects the family, closing
it (Back) pops that entry while the family is still the selection. Test: two new gestures in map-selection-machine.test.tsx (500 seeds pure + rendered).
E4 red: reaction-card-host-chip.test.tsx (`Unable to find an element with the text: Extra`), filter.test.ts (`1 failed | 28 passed`, run red
after writing, then green), arrow-reactions-chip.test.tsx (same). Green: ReactionCardHost uses useScope; rows carry `scopeKind` (core, additive
optional); compact rows and the arrow view rows draw the Chip; `scopeChipOf` moved to ui/study-page (navigator/scope-chip.ts re-exports it).
Chain cards (From A to B) are family steps, not reactions: no chip there (REVIEW REQUIRED).
E5 red: family-summary.test.ts `Cannot find module './family-summary'`; green with family-summary.ts + family-header.tsx (one line). Changed test:
navigator-family.test.tsx line 47 (the old long sentence "… in all: … of Alcohols and … that make it" is the one line now).
E6 (partial, said so): the inspector's connected groups are `ListRows`/`ListRow` (study-inspector.test.tsx "connected cards fill the pane" replaced by a
list-row test; dead card CSS removed); `ListEntry` composes the one Card. Other card-like classes in Studio screens keep their own recipe: the
screen-by-screen pass in 8.4f takes them (REVIEW REQUIRED: E6 is not "all").
E7 red: phone-window.test.tsx `expected undefined to be 'true'` (chevron); green: the folded line is 40 px high, "n notices" + a turning chevron.

## Sizes (initial JS gzip)
Baseline (8.4c close): Study 382,792 / Studio 386,595 bytes. Limit for this step (+0.5 kB): 383,292 / 387,095.
First build after Parts A-E: Study 384.29 kB, Studio 388.33 kB (about +1.5 / +1.7 kB): OVER. Action: `palette-commands.ts` (7.2 kB rendered, used only
once the palette is opened) became a lazy chunk (`lazy-commands.ts`; the window loads it with the palette at idle and `openSearch` waits for it). Result below.

## Text colours
Every piece of text that carries meaning uses `--text-2` or `--text` (status bar, rail group labels, the search box text and its Ctrl K hint);
`--text-3` stays on icons (chevrons), the family dot's neutral, field hover borders and placeholders (the reference's choice; REVIEW REQUIRED).
After the lazy palette-commands chunk: Study 383.02 kB, Studio 386.90 kB (exact bytes in PROGRESS): within this step's limit (383,262 / 387,082).

## E2E (Chromium) findings
Run 1 (24 specs): 106 passed, 7 failed. Fixed: notice band 56 -> 48 px (map height back to >= 640 / 840); the focus ring is a shadow now (shell.spec asserts
the 2 px gap + 2 px ring, no outline); study-edition title spec ("<view> · ORN"); compare spec selectors; skip-link spec (fresh page).
The reference's ring `rgba(59,91,219,.55)` is about 2.5:1 on the canvas (needs 3:1): the app uses the SAME ring with the solid accent (`--focus-ring`).
Run 2 (the failed specs again): ONE layout failure left and NOT fixed: map-room.spec.ts:52 (1280 x 800 Studio demo, Fit, pane shut): box title 9.86 px,
the 8.4c reviewer decision asks >= 10. Cause measured: the map is 1280 - 188 = 1092 px wide (rail 188 px per the reference; the old rail was about 148 px),
Fit is width-limited (9.855820314798734 px with the band at 56 px and again at 48 px: the same number, so height is not the limit). The bound is not lowered.
frame.spec.ts "map width with the rail" 1100 -> 1090 (a direct consequence of the 188 px rail, stated in the spec).

## Comparison screenshots (screenshots/compare-8.4d/<name>.png: app left, reference right; opened and looked at)
- top-bar: mark, breadcrumb, search box with Ctrl K, bell with count match. Differs: the exam control is still the native "Exam [All exams]" select, not the JEE Main chip; Studio chip is outlined; no record in the crumb because nothing was selected.
- rail-open: groups, icons, 188 px, selected tint match. Differs: the active label is not medium weight, group labels are darker/bolder than the reference; no Starred, Settings (8.4f/g) and no counts (the app shows no Review count today).
- rail-collapsed: 56 px icons, a hairline between groups and the Expand chevron; the reference has no collapsed picture.
- status-bar: hairline-separated parts, 24 px, tabular figures; matches (reference shows different items).
- palette: still the Search dialog (title row, hint line, "Go to" list); NOT the reference's menu pattern (no icons, no key hints, taller rows). Open difference.
- toast: dark pill with text, Undo import, X; matches. Differs: no icon on the action, text is longer ("from demo.orn.json.").
- notice-band: soft warm tint, warning icon, text, buttons; matches. Differs: two buttons side by side and no "+n more" because there is one notice; text is not cut.
- reactions-cards / reactions-compact: the cards and rows are still the old look (boxed name buttons, outlined review pill, filter buttons); the review dot shows on compact rows. Open difference (screen pass is 8.4f).
- buttons-chips: filter buttons keep their shadow/border; the segmented control matches the reference; the reference row is a spec table, not a screen.
- family-header: one summary line "12 reactions · makes 6 families · made from 5" matches; the header is still the old green block with outlined partner chips, not the reference panel (8.4e).
- phone-top-bar: mark, page name, Studio chip, search icon; More is a bordered button (reference has the exam chip and no More). Phone notices row: height 40 px.

## Resume 2026-11-09 (close)
Rail: 168 px below 1440 px, 188 px from 1440 (tokens.css media rule). frame.spec rail test red (received 188 at 1280), then green; map-room.spec.ts:52 title 10.04 px. Frame mutation pass: 13 breaks, each red in frame.spec alone. Sizes Study 383,020 / Studio 386,902. Moved to 8.4f: see PROGRESS "8.4f inputs".
