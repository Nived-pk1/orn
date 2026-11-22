# Step T notes (test speed, flaky list, K1-K3) - 2026-11-21

Resume here. Order: section 0 (done, 2dcd36c) -> START (done) -> FACTS -> T1..T4, K1..K3 -> CLOSE.

## START
HEAD 60ac6bf pushed, clean, stash empty. No node / playwright / wrangler process and no dev port
listening (only msedgewebview2 of the desktop app, not ours). Nothing stopped. Speed check 0.23 s.
Machine: 16 logical cores, 16 GB.

## FACTS (before any change)
- `playwright.config.ts`: fullyParallel false, workers 1, retries 0, timeout 120 s, expect 30 s;
  projects chromium / firefox / webkit (testIgnore gate-d spec) and gate-d (only with ORN_GATE_D);
  two preview servers (Studio 4173, Study 4174 for study-edition.spec.ts only).
- `tests/e2e/fixtures.ts` (63 lines): context fixture is TEST scoped; WebKit calls
  `launchPersistentContext` on a fresh temp dir for EVERY test; `makeContext` likewise.
- e2e spec files: 185 files in tests/e2e (specs + kits).
- `loadDemo` (tests/e2e/kit.ts:102): clicks "Load demo dataset" and waits; 62 files use it, 91 calls.
- `waitForTimeout`: 260 calls. Top 10: map-proportions 13, app-essentials 12, map-marks 11,
  full-map-table 11, compare-8.4e 10, navigator 9, map-chains 8, full-map 8, exam-first-run 8,
  starred-recent-shortcuts 7.
- raised timeouts (`setTimeout(` in tests/e2e): 357 occurrences.
- `vitest.config.ts`: projects `main` (all tests but e2e/timing/real-thread files; setupFiles
  window-setup.ts) and `real-threads` (serial, 1 worker, 60 s); maxWorkers = ORN_TEST_WORKERS or 4;
  default pool (forks), isolate true (default); cache false.
- `src/test-support/window-setup.ts`: per-FILE beforeAll warm-up for files under src/app/window.

## BASELINE
(a) `npm run check` default workers (4), green both times: run 1 672 s (838 files, 8828 tests),
    run 2 659 s. Vitest says import 665 s, environment 495 s, tests 936 s (sums over workers).
(b) Timing subset (20 spec files, fixed): map-fit map-free-areas map-focus map-selection map-chains
    inspector inspector-views inspector-study phone phone-inspector phone-sheet phone-chapters
    reaction-explorer reagent-explorer precursor-explorer named-explorer mechanism-explorer palette
    tabs chapters. Run against my own preview of the Studio build (ORN_BASE_URL), PID-managed.
    PIDs of my preview servers this session: Studio 4173 = 31504, Study 4174 = 23028 (stopped by PID at the end).
    `playwright.config.ts` got `ORN_REUSE_SERVERS=1` (reuseExistingServer) so the servers can be started
    by hand. The first subset try ran Study-edition specs (inspector-study, phone-inspector) against
    Studio by mistake (ORN_BASE_URL points both): 6 false failures; discarded, rerun with both servers.
- Chromium subset baseline: 77 passed, 7 skipped, 9.4 min (564 s wall incl. start-up).
  Firefox and WebKit subset baselines: run in background after it (logs ../T-sub-base-*.log).

## K1 / K2 (product, unit tests first)
RED: `npx vitest run chain-panel.test.tsx continue-from-view.test.tsx` -> 5 failed, 13 passed (15 s)
(count line "23 chains, the 5 shortest shown", "N chains", "Show the 2 chains", "Continue from s0").
GREEN: navigator/ + precursor-explorer/ folders pass (chainCountWords in chain-card.ts, its own unit
test; route-card.tsx label `Continue from ${step.from}`; the level-5 compound is the route's first
`from`). E2E specs chain-steps / map-chains / map-fit still say "5 of 6 chains" / "Show all n": they are
edited AFTER the subset baselines (map-fit and map-chains are in the subset).
- BASELINE subset (20 files, 84 tests, workers 1, retries 0; speed check 0.23 s before):
  chromium 77 passed / 7 skipped, 9.4 min (564 s); firefox 63 passed / 21 skipped, 9.3 min (563 s);
  webkit 70 passed / 13 skipped / 1 FAILED, 21.3 min (1282 s). The failure is the flaky-list item
  `map-fit.spec.ts:66` (webkit) - it fails in a plain subset run too.

## T3 flaky list
1. WebKit map-fit.spec.ts:66 (1280 x 800). BEFORE: `--repeat-each=20` -> 20 of 20 FAILED (not flaky: every run; log
   T-flaky-mapfit-before.log). Probe (throwaway spec, every 250 ms after the pick): pane opens, area 1112 -> 712 px,
   one frame at k 0.5704 (stale), then the automatic fit lands at the FLOOR 0.3775 with cls_family-15 16 px past
   the right edge: ADR-037's floor case, correct product behaviour. CAUSE (test): the spec read `atFloor` right after
   `expect.poll(scale > 0)`, which passes on the stale pane-closed zoom (0.5704) in WebKit (pane opens late), so it took
   the "whole map on screen" branch for a map that is clamped at the floor. Not the owner's B1 symptom: the refit does
   happen (probe shows it). FIX: `tests/e2e/settled-kit.ts` `viewSettled` (area size + world matrix identical for 8
   frames, bounded 900 frames) after the pane is open and in place of `waitForTimeout(900)`. AFTER: 20 of 20 pass; the
   whole file passes in webkit / firefox / chromium (7 / 7 / 7).
2. Firefox map-free-areas.spec.ts:137 (phone A3). BEFORE: alone `--repeat-each=20` 0 of 20; whole file x5 0 of 35;
   alone x20 under 14 busy node loops (CPU hog, killed after) 0 of 20. Cannot reproduce. The old spec `settle` was two
   equal readings 250 ms apart (sleep loop) = a map that was still moving after 500 ms of quiet could pass it. CHANGE:
   `settle` = `viewSettled(page, 30)` (area, zoom and floating-control boxes identical for 30 frames, bounded).
   Cause NOT proven; stays on the list until the CLOSE full-order run (REVIEW REQUIRED if it fails again).
3. Chromium exam-editors.spec.ts:64. BEFORE (`--repeat-each=20`, in progress at the pause): 4 failed of the first 11. Each failure
   hangs 15 min (no action timeout, test timeout 900 s): `chooseExam(page, NEW_LABEL)` (kit.ts:285) waits for the
   menuitemradio forever; the page snapshot shows NO open menu (chip "Exam: JEE Main"). Hypothesis (to prove): the
   chip click toggles a menu that is still open/closing from the previous chooseExam, so the menu is closed and the
   item never appears (kit.ts:294 comment names the same hazard). Planned fix (test): wait for `menu` count 0, click chip,
   expect menu visible, then click the item (state waits).
   Not yet done: 4 study-edition:118, 5 notices-band, 6 exam-chip:21; mapfit/free-areas see above.
   Product read for study-edition:118: lazy-export.tsx Loader swaps its loading Dialog for ExportScreen's own Dialog
   (new <dialog>, showModal in an effect): an Escape in that instant has no dialog to cancel (candidate product race).
   TH-02: 7 ResizeObservers still call state setters inside the callback (study-parts, family-page, map-toolbar,
   use-chain-reveal, phone-sheet, shell, equation uses rAF already); no "ResizeObserver loop" error seen in any of the
   six failures; a shared helper in shell.tsx (entry chunk) would cost bytes against the +100 limit: not changed.

## STATE AT PAUSE (2026-11-21)
Done: section 0 (2dcd36c); baselines (check 672/659 s; subset 564/563/1282 s); K1+K2 product+unit tests (UNCOMMITTED,
RED/GREEN recorded above); map-fit fix (20/20 after); free-areas settle change; `settled-kit.ts`; config REUSE switch.
UNCOMMITTED: playwright.config.ts, chain-card(.test).ts, chain-panel(.test).tsx, route-card.tsx, continue-from-view.test.tsx,
map-fit.spec.ts, map-free-areas.spec.ts, settled-kit.ts, this file. e2e specs chain-steps / map-chains / map-fit:192
still use "5 of 6 chains" / "Show all n": edit them (K1 words) before any e2e run on a NEW build.
Servers still up by PID: Studio 31504 (+ parent 28980), Study 23028 (+ parent 11220): old build (no K1/K2).
Left: exam-editors fix + 20x, study-edition:118, notices-band, exam-chip:21, T1.1-T1.5 (projects, WebKit pooled context,
demo reuse, sleeps, review project), T2 (vitest pure project), T4 (strict durability), K3 shots, CLOSE (check x3, subset
again, full 3-engine run, docs, sizes, deploy, push).

## PAUSED after the exam-editors 20x (2026-11-21)
exam-editors.spec.ts:64 chromium BEFORE: 5 of 20 FAILED (15 passed), 1.3 h (each failure = 15 min test timeout).
Cause still a hypothesis (chooseExam toggles a still-open menu); fix not yet written. Resume there.

## RESUMED
3. exam-editors.spec.ts:64 (chromium): probe spec (throwaway) showed the state "menu still in the DOM while the chip says
   expanded=false" before the chip click, and one failing run where after the click there was no menu (menus=0, expanded=false):
   the click toggled instead of opening. CAUSE (test): `chooseExam` clicked the chip while the previous menu was still closing.
   FIX: kit.ts `chooseExam` waits for no menu, clicks, waits for the menu, picks, waits for no menu. AFTER: 20 of 20 pass
   (before 5 of 20). Same helper serves every spec that chooses an exam.
T2 written (not yet run): vitest.config.ts project `pure` (core, io, layout, search, chem; 200 files, none jsdom; isolate false);
   main excludes them; `scripts/print-test-workers.mjs` first in `npm run check`.
4. Chromium study-edition.spec.ts:118: alone x20 BEFORE 0 of 20. Product read: lazy-export Loader's loading Dialog has onClose=model.close
   (Escape during the load closes: decided, product is right) but when the chunk lands it is replaced by ExportScreen's OWN
   <dialog> (new element, showModal in an effect); an Escape in that instant has no open dialog. Cause not reproduced, so NOT
   proven. CHANGES (tests, state waits): the Escape check waits until the loading status is gone before pressing; NEW test
   "Escape while the export screen is still loading closes the loading dialog" (chunk held by page.route until the test ends)
   covers the other half deterministically. Both pass in chromium, firefox, webkit (6 of 6). Stays on the list, cause unproven.
5. notices-band desktop (webkit): the only sleeps were in the map-key test (2 x 900 ms): now viewSettled + the key visible.
   Cause not reproduced alone; run x5 below. Load-dependent toast (auto-dismiss) is the suspected mechanism, unproven.
6. exam-chip.spec.ts:21 (chromium): examChoices read the menu items right after the chip click (an empty read if the menu was
   not up yet) and clicked a chip whose menu could still be closing: now waits for no menu, then menu visible. After: 20 of 20
   (40 tests) pass; no BEFORE count taken (not reproduced alone). Cause unproven.
PIDs now (after rebuild for K1/K2 words): Studio 4173 = 12828 (parent 11968), Study 4174 = new (see netstat) - stop by PID.
T2 first check run (pure project): 838 files / 8829 tests green, 655 s (before 672 / 659). Vitest sums: import 626 s (665), env 506 s (495).
  Only 200 of 838 files are pure, so the gain is ~2 %; the cost is jsdom + imports of the other 638. ORN_TEST_WORKERS=8 (vitest only):
  502 s but 2 failures (no-exam-name-in-product-strings, publish-dataset gate; load): default stays 4.
T1 written: tests/e2e/fixtures.ts (worker-scoped WebKit pool, emptied between tests), playwright.config.ts (parallel projects,
  *-serial projects with workers 1, review project, WORKERS 3), scripts/run-e2e.mjs (npm run e2e), settled-kit. Not yet run.

## T1 measurements (subset, 20 files; old = workers 1 per-test WebKit launch; new = 3 workers, pooled WebKit context)
 after T1.1+T1.2:  chromium 251 s (was 564), firefox 258 s (was 563), webkit 506 s (was 1282; map-fit:66 now passes)
 after T1.4 (54 sleeps replaced in map-proportions, map-marks, full-map-table, map-fit, map-free-areas, app-essentials; notices-band 2):
   chromium 253 s, firefox 251 s, webkit 505 s (subset has no further gain: the sleeps were a small part).
 sleeps: waitForTimeout 260 -> 202 in all e2e; in the named files (top 5 + flaky list) 13+12+11+11+10+6+2+2 = 67 -> 10 (the
 10 are compare-8.4e, moved to the review project).
K1 on the phone (found by map-chains.spec.ts:231, the peek layout guard): the longer count line wrapped inside the header and the
 peek (326 px, fixed) overflowed by 32 px, then by 16 px as its own row. FINAL: on a phone the count line shares the row of the
 "Show the N chains" button (and is only shown when chains are left out); desktop shows "N chains" above the list always.
 RED: map-chains.spec.ts:231 (chromium) failed 'the peek shows its whole content' x3 with the new words; unit test for the phone
 rule was written after the code change and shown RED by temporarily removing the condition (disclosed order slip). GREEN: map-chains,
 chain-steps, map-fit all pass (17/17 chromium).

## T4 strict durability cost (real Chromium, real data ORN-real-data-2026-11-15.ornpkg, empty local Studio, 5 + 5 runs, interleaved)
Apply time = click on Confirm -> "Imported n records" toast (throwaway spec, not committed; relaxed = throwaway build of
src/persistence/db.ts with 'relaxed' into dist-studio-relaxed, db.ts restored with git checkout, no diff left).
 strict (as shipped): 1228, 927, 974, 1569, 1494 ms -> median 1228 ms
 relaxed:             1208, 935, 991, 1625, 1510 ms -> median 1208 ms
Difference: ~1.6 % at the median, inside the run-to-run noise (the file's 5 pairs differ by less than 60 ms each). Setting NOT changed.

## T1.3 demo reuse: NOT built (measured first)
loadDemo (click Load demo dataset -> data in, 3 runs each): chromium 370-383 ms, firefox 611-1831 ms, webkit 5.9-6.4 s.
91 calls x per engine: chromium ~35 s, firefox ~1.5 min, webkit ~9 min of CPU, i.e. ~3 min of wall at 3 workers (about 9 % of the
WebKit run). A reuse needs an IndexedDB dump/restore for WebKit (storageState does not reach a persistent context) and changes the
first screen of every spec that follows (First-run region, exam card): a large isolation risk for a small gain. Specs that import:
unchanged (all of them still import through the UI). REVIEW REQUIRED if the owner wants it anyway.
K3 screenshots in screenshots/T (OPENED all: route-through-generic light/dark, starred-record-open light/dark, and the K1/K2 shots
 steps-n-of-n-desktop/pixel7, continue-from-here-desktop re-taken by chain-steps.spec.ts). K3 spec: tests/e2e/step-t-shots.spec.ts (review project).
FULL RUN started: ORN_REUSE_SERVERS=1 node scripts/run-e2e.mjs (parallel pass 3 engines x 3 workers, then the serial pass).

## STOPPED BY THE OWNER BEFORE THE FULL 3-ENGINE RUN (2026-11-21) - HOW TO RESUME IN A NEW SESSION
The full run (`npm run e2e`) was started once and STOPPED (owner: no full round now). It had 44 ok / 1 failed lines when
stopped: it proves nothing, ignore ../T-full.log. All my processes and ports (4173/4174/4175) are stopped; nothing runs.
DONE (see sections above): section 0 (2dcd36c); baselines; K1 + K2 (product, unit + e2e words, phone layout row); K3 shots (screenshots/T);
flaky list: map-fit:66 (test race, 20/20 after), exam-editors:64 (chooseExam, 5/20 -> 0/20), exam-chip:21, study-edition:118,
notices-band, free-areas A3 (changes made, causes unproven where noted); T1.1 projects + serial + review; T1.2 WebKit pooled
context; T1.4 sleeps (260 -> 202; named files 67 -> 10); T2 pure project (655 s vs 672/659); T4 durability table.
NOT DONE: (1) T1.3 demo reuse (decided not to build, numbers above; owner may overrule); (2) the full 3-engine proof run;
(3) `npm run check` x3 in a row at default workers (one green after the pure project, 655 s; one more started at the stop,
see ../check-T-after2.log); (4) the subset re-run table is in "T1 measurements" (after T1.4); (5) sizes (node scripts/initial-js-size.mjs
after fresh builds: Study was 338,365 / Studio 342,384, limit +100 bytes each: K1/K2 change chain-panel / route-card, which may be lazy:
MUST BE MEASURED); (6) docs: PROGRESS step T section, TEST_STRATEGY (projects, workers, the sleep rule "no new waitForTimeout; wait
on state", WebKit pool, review project, ORN_REUSE_SERVERS, ORN_E2E_WORKERS), plan row T (add after row C in IMPLEMENTATION_PLAN.md),
PROJECT_STATE (next: 8.5); (7) commit "phase-T: ..." (check must pass), deploy per docs/RELEASE.md (Study, live specs Chromium +
WebKit, Studio, Access check), push; (8) REPORT in the format of the prompt.
STEPS FOR THE NEW SESSION:
 1. Read CLAUDE.md, docs/PROJECT_STATE.json, this file, and "Claude outputs/ORN_SONNET_T_PROMPT.md" (CLOSE + REPORT sections).
 2. git status: the working tree holds all the step T changes UNCOMMITTED unless a "phase-T" commit exists (git log -3).
 3. Speed check (5e7 loop), then `npm run check` (twice more if the third green run is wanted).
 4. Build both editions fresh (../T-rebuild.sh does: stop my previews, rebuild Studio + Study, start them on 4173/4174; it lives
    next to the repo, recreate it from tests/e2e notes if missing: studio build; publish-dataset + study build with ORN_OUT_DIR=dist-study-e2e
    and the ORN_PUBLISH_DIR / ORN_PUBLISHED_DIR / ORN_NOW env of playwright.config.ts; previews with --strictPort).
 5. Full run: `ORN_REUSE_SERVERS=1 node scripts/run-e2e.mjs` (or without the env to let the config start and build the servers).
    Any failure: fix by its cause (the rules at the top of the prompt), re-run that spec file in its engine. Record before/after times.
 6. Measure sizes, write the docs of item (6), commit, deploy, push, write the REPORT.
Throwaway files kept OUT of the repo: ../T-run-subset.sh, ../T-subset.txt, ../T-*.log, ../edit-*.cjs (can be deleted).
CHECKPOINT COMMIT (2026-11-21): `npm run check` green with all of the above: 838 files / 8830 tests, 728 s (machine busy; run 1 was 655 s).
Fixes found by that check: the throwaway dist-studio-relaxed folder broke eslint (deleted; never keep a dist-* folder that is not in
eslint ignores), and the WebKit wipe may not name localStorage / sessionStorage (lint rule; the app uses neither) - removed.
So far: 2 green check runs after the pure project (655 s, 728 s). Not pushed, not deployed.

## SECOND CHECKPOINT (2026-11-22): PROOF RUN ATTEMPTS 1-5, FIXES FOUND - HOW TO RESUME
The full 3-engine proof run was tried 5 times; each attempt found failures that were fixed by cause and the run restarted on the final code
(a proof must be ONE clean run of the final code). Logs live next to the repo: ../Tproof-attempt1..4/ (and ../Tproof/ = attempt 5).
RESUMABLE SCRIPT: ../T-proof.sh (recreate if missing): for p in chromium firefox webkit chromium-serial firefox-serial webkit-serial:
`node scripts/run-e2e.mjs --project=$p > ../Tproof/$p.log`, write ../Tproof/$p.done on rc 0, stop at the first failure, log secs to summary.txt.
Attempt 5: chromium 456 passed / 1 failed (full-map-table:35, now fixed); firefox, webkit and the serial projects NOT yet complete.
Before attempt 6: `mkdir -p ../Tproof-attempt5 && mv ../Tproof/* ../Tproof-attempt5/` then run ../T-proof.sh in the background (about 15 min chromium, 17 min firefox; webkit and serial unknown).
FIXES (all in the checkpoint commit that contains this section):
 TEST RACES (test waited for the wrong thing): app-essentials (demo() + toast test use viewSettled and wait for Record menu; not-found waits for
 #/reactions so the address is live), exam-first-run:72 (skipTour; the first-run tour covers the Modes bar under load), phone-syllabus and
 phone-reagents (allTextContents does not wait: wait for the Show: select), study-edition:118 (File menu gone before Esc; cause UNPROVEN, 0 of 15 alone),
 full-map-table:35 (menu gone + viewSettled before the canvas right-click: the menu was closed ~200 ms later by a late map change; was 6/40, 3/40 in the
 pre-T spec too, now 60/60).
 PRODUCT RACES (both pre-existing, found by the faster parallel run; each has a unit test written red first):
 1. src/app/window/use-address.ts: the effect wrote the old view's address back when a render came between Back moving the URL and the hashchange
    event (P4 spec: 2/40 and 1/40 even with the step C spec; now 100/100). Test: use-address.test.tsx "does not write the old view back ...".
 2. src/app/window/address-gate.tsx: an address from the URL (e.g. after a reload) undid a view chosen before the lazy driver arrived (Firefox
    study-edition "Keep my data" 2/40 with and without fix 1; now 40/40). Test: address-gate.test.tsx "an address the reader came with does not undo ...".
 Both are product edits late in a test-speed step: DISCLOSE in PROGRESS and the report ("disclosed rule breaks"), owner review required.
STILL TO DO: (1) attempt 6, the full proof run; any failure: fix by cause, restart from scratch; (2) sizes: build both editions fresh,
`node scripts/initial-js-size.mjs`, limit +100 bytes per edition over Study 338,365 / Studio 342,384 (the two address edits may add bytes; over = STOP and report);
(3) `npm run check` once more if anything changes; (4) docs: PROGRESS step T section (with the 2 product fixes, flaky list state), TEST_STRATEGY
(projects, workers, "no new waitForTimeout; wait on state", WebKit pool, review project, ORN_REUSE_SERVERS, ORN_E2E_WORKERS, the wait-for-state lessons
above), plan row T after row C in IMPLEMENTATION_PLAN.md, PROJECT_STATE (next 8.5); (5) commit "phase-T: ...", deploy per docs/RELEASE.md (Study, live
specs Chromium + WebKit, Studio, Access check), push; (6) REPORT in the format of "Claude outputs/ORN_SONNET_T_PROMPT.md" (REPORT section).
