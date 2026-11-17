# Step 8.4m2 notes (paused 2026-11-16, resume tomorrow)

START ok: HEAD cffbe40 == origin/master, clean, stash empty. All 6 owner frames opened.

## B1 so far
- FACT (viewport-scene.tsx): fit paths = (1) fitKey effect -> `refit` (fitNow, unconditional), (2) `useEffect([fitEpoch, boxKey])` -> refitIfAuto,
  (3) own ResizeObserver `measure` (rAF), (4) free-areas measure -> onInsets -> fitEpoch++. Two defects: `boxKey` was '' on a wide screen
  (fitBoxRefits only for phone), so new boxes (chapter -> All) never refit after fitKey's fit used the OLD fitBox; and fitNow/refitIfAuto used the
  controller's LAST size, not the size now.
- Fix written (uncommitted): `readSize()` in `sync()`; `boxKey` always; prop `fitBoxRefits` removed (viewport-scene.tsx, navigator-canvas.tsx).
- RED: `npx vitest run src/render/viewport/viewport-scene-refit.test.tsx` -> 2 failed, 1 passed (11 s) before the source edit. Now green;
  `src/render/viewport src/features/navigator` 74 files / 536 tests green.
- e2e `tests/e2e/map-refit.spec.ts` (demo data) PASSES on the OLD source too (not red). Probe on owner data (`playwright-report/8.4m-probe/b1.mjs`,
  old build, Chromium 1920x1040): no cut either. NOT reproduced yet. Next idea: owner's sequence has a family-page round trip (Open family ->
  reaction -> Map) before closing the pane (`b1b.mjs`, unfinished; the Map click selector was being fixed). Make the e2e red with that shape.
- dist-studio currently holds the OLD build; rebuild before any run. Port 4183 preview stopped.
## B2, B3: not started.

## STATE at pause 2 (2026-11-17), all UNCOMMITTED, nothing deployed
- B1: the box-key refit on a wide screen was REVERTED (a hover changes the drawn boxes; the e2e caught it). Kept: `readSize()` in viewport-scene `sync()`
  (unit test viewport-scene-refit.test.tsx, red before). B1 was NOT reproduced (chromium 1920x1200/1536x960, throttle 6x/20x, family round trip);
  `tests/e2e/map-refit.spec.ts` passes on old and new code (it waits for the view to settle and checks the boxes fill the width): not a red test.
- B2: `DepictionSurface` in render/svg wraps equation drawings (term-view); tokens `--depiction-bg/--depiction-pad` (dark: paper, 4px spread). Only
  the fixed-scale equation drawings were transparent; sized drawings already have RDKit's white background. e2e depiction-surface.spec.ts was RED on old source.
- B3 (probe on owner data, pane at 520 px: placeholder came back every ~600 ms): cause = the hero swapped row/stacked because the hidden measuring copy,
  freshly mounted, measured narrow (drawings and facts not yet arrived). Fixes: copy with fewer drawings than seen does not decide (equation.tsx);
  `settledWidth` 4 px (hero-fit.ts); `scrollbar-gutter: stable` on .inspectorBody; useRetryingDepiction keeps the last ready picture;
  useFactsInput remembers answers per port. Unit tests red first for the hook and use-facts; settledWidth test written with source.
- Checks: `npm run check` green (803 files, 8671 tests). 3-engine round: only WebKit map-fit:66 (carried) after fixes. Sizes: Study 335,677, Studio 339,636.
- Screenshots in screenshots/8.4m2/ (dark + light, owner data).
- LEFT: ONE full Chromium run (was started, stopped by the owner), docs (PROGRESS, plan row, PROJECT_STATE, ADR-037 addendum, flaky list), commit, deploy per RELEASE.md.
