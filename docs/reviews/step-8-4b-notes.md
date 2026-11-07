# Step 8.4b notes (map readability)

## Start
- git clean; HEAD 1b0162c = "phase-8.4a ... closed not deployed". OK.
- Speed: `node -e "hrtime around execSync('node -e 1')"` = 54.5 ms (a real clock; hrtime.bigint).

## Part 0 fact sheet (from the code, before any change)
1. Zoom: `render/viewport/viewport-scene.tsx` controller `write` sets ONE `transform` attribute
   (`translate(x y) scale(k)`) on the world `<g data-world>`; everything inside scales with k.
2. Marks on an arrow, all in MAP units (so they shrink with k): stroke `WEIGHT_WIDTH` heavy 3 / normal 2 / light 1.25
   (`render/svg/geometry.ts`), dashes `'8 5'` / `'1.5 4.5'`, markers `markerUnits="userSpaceOnUse"` 10 (`defs.tsx`),
   hit path `EDGE_HIT_WIDTH` 12 (coarse pointer: 44 px non-scaling already), count chip and reagent chip: a pill
   `CHIP_HEIGHT` 20 with 12 px text in map units (`badges-layer.tsx`), "n within the family": caption text 11 px
   under the box (`labels-layer.tsx`), selected/hover edge stroke 4 map units (overlay).
3. Chip placement: `layout/grid/chips.ts` (worker, once per layout: nine slides on the line, avoid boxes and
   earlier chips; none free = kept at the middle and counted) gives `edge.labelAt`. `features/navigator/map-chips.ts`
   + `chip-words.ts` (main thread, per map view) choose words or number and drop a words chip that would overlap. No zoom input.
4. A two-way pair: ONE merged edge (`mapView.mergePairs`, forward by id order), ONE path with `markerStart`, one hit path;
   a click always selects the forward edge. The other direction's chip is an `extraChip` (aria-hidden, no click).
5. "Busy": `BUSY_CHAPTER_ARROWS = 15` in `map-view.ts`, only for a chapter with no focus. A selected family or the bucket never.
6. Draw order inside the world group: edges, nodes, labels, badges (chips), overlay. Faded: `.faded {opacity: .35}` on
   the node group and the label group (so lines show through).

## Red lines (before source)
- `chip-place.test.ts`, `busy-rule.test.ts`, `pair-direction.test.ts`: "Cannot find module" (3 files failed).
- `npx playwright test --project=chromium tests/e2e/map-marks.spec.ts` (speed 165 ms before): 5 failed, 0 passed:
  both Part A sizes (stroke/hit/chip problems list: "Expected 1 / Received 41" problems), Part B ("toHaveCount Expected 2 Received 0" chip buttons),
  Part C ("Expected 0 Received 20": edges still drawn for the bucket), Part D (26 lines through faded boxes / no "↻ n").
- `focus-fit.test.ts`: "Failed to resolve import ./focus-fit" (red).
- `status-words.test.tsx`: "Failed to resolve import ./status-words" (red).
- map-marks.spec (after Part A-D source): 4 of 5 green on the second run; the 5th (pair chip size) failed by 20 - 3e-5 px
  (float): the test now allows 19.99.

## STATUS AT STOP (2026-11-07) - NOT closed, NOT committed, NOT deployed
Stopped on the rule "layout or product failure: STOP". What is done and what is not:

Done (source + tests, uncommitted): Part A (screen-pixel marks: `--map-k` CSS variable, non-scaling strokes 2/3 px, hit 16/28 px,
10 px heads, chips counter-scaled 20 px / 12 px text, `chip-place.ts` placement in screen px, hidden chips named in the arrow),
Part B (pair: two hit halves, chip buttons, `pair-direction.ts`, half highlight), Part C (`busy-rule.ts`, outlined families, bucket
arrow list in the panel, hint "n arrows: listed in the panel"), Part D (faded boxes opaque, chips on top, "↻ n" inside the box),
E1 (one Open button), E2 (focus fit, 300 ms wait + 200 ms move, Fit button = whole map), E3 (phone Show all), G1 (toast dock stops at the
A-to-B panel; stacked toasts no longer clipped), G2 (phone toast one line), G3 (`status-words.tsx`), G4 (cards fill the pane).
`npm run check` last run: all green except 2 tests, both fixed afterwards and re-run alone (css-scale, study-inspector); not re-run whole.

Not done: E2 "saved viewport fitted flag"; Part F steps 2 to 6 (box-title table, ONE full Chromium run, screenshots, ADR-044 addendum,
PROGRESS / plan rows / PROJECT_STATE, sizes against 381.3 / 385.0, deploy, push). Parts E/G e2e were written after their source (disclosed;
only focus-fit and status-words had a red unit run).

Open e2e failures after the last 3-engine run of the affected specs (14 failed, 171 passed):
- Chromium + Firefox: arrangement:70 and arrows:120 "chip over chip" for cls_ketones (two chips measured overlapping; the tests measure
  while the view may still be moving after a pane opens: a settle wait (`stillView`) was added to the kit afterwards, NOT yet re-run).
- Firefox only: arrows:187 and map-room:124, the map's top moves +12.4 px after a family is selected (something above the main column grows
  when the pane narrows it; `white-space: nowrap` on the compact band actions did not fix it; cause not found; a diagnostic run failed to open the map).
- WebKit: arrangement:70, arrows:78/120/171, map-focus:26, map-fit (x2): a far family is outside the viewport or under the rail when the
  inspector is open (focus fit by design; the whole-map Fit shows only the top-left part at the name floor); arrangement:153 the Key dialog stays open.
Changed tests and why: chip-words (chips no longer overlap, placed in screen px), scene-svg* (layer order, chip structure, snapshots, faded rule),
viewport-scene (style `--map-k`), navigator.spec (one more write per frame), canvas-touch (hit 28 px), arrangement:153 (note is in the Layout notes
dialog since 8.4a), study-inspector (container query), navigator-interaction (one Open button), status-parts/phone-window (aria-hidden short words).
Amendments: none to schema or contracts. REVIEW REQUIRED: whether focus fit may leave other families off-screen while a pane is open (tests had to
bring them back with Hide inspector + Fit).

## Reviewer reply round (2026-11-07)
- Red (fitted flag): `map-state.test.ts` 5 failed (parse default lacks `fitted`, `setFitted` missing, saved map lacks `fitted`);
  `initial-view.test.ts` "Cannot find module './initial-view'".
- Red (zoom to selection): `focus-fit.test.ts` "zoomTargetRect is not a function" (rewritten for the new rule), `zoom-to.test.ts` "Cannot find module './zoom-to'".
- Firefox +12.4 px shift (reviewer item 4). `tests/e2e/map-shift.spec.ts` logs boxes before -> after selecting a family (Chromium / Firefox):
  header y=0 h=44 / same; notices band y=44 h=48 (Chromium), h=35.6 (Firefox) / unchanged in that run; main column y=92 (Chromium) 79.6 (Firefox);
  map toolbar h=41; "Selected:" label position absolute (y=141 h=28 -> h=32, inside the map); map area y=133 h=643 (Chromium), y=120.6 h=655.4 (Firefox), unchanged.
  In the failing specs (arrows:187, map-room:124) the Firefox band went 35.6 -> 48 px: the "Details" button (32 px) appears once the inspector narrows
  the column and the text is cut, so the band row grew by 12.4 px. The label is NOT in the page flow. Fix: `.band { min-height: 48px }` (notice-band.module.css).
- `npm run check` at default workers, WHOLE suite, once more after all code changes: 750 files, 8324 tests, exit 0 (first full run of this round failed
  only on a lint error in my new map-shift.spec.ts: `import()` type annotation; fixed, re-run green).
- WebKit alone (arrangement, arrows, map-focus, map-fit, map-marks, map-shift): 28 passed, 1 skipped. arrangement:153 (Key dialog) passes now: the Esc
  handler of the Key popover is document-level, the failure came from the old flow; no change was needed in the popover.

## Disclosed rule breaks (reviewer item 7): late e2e, rule broken for a moment, run alone in Chromium, seen red, restored
(one build with five breaks at once; the originals were copied back afterwards and checked)
- G4 `inspector-study.spec.ts:117` with `.cards:not(.cardsRow) .card { width: auto }`: `a card of makes  Expected: >= 0.45  Received: 0.2531931198910082`.
- E2 `map-fit.spec.ts:33` (Zoom to selection) with the button's `onClick` removed: `focus-set titles  Expected: >= 12  Received: 9.590405917167663`
  (1366: 10.799779307842254; 1920 stays above 12 by itself, as it did before).
- E3 `map-fit.spec.ts:91` (phone Show all) with `.panel[data-phone][data-expanded] { max-height: 80dvh }`: `Expected: >= 251.7  Received: 9.015625`.
- G2 `notices-band.spec.ts:212` (phone toast, Pixel 7 and iPhone 14 profiles) with the floating toast not compact: `the toast covers the storage line  Expected: false  Received: true`.
- G1 `notices-band.spec.ts:188` (toast vs inspector and A-to-B panel): the first run failed for another reason, a typo in my own regex
  (`Navigator: d+`, "element(s) not found"): the test never reached its rule, so it did NOT count as red. Regex fixed; the rule break is repeated for this test alone (next entry).
- G1 repeated alone (regex fixed) with `.main:has([data-right-pane-BROKEN])` (rule off): `the toast is on top of the A-to-B panel  Expected: false  Received: true`. Restored (cmp equal).
- Disclosed: the Part E and G e2e were written after their source; each was seen red above by breaking its rule; G3 (status words) had its unit test red first.

## Sizes (npm run build:smoke, after all code of this round)
Initial JS gzip: Study 383.28 kB (target 381.3: over by 1.98), Studio 387.16 kB (target 385.0: over by 2.16). 8.4a closed at 381.00 / 384.68.
Rule: missed by more than 0.5 kB -> STOP before deploy. Everything before the deploy continues (e2e, screenshots, docs); nothing is deployed or pushed.
