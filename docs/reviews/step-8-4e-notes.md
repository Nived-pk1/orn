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

## Session 3 (2026-11-10): Part A (phone half) first, because Part A was NOT done in session 2
Session 2 stopped after the split and Part 0; Part A (A1..A6), the A4 red test and the pane inventory were still open. C4 and the
phone parts of B need A3's free-area rule, so this session did the PHONE half of Part A first. Speed check: 238 ms (start), 243, 231,
etc. (before each Playwright run, all about 230-245 ms).

### Done
- A3 plumbing: `Insets` (render/viewport/contracts.ts); `fitBox` / `fitScene` / `fitRect` take insets (left/right too); controller
  `setInsets`; ViewportScene prop `fitInsets` (a change re-fits only while the view is still the automatic one: sticky Fit).
  Defaults unchanged when no insets are given (desktop passes none yet, FIT_TOP_PADDING stays for it and for focus-fit.ts).
- `free-areas.tsx` (lazy) measures `[data-map-control]` rectangles; `free-areas-rule.ts` (pure) turns them into insets.
- Phone: the bar floats on the canvas (`data-phone-map-bar`, `data-map-control="bar"`), the lineRow is GONE (it was the blank band), the
  hint is a pill at the foot (`.hintPill`, keeps its place when empty), the round-button stack moved to the top-right
  (`data-map-control="stack"`). Map area on the Pixel 7 now starts at y=86 and is 653 px high (was y=199, 540 px).
- A6: `.drawing svg:focus` draws the token ring inside the map, no UA outline.
- Specs: tests/e2e/map-free-areas.spec.ts (A4, A3, A6, Pixel 7). Red line: written first but only RUN after the source (slip);
  closed by breaking the insets pass-through and the focus rule: 3 failed (A4 151.88 < 156, A3 overlap, A6 UA outline), then restored, 3 pass.
  Unit tests fit-insets.test.ts: seen red (3 of 4 failed) before the source. free-areas-rule.test.ts: written with the rule (slip, disclosed).
- phone.spec layout guard failed once on `select[Chapter] 18 x 44` (the floating bar gave the select no width): fixed in CSS, no spec change.

### Findings
- PRE-EXISTING at HEAD 572fb25 (proved in a clean worktree): map-fit.spec 1280 x 800 "inspector open: the whole map stays fitted"
  fails (one family not wholly on screen). Not caused by this step. REVIEW REQUIRED.
- A3 conflict (CLAUDE.md §10): on a phone the map is wider than the screen (it pans), so the right-hand stack at Fit can reach into a
  box that runs past the edge (Alkynes, Ethers on the Pixel 7). No inset can avoid that without leaving the stack's column empty.
  Implemented: bars and the pill meet no box; the stack meets no TEXT of a box (title, formula, count). Proposed amendment: A3 holds for
  the stack as "no box text under it". C4 (height-fit zoom) will change which boxes spill.

## (superseded by 'Session 3 later' below)
- Part A desktop: A1 floating bars (toolbar row, MapCorner, key strip, zoom stack), A5 look of boxes/arrows/canvas, A2 pieces left:
  Full map button (Part D), hint pill must also hide while a sheet is open, toast must not cover a stack button, desktop focus ring check.
- Part B (pane header/sticky, review mark, list rows, motion), Part C (C1..C4). The pane inventory (Part 0 item 5) is still open.
- Sizes and the full list of specs for Part G: see the running list below.

## Running spec list (Chromium) for Part G
map-free-areas, phone, phone-sheet, map-fit (1280x800 fails at HEAD too), canvas-touch, touch-walk, map-chains.


## Session 3 later (2026-11-10): Part A desktop finished (session 2's leftover); STOPPED here by the user
The user said: finish session 2 (Part A) and stop; do NOT start session 3 (Parts B, C). Nothing of Part B or C was built.

### Done after the phone half
- A1 desktop: the toolbar row is GONE. `map-toolbar.tsx` is now ONE transparent layer (role=toolbar "Canvas tools", `map-float.module.css`) over
  the drawing with four floating things, all `data-map-control`: top-left bar (chapter select, Find a family ICON that opens its box in the bar,
  From A to B, More, Studio `extra`), top-right Selected bar (Selected: X, Open family / Open reactions, Zoom to selection, Clear) or, with nothing
  selected, the hint as plain words, bottom-right zoom stack (Zoom in, Zoom out, separator, Fit), bottom-left key strip (arrow key + Key button).
  The Key popover opens upward. `map-corner.tsx`, `key-placement.ts` (+ test) deleted (no longer used). `MapHint`/`ArrowKey` restyled.
  NOT in the bar yet: Full map button (Part D, session 4).
- A3 desktop: `free-areas.tsx` (lazy) + `free-areas-rule.ts`. With the size of what Fit shows, each corner control reserves the edge that
  costs the fit least (a width-limited map gives the zoom stack the bottom). Zoom to selection uses the same insets (focus-fit.ts, zoom-selection-run).
  FIT_TOP_PADDING / FIT_BOTTOM_PADDING stay as defaults for callers that pass no insets (nothing else needed removing).
- The desktop toast no longer raises the bottom controls (a moving control also moved the free area: titles fell under 10 px).
- A5 (CSS only): dot grid, faded 0.42, 180 ms fades, shadow on the selection ring (NOT on hover: it broke the phone arrow tap). NOT done: the 1 px
  hover lift (box and text are two layers), arrow caps/notched head and count-chip shapes were NOT re-checked against the reference.
- A2 leftover: hint pill also hidden while the A-to-B sheet is open.
- Size: Study 383,144 (limit 383,270), Studio 386,987 (limit 387,150); baseline 383,020 / 386,902.

### Specs written / changed
New: tests/e2e/map-free-areas.spec.ts (phone A3/A4/A6; desktop A1, A3 at 1280x800, 1366x768, 1920x1000, demo title px >= 10 at 1280x800,
1389x868, 1920x1000). Desktop specs were seen RED before the source (5 failed). Unit: fit-insets.test.ts (red first), free-areas-rule.test.ts
(first cases written with the rule; the content-aware cases red first), map-toolbar.test.tsx rewritten, scene-svg-motion.test.ts (red first).
Changed for the new LOOK (old look tested): map-toolbar.test.tsx (row order -> floating groups); navigator-interaction.test.tsx (Open family
has no disabled state with nothing selected; reasonOf helper removed); toolbar-rule.ts constant 1040 -> 620 (only `chain` still moves);
map-room.spec (toolbar row -> floating bar, column top); frame.spec and map-chains.spec (click the Find icon first; the box closes after a
choice); map-shift.spec (the label's position is read from the floating layer); navigator.spec (no Open family button until selected);
scene-svg-motion.test (0.35 -> 0.42). Real defects fixed on the way: phone chapter select squeezed to 18 px, then to 66 px (label hidden in the
phone bar); Key button failed axe target-size under the open canvas menu (the layer is `inert` while the menu is open).
Rule breaks (disclosed): phone specs were first RUN after the source (closed by break-and-restore: 3 red); free-areas-rule first cases.

### Failures that are PRE-EXISTING at HEAD 572fb25 (proved in a clean worktree, not caused by this step; REVIEW REQUIRED)
- map-fit.spec 1280x800 "inspector open: the whole map stays fitted" (one family not wholly on screen).
- map-marks.spec "a two-way pair is two lines..." (getByRole button 'Family 13 to Family 08, 1 reaction' never found; 60 s timeout).
- navigator.spec "the overview does not expand: no Expand or Collapse" (the 8.4d rail has a 'Collapse' button).

### A3 conflict (CLAUDE.md section 10)
On a phone the map is wider than the screen, so the top-right stack can reach into a box that runs past the edge. Implemented: bars and the pill meet
no box; the stack meets no box TEXT. Proposed amendment: A3 for the phone stack = "no box text under it". C4 will change which boxes spill.

## WHERE TO RESUME (tomorrow)
1. Read this file. HEAD = the commit after 572fb25 named at the end of this file.
2. Session 2 is DONE except these small Part A leftovers: look-check A5 (arrow caps/notched head, chip shapes) against the reference; hover lift.
3. Then session 3 as in the resume prompt: Part B (pane header sticky, review mark right, list rows, motion; pane inventory item 5 first), Part C (C1..C4;
   C4 uses `fitInsets`/`insets` already built: on the phone Fit should become height-fit between FIT_FLOOR and 13 px titles).
4. The 3 pre-existing failures above need a decision from the reviewer (fix in 8.4f or here).
5. Final Chromium spec list NOT run for this commit after the last edits (user stopped early): run map-free-areas, phone, phone-sheet, map-fit,
   map-chains, map-room, map-selection, map-shift, navigator, keyboard-walk, frame, canvas-touch, touch-walk, study-edition, axe-screens.
   Last full run of the first 13 desktop specs: 10 failed -> 3 left (the pre-existing ones) after the updates above.
- Radius: the reference says 10 px for floating bars; no 10 px token exists, so bars use --radius-8 (REVIEW REQUIRED: add a token or accept 8).
Commit: f44aa52


## Session 3 proper (2026-11-11): Part B and Part C done; Part A leftovers closed
Resumed on the user's word. HEAD at start a051fe9. Speed checks 229-243 ms before every run. Re-ran the Part A spec list first: 70 passed, 4 failed
(2 pre-existing, keyboard-walk axe and map-selection phone: both resolved below, they were caused by new work, see Findings).

### Part B (side panel), done
- B1 header (study-inspector.tsx, map-views.tsx, CSS): `.head` sticky inside the pane (bleeds to the pane's padding; static in the phone peek), chip row
  with the review mark on the RIGHT (`data-head-aside`; Study the dot, Studio its pill), title 20/600, ONE summary line (`data-pane-summary`, hidden in the
  peek). Summary: reaction = "reactants -> main products" (model/study-summary.ts), compound = formula, anything else = first sentence of the lead; arrow =
  its kind ("Between two families" / "Leads to compounds in no family yet"; NOT a count: 8.3 A5 says the count is only in the list heading); bucket = "n compounds".
  The old review SENTENCE stays under the title for review_required in Study.
  Close: the shell's inspector header now always has "Close inspector" (wide: pane.onOpen(false)); no contract change.
  Where each action went: unchanged. GoNext already shows at most 3 and the rest in "..." (8.4a). Studio's own author buttons (Edit, Delete..., Duplicate, New
  specific reaction) are STILL a separate row on the header line (data-sheet-full): REVIEW REQUIRED, moving them into "..." would hide Studio's main controls.
  Body: section labels 12/600 (groupHeading, arrowTitle), gap 14 px (new token --space-14), the reaction hero on --paper.
  Go-next lists / arrow ends / bucket rows / the arrow's reactions are LIST ROWS (ListRow got `ariaLabel`, `sub: ReactNode`); no pill buttons left in the panes.
- B2 the arrow pane: "Reactions on this arrow (n)" = list rows (name, reagent words, scope chip); "Open these n reactions in Reactions" = a normal Button.
- B3 motion: pane 260 ms slide + fade (shell.module.css `paneIn`, transform + opacity, reduced-motion guarded); content cross-fade 180 ms on a changed
  selection (`.root` keyed by the entry). e2e axe read a half-faded frame once: tests/e2e/kit.ts axeProblems now waits for running animations to finish.
- B4 tests/e2e/pane-list.spec.ts: the A-to-B pane's last card is inside the pane and clear of the toast at 1280x800 (green at once; behaviour was right).
- B5 phone sheets use the same parts; peek rules not loosened (phone-sheet spec green).

### Part C, done
- C1 NOT DONE, REVIEW REQUIRED (see the C1 note below).
  380 bytes of initial JS (the row had 34 / 19 left); it is saved in docs/reviews/step-8-4e-c1-pair-hit.ts.txt with how to reinstate it. What is in: paired
  lines carry `data-paired` and the stylesheet narrows each paired line's hit band to the stroke + the smaller of the usual band and the pair gap, so the two bands
  meet in the middle (CSS rule test + data-paired test). Near the box ports the two lines nearly coincide and the bands still overlap there; an e2e could not be
  made to discriminate in the fixture, so there is none for C1.
- C2 phone marks (touch only, scene-svg.module.css, `--map-title-u` published by the lazy FreeAreas): a line <= 0.25 x the box title height (>= 1.5 px), a chip <= 2 x
  the title (>= 18 px). tests/e2e/map-phone-marks.spec.ts red (stroke 3 px at a 6.1 px title) then green; desktop map-marks unchanged.
- C3 the sheet's peek equation carries reagent names only (`conditions={false}` on EquationScheme from HeroEquation compact). The primitives already had chip 28 px
  (chip.module.css:41) and phone card padding 12 (card.module.css:59), so nothing to restore; phone-sheet / phone-equation specs pass.
- C4 phone first view and Fit: `phone-fit.ts` (pure, 8 unit tests incl. each clamp) answers the world window; the lazy FreeAreas gives it to the canvas as `fitBox`,
  and ViewportScene re-fits when its SIZE changes while the view is automatic (`fitBoxRefits`). Before (title px, columns x rows on screen, boxes' share of the map
  height): Pixel 7 6.1 px, 3 x 4, 38%; iPhone 14 6.1 px, 3 x 4, 52%. After: Pixel 7 12.8 px, 2 x 4, 80%; iPhone 14 8.1 px, 3 x 4, 70% (its map area is only about 365 px
  high, so the largest zoom that fits the height is smaller). tests/e2e/map-phone-fit.spec.ts (portrait only; landscape is Part E). Part 0 had measured 8 px titles
  and 46% / 69% before: the title was 6.1 px once Part A's insets applied, the usage figures are as measured in the new spec.

### Findings and fixes on the way
- Hover shadow dropped: a drop-shadow filter on `.mapNode:hover` made a tap beside an arrow select the box on the phone (map-selection phone spec). The selection ring keeps its shadow.
- map-selection.spec bucket-view test: the chip is a list row now, its visible text carries the count apart: the spec reads the family from the accessible name.
- Also failing at HEAD 572fb25 (clean worktree): phone-inspector.spec x4 ("horizontal cards", stale since 8.4d), map-fit 1280x800, map-marks pair click, navigator "Collapse".

### Sizes (node scripts/initial-js-size.mjs, fresh builds): Study 383,260 (limit 383,270), Studio 387,138 (limit 387,150). Made room by moving work into the lazy FreeAreas
(titles, phone window, content size) and trimming duplicate code in viewport-scene.

### WHERE TO RESUME (supersedes the earlier one)
Sessions 2 and 3 are DONE. Next: session 4 (Part D full map, Part E phone landscape). Keep the size headroom in mind (10 / 12 bytes): make new code lazy from the start.
Reviewer decisions waiting: C1 (spend ~400 bytes for exact nearest-line?), Studio author buttons in the header, bar radius 8 vs 10, the A3 phone-stack reading,
the pre-existing failures above.
- The css-scale guard (tests/integration/css-scale.test.ts) now allows --space-14 (the reference's 14 px between panel sections): one token added to the scale. REVIEW REQUIRED if the scale should stay 4/8/12/16.
Commit (Part B, C): ae66720

### Corrections after the broad Chromium run (2026-11-11, later)
- C1 is NOT DONE. The CSS band narrowing I first committed made a paired line's hit area 10.5 px, under the standing 16 px (mouse) and 28 px (finger) floors
  (map-marks, map-proportions, canvas-touch failed), so it is REVERTED (no `data-paired`, no CSS rule). The exact nearest-line code is in
  docs/reviews/step-8-4e-c1-pair-hit.ts.txt (380 bytes gzip over a budget with about 20 bytes left). Reviewer: spend the bytes, or move C1 to 8.4f / drop it.
- The Key button failed axe target-size where it lay under the import toast (the wide key strip with a selection). The desktop toast raises the zoom stack and key
  strip again (8.4b rule) and FreeAreas adds the lift back when it measures, so Fit does not shrink for a toast.
- map-selection.spec (phone, S-bug 3): closes the sheet before picking the bucket (the fuller first view can put the bucket under the peek). Reason recorded in the spec.
- Sizes after the corrections: Study 383,250 / Studio 387,128.
- Failing at HEAD 572fb25 as well (clean worktree, not caused by this step): phone-inspector x4, map-fit 1280x800, map-marks pair click, navigator "Collapse".
Commit (corrections): 221087d
