# Phase 4 close packet — workers and chemistry services (step 4.6)

Prepared by the implementing agent on 2026-10-02 for the human reviewer. Phase 4 has no gate (D6): the reviewer's verdict is
recorded in PROGRESS.md first, then a separate session tags `phase-4`. **This session did not mark Phase 4 complete and did not tag.**

Machine: Lenovo 83K1, Intel i7-13620H (16 logical cores), Windows 11, plugged in, one Edge window open and idle (not closed;
Creative Cloud and OneDrive idle in the background). Node 24.21. Measurements below are single runs unless stated.

## 0. Summary

- Part A (commit `babded2`): the step 4.5 review recorded (ACCEPTED, eight decisions), `REFRESH_CAP` 500 -> 250, SEARCH.md known limitation.
- Step 4.6: worker factories (`src/app/worker-factories.ts`), `npm run build:smoke` (`scripts/check-build.mjs`), the three DoD
  evidence items, coverage thresholds for chem, layout and search, the quiet-laptop runs, this packet.
- `npm run check` green as ONE command: 232 files, 3,728 tests (was 228 / 3,675 after Part A: +4 files, +53 tests).
- Build smoke: passed. Coverage thresholds: passed. `npm audit`: 0. Property at 200 runs: 179 / 179. Timing: 10 / 10.
  `bench:compare`: 198 entries measured, no entry over +20% p99.
- No schema change, no `CURRENT_SCHEMA_VERSION` bump, no contract change (`contracts.ts` untouched), no new dependency.
- One finding for the reviewer that is not a code defect: the real-thread timeout tests are sensitive to how Vitest schedules files
  (section 11, REVIEW REQUIRED 1).

## 1. Phase 4 Definition of Done (IMPLEMENTATION_PLAN §3)

| Row | Evidence |
|---|---|
| Workers restart after an induced crash | Real `worker_threads` thread, real host, thread ends itself on a named request (`workerData.crashOn`, tests only). Chem, layout, search: `tests/integration/worker-crash-recovery.test.ts` (3 tests). Compute (reused, not repeated): `tests/integration/compute-worker-threads.test.ts`, "a crash under an idempotent call: restart, the hook reloads the replica, ..." and "a crash under applyChanges: the replica is reloaded from the store, ...". Each shows `WORKER_CRASHED`, a `crash` and a `restart` event, a second thread, and the work going on (chem: retried parse answers from RDKit; layout: retried layout is real ELK, no fallback; search: index lost, `NOT_READY`, the next edit finds out and reloads once, answers equal a fresh index; compute: replica reloaded from the store). |
| All worker APIs have in-process tests | `tests/adversarial/phase4-dod.test.ts` (28 tests): every key of `CHEM_SPECS` (6), `COMPUTE_SPECS` (14), `LAYOUT_SPECS` (2), `SEARCH_SPECS` (5) is named as a whole word in at least one test title (the `RpcMethodSpecs` type forces one entry per API method). It first failed for 8 methods; the tests existed but their titles did not name the method, so six titles were renamed to add it (section 12). |
| L4 findings for the demo's invalid species | `tests/integration/l4-service.test.ts`, describe "the demo dataset (Phase 4 DoD)", test "the demo's invalid species produces CHEM-001, as a WARNING of level 4; nothing else is an error or changed" (proved in step 4.3b); `docs/reviews/demo-chem-findings.md` is checked against the service by the next test in that file. |

## 2. Steps and commits

| Step | Commit | Subject |
|---|---|---|
| plan | `6d56b66`, `0f275df` | plan review and contracts fit scan; contract decisions (docs) |
| 4.1 | `e418347`, `408c852` | RPC library, ADR-034, worker dependency rules; review follow-ups |
| 4.2a | `6ba0bde`, `218e28b` | store accepts precomputed findings; follow-ups (test worker cap) |
| 4.2b | `1ad0c68`, `99597f2` | compute worker core; review recorded |
| 4.2c | `a89ff99`, `43c5c87` | import in the compute worker; follow-ups |
| 4.2d | `1982f27`, `57a297f` | snapshot decode and restore, boot, follower; review recorded |
| 4.2e | `577eda7`, `3cd59ec` | export in the compute worker; follow-ups |
| 4.3a | `bb4d84a`, `56a0a66` | chem adapter and SVG sanitiser; review recorded, ADR-035 |
| 4.3b | `130a722`, `d2e2edf` | L4 checks and service; follow-ups (CHEM-006, referrer re-checks) |
| 4.4 | `0303706`, `3bb60ca` | layout worker; follow-ups (ELK defaults, bundles, stress cap) |
| 4.5 | `a31d992`, `babded2` | search worker; review recorded, `REFRESH_CAP` 250 |
| 4.6 | the commit that adds this file | Phase 4 close |

## 3. Amendments and ADRs of Phase 4

ADR-034 (worker model and RPC rules: stateless engines, one replica, terminate to stop, retry once) and ADR-035 (CSP: no
`unsafe-eval` on the page; `new Function` only inside the chem worker, from RDKit's glue) are the two ADRs. ADR-007 gained a dated
line (ELK layered defaults, step 4.4). Contract amendments, all additive except where PROGRESS.md says otherwise (full text under
"Amendments" there): 4.1 RPC contracts and worker rules; 4.1 review `restartHookTimeoutMs`, `restart_hook_timeout`, `gave_up`; 4.2a
precomputed findings on `replaceState` / `reload`, `FINDINGS_MISMATCH`, `RULE_SET_ID`; 4.2b `ComputeWorkerApi` shapes, `replica_status`;
4.2c import, `snapshotBuild`, `adoptPending`, `dropPending`; 4.2d `snapshotDecode`, `validation_fallback`, `readSnapshotBytes`; 4.2e
`exportPlan` / `exportBuild` replace `buildExport`, `MissingAsset`; 4.3a `ToolkitFailureReason`, `DepictOutcome`; 4.3a review ADR-035
and SECURITY §4; 4.3b `checkSpecies` / `checkReaction` / `checkMechanism` / `matches`, `InvalidProblem`; 4.3b follow-ups `cipCounts`,
`L4Ports.indexes`, `L4Stats`; 4.4 `fallbackReason`, `notes`, layout caps, `layoutFallback`; 4.4 follow-ups `MAX_STRESS_NODES`; 4.5
`SearchDocument` fields, `SearchQuery.examVersionId`, `fromRevision`, `serialize` / `loadSerialized`. Step 4.6 adds none
(tooling, build configuration and test support only; recorded under Amendments in PROGRESS.md as a non-contract change).

## 4. Dependencies and licences (docs/DEPENDENCIES.md)

Added in Phase 4: `@rdkit/rdkit` 2026.3.6 (BSD-3-Clause, step 4.3a), `elkjs` 0.12.0 (EPL-2.0 OR GPL-3.0-or-later; EPL-2.0 used,
step 4.4), `minisearch` 7.2.0 (MIT, step 4.5). All exact pins. `npm audit`: 0 vulnerabilities (run in step 4.6). Nothing added in 4.6.

## 5. Build smoke (`npm run build:smoke`)

How the four entries are referenced: `src/app/worker-factories.ts` has four literal `new Worker(new URL('../workers/<name>/entry.ts',
import.meta.url), { type: 'module' })` calls (the form Vite recognises); `src/app/main.tsx` imports the module for its side effect so
the build transforms it (Vite emits the entries even though nothing calls the factories yet; Phase 5 does, D7). `vite.config.ts`
names the chunks: `worker-<dir>-<hash>.js` from the entry's directory, and `rdkit-glue-<hash>.js` for the one chunk whose modules
are all `@rdkit/rdkit` (plus the bundler's virtual modules). That naming is how the check identifies RDKit's glue chunk. A build
that merges RDKit into one of our chunks keeps an ordinary name and fails the scan, naming that chunk.

Result of the run (sizes from the script, KiB):

- CSP: `dist/index.html` carries the policy of SECURITY §4 exactly (read from the doc, entity-decoded), one meta tag, no inline script.
- `assets/worker-chem--fvgrXYq.js` 216.88, `worker-layout-D7qN0jUZ.js` 18.16, `worker-search-CslXk5dF.js` 153.09,
  `worker-compute-CMDF4c2o.js` 369.56.
- `assets/RDKit_minimal-boFmsFLJ.wasm` 7,161.23: separate, hashed, WASM magic bytes, named by the chem worker, nothing inlined.
- `assets/rdkit-glue-8icpKFQX.js` 62.32: the only chunk with `new Function` (2 sites, 0 `eval(`), only the chem worker refers to it.
- Scanned 7 JS chunks (index, four workers, glue, `elk.bundled-BnfkbB9k.js` 1.4 MB lazy chunk): `eval(` 0, `new Function` 0, `Function(` 0
  outside the glue. minisearch is inside the search worker chunk; ELK is its own lazy chunk. ADR-035 holds.
- The script has 16 tests on a fixture dist (`tests/integration/check-build.test.ts`); not part of `npm run check`'s command list
  (it is slow) but its test is. `npm run build:smoke` and `npm run test:coverage` are added to SONNET_HANDOFF §19 as phase-close and gate commands.

## 6. Tests and coverage

`npm run check`: 232 files, 3,728 tests, Vitest about 120 s. New in 4.6: `src/app/worker-factories.test.ts` (6),
`tests/integration/check-build.test.ts` (16), `tests/integration/worker-crash-recovery.test.ts` (3), `tests/adversarial/phase4-dod.test.ts` (28).

`npm run test:coverage` passed with chem, layout and search now under the 80% lines threshold (workers already were; `vitest.config.ts` and
the script's `--coverage.include` flags changed). Total: statements 96.39, branches 90.55, functions 97.98, lines 97.98. Per directory
(lines / branches): core 99.04 / 91.98; persistence 98.51 / 89.43; io 97.08 / 90.51; workers 96.46 / 86.40; chem 98.70 / 91.03; layout
100.00 / 96.69; search 97.68 / 90.57. Core is above 90 / 85; the rest are above 80 lines. (`contracts.ts` and `index.ts` are excluded, as before.)

## 7. Property, timing, audit, bench:compare (quiet laptop, plugged in, in the requested order)

1. `npm audit`: found 0 vulnerabilities.
2. `ORN_PROPERTY_RUNS=200 npm run test:property`: 17 files, 179 tests passed (101.6 s). No failure, so no seed to report.
3. `npm run test:timing`: 2 files, 10 tests passed.
4. `npm run bench:compare` (compare only; `bench:baseline` was NOT run; `baseline.json` untouched): 198 entries measured against the
   committed Gate C baseline (96 entries); "No entry regressed p99 by more than 20%". The 102 entries without a baseline are the Phase 3 stage
   rows and every Phase 4 bench (rpc, compute, restore, export, chem, L4, layout, search): reported as new, to get a baseline at Gate E.
   No Phase 2/3 entry was flagged, so nothing was re-run.

## 8. Phase 9 exception list (TEST_STRATEGY §6), updated

Gate C numbers are the median p99 of 3 runs (gate-c-packet §8). "This run" is the single `bench:compare` run of step 4.6, mean / p99 ms.

| # | Item | Gate C | Phase 4 effect and this run | Remedy |
|---|---|---|---|---|
| 2 | Class-hub parent move | 51.0 | untouched by Phase 4; not over +20% | `peerReads` on RTE-002/004 (Phase 9) |
| 3 | Review-status change, like-water hub | 21.6 | untouched; `dispatch` 12.6 / 18.8 in this run | structural (RVW-002 on ~1,000 referrers) |
| 5 | `validateTouched` without previous state | 34.9 / 41.5 | CLOSED in practice: the compute worker always passes the previous state (step 4.2b) | none |
| 6 | Writer `replaceReferences` on the 1,000-reaction hub | 216 | still validates on main: commit 170.1 / 199.6 this run (the worker is not on this path) | Phase 9 |
| 7 | Follower `applyRemote`, hub edit | 200 | 150.5 / 187.0 this run; with the worker's validation replayed as data 55.6 / 62.5 (step 4.2d measured -64%, qualifies, NOT built: needs a two-phase store API) | Phase 9: `prepareRemote` + `applyRemote(change, validation?)` as proposed in PROGRESS step 4.2d |
| 9 | Snapshot build / restore, `replaceState` on main | 395 / 1,621 | build is worker-side now (main stores bytes); restore in process 1,359.8 / 1,381.7 this run; through the worker main is blocked about 358 ms (receive 107 + `replaceState` 251, step 4.2d) | judged at Gate E |
| new | ELK layered, 400 nodes / 800 edges, 300 ms row | not measured | 4.4 follow-ups: raw 464-576 mean, bundled 425-462 mean; this run: acyclic 361.0 / 381.7, with cycles 532.4 / 560.5. Layout runs in the layout worker, never on the main thread (step 4.4 review decision 2) | Phase 9 exception under TEST_STRATEGY §6 (decided at the 4.4 review) |
| new | `prepareApply` validates the merged state a second time (preview already did) | not measured | worker code: 645.99 / 662.2 and 653.56 / 673.5 this run (dense, hub_explosion); 1.4-2.3 s in earlier, slower sessions; round trip 1,060 / 1,084. Off the main thread | Phase 9: reuse the preview's findings and indexes (`validateMerged`), openItem 63 |
| closed | class-hub rename 13.5, route search dense 12.3 | | not over 16 | none |

Machine drift is real (the same code read about 2x slower in the step 4.2d session than in this one), so a single run is not a median.

## 9. Gate E watch list

1. Main-thread cost of moving a whole state to or from the worker (D3): serialise on send 57 / 190 ms (mean / p99), receive of a
   decoded state 107 / 121 ms, merged state back 131 / 151 ms. Boot, restart, reload, restore only.
2. Restore through the worker: wall clock about 3.3 s against about 1.4 s in process; the main thread is free for about 2.9 s of it.
3. Search, full load on the main thread: building every document costs 193 ms with the indexes ready (870 ms with the indexes
   built too) at the design tier, above a frame, at boot, `replace`, `remote` and mismatch. Remedy candidate (4.5 review decision 6):
   build the documents in the compute worker.
4. Import preview, hub_explosion with every ID conflicting, against the 5,000 ms row (openItem 41).
5. The compute sync's backlog bounds (100 ChangeSets, 2,000 touched records) came from one bench session with 2.3x drift (openItem 60).
6. L4 over a design-tier store: 1,400 synthetic alcohols 3,206 / 3,266 ms in the worker; no structures in the generator's species, so no
   design-tier L4 bench of its own.
7. A restarted chem thread loads the 7.2 MB WASM again inside the 2 s call limit; on a slow or loaded machine the first call after a restart
   can be `timeout` (see section 11, REVIEW REQUIRED 1).
8. Real browser: the page CSP is enforced and the chem worker still starts; whether a host that applies a header CSP to workers gets a
   policy that allows `new Function` for the chem worker script only (ADR-035; the smoke check cannot prove runtime behaviour).
9. Baselines for the Phase 4 benches (`bench:baseline` at Gate E).

## 10. openItems sweep (PROJECT_STATE.json; item numbers are the position in the file before this step)

Mark: "CLOSED (step)" items are kept in the file, never deleted.

- **CLOSED by Phase 4 steps, already marked in the file:** 30, 31, 71 (4.2e), 74 (4.3b).
- **CLOSED in this step's edit of the file (text prefixed "CLOSED (step ...)"):** 55 (step 4.1 review: accepted), 57 (step 4.3b: Q10 b landed
  there), 58 (step 4.2b: replica == store proved by property test).
- **Half closed by step 4.6 (the half is marked "CLOSED (step 4.6)", the rest stays open):** 2, 73, 83 (the build smoke references
  the layout, chem and search entries and scans the ELK, RDKit and minisearch chunks).
- **Carried to Phase 5 (wiring, D7; `createWorkerFactories()` is the way to create the four workers):** 2, 3, 6, 25, 26, 37, 62, 65, 69, 70, 73
  (browser CSP proof), 76, 78, 79, 82, 83. Includes: the sync ports, status banners, restart hooks, `flush()` before reporting "done", Diagnostics
  of fallback reasons and sync status, the store giving the search sync the FULL indexes (4.5 review decision 7), derived formulas into search
  documents (decision 3), real-browser test of `browserWorkerPort` (56). Also 20, 22, 50.
- **Carried to Phase 6:** 9, 44, 51.
- **Carried to Phase 9:** 4 and 63 (`prepareApply` reuse), 16 and 17 (the exception list, section 8), 24, 54, 64 (`applyRemote` remedy), 59 (full index
  engine in the replica; reviewer to confirm or ask for lazily built full indexes), 5 (move the pure snapshot codec to a shared place, or keep the
  duplicate; byte equality is tested).
- **Gate E watch (section 9):** 7, 41, 60, 61, 66, 67; baselines for the Phase 4 benches: 56, 72, 77, 80.
- **Standing:** 10-15 (human review of demo chemistry and exam coverage; nothing is marked verified), 53, 68 (per-test resource limits),
  81 (demo findings document, regenerate with `node scripts/demo-chem-findings.mjs`).
- **Added by step 4.6:** the file-scheduling hazard of the real-thread timeout tests (section 11); the factories' side-effect import in
  `main.tsx` until Phase 5; the weak spot of the title-based completeness test (section 12, item 1).

## 11. Known limitations and REVIEW REQUIRED

**REVIEW REQUIRED 1 — real-thread timeout tests depend on file scheduling.** Six tests in `tests/integration/chem-worker-threads.test.ts` need a freshly
started thread to load RDKit inside the 2 s call limit (and, on battery, `compute-import-threads.test.ts` also timed out at 5 s). They pass alone (7 / 7 in
3.2 s) and passed in the full run of Part A. Later the full suite failed 4 to 6 of those chem tests in four consecutive full runs, one of them at the
committed Part A state with all my changes stashed, so not caused by 4.6. The machine was idle and plugged in, single-thread speed normal. Deleting Vitest's local
results cache (`node_modules/.vite/vitest`, not in git) made the next full run, and `npm run check`, pass. My reading, not proved: Vitest schedules files that
failed last time first, so the thread tests then start together with the cold transform of everything else and RDKit's start-up does not fit 2 s. I changed no
test, timeout or rule. Options: leave it and say so in SONNET_HANDOFF (clear the cache after a failed run); give the real-thread files their own Vitest project
run serially; or let a restarted thread's first call tolerate a cold WASM load. Your decision. An earlier, first failure (6 chem + 1 compute-import tests) happened
while the laptop was on battery; it passed after plugging in, with the cache as it was.

Known limitations (new in 4.6): the smoke check proves what is in the files, not what a browser does with them (the meta CSP is not
applied to dedicated workers; Phase 5 e2e). The eval scan is a regex over built text: it cannot see `Function` reached through
`constructor`, nor a string passed to `setTimeout`. RDKit's glue is identified by chunk naming from `vite.config.ts`; the name rule
depends on the entry directory being `src/workers/<name>/`. Induced crashes are thread exits, not a WASM out-of-memory or a native fault.
Earlier limitations (two-letter swaps not matched in search, `pinned` honoured by no layout algorithm, one pending slot per compute worker,
and the list in PROGRESS.md) are unchanged.

## 12. Self-review: what I would challenge as the reviewer

1. **The completeness test is weak for generic names.** `search`, `load`, `apply`, `layout`, `parse`, `depict` and `matches` are ordinary
   words and appear in many titles, so those rows pass without proving a test exercises that method. The strong form is runtime: the
   compute rig already records calls per method (`compute-rig.ts`); an equivalent recording client for the other three would let the test
   assert "each method was called in an in-process test". I did not build it.
2. **I renamed six existing test titles** (`chem/handlers.test.ts`, `compute-import-failures.test.ts` x3, `compute-import.test.ts`,
   `compute-restore.test.ts`) to add the method they already exercise. Bodies are unchanged. Check the diff if you doubt that.
3. **`importCancel` has no test that calls it by name**: it is exercised through `flow.cancel` / `driver.cancel`. The title now says so.
4. **The compute crash tests are reused, so the "one test file" is three workers plus two cited tests**, as the instruction allowed.
5. **The factories are kept alive by a side-effect import in `main.tsx`.** It is honest about being temporary, but it is app code that
   exists for the build. Phase 5 replaces it with a real use.
6. **`vite.config.ts` now carries chunk-naming logic.** It is small and tested through the smoke run only (a plugin-level test would be heavy).
   If Rollup ever splits RDKit's glue into two chunks, the check fails at "at most one glue chunk" rather than passing silently.
7. **bench:compare was one run, and Phase 4 benches have no baseline**, so "no regression" covers only the 96 older entries. Single-run p99 on a
   laptop is noisy; none was close to the +20% line that I looked at, but I did not list the margins.
8. **The test suite got a new ordering hazard visible** (REVIEW REQUIRED 1). It predates 4.6; 4.6 only surfaced it, and my fix attempts were
   limited to clearing a cache.
9. **The 4.5 review's SEARCH.md edit also changed "queued 500 at a time" to 250 in §6**; I checked the sync tests use the constant, not 500.
10. **No new invariant and no new ADV row was needed**; I did not re-derive INV coverage for steps that are closed. If you want a Phase 4 INV
    sweep like Gate C's, say so.
