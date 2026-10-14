# Gate E review packet — Phase 5 (UI and rendering)

Prepared 2026-10-14 (step 5.10b) for a reviewer who cannot see the repository. Everything below was produced or re-run in
the step 5.10b sessions (2026-10-13 and 2026-10-14); where a claim comes from a project document rather than from a run, it
says so. Not part of `npm run check` (`docs/reviews/` is reference material, like the earlier packets).

**Status: self-reviewed; human review pending.** The implementing agent does not mark a gate passed and does not tag
`phase-5` (CLAUDE.md §6). A separate session tags it only after the reviewer's verdict is recorded in `docs/PROGRESS.md`.

**Attribution.** "Reviewer" means the human reviewer as recorded in `docs/PROGRESS.md`. "I" means the implementing agent.

- Repository state: branch `master`; step 5.10b commits are listed in §14. No `phase-5` tag.
- Machine: Windows 11, i7-13620H, 15.7 GB, headless browsers (Playwright 1.63: Chromium 153, Firefox, WebKit), Node 24.21.0,
  Vitest 4.1.11. Speed check (3e8-iteration loop, `s += i & 7`): 601 / 603 / 619 ms at session start and 605 / 600 / 608 ms
  before `bench:baseline` (the machine was not slow). Earlier 5.10b sessions had an unknown machine speed (PROGRESS, part 2 MACHINE
  NOTE); the figures that depend on it are marked.
- Honest limits that apply to the whole packet: one machine; headless, software rendering; Playwright's WebKit on Windows is
  not Safari (a different port); FPS is requestAnimationFrame, not compositor frames; scripted input; the bench "p99" of 10-12
  samples is the worst sample and 221 of 235 baseline entries exceed the 25% spread rule.

## 0. Summary

| Item | Result |
|---|---|
| Gate E row (TEST_STRATEGY §6) | every clause has evidence (§1); two clauses carry a caveat (WebKit is not Safari; boot over its warm row, §5) |
| `npm run check` | green as ONE command: 386 files, 5,448 tests (part 3b) |
| Full e2e, three browsers (`npx playwright test`) | 345 passed, 2 failed, 13 skipped (29.6 min). Both failures are WebKit and passed on 3 of 3 immediate repeats (§2) |
| Pan / zoom | 59.4-59.9 fps, 0 React commits inside an LOD band, 0 long tasks over 50 ms (Chromium) |
| Cold boot, design tier, to the overview | Chromium 2,136 ms (row 2.5 s: inside); **warm 2,044 ms against the 1.5 s row: OVER**; Firefox cold 3,476 / warm 3,193 ms: over |
| Heap after boot (Chromium, page only) | 84-87 MB used (56 MB after GC) against 150 MB: inside |
| Initial JS | 386.22 kB gzip against 400: inside, 13.78 kB of room |
| Benches | 0 of 68 budgeted entries over budget (median p99 of 3); closest margin 87% of a row (§6) |
| `test:timing` / property at 200 runs / audit / build:smoke | 10 of 10 / 221 of 221 / 0 vulnerabilities / passed |
| Coverage floors | met in every area (§8) |
| Gate E | **pending**: packet written, no verdict, no tag |

## 1. The Gate E row, clause by clause

Source: `docs/TEST_STRATEGY.md` §6: "Shell, navigator, inspector, keyboard map, list view, a11y checks (axe) pass; 60 fps
pan/zoom at render budget; ADV-005 (glyph), ADV-012, ADV-033 in e2e; ADV-038 and ADV-039 browser halves (§5 notes)".
And `docs/IMPLEMENTATION_PLAN.md` §2, row 5.10b.

| # | Clause | Result | Evidence |
|---|---|---|---|
| 1 | Shell | pass | `tests/e2e/shell.spec.ts`, `smoke.spec.ts`, `app.spec.ts`, `lifecycle.spec.ts`, `narrow-width.spec.ts`; full e2e green in 3 browsers except §2 |
| 2 | Navigator | pass | `navigator.spec.ts`, `arrangement.spec.ts`, `arrows.spec.ts`, `family.spec.ts`, `exam-scope.spec.ts`; core tests `src/core/graph/navigator/*`; pipeline tests of 5.5a |
| 3 | Inspector | pass | `inspector.spec.ts`, `inspector-views.spec.ts` (all 22 kinds: `inspector-completeness.test.tsx`), `completeness.spec.ts` |
| 4 | Keyboard map | pass | `keyboard-walk.spec.ts`, `canvas-keyboard.spec.ts`, `touch-walk.spec.ts` (Chromium and WebKit), `canvas-touch.spec.ts` (Chromium only: skip says why) |
| 5 | List view | pass | `axe-screens.spec.ts` (List view, Unanchored, family page), the List / table component tests of 5.7, `keyboard-walk.spec.ts` |
| 6 | a11y checks (axe) | pass | `axe-screens.spec.ts` (first run, overview, List, Unanchored, family page, inspector levels, palette, import, export); axe runs inside navigator, arrangement, inspector-views, family and keyboard-walk specs; in the full run every axe line reads "0 serious or critical" |
| 7 | 60 fps pan/zoom at render budget | pass (Chromium, one machine) | §3. 59.4-59.9 fps, p99 frame gap 16.8 ms, 0 commits in a band, 0 long tasks |
| 8 | ADV-005 (glyph) in e2e | pass | `tests/e2e/arrows.spec.ts:155` "ADV-005: reactions from a family into itself are a loop with an arrowhead ..., with its count chip; the legend explains it" |
| 9 | ADV-012 in e2e | pass | `tests/e2e/navigator.spec.ts:264` "ADV-012 part 1: a hub with 1,000 reactions" (stays inside the render budget; DOM rows bounded: `inspector-views.spec.ts:126`, 60 rows) |
| 10 | ADV-033 in e2e | pass | `tests/e2e/hostile.spec.ts:30` ADV-033: hostile names, notes, a `javascript:` URL, a scripted SVG and a hostile file name are only text or an inert image; plus `csp.spec.ts` |
| 11 | ADV-038 browser half | pass | `tests/e2e/durability.spec.ts` (closing the context while "saving"; a killed renderer in Chromium: before or after, nothing quarantined) |
| 12 | ADV-039 browser half and INV-28 | pass | `tests/e2e/tabs.spec.ts:37` (tab 2 read-only and follows; closing tab 1 promotes tab 2, which can import), three browsers |
| 13 | Completeness of the Gate E rows | pass | `tests/adversarial/gate-e.test.ts` (rows named by ID in e2e titles) |

Plan-row 5.10b items beyond the TEST_STRATEGY row: pan/zoom FPS §3; no long task over 50 ms during interaction §3; cold boot §5;
heap §5; the synthetic L4 bench (1,400 structures) re-run §6 (746 / 760 ms mean / p99 in the worker); the nine Gate E watch
items of `phase-4-close.md` §9 §7; `bench:compare` then `bench:baseline` §6; `test:timing`, coverage, property at 200, audit,
build:smoke §8; INV sweep §9.

## 2. Test results

- `npm run check` (typecheck, lint, lint:deps, size, hardcode, colours, control-chars, bench-budgets, vitest): green, 386 files /
  5,448 tests, run as ONE command after part 3a and after part 3b.
- Full e2e (`npx playwright test`, Chromium + Firefox + WebKit, 360 tests, production build): **345 passed, 2 failed, 13 skipped**.
  Skips are by design and say so in the test: touch drags (Chromium only), `chrome://crash` (Chromium only), the private-window
  tests that apply to only one WebKit context mode, and the touch walk (not Firefox).
  The two failures, both WebKit:
  1. `arrows.spec.ts:131` hovered arrow: expected exactly 1 React commit for the overlay, saw 0 (the count was read too early or
     the commit was folded into another).
  2. `csp.spec.ts:95` eval and `new Function` refused: the expected `script-src` violation event with blocked URI "eval" was not
     seen (`[]`).
  Immediately re-run: one of the two failed once in a 2-test re-run (the output did not say which, I did not keep it), then 3 of
  3 repeats passed both. So both are intermittent in WebKit and I do not know the cause. They are timing-sensitive assertions on
  an event that WebKit may deliver late. REVIEW REQUIRED 2: treat as flaky, or fix the waits before Phase 6 (§12).
- Property suite at 200 runs: 25 files, 221 tests passed (81 s); no failing seed.
- `npm run test:timing`: 2 files, 10 tests passed.

## 3. Pan / zoom, long tasks (part 1a)

Production build, Chromium 153, 1280 x 800, overview of 60 nodes / 120 arrows, LOD 0, 10 s per run; FPS from in-page
requestAnimationFrame intervals; React commits counted through a fake DevTools hook installed before load (a positive control:
a click on a hub = 4 commits).

| gesture | fps | frame gap p99 / max | React commits | long tasks over 50 ms |
|---|---|---|---|---|
| pan (mouse drag, 574-582 moves), 2 runs | 59.4, 59.9 | 16.8 ms / 116.7 and 33.3 ms | 0, 0 | 0 |
| wheel zoom inside one LOD band (205 events), 2 runs | 59.8, 59.8 | 16.8 / 49.9 and 50.0 ms | 0 and 0 (run 1 counted 1, not reproduced) | 0 |
| wheel zoom across LOD bands 0 to 3 (216 events), 2 runs | 59.9, 59.8 | / 33.3 ms | 15 (each LOD change redraws the layers) + 1 settle 385 ms after the end | 0 |

The one 116.7 ms frame gap has no long task behind it and did not repeat. Verdict proposed in part 1: inside.

## 4. Browser interaction, import and boot long tasks

- Import in Chromium, by path (the harness cost of uploading a 17 MB buffer through the protocol is not the app's: closed by the
  reviewer): preview of a 15.8-16.9 MB file 0.9-2.4 s with the main thread 95% idle (parse and preview run in the compute worker);
  apply: 3 long tasks (99, 849, 90 ms), the longest `replaceState` 473 ms inclusive plus the persistence write (top self
  time: IndexedDB `put` 175 ms, Dexie mutate 133 ms, GC 56 ms, `postMessage` of the whole state 56 ms).
- Boot long tasks (Chromium, the same six in every run): about 75, 70, 267-328, 172-185, 173-210 and 74-93 ms, total about
  0.9 s (the same as the 903 ms of step 5.1d).

## 5. Boot, heap, three engines

Boot to the overview drawn (first `svg [data-node-id]` from navigation start), design tier (16.9 MB dense file with 60
navigator anchors), 5 runs each. COLD = a new browser process on a copy of a seeded profile with the HTTP and code caches
removed; WARM = the same copy again. Rows: 2.5 s cold, 1.5 s warm (TEST_STRATEGY / PERFORMANCE).

| engine | cold overview (mean / max) | warm overview | loadReplica answered (cold / warm) |
|---|---|---|---|
| Chromium | 2,136 / 2,167 ms (inside 2.5 s) | **2,044 ms (over 1.5 s by 544 ms)** | 1,621 / 1,541 ms |
| Firefox | 3,476 / 3,592 ms (over) | 3,193 ms (over) | 2,637 / 2,380 ms |
| WebKit, design tier | NOT MEASURED (the file could not be seeded in time; see §10) | | |
| WebKit, demo dataset | 803 ms | 1,997 ms | 471 / 1,669 ms |
| Chromium / Firefox, demo | 405 / 567 ms cold; 400 / 518 ms warm | | |

The rows are Chromium trace rows; no per-engine row exists for Firefox. Warm in WebKit with a tiny store is 2.5 times its cold
boot (a 1.1 s delay before the state is sent, in all 5 runs; not diagnosed).

> Correction (2026-10-14, reviewer, step 5.11a): the Chromium boot figures of this packet (cold 2,136 / warm 2,044 ms; loadReplica 1,621 / 1,541 ms) were taken in a session of unknown machine speed (PROGRESS, 5.10b part 2 MACHINE NOTE). The 5.11a figures, taken after a speed check, supersede them: Chromium cold 1,411 ms, warm 1,329 ms, inside both rows; exception #12 is NOT added. The figures above are kept as taken.

Heap after boot (Chromium only, CDP `Performance.getMetrics`, page heap; the workers' heaps are not in it): JSHeapUsedSize
84-87 MB (56.1 MB after a forced GC), JSHeapTotalSize 133-138 MB, in 10 boots; budget 150 MB (Gate F row): inside.

### 5.1 Boot phase breakdown (Chromium, design tier, 3 cold + 3 warm timelines, 2 + 2 CPU profiles)

| phase | at (cold, ms from navigation) | what the main thread does |
|---|---|---|
| open database | 199 -> 270 | idle |
| read the committed state (`records` + `meta`) | 277 -> 472 (195 ms) | idle |
| assemble the state, zod parse of every record | 472 -> about 690 | busy 150-220 ms |
| send the state to the compute worker | `loadReplica` sent 688 | 49-57 ms to serialise |
| compute worker: deserialise, freeze, index build, `validateAll`, findings | 688 -> 1,591 (903 ms; warm 888) | IDLE |
| create the canonical store: index `build`, `addRecord` | 1,621 -> about 1,800 | busy 165-250 ms |
| quarantine count read | 1,603 -> 1,834 (231 ms) | idle; "ready" only after it (1,804) |
| overview projection and layout request | 1,867 -> 2,050 | busy 165-180 ms |
| search: derived-cache reads, `worker-search.load` | 1,777 -> 2,166 (load 101 ms) | busy about 80 ms |
| first overview drawn | 2,071-2,165 in all 6 runs | |

Cold and warm differ by 0-60 ms: neither the HTTP nor the code cache is where the time goes.

Worker-side `loadReplica` (decision 5; Node, the same calls as `replica.ts`, 17,161 records; first run ≈ the browser's one
cold call): receive 55 ms, freeze 34, `indexEngine.build` 282, `validateAll` 448, `commitFindings` 21, counts 1, answer 3: sum
844 ms against the browser's 888-903 ms. Split: validation 53%, index build 33%, receive 6.5%, freeze 4%, rest 3%. Warm sum
706 ms. (Node timers, not a CPU profile of the worker.)

### 5.2 Boot remedy candidates (nothing built)

Needed: warm Chromium 2,071-2,092 ms to 1,500 ms = about 570-590 ms. Each candidate lists what the phase table says it can
save at most. They overlap; the numbers are NOT additive and none was prototyped.

| # | Candidate | Saves at most | Cost / risk |
|---|---|---|---|
| A | Read the quarantine count in parallel with `loadReplica` (and do not gate "ready" on it) | about 230 ms | none known; a small ordering change in boot |
| B | Draw the overview before `loadReplica` answers: build the store's indexes on main while the worker validates, adopt the findings when they arrive | up to about 650 ms of the 900 (minus the 165-250 ms index build that moves to the critical path) | UI shows data before its findings exist for under a second (the stored state passed validation when it was written); changes the "store needs its findings first" order of PERSISTENCE / D2, so an amendment |
| C | Send the raw rows to the worker and let it parse and validate (skip the 150-220 ms zod parse and the 49-57 ms serialise on main) | about 200-270 ms on the main thread | L1 parse moves to the worker; quarantine of bad rows must still be reported; amendment of the boot port |
| D | Make the worker faster: reuse one traversal for index build and `validateAll`; or cache the findings with the stored state (the precomputed-findings idea at boot, hash-checked) | up to most of 0.9 s | the largest change; findings caching risks a stale-findings class of bug (INV-12/18) |
| E | Start the compute worker earlier (at HTML parse) so its code load and RDKit-free start overlap the IndexedDB read | tens of ms | small |

**Recommendation:** do A and E in one small step (no architecture change), then re-measure; if warm is still over 1.5 s,
decide B against C with the reviewer, B being the larger saving and C the smaller, safer change. I do not recommend D before
Phase 9. Whether the 1.5 s warm row is the right row for a 17,000-record store on a laptop is the reviewer's decision (§12).

## 6. Benches (parts 3a)

`bench:compare` first (single run, 470 entries over the two Vitest projects, against the Gate C baseline of 96 entries): 24
flagged above +20% p99. Then `bench:baseline` (3 fresh processes; 235 entries; median of the three p99s): compared with the OLD
baseline, 1 entry of 96 is above +20%: `validateTouched` on the design-tier hub, hub_explosion, 6.62 -> 10.83 ms (row 16 ms;
spread 87%). The other 23 flags were single-run noise. **No entry is over its budget**: of 235 entries, 68 have a budget
(0 fail), 15 an informal one, 152 none.

Ten closest margins (median p99 of 3 / row):

| # | Entry | p99 / row | share |
|---|---|---|---|
| 1 | validateTouched, ADV-012 hub, review lifecycle changed | 43.5 / 50 ms | 87% |
| 2 | validateTouched, ADV-012 hub, no previous state | 40.2 / 50 | 80% |
| 3 | validateTouched, "like water" hub, review lifecycle changed | 38.5 / 50 | 77% |
| 4 | navigator overview, every hub expanded (informal 16 ms) | 11.8 / 16 | 74% |
| 5 | commit, move the class hub to another parent (~1,400 referrers) | 36.3 / 50 | 73% |
| 6 | validateTouched, "like water" hub, no previous state | 34.9 / 50 | 70% |
| 7 | validateTouched on the design-tier hub | 10.8 / 16 | 68% |
| 8 | legacy import parse -> preview, synthetic 5,000 reactions | 3,270 / 5,000 | 65% |
| 9 | projection reaction_explorer focused on the hub | 9.9 / 16 | 62% |
| 10 | grid index build, 2,000 nodes / 4,000 edges (informal 16) | 9.3 / 16 | 58% |

Figures over budget: none. Spreads of 70-94% on rows 1-3, 5, 6, 7 mean they are not tight figures.

Harness repairs that `bench:compare` needed (PROGRESS, part 3a; both stale test infrastructure): `compute-restore.bench.ts` had
`schemaVersion: 1` hard-coded (the schema is 2, so the worker said CORRUPT and the bench setup threw); `app-index-state.bench.ts`
had no budget metadata, so `bench-report` aborted. This means no one had run `bench:compare` since the schema bump: a gate
should include it.

## 7. The nine Gate E watch items of `phase-4-close.md` §9

| # | Item | Result |
|---|---|---|
| 1 | Main-thread cost of moving a whole state | send 57.0 / 147.7 ms (bench, mean / p99), 49-57 ms in the browser; receive of a decoded state 98.2 / 125.6; merged state back 82.1 / 140.2 (87 ms in the browser). Boot / restart / reload / restore only. Proposed: CLOSED, accepted |
| 2 | Restore through the worker | in process 1,325 / 1,404 ms (bench); through the worker end to end 3,262 / 3,362 ms; main thread blocked about 341 ms (receive 98 + `replaceState` precomputed 243). Browser: `loadReplica` round trip 888-903 ms with the main thread idle. Proposed: accepted |
| 3 | Search full load on the main thread | 260 / 299 ms (documents + first DerivedIndexes build); in the browser the search `load` is 81 ms on main, 101 ms round trip. Remedy (documents in the compute worker) NOT needed by this evidence; proposed: CLOSED, keep as Phase 9 candidate |
| 4 | Import preview, hub_explosion, every ID conflicting | **927, 912, 951 ms (and 939)** in Chromium by path for the DIFFERENT-content case (every one of 17,101 IDs conflicting, 0 identical), against the 5,000 ms row: inside by 5 times. Identical content (part 2b) 1,516-1,527 ms. Bench: 856 / 888 (hub_explosion), 1,170 / 1,223 (dense). Proposed: CLOSED |
| 5 | Compute sync backlog bounds (100 ChangeSets / 2,000 records) | no bench of its own; sync ordinary edit 0.05 / 0.13 ms, rename of the 1,000-referrer hub 0.05 / 0.13, a curriculum edit 106 / 135, replica hub edit 367 / 408. The bounds are untouched; nothing observed contradicts them. Proposed: accepted, carry to Phase 6 (edits arrive there) |
| 6 | L4 over a design-tier store | 1,400 synthetic species through the L4 service 746 / 760 ms in this session (3,206 / 3,266 ms in step 4.3b: the earlier session was about 2x slower; no code change identified). No design-tier structures exist in the generator. |
| 7 | A restarted chem thread reloads the 7.2 MB WASM inside the 2 s limit | chem cold start in Chromium 88-116 ms (5.1d); restart under load not re-measured in this step. Carried |
| 8 | Real browser: page CSP enforced, chem worker still starts | `csp.spec.ts` and `build:smoke` (CSP exact, `new Function` only in the RDKit glue chunk, ADR-035). One WebKit assertion of `csp.spec.ts` is intermittent (§2). Whether a host that applies a header CSP to workers allows `new Function` for the chem worker script only is not provable here: unchanged |
| 9 | Baselines for the Phase 4 benches | done: `tests/perf/baseline.json` holds 235 entries (Phase 3, 4, 5) |

## 8. Gate checks

- `npm audit`: found 0 vulnerabilities (no finding, nothing to ship-check).
- `build:smoke`: passed. Workers: chem 219.09 kB, layout 29.96, search 153.34, compute 372.70 (raw); WASM 7,161 kB separate;
  5 lazy chunks outside the initial load (views-other 6.61 kB gzip, import-inprocess 31.03, export-inprocess 1.91, import-screen
  4.64, export-screen 1.83); no chunk imports a worker entry (the WebKit double-evaluation rule); no source maps.
- Coverage (386 files, 5,448 tests; lines / branches): core 99.3 / 92.1 (floor 90 / 85); app/services 94.4 / 83.6 (floor 80);
  chem 98.7 / 91.4; io 97.1 / 90.5; layout 99.9 / 95.1; persistence 98.7 / 89.9; render/scene 99.0 / 93.3; render/svg 100 /
  94.4; render/viewport 98.9 / 93.0; search 97.7 / 91.2; workers 97.3 / 88.5; total 98.05% lines, 90.75% branches. Under 80%
  lines: worker `entry.ts` / `host.ts` files and `wasm-url.ts` (0%: they run only in a real worker; e2e covers them),
  `app/services/replica.ts` 75.5%, `persistence/lock.ts` 75% (Web Locks; `tabs.spec.ts`), `workers/compute/snapshot-build.ts`
  71.4%. UI components have no line target (TEST_STRATEGY §1).

### 8.1 Initial JS 386.22 kB gzip (budget 400; room 13.78)

Growth by step (kB gzip): 5.2 312.7; 5.5d 372.55; 5.6b 391.38 (over the 390 line, then 354.29 after lazy views at 5.7); 5.8
367.89; now 386.22. Top modules of the entry chunk by rendered (pre-minify) bytes: react-dom-client 644,593 (25.4% of the
chunk); dexie 97,094; zod core schemas 79,593; @tanstack/virtual-core 47,298; fflate 41,542; zod classic schemas 33,082; zod
json-schema-processors 28,688; zod to-json-schema 28,552; zod util 27,570; floating-ui core 27,062; immer 26,579; floating-ui
dom 26,114; radix react-menu 23,482; radix react-tooltip 19,838; react 19,185. Groups: react-dom 25.7%, zod 10.7%, dexie 3.9%,
core/validation 3.6%, features/navigator 3.3%, app/services 3.0%, features/inspector 2.8%.

Lazy candidates, MEASURED by a throwaway edit and a build (reverted; nothing kept):
1. The four inspector views still static (species, class, reagent, reaction) into the lazy `views-other` chunk: -7.16 kB
   (386.22 -> 379.06). The other 18 kinds are already lazy.
2. The palette (Palette + cmdk + Radix pieces) behind `React.lazy`, mounted while open: -9.03 kB (386.22 -> 377.19), plus a new
   10.08 kB gzip chunk loaded at the first open.
Not measured (estimates from the module sizes): fflate and export / import helpers about 6 kB; the rest of `io/legacy-v6` still
in the entry (35.7 kB rendered) about 5-6 kB; zod's JSON-schema code (57 kB rendered, no caller in `src`) about 8 kB if it can be
tree-shaken. Recommendation: nothing for Gate E; the two measured candidates are worth doing when a step takes the entry over
about 395 kB; the zod JSON-schema modules deserve a look first because they may cost nothing to remove.

## 9. INV sweep, Phases 4 and 5

Method: for each INV-01..30, the test files that name it in a test file (`grep INV-nn` in `src/` and `tests/` test files), then
which of them live in Phase 4/5 code (workers, app, features, render, layout, search, persistence, e2e, integration, property,
adversarial). A number named in a test is evidence that someone aimed a test at it, not a proof; where it matters I say what the
test does.

| INV | Touched by Phase 4/5? | Proof (Phase 4/5 part) | Gap |
|---|---|---|---|
| 01, 02, 03, 05, 06, 07, 08, 09, 13, 15, 16, 17, 30 | no (domain; Gate A/B) | Gate A/B tests (`invariants-gate-a`, `gate-a`, core tests) | none new |
| 04 | indirectly (replica, import apply) | `tests/property/commands.test.ts`; imports block on dangling refs (ADV-030) | none |
| 10 UI state never in records | yes (UI stores, panel persistence) | core schema tests (`document.test.ts`, `schema-mutations.test.ts`, strict schemas) | **no Phase 5 test names it**: the UI-state-in-`uiState` separation (5.2) is covered by persistence-boot tests that do not cite the INV |
| 11 derived data never stored | yes (layouts, depictions, indexes, search cache) | `schema-layering.test.ts`, `tests/property/related-reactions.test.ts`; derived data lives in `derivedCache` (tests of 5.1b) | **UI half not named**: no test says "a layout or a depiction is never written into a record" |
| 12 zero L1-L3 ERRORs in committed state | yes (replica, precomputed findings, import apply) | `tests/property/commands.test.ts`, `src/core/commands/store.test.ts`; import blocks on errors | none |
| 14 removing presentation leaves chemistry valid | yes (anchors, schemes, displays) | `navigator.test.ts`, `schema-layering.test.ts`, `validator.test.ts` | none new |
| 18 derived recomputable (incremental == full) | yes (Phase 4: replica, search, DerivedIndexes) | `tests/property/derived-indexes.test.ts`, `related-reactions.test.ts`, `commands.test.ts` (these name INV-18); the worker replica and search incremental-equals-rebuild properties (`tests/property/replica.test.ts`, `search-incremental.test.ts`) exist but do not cite the number | none; the projection hook's `sameProjection` is covered by counters, not by a property |
| 19 deterministic serialisation | yes (export UI, worker-built export / snapshot) | `snapshot-build.test.ts`, `snapshot-codec.test.ts`, `tests/e2e/export.spec.ts` (injected clock), property round trip | none (`exportedAt` follows the injected clock: openItem 160) |
| 20 persistence atomic | yes (write queue in the app) | `persistence-write-path.test.ts`, `app-services-writer.test.ts`, `persistence-roundtrip.test.ts`; browser: `durability.spec.ts`. NEW FACT: in Playwright's WebKit one apply transaction takes up to 270 s but completes, never aborts (§10) | none for atomicity |
| 21 imports atomic after confirmation | yes (import UI) | `import-model.test.ts`, `import-screen.test.tsx`, `import.spec.ts`, `gate-c.test.ts` | none |
| 22 bounded traversals | yes (navigator caps, virtual lists, search) | `navigator-truncation.test.tsx`, `notices.test.ts`, `navigator-scale.test.ts`, `inspector-views.spec.ts` (60 DOM rows for a 1,000-reaction family) | none |
| 23 no silent loss | yes (import, quarantine) | `adv-043-legacy-import.test.ts`, `persistence-boot.test.ts`; the UI shows quarantine and the WebKit "Applying the records" state is not silent (but see §10) | none |
| 24 validation never modifies data | yes (replica `freeze`s state; workers validate) | core tests (`validator.test.ts`, `l1.test.ts`); the replica deep-freezes its state (a mutation would throw) | **no Phase 4 test names it** for the worker; the freeze is the practical guard |
| 25 no branching on IDs or names | yes (every new file) | `check-hardcode.test.ts`, `npm run check:hardcode` (654 ids, 283 names) | grep-based; cannot see a name compared through a variable |
| 26 edges never deduplicated | yes (navigator pair bundles, arrows) | `projections.test.ts`, `navigator-pairs.test.ts`, `projection-harness.test.ts`; `arrows.spec.ts` | none |
| 27 undo / redo exact | no editing in Phase 5 (Undo import only) | `commands/undo.test.ts`, `tests/property/commands.test.ts`; "Undo import" in `import.spec.ts` | none for Phase 5 |
| 28 exactly one writer | yes (promotion, banners) | `write-queue*.test.ts`, `gate-c.test.ts`, `gate-e.test.ts`, `tests/e2e/tabs.spec.ts` (3 browsers) | none |
| 29 chemistry never references curriculum / presentation | yes (exam scope derived) | `schema-layering.test.ts`, `export-scope.test.ts`, `exam-scope.spec.ts` | none |

Gaps found: INV-10 and INV-11 (UI halves) and INV-24 (worker half) have no test that names them in Phase 4/5 code. I believe the
behaviour is covered under other titles, but I did not prove it and did not add tests (this step measures and reports).
Proposed: a short step before Phase 6 that adds three titled tests (§12).

## 10. The WebKit write finding

Parts 1, 2W of 5.10b; decisions 2026-10-14 (reviewer).

- Symptom: in Playwright's WebKit on Windows (not Safari), after Confirm the page stays on "Applying the records..." for minutes.
  Part 1 first read this as a stall; part 2W showed it is NOT stuck: the apply is linear in the number of records.
- Measurements (persistent context; time from Confirm to "Imported"): 0.5 MB (512 records) 10 s; 2 MB (2,050 records) 35 s;
  3.5 MB (3,584 records) 60 s; 16.9 MB (17,283 records) 276 s. About 15.5 ms per record. Chromium, same files: about 1 s for
  3.5 MB.
- Where: the one IndexedDB transaction `readwrite [records, meta, assetBlobs]` completes after 31.7 s (2 MB), 55.5 s (3.5 MB),
  270.5 s (16.9 MB); `derivedCache` writes queue behind it. No abort, no QuotaExceeded, no worker error; the page stays
  responsive (heartbeat every 500 ms).
- Cause, proven with raw IndexedDB and none of our code: N puts of 1 KB in one transaction: 200 puts 3,126 ms, 2,000 puts
  30,803 ms, 5,000 puts 77,200 ms (15.4 ms per put, linear), while ONE put of a 2 MB value takes 25 ms. In this WebKit build the
  cost is per put REQUEST, not per byte. The app writes one object-store row per canonical record (about 17,000 puts). Chromium:
  10 / 88 / 244 ms and 23 ms.
- Does the UI give up? No: the message stays; there is no timeout and no progress figure; the import ends with the normal
  "Imported" notice. It is not a silent failure, but a user sees minutes of an unchanging line.
- Reviewer decisions (2026-10-14): (3) NO schema change is decided until real Safari is measured; openItem "Before release:
  import a 2 MB file in real Safari (macOS or iOS), Confirm to Imported, and decide the write remedy (fewer larger values vs
  slices)". (4) A long apply must show progress: any apply longer than 2 s shows "Applying the records... N of M" updated at
  least once a second, in every engine, whatever real Safari shows; built in its own step after Gate E (openItem
  "-> step after Gate E"). Nothing is built in 5.10b.
- Not done: WebKit at the design tier (boot figures), WebKit warm-boot trace (2.5x cold with a tiny store).
- Related (step 5.10a review): WebKit evaluates a worker ENTRY module a second time when a dynamic chunk imports code from it;
  build:smoke rule 7 forbids it.

## 11. Proposed Phase 9 exception list (TEST_STRATEGY §6 general rule)

Numbers are the median p99 of 3 fresh-process runs in part 3a unless noted. The Gate C list (openItem 46) is brought up to date.

| # | Item | Gate C | Now | Remedy / status |
|---|---|---|---|---|
| 1 | Class-hub parent move | 51.0 ms | 36.3 ms (row 50): now inside | none needed; was over 50 at Gate C (noise 70%) |
| 2 | Review-status change on the like-water hub (validateTouched, field referrers read) | 21.6 | validateTouched 38.5, dispatch 19.1 | structural (RVW-002 on ~1,000 referrers); keep as exception |
| 3 | validateTouched without previous state (the safe fallback) | 34.9 / 41.5 | 40.2 (ADV-012) / 34.9 (like water) | closed in practice: the compute worker always passes the previous state |
| 4 | Writer `replaceReferences` on the 1,000-reaction hub | 216 | 173.6 | Phase 9 |
| 5 | Follower `applyRemote`, hub edit | 200 | 168.3 (82 with the validation replayed as data) | Phase 9: `prepareRemote` + `applyRemote(change, validation?)` |
| 6 | Snapshot build / whole restore on main | 395 / 1,621 | build 259 p99 (worker-side, main stores bytes); restore through the worker blocks main about 341 ms | judged here: accept (the worker did what Phase 4 meant) |
| 7 | Navigator overview, EVERY hub expanded, dense | 25.0 p99 (5.4c) | 11.8 p99 (informal 16: inside) | withdrawn |
| 8 | Filtered navigator overview | about 23 p99 | not re-measured | Phase 9, as decided at 5.4c |
| 9 | ELK layered 400 nodes / 800 edges | 464-576 mean (4.4) | acyclic 325 / 335 p99; with cycles 426 / 448 (row 300) | layout runs in the layout worker, never on main; exception stays (decided at 4.4) |
| 10 | `prepareApply` validates the merged state a second time | 1.4-2.3 s | worker 597 / 657 (dense), 567 / 637 (conflicting); round trip 826 / 846 | Phase 9: reuse the preview's findings |
| 11 | DerivedIndexes apply after a hub-wide edit | 206 / 223 | 200.7 / 210.9 | Phase 9 |
| 12 | Boot, warm, Chromium, design tier | n/a | 2,044 ms against 1.5 s | NOT proposed as an exception: see §5.2 and §12 |

## 12. Proposed fixes before Phase 6

1. **Boot warm over its row** (Chromium 2,044 vs 1,500 ms; Firefox over both rows): a small boot step (candidates A and E of §5.2),
   then re-measure; B or C if still over. Reviewer decides whether to fix before Phase 6 or take the row as a Phase 9 exception.
2. **Two intermittent WebKit e2e assertions** (§2): fix the waits so a Phase 6 CI is not red by chance.
3. **Progress for a long apply** ("Applying the records... N of M"): decided, its own step after Gate E. Proposed to come
   before Phase 6 because Phase 6 adds more writes.
4. **Three titled invariant tests** (INV-10, INV-11 UI half, INV-24 worker half): short, no behaviour change.
5. **Bench hygiene**: run `bench:compare` in every phase-closing step (two harness files had gone stale unnoticed).
6. Not before Phase 6: real-Safari check (before release); the lazy candidates (§8.1); the zod JSON-schema tree-shaking look.

## 13. openItems sweep (PROJECT_STATE.json; positions as in the file at this commit)

This step changes the file only as follows. Closed by reviewer decision (2026-10-14): item 156 (the 3,707 ms preview task: a
harness cost, proven; the 2,644 ms apply block: not reproduced at full speed, longest 849 ms). Added: the real-Safari openItem
and the progress-step openItem. Closed by this gate's measurements, as PROPOSED CLOSED (the reviewer's verdict makes it final;
text kept, "CLOSED (step 5.10b...)" prefixed): 70 (conflicting preview: 912-951 ms against 5,000), 85 (rpc bench baseline
exists), 101, 106, 109 (compute-export, chem, chem-checks baselines exist), 139 (initial JS re-measured: 386.22 kB), 144
(frame-rate watch: met, 59.4-59.9 fps).

Still open, with the gate's finding:
- Boot: 133 (boot long tasks 903 ms; cold 1.6 s was the 5.1d figure, now 2.1 s; warm over): carried to the boot step.
- Initial JS: 0, 3, 7, 15, 148, 151 (lazy candidates measured, §8.1): carried as a watch with 13.78 kB of room.
- 11, 13 (navigator edges, every-hub-expanded 25 ms): re-measured, informal 16 ms inside (11.8 p99); proposed CLOSED at the reviewer's pleasure (not changed here).
- 20, 24, 27, 36, 95, 96, 116, 126 (main-thread parts of import apply, search document build, first DerivedIndexes build, restore
  wall clock): measured in §4, §7; none exceeds a stated row; proposed accepted, to be closed with the verdict.
- Phase 6 / Phase 9 / later items (38-42, 56, 73, 76, 80, 118-120, 132, 154 and the Phase 9 exception items 28, 45, 46, 88, 92,
  93): untouched.
- Review-required questions of earlier steps (152, 153, 157, 158, 161, 164): untouched.

## 14. Commits of step 5.10b

Part 1 `0c8b2c4`, part 2 `831ae8f`, part 2W `5102a1f` (earlier sessions); this session: decisions `698ca0f`, part 3a `1b5dea5`, part
3b `29688e4`, packet (this commit).

Harness and spec changes in this session (nothing in `src/`; no budget, threshold, run count or timeout changed):
- `tests/perf/compute-restore.bench.ts`: `schemaVersion` from `CURRENT_SCHEMA_VERSION`, not the literal 1 (stale after the schema bump).
- `tests/perf/budgets-app.mjs`, `tests/perf/app-index-state.bench.ts`: six informal entries (`budgetMs: null`) and a template-literal
  bench name so `check:bench-budgets` sees them.
- `tests/perf/baseline.json`: regenerated (235 entries).
- `tests/e2e/kit.ts`: files over 1 MB uploaded by path (reviewer decision 2). Specs that go through the helpers: app, arrangement,
  axe-screens, durability, family, import, inspector-views, keyboard-walk, navigator, shell, tabs; those with a file over 1 MB: app (one
  test), durability, family, inspector-views, keyboard-walk, navigator, tabs.
- `tests/measure/import-conflict.measure.ts`: `ORN_CHANGE=1` (decision 6), longer preview text. New `tests/measure/load-replica-split.measure.ts`
  (decision 5).

## 15. REVIEW REQUIRED

1. Warm boot over its row (Chromium 2,044 vs 1,500 ms; Firefox cold and warm over their rows): fix before Phase 6, or move the row?
   And is a per-engine row wanted for Firefox / WebKit?
2. Two WebKit e2e assertions are intermittent (`arrows.spec.ts:131`, `csp.spec.ts:95`): flaky-as-is, or fix now?
3. Closure of the openItems listed as "proposed CLOSED" in §13.
4. INV-10 / INV-11 / INV-24: add three titled tests before Phase 6?
5. Whether a timestamp-only difference should count as a conflict in an import (my first conflicting-preview attempt changed only
   `provenance.updatedAt`; I did not read what the preview said about conflicts for it, and then used `tags`).
6. The Phase 9 exception list of §11, in particular #6 (snapshot restore judged "accept") and #12 (boot not an exception).

## 16. Self-review: what I would challenge as the reviewer

- **Single-machine, headless, scripted.** Every browser figure comes from one laptop. FPS is rAF-based; "60 fps" says the main
  thread kept up with the scripted input, not what a compositor drew. A real device, real touch and real Safari are untested.
- **The boot remedy table is arithmetic, not experiment.** The savings are upper bounds read off the phase table; nothing was
  prototyped, and the candidates overlap.
- **The worker-side split is from Node, not the worker.** Its cold sum (844 ms) matches the browser (888-903 ms), which is the
  evidence it is representative; it is not a profile of the real worker thread.
- **Noise.** 221 of 235 baseline entries exceed the 25% spread rule; "p99" of 10-12 samples is the maximum. Rows 1-3 of the margin
  table are therefore indicative; a different run could flip their order. The 24 single-run flags were noise, I judged by re-running
  `bench:baseline` and comparing medians, not by re-running only the flagged benches.
- **e2e flakes.** Two WebKit failures I could not reproduce reliably and did not explain. I did not touch them.
- **INV sweep is by name.** "A test names INV-nn" is weaker than "a test proves INV-nn"; for the three gaps I say so rather than
  claim coverage I did not check.
- **Lazy candidates were measured one at a time**, not as a pair, and only by gzip size, not by what the user waits for at the first
  open of the palette or of a species inspector.
- **Comparison with part 2b.** The conflicting-preview case with different content (930 ms) is faster than the identical-content case
  of part 2b (1,520 ms) only because the sessions ran at different machine speeds; I did not re-run the identical case. Do not read
  it as "different content is cheaper".
- **Things I did not do:** WebKit at the design tier; WebKit warm-boot trace; Firefox long tasks (no API); heap in Firefox / WebKit;
  restart of the chem thread under load; a real-Safari run.
- **Process.** The first `bench:compare` aborted on two stale harness files; I repaired them (tests/perf only) instead of stopping,
  because without them no Phase 4 or 5 baseline could exist. If the reviewer would rather have had those repairs in their own
  commit, they are in the same commit as the baseline (`1b5dea5`).

## 17. Reviewer verdict

Gate E review recorded (reviewer, 2026-10-14)

1. Verdict: PASS WITH CONDITIONS. Every clause of the Gate E row has evidence (packet section 1). Gate E closes, and phase-5 is tagged, only after steps 5.11a and 5.11b are green and the reviewer confirms. PROJECT_STATE gate E: status "conditional", note "closes after 5.11a and 5.11b"; nextStep 5.11a. No tag.
2. New rows in docs/IMPLEMENTATION_PLAN.md section 2 after 5.10b: 5.11a "Gate E follow-ups: WebKit flakes, boot A and E, INV-10/11/24 tests, zod JSON-schema look" and 5.11b "Long apply progress (Applying the records... N of M)".
3. REVIEW REQUIRED answers (packet section 15):
   (1) Boot: candidates A and E in 5.11a, then re-measure; if Chromium warm is still over 1.5 s it becomes Phase 9 exception #12 with candidate B as its remedy. No architecture change before Phase 6. The boot rows are Chromium rows; Firefox and WebKit boot are REPORTED, not gated, until Phase 9 (dated line in TEST_STRATEGY section 6 and PERFORMANCE_ARCHITECTURE).
   (2) The two WebKit flakes (arrows.spec.ts:131, csp.spec.ts:95): fixed in 5.11a.
   (3) The "proposed CLOSED" openItems of packet section 13 (70, 85, 101, 106, 109, 139, 144) are CLOSED; also CLOSED as accepted: 11, 13, 20, 24, 27, 36, 95, 96, 116, 126. Text kept, never deleted.
   (4) INV-10/11/24 tests: yes, in 5.11a.
   (5) A difference only in provenance (e.g. updatedAt) IS a conflict: PERSISTENCE section 8 defines identical as canonical deep equality, and the default resolution is non-destructive. No change.
   (6) The Phase 9 exception list of packet section 11 is accepted as proposed: #1 and #7 withdrawn (inside), #3 closed in practice, #6 accepted, #12 per answer (1).
4. Standing rules (dated 2026-10-14): bench:compare runs in every phase-closing step (TEST_STRATEGY section 6 general rule). Phase 6 editors are lazy chunks (React.lazy per editor); the measured lazy candidates of packet section 8.1 are done when the entry passes 395 kB gzip (note at the top of the Phase 6 section of the plan).
5. Not before Phase 6: the real-Safari openItem (before release), the WebKit warm-boot trace (folded into the real-Safari check), chem restart under load (Phase 9).

6. Correction (2026-10-14, reviewer, step 5.11a): the Chromium boot figures of this packet (cold 2,136 / warm 2,044 ms; loadReplica 1,621 / 1,541 ms) were taken in a session of unknown machine speed (PROGRESS, 5.10b part 2 MACHINE NOTE). The 5.11a figures, taken after a speed check, supersede them: Chromium cold 1,411 ms, warm 1,329 ms, inside both rows; exception #12 is NOT added. The figures above are kept as taken.
