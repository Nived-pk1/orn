# Step 8.4e notes (map + side panel to the reference, full map, phone landscape)

Resume rule: read this file first; it says where to resume.

## START (2026-11-10)
- HEAD at start: 3395286 (clean, stash empty).
- Speed check (5e7 loop): 235 ms (start).
- Size limits (initial JS gzip bytes, `node scripts/initial-js-size.mjs`): Study <= 383,270; Studio <= 387,150.
- Size baseline measured now from the existing dist / dist-studio: Study 383,020; Studio 386,902.
  (dist built at 8.4d close; rebuild before Part G to be sure.)

## Done
- H1 prettier frame.spec.ts (7e7c510-ish: `7e6a058`). H2 script `scripts/initial-js-size.mjs` + test (6b3f507; the
  script was written together with its test, not red first: it is a new tool with no prior behaviour). H3 PROGRESS 1100 (6b3f507).

## Where to resume
Part 0 (fact sheet).

## Part 0 fact sheet (PARTIAL: items 2, 4, 6, 7(part) answered; 1, 3, 5, 8 NOT done)
Measured with a throwaway probe (kept as docs/reviews/step-8-4e-part0-probe.spec.ts.txt; raw numbers in
step-8-4e-part0-probe.jsonl; pictures in screenshots/part0-8.4e/). Fixture: tests/fixtures/map-layout (20 families),
Studio build, Chromium. Speed check: 235 ms at start (not repeated before the probe run).

2. THE BLANK BAND. Phone portrait (Pixel 7 412x839, iPhone 14 390x664): `styles.lineRow` in navigator-canvas.tsx
   (~line 319) holds `<p class=quiet aria-hidden>`; it keeps its height when empty. Measured: quiet line y=147, h=47
   (hint shown); with a family selected the p is aria-hidden and the row keeps the space; transparent background.
   On top of it Fit keeps FIT_TOP_PADDING = 44 (world translate y=44), so the strip in the screenshot is lineRow (47)
   plus that 44. Stack above the map: header 45, notices row 41, phone bar 61, lineRow 47, map area at y=199
   (Pixel 540 of 839 = 64%; iPhone 365 of 664 = 55%).
   Desktop: no band; `.corner` (pointer-events none, white 85%) sits inside the map area, h 28 (hint) / 32 (selected).
   Dark border in inspector-arrow-1280x800.png: the UA focus ring on `svg[role=group]` after a click focuses the canvas:
   computed `outline: rgb(16,16,16) auto 5px`. The canvas has no token focus rule.
4. PHONE ZOOM TODAY. Both phones, portrait: scale 0.3775 = FIT_FLOOR; box title about 8 CSS px; 12 of 20 boxes on
   screen (about 5 columns, 4 rows); boxes use 251 px of the map area: 46% (Pixel) / 69% (iPhone). Landscape with the
   sheet open: map area 113 px (Pixel) / 91 px (iPhone) high, one row visible. The reviewer's numbers are confirmed.
6. `public/_headers`: `Permissions-Policy: camera=(), microphone=(), geolocation=()`: no fullscreen directive, so
   fullscreen is allowed. Not changed.
7. (part) Portrait: top bar 45, notices row 41, tab bar 56. Desktop 1280x800: header 44, toolbar 41, footer 24,
   map area 1112x643 shut, 712x643 with the inspector (titles 12 px shut, 8 px open).
   NOT measured: breakpoints, media queries and hooks that decide the phone layout.
Other: navigator-canvas.tsx is 395 lines (limit 400): Part A must split it first.

## Where to resume
Finish Part 0 items 1, 3, 5, 7 (breakpoints), 8 (no e2e project sets reduced motion; shell.spec and phone-inspector
use emulateMedia), then Part A. No file under src/ was changed so far.

## Session 2 (2026-11-10)
- START: HEAD a4e2b7e, clean, stash empty. Speed check 232 ms (start), 232 ms (before check).
- Canvas split (pure move): navigator-canvas.tsx 395 -> 360 lines. New files: map-lines.ts (QUIET_LINE, busyLine,
  openFamilyReason; index.ts re-exports openFamilyReason from there), use-map-chips.ts (lazy pair-facts + chips),
  use-map-commands.ts (palette view commands). No test changed. Prettier NOT run on navigator-canvas.tsx: the file is
  not prettier-formatted and `--write` rewrapped it to 734 lines (reverted). New files are prettier-clean.
- Fix found on the way: tests/integration/initial-js-size.test.ts (session 1) had its @ts-expect-error on the wrong line,
  so `npm run typecheck` failed (TS2578 + TS7016). Directive moved above the import. Own fix, no behaviour change.

### Part 0 item 1: the map's controls today (read from source; sizes NOT re-measured this session)
Desktop (map-toolbar.tsx, a ROW above the map, role=toolbar "Canvas tools", data-map-toolbar):
 Zoom out, Zoom in, Fit (IconButtons, styles.zoomButton), chapter select, Find a family (lazy FindFamily box),
 From A to B (Button, aria-pressed), Open family / Open reactions (one Button; both can move to More when the row is
 narrow, `movedToMore`), spacer, Key (Button + popover in keyWrap), More menu (List/Show the map, From A to B,
 Open*, Unanchored reactions (n) in Studio), then `extra` (Studio multi-select actions). Toolbar row 41 px (opaque).
 Inside the map (map-corner.tsx, lazy; `.corner` pointer-events none, white 85%): MapHint (hint, busy sentence, or
 "Selected: X" with Clear and Zoom to selection) top-left, h 28/32; ArrowKey (the key strip) bottom-left, or
 bottom-right when keyPlacement says the left would cover a box. NavigatorSelection (Studio multi line) under toolbar.
 Banners (truncation, emptiness) and UnanchoredPanel sit above the map row.
Phone (phone-bar.tsx, phone-map-controls.tsx): bar 61 px with chapter select, Find (icon), From A to B; lineRow 47 px
 (hint / busy sentence, keeps height when empty); floating round buttons in the drawing: Fit, Legend (Key), Select
 toggle (Studio) + select bar. FIT_TOP_PADDING = 44 (render/viewport/contracts.ts:26) is used by focus-fit.ts:24 and
 transform.ts; FIT_FLOOR (transform.ts:48) is the phone minimum zoom.
Toast: bottom, toast.module.css (the third round button sits under it on the Pixel 7).

### Part 0 item 3: INTERACTION TABLE (after-Part-A column is the plan; full-map column is the plan for Part D)
| Control / gesture | Today | After Part A | Full map |
| Zoom in / out / Fit, wheel, pan, pinch | toolbar / canvas | zoom stack bottom-right / canvas | STAYS |
| Chapter select | toolbar / phone bar | floating bar / phone chip | STAYS |
| Find a family | toolbar / phone bar icon | floating bar icon | STAYS |
| From A to B (+ chain cards, step rows) | toolbar / phone bar | floating bar; panel as today | STAYS (panel over map) |
| Key | toolbar button | key strip button (bottom-left) / phone stack | STAYS |
| Selected label: Clear, Zoom to selection (Z) | MapCorner top-left | Selected bar top-right | STAYS |
| Open family | toolbar | Selected bar (family selected) | LEAVES |
| Open reactions (arrow) | toolbar | Selected bar (arrow selected) | LEAVES |
| List / Show the map | toolbar More | floating More | LEAVES? (list is a map mode: STAYS only if it fits) |
| Unanchored reactions (Studio) | More | floating More | LEAVES (opens panel; Studio editors) |
| Studio multi-select, arrange, More items | toolbar `extra` | floating bar More | items needing the frame: tooltip |
| Phone Select toggle + select bar | round button | phone stack | STAYS |
| Phone Legend / ⓘ | round button | phone stack Key | STAYS |
| Canvas menu: Fit, Zoom in, Zoom out | right-click/long press | same | STAYS |
| Canvas menu: Show in inspector, arrow rows | same | same | STAYS (pane over map) |
| Canvas menu: Open family page, Open at this group | same | same | LEAVES |
| Double-click a box | opens family page | same | LEAVES |
| Click box / arrow / chip, empty = clear | canvas | same | STAYS |
| Keyboard: arrows, Enter, Esc, Z, +/-, Tab | canvas | same (+ F full map) | STAYS (Esc leaves full map only when nothing else uses it) |
| Panes (inspector, arrow, bucket, Unclassified, A-to-B) buttons | pane | pane (B) | go-next rows STAY; "Open ..." LEAVES |
| Undo / redo | top bar | top bar | hidden with the frame (key shortcuts stay) |
Gaps still to confirm in the code before Part D: the exact More items of Studio's `multi.actions` and each pane's
buttons (list them when Part B starts).

### Part 0 item 5: panes
Pane width: shell `--inspector-width` (shell.tsx:148), 400 px on desktop (map 1112 -> 712 at 1280). Phone: sheet, width
min(--inspector-width, 100vw) (shell.module.css:247). Body components: features/inspector/study-inspector.tsx (88),
study-hero.tsx, study-parts.tsx, map-pane.tsx; Studio: inspector.tsx + model/. Header parts, action counts and go-next
list form per kind: NOT inventoried this session (Part B is session 3; do it first there).

### Part 0 item 7: breakpoints / hooks
Layout is ONE value, `useLayoutMode` (ui/hooks/use-layout-mode.ts): phone = (max-width: 699px) OR
(pointer: coarse) and (max-height: 499px). CSS: shell.module.css @media max-width 1279 / 899 / min-width 900;
mode-rail 899; toast 899; family-page.module.css `(max-width:699px), (pointer:coarse) and (max-height:499px)`;
navigator.module.css 899; tokens.css `(pointer: coarse)` and min-width 1440. NOTE the two vocabularies: CSS 899
(tablet) vs the hook 699. Phone landscape heights (Pixel 915x412 / iPhone 844x390) NOT measured yet (Part E probe).
Heights: --top-bar-height, --status-bar-height tokens; phone sets status bar 0 (shell.module.css:349), tab bar 56.

### Part 0 item 8: reduced motion
No Playwright project sets reducedMotion. Specs that use it: tests/e2e/shell.spec.ts:145 (new context
reducedMotion: 'reduce') and tests/e2e/phone-inspector.spec.ts:83 (page.emulateMedia). Every new transition must leave
nothing hidden/moving that a test waits on.

## Where to resume (end of session 2 as written)
See the last line of this file.

Last line: Session 2 stopped after the canvas split + Part 0 items 1,3,5(width),7,8. check green (766 files, 8449 tests, 11m52s). NEXT: session 2 continues with Part A (A4 red test first), pane inventory is session 3.
