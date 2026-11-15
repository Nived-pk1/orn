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

NEXT: M1 (tests red first).
