# Step 8.4a notes (visual system) — resume file

Start: HEAD a190786, tree clean. Speed check (`node -e 1` timed): 0 ms at start (2026-11-07).

## Part 0 fact sheet

1. Tokens: `src/ui/design/tokens.css` (colours, `--font-*`, `--text-12/13/14/16/20/24`, `--space-1..6` = 4/8/12/16/24 px,
   `--radius-1/card/control` = 2/8/6, `--hit-min`, `--top-bar-height` 48, `--status-bar-height` 32, `--mode-rail-width` 168).
   Global rules `src/ui/design/base.css` (body 14 px, line-height 1.45, inputs min-height `--hit-min`, text inputs mono).
2. Distinct values in 59 CSS files (value:uses), excluding SVG drawing:
   - gap: space-2:163 space-3:69 space-1:57 2px:9 space-4:7 space-6:2 4px:2 0:3
   - padding: 0:138 space-2:113 space-3:89 space-1:52 space-4:35 2px:6 8px:4 space-6:4 calc(space-N - 1px):3
   - font-size: text-13:79 text-14:39 text-16:31 text-12:23 text-20:18 0.85rem:2 12px:2 10px:2 text-18:1 text-24:1 1rem:1 75%:1
   - margin: 0:229 space-2:28 space-1:17 space-3:12 space-4:5 -1px:4 0.4rem:2 -4px:1 auto:3
   - radius: control(6):83 card(8):36 0:5 50%:2 4px:2 999px:1 24px:1 radius-1(2):1 2px:1
3. Card-like: radius-card in 23 CSS files (window, chapters-view, import, study-inspector, mechanism-view, family-header,
   family-page, navigator, phone-home, unanchored-panel, precursors-view, reactions-view, reagents-view, syllabus-view,
   structure-panel, dialog, list-entry, menu, toast, virtual-table, phone-sheet, study-page).
4. Buttons: `src/ui/primitives/button.module.css` (primary/quiet/icon; disabled = dashed border). Dashed "Open family":
   family-page.module.css:159/170, chapters-view.module.css:92/154. Chips: study-inspector `.chip` (28 px, 13 px text), plus
   own badge/pill rules in 17 CSS files (see grep chip|badge|pill).
5. Notices: `src/ui/primitives/banner.tsx` (kind word + rule weight), `src/app/window/banners.ts` (pure function of AppStatus),
   shell.module.css `.banners` grid-area; phone: shell prop `phone.notices` folded line. Toast: `toast.tsx`, `.region`
   position fixed, right 16, bottom status bar + 16, width 420, z-toast: floats over map/right pane (decided by CSS only).
6. Review mark: `src/ui/study-chrome/review-mark.tsx` (dot in Study, pill in Studio; words "Review required"/"Not yet
   reviewed"); findings.ts words; Studio review-section.tsx words "Not reviewed/Needs review/Verified".

## Part A

RED (before tokens.css or any CSS touched): `npx vitest run tests/integration/css-scale.test.ts` ->
`Tests 1 failed | 2 passed (3)`, 1018 violation lines (e.g. `css:4 gap: var(--space-2)`: old token names, `--text-13`, 6 px radius).
New files: tests/integration/css-scale.test.ts, tests/integration/css-scale-exceptions.ts.
GREEN after codemod: tokens renamed (`--space-4/8/12/16/24/32/48`, `--text-12/14/16/20/24/32`, `--radius-4/8/pill`; old names
removed, no alias), 55 CSS files migrated by codemod (nearest value; ties to the larger text size: `--text-13` -> 14, 79 uses).
Weights: 8 declarations 700/bold -> 600. Line height 1.4 text, 1.25 headings (base.css).
Exception list length: 10 (css-scale-exceptions.ts). Values moved by more than 2 px: 1
 - src/features/navigator/phone-home.module.css:145 border-radius 24px -> pill (a 24 px high pill is the same shape).
Other tracked moves (<= 2 px): 6 px control radius -> 8; text 13 -> 14; 10 px text -> 12; 0.4rem margin -> 8.
tokens.test.ts updated (scale 12/14/16/20/24/32; radius 4/8/pill): it pinned the old scale, not loosened.

## Part B / D red lines (before the source files exist)
- card.test.tsx, chip.test.tsx: `Failed to resolve import "./card"` / `"./chip"` (files absent).
- button.test.tsx (3 new-kind tests): 2 failed: `expected null to be 'secondary'`; `expected '.button {...' not to match /dashed/`.
- review-mark-of.test.ts: `Cannot find module './review-mark-of'`.
- scene-svg.test.tsx:282 expected 'font-size: 12px'; now 'var(--text-12)' (same 12 px, written as the token).
- After Part A/B/D + composes migration: Study initial JS 380.11 kB gzip (target 380.0; Studio not yet measured).

## Part C red lines
- transform.test.ts "Fit leaves the key band free at the bottom": `actual value must be number or bigint, received "undefined"`
  (FIT_BOTTOM_PADDING absent). notice-order.test.ts: `Cannot find module './notice-order'`.
- notice-band-view.test.tsx: Failed to resolve import "./notice-band-view".
- panels.test.ts railHidden (3 tests): setRailHidden is not a function.
- panels.test.ts: 6 exact-match expectations gained 'railHidden: false' (new optional field; behaviour otherwise unchanged).
- shell-frame.test.tsx (4 tests): all 4 failed (no toast dock, no Hide button, no ☰ menu).
- status-short.test.ts: Cannot find module './status-short'.

## Changed tests (reasons)
- drafts-window.test.tsx: the "Start-up report" region is gone; the drafts line is an entry of the one "Notices" band.
- navigator-window.test.tsx: a layout note is now the status-bar item "Layout notes (1)" opening a dialog (Part C2.1), not a banner.
- phone-family-window.test.tsx: with no sheet open a phone toast floats above the tab bar (Part C), with its Dismiss; the folded
  case (sheet open) stays covered by toast-folded.test.tsx.
- transform.test.ts: the fitBox centring test uses FIT_BOTTOM_PADDING (Fit now leaves the key band free at the bottom).

## Built so far (resume list)
- Part A done (tokens, codemod, guard, exceptions). Part B: Card/Chip/Button primitives (+ tests); 14 CSS modules compose card/chip
  (list in git diff); chain cards and the family card use the inset ring; GoNext uses Button + a "⋯" Menu.
- Part C: notice-order, NoticeBandView/NoticeBand, LazyNoticeList (separate chunk), toast docked in the main column (ToastRegion,
  Shell `toasts`), phone toast folds only while a sheet is open (Shell `onSheetHeight`), Fit bottom band (FIT_BOTTOM_PADDING 44).
- Part C2: header 44, status bar 24/12 px, short status line (status-short.ts; short words drawn from `data-short`, full words stay as
  the only text for readers and tests), "Layout notes (1)" status item (a Dialog, not a lazy chunk: it is 12 lines), rail 14 px/32 px
  rows, max-content width, Hide + "☰ <view>" menu, `railHidden` in panels (optional field), map toolbar 40, inputs in the UI font,
  Exam select width max-content, GoNext 3 buttons + "⋯", connected cards grid (1 col < 520 px pane, 2 above).
- Part D: reviewMarkOf + REVIEW_FILTER_WORDS + STUDY_REVIEW_SENTENCE; Study inspector shows the dot + line for review_required only.
- Part E done (docs/RELEASE.md). Specs written AFTER their source (disclosed): tests/e2e/notices-band.spec.ts, tests/e2e/frame.spec.ts.
- Older e2e specs adapted: drafts, lifecycle, study-edition (noticeScope helper in own-data-kit.ts).
check2: 743 files, 8294 tests green at default workers (before the chain-card CSS edit and later)

## STOP (size)
Speed check 0 ms. Initial JS gzip after Parts A-E: Study 382.37 kB (target 380.0, over by 2.37), Studio 386.29 kB (target 383.7,
over by 2.59). Rule: missed by more than 0.5 kB -> STOP. Nothing committed, nothing deployed, no e2e run yet.
Likely growth (not yet measured per module): NoticeBand + status-short + status-parts details in the entry chunk, Card/Chip/Menu
imports in study-parts, ReviewMark/reviewMarkOf, composes CSS (CSS is not in the JS figure).

## Size: reviewer reply (measured)
Baseline a190786 (git worktree ../orn-wt-base; src/core/coverage copied in because it is gitignored): Study 379.76, Studio 383.39 kB.
Working tree before trims: Study 382.37 / Studio 386.29. Top growers, raw bytes in the entry chunk (gzip per module is not in the report; raw delta 15,086 B):
  status-short.ts 2718, notice-band.tsx 2078, notice-band-view.tsx 1788, lazy-notice-list 1518, shell.tsx +1210, card.tsx 1066, status-parts.tsx +806, toast.tsx +734, review-mark-of.ts 629, window.tsx +454
Trims (Study / Studio kB gzip): a. status + layout dialogs lazy: 382.42 / 386.32 (no gain: the dialog was small, the loader cost the same).
 Card/CardButton out of the barrel (unused by the app; it was pulled in by the barrel's CSS side effect): 382.27 / 386.22.
 b. Menu: NOT lazy-able: radix-menu is already in the initial chunk through the File menu, so the go-next and rail menus add nothing (measured, not changed).
 c. Full status line (Studio only) lazy chunk: 381.58 / 385.43. Notice band lazy chunk (loads after first paint): 381.02 / 384.75. Dialog loader and status CSS split out of the shared module: 380.98 / 384.67.
FINAL: Study 380.98, Studio 384.67 (inside the reviewer's accepted 381.0 / 384.7; the original 380.0 / 383.7 not reached). 8.4b BASELINE: Study 380.98, Studio 384.67.
Review-mark function (629 B raw) and Chip/Button stay in the initial chunk; Card is exported from ./card, not the barrel, until something uses it.

## Red-first for the two e2e specs written after the source (reviewer item 5), Chromium, each alone
- frame.spec.ts with `--status-bar-height: 32px`: `Error: status bar height  Expected: <= 24.5  Received: 32` (and the 1920x1000 map height 782.6 < 840).
- notices-band.spec.ts (Study desktop) with the compact banner allowed to wrap: `the band is one row  Expected: <= 56  Received: 100.39`.
- Both breaks restored (tokens.css, banner.module.css back to the committed-in-tree versions); disclosed rule break, check done.
