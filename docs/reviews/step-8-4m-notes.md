# Step 8.4m notes: the map with every chapter

RESUME FROM: see the last "NEXT" line at the bottom of this file.

START (2026-11-15): `git status` clean, HEAD 5e0bb83 (8.4f Part 2 close, deployed, == origin/master), stash empty.
Ports 4173, 4174, 8787, 9333 free. Speed check (5e7 loop, file script): 51 ms.
The owner's package is read from `..\fable-work\inputs\` only (a local Studio preview on port 4183, a fresh browser
profile, File > Import; one measuring script run from the git-ignored `test-results/8.4m-probe/`). Nothing of it is in the repo.

## R. Room first

- RED R1/R2 `npx vitest run src/features/navigator/lazy-model.test.ts src/features/navigator/navigator-context.test.tsx
  src/app/window/map-wanted.test.ts` -> 3 files failed (lazy-model and map-wanted: module missing; provider: the layout was
  asked once with the map not shown, expected 0) (6 s), before the source edit.
- R1 built: `NavigatorProvider` takes `shown`; the model starts once `active && shown` and then stays started.
  `src/app/window/map-wanted.ts` decides `shown`: Studio and a phone on its map tab at boot; Study once the first-screen rule
  has run and the map (or the phone's Families tab, which reads the model) is the screen. `useFirstScreen` now returns
  `settled` (the navigator is mounted for one render before Chapters takes over; without it that render started the model).
  Before the first state every reader gets `IDLE_NAVIGATOR_STATE` (no scene, no numbers): the status line shows nothing.
- R2 built: `lazy-model.ts` loads `pipeline.ts` with `import()` at the first `start`; a chunk that does not load is the
  error value `MAP_CODE_FAILED` and the next start asks again. The 300 ms skeleton delay counts from `start`.
- Sizes (fresh builds, `node scripts/initial-js-size.mjs`): BEFORE Study 350,211 / Studio 354,223.
  After the lazy model alone: 345,109 / 348,887 (above the 343,500 stop line). Cause found in `build-report/study.json`:
  the entry still held (a) the map's SVG layers: `memo(...)` at module top level is a side effect to Rollup, so every
  module the `@/render/svg` barrel re-exports stayed in the entry; (b) the projection builder, because
  `features/navigator/reads.ts` read `navigatorProjection.readsKinds`. Fixes: `/* @__PURE__ */ memo(` on the six layers;
  `NAVIGATOR_READS_KINDS` exported from `@/core/graph` (the same list object) and imported alone.
  AFTER R: **Study 335,369 / Studio 339,176 = M.** Step limit: M + 1,500 = 336,869 / 340,676.
- Budget lines lowered to (M + 10,000) rounded up to 1,000: Study 346 kB, Studio 350 kB (check-build.mjs, check-edition.mjs;
  their two tests quote the new numbers; the "light" fixture of check-edition.test.ts went from 300,000 to 280,000 random
  bytes because 300,000 gzip to about 353 kB, over the new Studio line).
- Unit: navigator + window + inspector + integration: 291 files green after the fixes (the window skeleton test showed the
  delay had moved to the chunk's arrival: fixed in lazy-model.ts, test unchanged).

## Facts (before the map work)

- **F1.** `NAVIGATOR_MAX_EDGES` (120, `src/features/navigator/limits.ts:9`) is put into the projection request at
  `pipeline.ts` `requestOf` (`limits.maxEdges`) and applied in `src/core/graph/navigator/build.ts:112-114`
  (`edgeBudget`, `between.slice(0, edgeBudget)`). It counts ORDERED family pairs (from, to), a family to itself included,
  taken by (total descending, from, to); it does not count arrows. The anchored overview is laid out by the GRID layout
  (fixed cells; `render/scene/layout-request.ts:56,81` `isArranged` -> `algorithm: 'grid'`), not by ELK.
  Owner's data: 657 reactions, 17 anchored families + the bucket = 18 boxes, 159 ordered pairs (16 of them a family to
  itself), 826 candidate arrows; 120 admitted, 39 pairs / 44 arrows cut. With every pair admitted (median of 5, Node,
  `performance.now()`): projection 3.2 ms, grid layout 2.5 ms, scene build 0.6 ms (120 pairs: 3.3 / 2.7 / 0.7 ms).
  The browser numbers are in "Timings" below.
- **F2.** Two causes. (1) The screenshot: after a reload the SELECTION comes back (it is saved) but the map's FOCUS does
  not (`ui/state/map-state.ts`: "never saved: the map always opens with nothing focused"), and only the focus draws
  arrows (`use-map-view.ts`: `focusId = hover ?? locked`). Probe: click Ketones -> 12 lines drawn; reload -> "Selected:
  Ketones", 0 lines, nothing faded, no count. Not the busy rule (Ketones has 14 admitted lines with the bucket shown).
  (2) Silent loss: 7 of Ketones' 21 pair directions are among the 39 cut (ketones>alkanes, >esters, >aldehydes, >alkenes,
  >arenes, >ethers, haloalkanes>ketones), so even when drawn it showed 14 of 21 with no word about it on the family.
- **F3.** Confirmed by probe (1920 x 1040, pane closed, bucket shown, Ketones selected after a reload, Fit): hovering
  Esters, the Key bar grows from 91 x 42 to 556 x 42 at 214 ms and the view changes at 221 ms (scale 0.7484 -> 0.7418,
  translate (12.7, 45.6) -> (-21.6, 28.3)). `free-areas.tsx` observes each control's size; `insetsOf` lets the 91 px Key
  button take the LEFT edge but gives the 556 px legend the BOTTOM edge, the insets change, and `viewport-scene.tsx`
  (`useEffect(() => refitIfAuto.current?.(), [insetKey, boxKey])`) fits again while the view is still the automatic one.
  After a pan by hand the view is not automatic: no move (probe: unchanged). Also seen: with a family CLICKED at Fit the
  open legend lay over the bucket box (the re-fit comes only with the next automatic fit).
- **F4.** `map-lines.ts:6` `busyLine(n, true)` = "N arrows: listed in the panel", shown by `navigator-canvas.tsx` when
  `view.busySelection`. The panel does not list arrows: the class view's groups come from
  `inspector/model/study-connected.ts:122-132`: "Reactions that use it", "Compounds in this class", "Often confused with".
- **F5.** (a) The bar over the boxes: `map-float.module.css` `.top` is a wrapping flex row; when the toolbar and the
  Selected bar do not fit, the Selected bar drops to a second row. The free-area rule (A3) measures it there, but the
  re-fit happens only while the view is the automatic fit, and here Fit was already at the ADR-037 floor. (b) The right
  edge: `render/viewport/transform.ts:84-89` `fitBox`: below `FIT_FLOOR` the content starts at `left` inset; `insetsOf`
  had given the small Key button the LEFT edge (about 107 px), so there was an empty strip on the left while the right
  was cut. Rules that should have prevented it: A3 (reserve the largest state, so the bar's second row is always
  counted) and the floor case (take the insets that cut least).


## M. Map work (IN PROGRESS, stopped mid-edit 2026-11-15: usage limit)

- RED M2 `npx vitest run src/features/navigator/pipeline-full-map.test.ts` -> 2 failed (truncation max_edges; family-08>family-02
  missing), 3 passed (2 s), before the source edit. GREEN: pipeline.ts builds again with boxes squared when the grid overview
  was cut (5 passed; pipeline tests 38 passed). Test data: tests/fixtures/full-map/full-map.ts (17 families, 650 reactions, 170 pairs).
- RED e2e `npx playwright test tests/e2e/map-full-content.spec.ts --project=chromium` (speed 51 ms; pipeline change stashed for the
  run, popped after) -> 8 failed (3.3 min): M2 notice, M1 x2, M4 x2 ("a bar (176,642 556x42) lies over the bucket"), M3 x2
  (11 lines for 18; "21 arrows: listed in the panel"), F2 (2 for 4).
- RED M4 unit `npx vitest run src/features/navigator/free-areas-rule.test.ts` -> 1 failed (expected 107 to be 24). GREEN after
  `insetsOf(..., floor)` (19 passed).
- F5 correction: screenshot 4 was not reproduced exactly (the pane could not be dragged to 650 px in the probe). Seen instead:
  the open legend over the bucket box, and Fit with the Key on the LEFT edge (a 147 px strip).
- Session 2 (same day, after the break): speed 51 to 62 ms before each Playwright run.
- **M1 built.** (a) `free-areas.tsx` tells each answer whether the map AREA changed (its size, the pane over it, the number of
  controls, the size of the content); `navigator-canvas.tsx` counts those in `fitEpoch`; `viewport-scene.tsx` fits again (while
  the view is the automatic one) on `fitEpoch` only. New insets alone are kept for the next fit and move nothing.
  (b) Largest state: the key strip has an invisible reserve with every arrow key (`.keyReserve`, `ArrowKeySizer`); the hint /
  Selected bar sits in a slot that is always one row (`.hintSlot`), whose row depends on the area's width only; the bar gives way
  with an ellipsis (full words in `title`) instead of taking a second row over the boxes.
- **M2 built** (above). The old window test that lowered the ARROW limit to 3 to see the notice now lowers the BOX limit to 5
  (`navigator-truncation.test.tsx`; the notice and the status line are still asserted, reason "max nodes"): disclosed change.
- **M3 built.** `busy-rule.ts` BUSY_SELECTED_LINES = 30; `map-view.ts` `locked` (the focus is the selected family) and `links`;
  `map-hint-line.ts` the bar's line: "68 reactions to 14 families" (drawn), "... : listed in the panel" (more than 30 lines; the
  panel has the list), a hover over a busy family says "This family has N arrows. Click it to see them." (no panel promised).
  Panel: `core/graph/navigator/links.ts` `familyLinksOf`, `inspector/model/study-links.ts`, `inspector/links-section.tsx`
  (region "Links", lists "Turns into" / "Made from", rows "Name · n", a row selects the arrow = the pair's reaction list).
  RED `npx vitest run src/core/graph/navigator/links.test.ts src/features/inspector/model/study-links.test.ts` -> 2 files failed
  (module missing; links undefined) before the source. `map-view-links.test.ts` (6 tests) was written AFTER the map-view source
  (the e2e M3 tests were red first): disclosed.
- **F2 fix.** The map store starts focused on the saved selection when it is a box (`navigator-persist.ts`, `map-state.ts`).
  RED `npx vitest run src/ui/state/map-state.test.ts` -> 1 failed (expected null to be 'cls_family'); the test was added after
  the two-line source edit and proven red with that edit stashed: disclosed.
- **M4 built.** `insetsOf(..., floor)`: below FIT_FLOOR (0.3775) the edges that CUT least win. With the reserve the Key needs
  572 px on the left, so it takes the bottom except on a very wide, short map.
- GREEN `npx playwright test tests/e2e/map-full-content.spec.ts --project=chromium` -> 8 passed (1.4 min). Two spec corrections
  on the way: the busy family has 14 neighbour families (not 13), 2 faded; the spec dismisses the "Imported ..." toast (it stays
  until dismissed and lifts the bottom controls, step 8.4b) and asserts "the click did not move the view" only when the click
  did not also open the pane (that is an area change).
- Owner's data, local Studio (probe): 1920 x 1040 no notice, no "Not drawn"; hover Esters: view unchanged, 14 lines; Ketones
  clicked: 21 lines, "63 reactions to 11 families"; no control over a box. 1366 x 768 the same.
- Commit a checkpoint after M1-M4 (see git log).

## M6 (report only; owner's data)

132 classes: 17 are boxes, 76 sit inside a box (through their parent classes), 39 have no anchored ancestor.
194 of 657 reactions have an arrow from or to "Not in a family yet" (115 compounds there: 84 single compounds, 31 classes);
5 reactions are in no box at all (unanchored).
- Polyhalogen compounds: inside "Haloalkanes". Vicinal dihalides: inside "Haloalkanes". Geminal dihalides: inside "Haloalkanes".
  α,ω-Dihalides: inside "Haloalkanes". Vicinal diols: inside "Alcohols". Carboxylate (alkanoate) salts: inside "Carboxylic acids".
  Diazonium salts: a box of its own.
- No anchored ancestor (reactions through the bucket): Acyl halides 13, Grignard reagents 12, Nitriles 7, Epoxides 6, Ammonium
  salts 4, Isocyanides 4, Nitro compounds 3, Nitroarenes 3, Oximes 3, Quaternary ammonium salts 3, Sulfonic acids 3, Addition
  polymers 2, Cycloalkanes 2, Haloalkenes 2, Isocyanates 2, Metal alkynides 2, Sulfonamides 2; one each: 2,4-Dinitrophenyl-
  hydrazones, Alkyl nitrites, Aryl nitriles, Azo compounds, Bisulfite addition compounds, Hydrazines, Hydrazones, Hydroxamic
  acids, Imines, N-Nitrosoamines, Phenylhydrazones, Semicarbazones, Sulfonyl chlorides, Tertiary amine oxides; none: Elements
  and metals, Imides, Inorganic acids, Inorganic bases, Inorganic salts, Isothiocyanates, Osazones, Other inorganic compounds.


## Session 2, after M1-M4 (stopped by the owner 2026-11-15; everything committed)

- Existing map specs, Chromium (18 files): 99 passed, 1 skipped, 2 failed, both fixed:
  (1) `map-marks.spec.ts:93` (the selected BUCKET with more than 15 arrows draws none): my M3 rule had applied to the bucket too.
  Now the 30-line rule is for a selected FAMILY only; the bucket keeps 15 and its old line "N arrows: listed in the panel"
  (`map-view.ts` `busyListed`, `map-lines.ts` `listedLine`). Spec unchanged, passes.
  (2) `full-map-table.spec.ts:34` "From A to B ... element was detached": a race in the test helper (the button moves into More
  one frame after the A-to-B panel narrows the map). `map-toolbar-kit.ts` `clickToolbar` now looks the action up again
  (bounded, 4 tries). The whole file passes in Chromium (4 passed), and :34 now passes in WebKit too (carried item closed).
- **M5, carried list, run red on the current build** (speed 51 ms):
  WebKit (full-map-table, map-fit, map-landscape, frame): 10 passed, 1 skipped, 7 failed:
  - `frame.spec.ts:166` skip link not focused. PROBE (`tab-links.mjs`, a static page): Tab stops are link > button > input in
    Chromium and Firefox, button > input in WebKit: Safari's default skips links (an engine setting). PLAN: press Alt+Tab
    (Option+Tab) for that step in WebKit, assertions kept. NOT DONE YET.
  - `full-map-table.spec.ts:193` "the view is as it was" (0.559 off). NOT LOOKED AT YET.
  - `map-fit.spec.ts:66` (1280, 1920) and `:117`: "Hide inspector" not found after "Show inspector". NOT LOOKED AT YET.
  - `map-landscape.spec.ts:45` both phones: 360.015625 against 360 (and 340.015625 against 340): 1/64 px, WebKit's layout
    unit. PLAN: name it an engine limit (compare with 1/32 px of slack, said in the spec). NOT DONE YET.
  Firefox (map-free-areas, full-map, map-full-content): 21 passed, 1 skipped, 2 failed:
  - `full-map.spec.ts:60` (1920 x 1000) pane right edge 1366 against 1919: in true fullscreen Firefox's window is its screen
    (1366 wide). PLAN: compare with `window.innerWidth` (the real viewport), not the asked size. NOT DONE YET.
  - `map-free-areas.spec.ts:223` (1366 x 768): **the real cause is found, it is NOT text width.** It fails only when the whole
    file runs (3 of 3), passes alone. Temporary logging in viewport-scene.tsx (removed again) showed: when the pane opens,
    `measure` runs at width 798 and the controller IS given the new fit (scale 0.402), and `refitIfAuto` runs after it, but the
    `data-world` transform on the page stays the old one (scale 0.616): the controller's frame is never drawn. Same box
    position (191.7, 174.3) as the carried failure, so this bug is older than 8.4m. Before the click the view is sticky (a
    window resize fits again), and a later window resize draws the right view. NEXT: read `controller.ts` `request` / `frame`
    (`queued`, the scheduler handle) for a frame that is queued and never run or cancelled in Firefox (e.g. a
    `cancelAnimationFrame` of the wrong handle, or `queued` left true), fix with a unit test red first.
  `map-full-content.spec.ts` passed in Firefox (8 of 8) in that run.
- A change made after that run: `free-areas.tsx` also counts the reserves' rows in the "area changed" signature (harmless; it did
  not cure the Firefox case, which is the frame bug above). Keep or drop after the controller fix.

## RESUME HERE (new session)

State: `git status` clean, all work committed locally (NOT pushed, NOT deployed). Run the START checks of the prompt again
(ports, speed). Probe scripts and owner-data helpers: `playwright-report/8.4m-probe/` (git-ignored, ESLint-ignored; do NOT use
test-results/, Playwright wipes it): lib.mjs, probe3-6.mjs, m6.ts, tab-links.mjs. Local Studio for probes:
`node scripts/edition.mjs studio preview --host 127.0.0.1 --port 4183 --strictPort` (stop it by PID before any Playwright run
is not needed: Playwright uses 4173 / 4174).
1. M5: the Firefox frame bug (above), then the four planned spec fixes, then look at WebKit full-map-table:193 and map-fit.
2. Sizes: fresh `npm run build:smoke` + `node scripts/initial-js-size.mjs`; limit Study 336,869 / Studio 340,676 (M + 1,500).
   NOT MEASURED since M (335,369 / 339,176); the new code is in lazy chunks except `study-links.ts` / `links-section.tsx`
   (check they did not land in the entry).
3. CLOSE of the prompt: `npm run check`; ONE 3-engine round (map specs + touched specs + carried list); ONE full Chromium;
   screenshots `screenshots/8.4m/` with the owner's data (dark and light); timings (overview layout median of 5, select-to-drawn
   for Aldehydes, in the browser); docs (PROGRESS, plan row, PROJECT_STATE next 8.4g, ADR-037 addendum M1 + M4, ADR-044 busy
   rule addendum M3, GRAPH_SEMANTICS pair limit, PERFORMANCE_ARCHITECTURE timings); commit; deploy per RELEASE.md.
4. To disclose in the report: tests written after their source (map-view-links.test.ts; the F2 unit test, proven red with the
   fix stashed); budget tests renumbered; navigator-truncation.test.tsx now lowers the box limit; the count line with a chapter
   chosen counts reactions of ALL chapters on the drawn lines; an "Imported" toast still lifts the (now wider) key reserve
   over the bucket box until it is dismissed; F5 not reproduced exactly.

## Session 2026-11-16 (continuation): Firefox map-free-areas:223 (1366 x 768) re-diagnosed, NOT fixed

The earlier reading ("the frame is never drawn") is WRONG. Controller event log (temporary, removed) at a failure: the last frame IS
written and `data-world` equals the controller's last view (translate 16.58 155.6, scale 0.402). Two commands came in order: a fit
with top inset 58, then a fit with top inset 108 (the bar stack becomes two rows when the pane narrows the area to 798 px:
`ctl 8,8,468x42 | 8,58,782x42`, `ins top 108`, `struct true`). So the refit does run with the right insets; the drawing still has a
box about 32 px below the area's top (under the second bar). Not yet explained: next look at `fitBox` in transform.ts (a scale
floor / `FIT_FLOOR` or the title floor in focus-fit.ts clamping the scale so the content overflows the band) with Firefox's wider
text (`--map-title-u`). Fails about 1 of 3 whole-file runs, passes alone and with heavy logging (timing-dependent).
Tried and dropped: adding the controls' sizes to the "area changed" signature (no cure, 2 of 3 still failed); reverted.
