# Step C notes (current; says where to resume)

- Section 0 done: 35cea0c (8.4g Part B review in PROGRESS).
- START ok: clean, stash empty, HEAD 98c7771, pushed.
- RED C1: `npx vitest run src/core/graph/scope-edges.test.ts` -> 2 failed (a: official not enrichment; b: outside not prerequisite).
- RED C2: `npx vitest run src/core/graph/scope-cost.test.ts` -> median 98.3 ms (target 20 ms).
- GREEN C1/C2: scope.ts builds coverage table + parent map once per createScopeOf, per-ref caches. Median 1.4 ms. Demo scope dump (609 lines, 3 exam versions' rows) byte-equal before/after.
- RESUME AT: C3 (routes).
- RED C3: `npx vitest run route-generic-product.test.ts` -> 2 failed (no route through generic; no stated-first). RED C4: route-shortest-first -> 1 failed (one-step route missed).
- GREEN C3/C4: moves.ts producedAs (classes/ancestors), class reactant = ONE move; search.ts iterative deepening, one budget, stops when frontier closed or maxRoutes filled; explored = nodes of the last pass; rank ties end on route key. Old tests changed on purpose (moves.test member expansion, 2 search.test, 2 demo tests now see the inferred generic PCC route). Search runs in the worker (replica.ts), not the main thread.
- Limit: a route that continued through one member's own producers of a class reactant is no longer found (spec: ONE move any <class>). Recorded in ADR-049.
- RESUME AT: real-data route probe (C4), then C5.
- RED C5: chains.test (total, 5 steps, budget) -> 4 failed; map-state.test (chainSteps) -> 1 failed; chain-panel.test (Steps, "5 of 23 chains", quiet line) -> 2 failed. GREEN: chains.ts `total` + CHAIN_MAX_STEPS_LIMIT 5; map store `chainSteps` (optional field of the `map` uiState entry, written only when not 3; parsed per field like `fitted`); panel radio group "Steps" 3/4/5, "n of N chains", quiet line. e2e + real-data timing still to do.
- RESUME AT: C6.
- RED C6: model.test (continueFrom) -> 2 failed; continue-from.test -> module missing; precursors-view.test (Continue from here, Back) -> 2 failed. GREEN: model.ts `continueFrom` on step 1 of a >=5-step found route when the start has makers (backwardMovesInto); route-card button; view `continueFrom` (pushTargetEntry = replaceState prev + ONE pushState; popstate with the state returns to the previous search; autoRun runs the search after the target effect). Address text unchanged (ADR-047: target is in history.state only). 3 view tests changed on purpose (demo now 3 routes, C3).
- RESUME AT: C7.
- RED C7: study-connected-scan.test -> 1 failed (no note). GREEN: `CardGroup.note` "first 5,000 of N compounds" on the class "Reactions that use it" group (and "first 5,000 of N reagents" on the reagent same-family group); rendered under the group.
- RESUME AT: F1 (tour anchors), F2 (starred inspector line).
- RED F1: tour.test (new words + anchors on desktop rail, phone tabs, Expand fallback) -> 4 failed. GREEN: viewItem() finder (rail button / phone tab / Expand button); marks are Map item, Search button, Starred item; mid-window only if no anchor exists.
- F2: `noPlaceLineIn(mode)` in modes.ts (Starred joins Chapters and the explorers; window.tsx uses it). DISCLOSED: the test file and the function were written in the same step, the test was not run red first.
- Two window tests (precursors, phone-precursors) changed "2 routes found" -> "3" (C3). e2e specs with "routes found" still to check: phone-precursors, precursor-explorer, route-editor, saved-as-link, study-explorers.
- RESUME AT: npm run check, then e2e (specs above, From A to B steps spec, tour, starred, Continue from here), screenshots, real-data probes, sizes, docs, deploy.

## Real-data probes (owner data ORN-real-data-2026-11-15, 657 reactions, 622 species; throwaway test, old code from 98c7771)
```
SCOPE exv_cbse-11-chemistry-2026-27 reactionsChanged=0 {}
SCOPE exv_cbse-12-chemistry-2026-27 reactionsChanged=0 {"concept:outside->prerequisite":5}
SCOPE exv_jee-advanced-2026 reactionsChanged=0 {}
SCOPE exv_jee-main-2026 reactionsChanged=0 {}
ROUTES species=622 withGenericGain=248 maxOldMs=8.3 maxNewMs=5.4 truncOld=28 truncNew=0 lostOld=0
  spc_1-2-dibromoethane: routes 0->10; trunc -->-; ms 0.0->1.0
  spc_1-3-dibromopentane: routes 0->10; trunc -->-; ms 0.0->0.8
  spc_1-4-dibromopentane: routes 0->10; trunc -->-; ms 0.0->0.8
  spc_1-5-dibromopentane: routes 0->10; trunc -->-; ms 0.0->0.8
  spc_1-bromobutane: routes 0->10; trunc -->-; ms 0.0->0.8
  spc_1-chloro-2-2-dimethylpropane: routes 0->10; trunc -->-; ms 0.0->0.8
CHAINS steps=3 families=17 edges=114 worstMs=2.8 cls_amines>cls_aldehydes total=21 trunc=false
CHAINS steps=4 families=17 edges=114 worstMs=0.5 cls_ethers>cls_aldehydes total=129 trunc=true
CHAINS steps=5 families=17 edges=114 worstMs=0.3 cls_amines>cls_aldehydes total=140 trunc=true
```
Size (fresh builds): Study 338,107 -> 338,344 (+237); Studio 342,164 -> 342,367 (+203). Limit +300, aim +0 missed.

## STATE AT PAUSE (2026-11-20, owner asked to pause; resume on their word)
- Commits so far (master, NOT pushed, NOT deployed): 35cea0c (section 0) ... last "count of chains stays visible at phone peek". `npm run check` was green except 3 route-count tests, since fixed (not re-run as a whole after that fix: re-run before close).
- Fresh builds: Study 338,344 (+237), Studio 342,367 (+203). Real-data probes done (see above).
- 3-engine round of touched specs: 106 passed, 12 skipped, 8 FAILED (not yet fixed):
  1. chromium map-chains.spec.ts:231 (phone, "the peek shows its whole content"): the new Steps row makes the peek overflow. Fix: shrink the peek (e.g. Steps row inline with the Close row) or raise the peek's allowance, no loosening of the test.
  2. chromium/firefox/webkit precursor-explorer.spec.ts:51: expects 2 routes (`toHaveCount(2)`); now 3 (C3 inferred generic route). Update to 3 with the third warned.
  3. chromium/firefox/webkit route-editor.spec.ts:91: expects 1 "Save as route" button; now 2 unsaved routes. Update the count.
  4. webkit chain-steps.spec.ts:37 (desktop): "console errors" after the reload step; read the log (`test-results`) and decide: product or test.
- Still to do: fix the above; re-run the failed specs in the 3 engines; ONE full Chromium run; open each screenshot in `screenshots/C/` (light and dark; the phone chain-steps shots were taken after the last fix, re-check "5 of 6 chains" shows at peek); final `npm run check`; fresh size build; PROGRESS "Step C" section (with the Part B review text kept from section 0), plan row C DONE, PROJECT_STATE (next: T, then 8.5); commit; deploy per RELEASE.md (Study, live specs Chromium + WebKit, Studio, Access check); push; REPORT.
- Disclosed so far: F2 test and code written together (not red first); old route/demo tests changed on purpose for C3/C4; Study/Studio size +237/+203.

## STATE AT SECOND PAUSE (2026-11-20, owner asked to pause before the deploy)
- All 8 earlier e2e failures fixed (counts for C3, Steps row moved into the phone header, chain count under the title, WebKit reload count, tour mark above the toast). 3-engine rerun of the touched specs green. ONE full Chromium run: 496 passed, 41 skipped, 1 failed (exam-chip.spec.ts:21, page closed; passes alone 2 of 2).
- Screenshots in `screenshots/C/` opened and checked (light and dark).
- `ORN_TEST_WORKERS=2 npm run check` GREEN: 838 files, 8,828 tests, 0 lint errors (after removing an unused helper from the chain-line generator).
- PROGRESS "Step C" section is written (no deploy line yet).
- LEFT: (1) `npm run build:smoke` + `npm audit --omit=dev` and a fresh size line (was Study 338,344 / Studio 342,367 before the last small CSS/tour changes; confirm <= +300). (2) PROJECT_STATE (releasePreview / studioPreview versions, nextStep "T, then 8.5", a step C entry), plan row C DONE. (3) Commit. (4) Deploy per RELEASE.md: Study (`npm run build`, `npm run deploy:study`), live specs by exact file names in Chromium AND WebKit (smoke, csp, phone, phone-family, equation, phone-equation, structures, study-edition, study-explorers, reaction-explorer, precursor-explorer, chapters, reagent-explorer, tour), then Studio (`npm run build:studio`, `npm run deploy:studio`), Access check (Studio 302 to cloudflareaccess.com, Study 200). (5) Push. (6) Report. Never tag.
