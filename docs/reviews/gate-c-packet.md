# Gate C review packet — Phase 3 (persistence, import/export, legacy)

Prepared 2026-09-30 (step 3.12) for a reviewer who cannot see the repository. Everything below was produced or
re-run in the step 3.12 session; where a claim comes from a project document rather than from a run, it says so.
Not part of `npm run check` (`docs/reviews/` is reference material, like the Gate A and B packets).

**Status: self-reviewed; human review pending.** The implementing agent does not mark a gate passed and does not tag
`phase-3` (CLAUDE.md §6, SONNET_HANDOFF.md §20). A separate session tags `phase-3` only after a human reviewer records
a **passed** verdict in `docs/PROGRESS.md` ("Gate C review: verdict pending (reviewer)").

**Attribution convention.** "Reviewer" means the human reviewer, as recorded in `docs/PROGRESS.md` (step reviews,
"Phase 3 contract decisions", "Phase 3 plan review"). "Sonnet" means a choice the implementing agent made itself.

- Repository state: branch `master`, working tree clean at the start of the step; 30 commits since tag `phase-2`
  (steps 3.1-3.11c, their review follow-ups, two docs commits, the step 3.11c review commit `565c4ce`). No `phase-3` tag.
- Toolchain: Node 24.21.0, npm 11.19.0, TypeScript 6.0.3, Vitest 4.1.11. Phase 3 dependencies: `dexie`, `fflate`,
  dev `fake-indexeddb`.
- **Benchmark conditions (stated as required).** Before `bench:baseline` no other `npm test` / `vitest` / `bench`
  process was running (checked with a process list: the only `node.exe` was an Adobe Creative Cloud helper, not ours).
  **Microsoft Edge was open (9 processes, idle)** and the machine is a developer workstation. `baseline.json`'s
  generated `runner` text says "no other heavy applications open"; Edge was open, so read that sentence with this
  caveat. One earlier shell command of this session (a hung `python3` probe, presumably idle) was still alive during
  `bench:compare`; it was killed by its timeout later. Nothing else ran during the three baseline runs.

## 0. Summary

| Item | Result |
|---|---|
| Gate C rows named in test titles | **all 19 rows titled** (11 ADV, 5 INV, 3 P); 3 titles tightened and a permanent Gate C completeness test added (§2) |
| `npm run check` | green: **158 files, 2,606 tests** (Part A: 157 / 2,586; +20 Gate C completeness tests) |
| Coverage (`npm run test:coverage`) | thresholds met: `src/core` 98.89% lines / 91.83% branches; `src/persistence` 99.11% / 90.11%; `src/io` 97.05% / 90.15% |
| `npm audit` | 0 vulnerabilities |
| `npm run test:timing` | 10 / 10 pass (first run) |
| `bench:compare` vs Phase 2 baseline | no Phase 2 regression after one re-run of one flagged entry (§5) |
| Budgets (median p99, 3 fresh-process runs) | export < 2 s **pass** (0.2 / 0.5 s); import 5k < 5 s **pass** (1.0-1.3 s; legacy synthetic 5k 4.0 s); commit rows **pass** except structural hub edits, listed as Phase 9 exceptions (§7, §8) |
| New over budget | none new; the class-hub parent move reads 51.0 ms against the 50 ms row (already a Gate B exception, was 46.0) |
| Gate C | **pending**; packet written, no verdict, no tag |

## 1. What Gate C requires

Source: `docs/TEST_STRATEGY.md` §6 (Gate C row) and `docs/IMPLEMENTATION_PLAN.md` step 3.12.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Dexie adapter, write queue, boot integrity, snapshots, multi-tab lock | **pass** | steps 3.1-3.4; §2 rows ADV-038/039/040/041/045, INV-20/28, P-01 |
| 2 | Import/export incl. `.ornpkg` | **pass** | steps 3.5-3.7; ADV-030/031/032/035/042, INV-19/21, P-02 |
| 3 | Migrations framework | **pass (framework form)** | P-03 framework form, Phase 3 note 1: no schema bump, no production step |
| 4 | v6 dry run on both fixtures with zero `notImported` | **pass** | step 3.11c; ADV-043; `data/fixtures/legacy-expected/` |
| 5 | ADV rows marked C pass | **pass (titled and green)** | §2 |
| 6 | Benchmarks meet budgets (general performance rule) | **met under the rule; exceptions listed** | §6-§8 |

## 2. Matrix: Gate C rows (title-level scan)

Method: an ID counts only when it appears in a `describe` / `it` / `test` title (`tests/adversarial/gate-matrix.ts`);
the scan lists each ID's test files and titles. All tests named below passed in the `npm run check` of this step
(158 files, 2,606 tests). **New:** `tests/adversarial/gate-c.test.ts` runs the completeness check for Gate C (11 ADV rows
from `docs/TEST_STRATEGY.md` §5 whose Gate column is "C", plus INV-19, 20, 21, 23, 28 and P-01, P-02, P-03): 20 tests.

| Row | Test file (title) | Status |
|---|---|---|
| ADV-030 dangling references in an import | `src/io/import-session.test.ts` (ADV-030: dangling references block confirmation until resolved) | pass |
| ADV-031 wrong ID prefix / wrong-kind ref | `src/io/import-adv031.test.ts` (ADV-031: wrong ID prefix / wrong-kind reference) | pass |
| ADV-032 (io part) 60 MB, depth 100, 5 MB string | `src/io/json-caps.test.ts` (depth-100 rejected fast; 5 MB string rejected fast); `src/io/import-source.test.ts` (byte cap without reading the Blob; depth; 5 MB string; package byte cap) | pass |
| ADV-035 `__proto__` keys | `src/io/import-source.test.ts` (unsafe keys renamed, reported, `Object.prototype` untouched); `src/io/safe-json.test.ts` (sanitizeUnsafeKeys) | pass |
| ADV-038 (integration part) crash mid-write | `tests/integration/persistence-write-path.test.ts` (a write aborted mid-ChangeSet leaves the last committed revision) | pass; e2e half is Gate E |
| ADV-039 (integration part) two tabs | `tests/integration/persistence-follower.test.ts` (two tabs: second read-only, follows changes, promotes on close) | pass; e2e half is Gate E |
| ADV-040 quota exceeded while saving | `src/persistence/write-queue.test.ts` (write-path part); `src/persistence/write-queue-tasks.test.ts` and `tests/integration/persistence-snapshots.test.ts` (snapshot stage); `tests/integration/persistence-write-path.test.ts`; "export works after a failed save" in the step 3.5 export tests | pass |
| ADV-041 newer schema on disk / in file | `tests/integration/persistence-boot-migration.test.ts` (disk part); `src/io/import-envelope.test.ts`, `src/io/import-source.test.ts` (file part) | pass |
| ADV-042 import ID conflicts | `src/io/import-session.test.ts` (conflict analysis and the four resolutions) | pass |
| ADV-043 v6 import, hub SMILES, dangling IDs, duplicate names | `tests/adversarial/adv-043-legacy-import.test.ts` (13 tests) | pass |
| ADV-045 redo after migration / import | `src/core/commands/undo.test.ts`; `src/io/import-apply.test.ts`; `tests/integration/import-apply-persistence.test.ts` (import); `tests/integration/persistence-boot-migration.test.ts` (migration); `tests/integration/persistence-restore.test.ts` (snapshot restore) | pass |
| INV-19 deterministic serialisation | `src/core/dataset/document.test.ts`; `src/io/export-json.test.ts`, `src/io/export-package.test.ts` (**titles tightened, see gaps**); `tests/property/import-export-roundtrip.test.ts` (P-02 full (INV-19)); `src/persistence/snapshot-codec.test.ts` | pass |
| INV-20 persistence atomic | `tests/integration/persistence-write-path.test.ts` (one transaction per write, records + meta; one transaction covers asset record, blob and meta) | pass |
| INV-21 imports atomic after confirmation | `src/io/import-session.test.ts`, `src/io/import-apply.test.ts`, `src/io/import-legacy.test.ts` (legacy), `tests/integration/import-apply-persistence.test.ts` | pass |
| INV-23 (quarantine and legacy) | quarantine at boot: `tests/integration/persistence-boot.test.ts`; quarantine on import: `src/io/import-envelope.test.ts`, `src/io/import-apply.test.ts` (**titles tightened**); legacy: `compound-`, `reaction-`, `classify-completeness.test.ts`, `tests/adversarial/adv-043-legacy-import.test.ts`; framework: `tests/integration/migrations-framework.test.ts` | pass |
| INV-28 exactly one tab writes | 10 titled tests: `src/core/commands/remote.test.ts`, `src/persistence/write-queue*.test.ts`, `tests/integration/persistence-{boot,follower,follower-guards,markers,recovery,snapshots}.test.ts`, `tests/property/follower.test.ts` | pass |
| P-01 (IndexedDB) | `tests/property/persistence-roundtrip.test.ts` (P-01 save → load, IndexedDB variant); in-memory variant `tests/property/state-document.test.ts` | pass |
| P-02 (full pipeline) | `tests/property/import-export-roundtrip.test.ts` (export → import through the real importer → export byte-identical); `export-roundtrip.test.ts`, `document.test.ts`, `demo.test.ts` | pass |
| P-03 (framework form) | `tests/integration/migrations-framework.test.ts` (synthetic migration over a frozen synthetic fixture) | pass |

**Gate A/B regression line:** all Gate A and Gate B rows still green (the whole suite is green; Gate A completeness
in `tests/adversarial/gate-a.test.ts`, Gate B rows scanned at the Gate B tagging session).

**Matrix gaps found and closed (all title-level; no test behaviour changed):**
1. INV-19 had titled tests only in `src/core` and the snapshot codec; the export determinism tests
   (`.orn.json`, `.ornpkg`, fixed clock, byte-identical) and the P-02 full test did not name it. Titles now start
   "INV-19 export is deterministic…" and "P-02 full (INV-19): …".
2. INV-23 (quarantine) was titled only at boot; the two quarantine-on-import tests now say
   "INV-23 (quarantine on import): …".
3. There was no permanent Gate C completeness test (Gate A has one); `tests/adversarial/gate-c.test.ts` is new.

These are honest limits of a title scan: it proves each row is *named*, not that the test is sufficient. The
substance per row is in the table (which parts each test covers).

**Not a row but worth saying:** `tests/timing` holds 10 wall-clock tests from Phases 1-2; Phase 3 has no wall-clock
assertion. ADV-032's "rejected fast" is asserted structurally (the Blob is never read, no parse tree is built, no stack
overflow), not by elapsed time (decision of the step 3.3 review: elapsed-time assertions live in `tests/timing`).

## 3. Tests and coverage

- `npm run check` (typecheck, lint, lint:deps, check:size, check:hardcode, **check:control-chars (new)**, tests):
  **green, 158 files, 2,606 tests.**
- `npm run test:coverage` (Vitest v8; thresholds enforced: `src/core` 90% lines / 85% branches; `src/persistence` and
  `src/io` 80% lines). Whole run: 96.71% statements, 90.89% branches, 98.12% functions, 98.15% lines. Per directory
  (computed from `coverage-final.json`, unique statement lines, matches the whole-run line total 6,607 / 6,731):

| Directory | Lines | Branches | Statements | Functions | Threshold | Met |
|---|---|---|---|---|---|---|
| `src/core` | 98.89% (3,019 / 3,053) | 91.83% (2,069 / 2,253) | 97.35% | 98.35% | 90 / 85 | yes |
| `src/persistence` | 99.11% (889 / 897) | 90.11% (565 / 627) | 98.20% | 96.04% | 80 lines | yes |
| `src/io` | 97.05% (2,699 / 2,781) | 90.15% (2,233 / 2,477) | 95.54% | 98.77% | 80 lines | yes |

  `contracts.ts` and `index.ts` files are excluded by the coverage script (unchanged from earlier gates).
- Property tests were not re-run at `ORN_PROPERTY_RUNS=200` in this step (not asked; last run at Gate B).

## 4. Audit and timing

- `npm audit`: **found 0 vulnerabilities.**
- `npm run test:timing`: **10 / 10 pass**, first run (2 files: `core-bounded-work`, `gate-b-performance`; 2.6 s).
  Nothing failed, so nothing was re-run.

## 5. `bench:compare` against the committed Phase 2 baseline

Run before `bench:baseline`, as required.

1. **First attempt aborted, not a regression:** `bench-report` refused to run because six Phase 3 benchmarks had no
   entry in `tests/perf/budgets.mjs` (four "stage functions back to back" rows added in the step 3.7 review and two
   legacy rows from step 3.11c). Nothing had been compared. Fixed in this step by adding the six entries (budget 5,000 ms
   only for the legacy synthetic 5k total; the others informal). This was a gap in tooling metadata, not a tuned budget.
2. **Second attempt:** 96 entries measured; 54 Phase 3 entries are new (nothing to compare); one Phase 2 entry flagged:
   `validateTouchedByRule: "like water" hub, review lifecycle changed (per rule)` 18.8 ms → 28.5 ms (+51.4%).
3. **Re-run once (PERFORMANCE_ARCHITECTURE §9):** "No entry regressed p99 by more than 20%." The flag was a single-run
   spike (in the final baseline this entry is 20.1 ms, runs 19.0 / 20.1 / 26.7). No Phase 2 entry is a real regression.

## 6. `bench:baseline` (3 fresh-process runs, median p99)

`tests/perf/baseline.json` rewritten with **96 entries** (42 Phase 2 + 54 Phase 3), committed in the step commit.
43 entries exceed the 25% spread threshold (`noisy` field on each): noisy again, mostly the sub-second hub and
projection entries, and every entry judged below has its spread listed. Entries with 5-7 samples (import previews,
follower hub apply, writer hub commit, `validateAll`) have a p99 that equals the maximum of few samples, so their
"median p99" is the median of three maxima.

Phase 2 entries after the re-measure (median p99, ms; Gate B in brackets): class-hub rename **13.5** (16.5), class-hub
notes **14.4** (15.5), class-hub parent move **51.0** (46.0; runs 50.6 / 51.0 / 109), like-water notes commit 2.37 (2.93),
like-water review-status commit **21.6** (21.2), route search `dense` **12.3** (17.2), `validateTouched` without previous
state 34.9 (ADV-012) / 41.5 (like water), navigator `dense` 12.1, `hub_explosion` 7.6, reaction_explorer `hub_explosion`
15.0 (one 50.4 ms run), stress navigator 22.5, `validateAll` 315 / 320.

## 7. Budgets, judged by TEST_STRATEGY §6 (median p99, ms)

General rule: (1) correctness green; (2) ordinary edits on hubs under 50 ms; (3) over target but under 50 ms, and
structural edits, are documented Phase 9 exceptions, not gate failures.

**Rows with a budget**

| Row | Entry | Median p99 | 3 runs | Spread | Verdict |
|---|---|---|---|---|---|
| Export full dataset < 2 s | `.orn.json`, dense / hub_explosion | 191 / 196 | 205 / 191 / 189; 203 / 196 / 192 | 9% / 6% | **pass** |
| | `.ornpkg`, dense / hub_explosion | 475 / 466 | 475 / 517 / 454; 546 / 466 / 430 | 13% / 25% | **pass** |
| Import 5k parse → preview < 5 s | JSON/pkg, empty store, dense | 1,107 | 1,085 / 1,107 / 1,182 | 9% | **pass** |
| | conflicting import (design-tier store, every ID conflicting), dense | 1,280 | 1,295 / 1,175 / 1,280 | 9% | **pass** |
| | empty store, hub_explosion | 1,037 | 1,037 / 1,027 / 1,257 | 22% | **pass** |
| | conflicting import, hub_explosion | 1,224 | 1,205 / 1,224 / 1,302 | 8% | **pass** |
| | legacy synthetic 5,000-reaction file (convert + preview) | 4,030 | 4,132 / 3,891 / 4,030 | 6% | **pass** (19% headroom; 5 samples) |
| Commit < 16 ms, hub, ordinary edits | like-water hub notes commit | 2.37 | 2.30 / 2.53 / 2.37 | 10% | **pass** |
| | class-hub rename / notes (1,400 referrers) | 13.5 / 14.4 | 13.5 / 13.5 / 12.2; 14.4 / 13.8 / 27.0 | 9% / 91% | **pass** |
| Commit ≥ 500 referrers (backstop 50 ms), structural | like-water review-status commit | 21.6 | 20.6 / 23.0 / 21.6 | 11% | pass on 50; over 16 → exception 2 |
| | class-hub parent move | 51.0 | 50.6 / 51.0 / 109 | 115% | **over the 50 ms row by 1.0**; structural → exception 1 |
| | writer: `replaceReferences` on the 1,000-reaction hub | 216 | 179 / 216 / 713 | 248% | no per-row target; over the 50 ms backstop; structural → exception 6 |
| | follower: `applyRemote` of that edit | 200 | 185 / 200 / 513 | 164% | over the 50 ms backstop; structural → exception 7 |

**Informal entries (no §2 row; judged at Gate E / Phase 4 where the plan says so)**

| Entry | Median p99 | Note |
|---|---|---|
| Snapshot build (serialise with L1 + compress), design tier | 395 | main thread until Phase 4; judged Gate E |
| Snapshot restore without the store (decode + migrate + L1 + state) | 321 | |
| `restoreSnapshot` whole (decode, L1, `pre_restore` build, `replaceState` L1-L3) | 1,621 | main thread until Phase 4; was 3.5 s in step 3.2 |
| Boot: whole `open()` | 1,151 | bulk read 198 (fake-indexeddb, not our code) + L1/state 177 + index build 237 + `validateAll` 346; cold-boot budget is Gate E |
| Persist overhead: enqueue + coalesce, ordinary / hub edit | 0.000 / 0.195 | our overhead only; prepare rows 0.000 / 0.095; one flush on fake-indexeddb 17.0 ("not real IndexedDB") |
| Follower apply, ordinary edit / hub edit | 0.92 / 200 | L1 parse of rows read 0.005 / 10.3; reading rows on fake-indexeddb 0.59 / 51.4 (not our code) |
| Import `.orn.json` / `.ornpkg` parse → envelope → L1 | 390 / 451 dense; 320 / 403 hub | informal stage of the 5 s row |
| Legacy demo file (22 reactions) parse → preview | 24.7 | |

Real-IndexedDB timing is not measured (fake-indexeddb measures our overhead only, Phase 3 note 4); the long-task and
cold-boot rows are judged at Gate E.

## 8. Phase 9 exception list

Numbers are median p99 of 3 fresh-process runs from this step's `baseline.json`.

**Gate B five, re-measured**

| # | Item | Gate B | Now | Status |
|---|---|---|---|---|
| 1 | Class-hub rename | 16.5 | **13.5** (runs 13.5 / 13.5 / 12.2) | no longer over 16; notes 14.4. Not an exception on this run (fix still pending: `peerReads` on RTE-002/004) |
| 2 | Class-hub parent move | 46.0 | **51.0** (50.6 / 51.0 / 109) | structural; slightly over the 50 ms row (1.0 ms; one run 109). Cause: SPC-006 on ~1,400 species, RTE-002/004 `peers` walk, merging ~1,400 findings. Remedy: `peerReads` on RTE-002/004 (Phase 9) |
| 3 | Review-status change, like-water hub | 21.2 | **21.6** (20.6 / 23.0 / 21.6) | structural; over 16, under 50. Cause: RVW-002 on ~1,000 referrers + finding-store merge |
| 4 | Route search `dense` | 17.2 | **12.3** (12.3 / 14.6 / 9.6) | back under 16: the Gate B reading was noise; closed |
| 5 | `validateTouched` without previous state | 38.7-47.1 | **34.9** (ADV-012) / **41.5** (like water) | safe fallback the commit path never takes; the Phase 4 compute worker must always pass the previous state |

**Phase 3 candidates (from `PROJECT_STATE.json` openItems) and one item found here**

| # | Item | Median p99 (3 runs) | Cause | Planned remedy |
|---|---|---|---|---|
| 6 | Structural hub edit, writer: `replaceReferences` on the design-tier 1,000-reaction hub | **216** (179 / 216 / **713**; 6 samples) | one ChangeSet touching ~1,000 records: per-record validation, index update and persistence preparation, all on the main thread | Phase 4 compute worker (validate-once, prebuilt indexes); Phase 9. The earlier ~700 ms reading reproduces as the third run's outlier |
| 7 | Same edit, follower: `applyRemote` | **200** (185 / 200 / **513**; 7 samples) | applying ~1,000 records + re-reading rows (51.4 on fake-indexeddb, not ours) | Phase 4 worker. A follower's full `reload` (~2 s at the design tier, openItems 18) is not in `baseline.json` |
| 8 | Import preview, hub_explosion into a design-tier store with every ID conflicting | **1,224** (1,205 / 1,224 / 1,302) against 5,000 | not over budget in this measurement. The step 3.7 review read 5.0-5.3 s in two runs (and 1.17 s in another): the machine drifted about 4x between sessions. Validation is about half of the total | **candidate not confirmed** on the 3-run median; kept listed for the reviewer (drift is real: a slower session could still approach the row). Remedy if it recurs: Phase 4 validate-once |
| 9 | Snapshot build / restore and `replaceState` on the main thread | 395 / 1,621 | `replaceState` re-validates the whole state (`validateAll` ~0.35 s + index build 0.24 s); restore also builds a `pre_restore` snapshot | Phase 4 compute worker with prebuilt indexes and precomputed findings; judged at Gate E |
| — | Nothing new over budget | — | — | — |

No benchmark was tuned to pass. One tooling fix (budget metadata for six new benches, §5) and no threshold changed.

## 9. Contract amendments of Phase 3

From `docs/PROGRESS.md` "Amendments" (dates as recorded; each has its Problem/Change text there). No schema change, no
`CURRENT_SCHEMA_VERSION` bump, no production migration step (Phase 3 note 1); the IndexedDB `DB_VERSION` went 1 → 2
in step 3.7's review.

| Date | Step | Amendment |
|---|---|---|
| 2026-09-28 | 3.1 | `PersistenceAdapter`: derived cache, meta markers, asset blobs in the write, `getStatus` (approved) |
| 2026-09-28 | 3.1 review | INV-20 / PERSISTENCE wording: every IndexedDB transaction atomic; queued ChangeSets may share one |
| 2026-09-28 | 3.2 | `readSnapshot` tolerant document, `SaveStatus.deletablePeriodicSnapshotIds`, restore types |
| 2026-09-28 | 3.3 | boot: quarantine rows, import batches, asset-blob IDs, `OpenResult` (`migration_failed`, `bootReport`) |
| 2026-09-28 | 3.3 review | boot quarantine is a move (whole raw value); `quarantineTruncated` removed |
| 2026-09-28 | 3.4 | writer lock, change channel, follower mode, promotion (ADR-033) |
| 2026-09-29 | 3.5 | export: `AssetBytesProvider`, `MissingReference`, `ExportResult`, `TaskOptions` |
| 2026-09-29 | 3.6 | import part 1: `maxAssetBytes`, `ImportFormat` renamed, `QuarantinedItem.raw`, parse result types |
| 2026-09-29 | 3.6 review | `maxPackageEntries`, `KindMismatch`, `kindMismatches` |
| 2026-09-29 | 3.7 | import part 2: preview/plan fields, `IdConflict.identical`, ports, rich-text link rewriting on `import_as_copy` |
| 2026-09-29 | 3.7 review | content-addressed `assetBlobs`: DB version 2, `AssetBlobRow`, `assetBlobsUnverified`, boot report field |
| 2026-09-30 | 3.10 | `LegacyImportReport.consumedByDefault` / `notes`; two ID rows; `ReportBuilder.absorb` |
| 2026-09-30 | 3.10 review | MIGRATION §4.2 / §4.4 / §4.8 behaviour decisions (no contract change) |
| 2026-09-30 | 3.11a | intermediate ID row, `LegacyIdSpace.intermediateId` |
| 2026-09-30 | 3.11b | `LegacyImportReport.documentUnmapped`; three ID rows |
| 2026-09-30 | 3.11b review | kind-qualified concept ID keys (`kindedConcepts`) |
| 2026-09-30 | 3.11c | legacy wired into the session: async `preview`/`revise`, decisions, `LEGACY_INVALID`, four report fields, `ImportBatchReport.legacyReport` |
| 2026-09-30 | 3.11c review | `check:control-chars`; the NUL key separator written as an escape (tooling and doc only) |
| 2026-09-30 | 3.12 | this step: `tests/perf/budgets.mjs` entries for six benches; `tests/adversarial/gate-c.test.ts`; three test titles tightened (tooling/tests only; recorded in PROGRESS.md) |

## 10. Open items carried forward (sweep of `PROJECT_STATE.json` openItems)

Items closed by Phase 3 are marked "CLOSED (step)" in `PROJECT_STATE.json` (never deleted). Numbers are list positions.

**Closed by Phase 3:** 0 (all approved contract amendments landed, step 3.7); 14 (timing decision applied: `test:timing`
run at 3.12); 19 (writer hub edit confirmed with numbers here, exception 6); 20, 25 (step reviews accepted); 23
(bugs fixed and regression-tested); 26 (legacy conversion built, 3.11c); 27 (decisions filled, 3.11c); 32, 33, 35, 36
(legacy port and mappers consumed as listed, 3.8-3.11c); 38, 39 (steps 3.11b/3.11c reviewed and accepted).

**Carried to Phase 4** (compute worker, chem services): 12 (replaceState/reload accept precomputed findings and prebuilt
indexes; boot builds indexes once); 18 (hub-edit `applyRemote` and follower `reload` off the main thread); 22 (export
into `ComputeWorkerApi.buildExport`); 24 (heavy work hosted by the worker); 30 (validate once; conflict analysis
hashing candidate); 31 / exception 8 (validate-once if the import preview row tightens); 10 / exception 9.
**Carried to Phase 5** (UI wiring): 7 (store still on the part-1 index engine); 11 (report done only after `flush()`);
13 (revision-gap "save everything now"); 16 (multi-tab banners and wiring); 17 (refused promotion retry); 28
(AssetStagePort wiring); 40 (legacy re-import reuses the earlier batch's clock; batch report records the file's SHA-256
and clock time).
**Carried to Phase 6:** 1 (duplicate-substance WARNING); 21 (asset-bearing export bench); 34 (`strength` of a legacy
condition); 37 (reusing an existing reagent/species is an authoring merge); 41 (`reagentFamily` link to reagents).
**Carried to Phase 9:** 8 (Gate B exceptions, §8), 9 (rules without `referencedReads`/`peerReads`), 15 (Diagnostics
repair of quarantined rows), 29 (orphan-blob sweep).
**Standing / not phase-bound:** 2, 3, 4, 5 (exam, syllabus and demo chemistry unverified: REVIEW REQUIRED), 6
(`bench:compare` is manual, not in CI).

## 11. Known limitations

- **Nothing in the demo or legacy data is chemically verified** (standing Gate A caveat).
- ADV-038 / ADV-039 are proven with fake-indexeddb and in-process lock/channel fakes only; the real-browser halves are
  Gate E. Real IndexedDB timing is not measured anywhere.
- Heavy work (import, export, snapshots, migration, boot validation) runs on the main thread in Phase 3; the "no task
  over 50 ms" row is judged at Gate E. Several entries above are hundreds of milliseconds to seconds for that reason.
- Benchmarks are noisy on this workstation (43 of 96 entries over 25% spread) and 5-7 sample entries report a maximum as
  "p99". Edge was open during the runs.
- The export bench has no asset-bearing dataset (openItems 21); `.ornpkg` asset paths are exercised functionally only.
- A legacy re-import with a different clock shows a conflict on every record (nothing lost); the fix is Phase 5.
- `reagentFamily` from the legacy app is kept in `provenance.legacy.unmapped`, never mapped (no schema home).
- Property tests were last run at 200 runs at Gate B.

## 12. Self-review: what I would challenge as the reviewer

1. **Title scan is weak evidence.** All 19 rows are "named", but three needed retitling to be found, which is
   cosmetic; INV-19's real proof is the two determinism tests plus P-02 full. Ask whether one test per row that says
   which *parts* it covers (e.g. ADV-041 disk vs file) should be a table in `TEST_STRATEGY` instead of prose.
2. **The class-hub parent move is over its 50 ms row (51.0)** and I filed it as a structural exception under the
   general rule; it is 1 ms over on a median with a 109 ms outlier run. The reviewer may prefer to see it fixed
   (`peerReads` on RTE-002/004) before Phase 9 rather than carried, since the fix is already identified.
3. **The import-preview exception candidate did not reproduce (1.2 s vs 5.0-5.3 s earlier).** I did not delete it:
   the difference is machine drift (a factor of about 4 between sessions), and a slow session could put it back near
   the row. I cannot tell from this data which state is typical; only a dedicated runner would.
4. **`bench:compare` failed on missing metadata** because new benches shipped in 3.7 review and 3.11c without
   `budgets.mjs` entries; `npm run check` does not run benches, so nothing caught it. I added entries; a check that every
   `bench()` has a budget entry would prevent a repeat (not built: out of scope).
5. **Benchmark conditions were not ideal** (Edge open; `baseline.json`'s generated runner note claims otherwise). The
   verdicts lean on a median of three maxima for the slow entries.
6. **Coverage is by lines and branches, not by rows.** `src/io` and `src/persistence` are 90% on branches; the
   uncovered branches were not individually reviewed in this step.
7. **I extended the control-character check beyond the request** (source files under `src/`, `tests/`, `scripts/`),
   because the same defect existed in `src/io/legacy-v6/id-space.ts`. If the reviewer wants it limited to docs and
   data, drop the last three roots in `scripts/check-control-chars.mjs`.
8. **Line endings:** `id-space.ts` was CRLF in git (git skipped normalisation because of the NUL); it is LF now, so
   that file's diff in commit `565c4ce` is whole-file.

---
Preparation notes: written with `docs/PROGRESS.md` "Step 3.12" and `docs/PROJECT_STATE.json`. `tests/perf/baseline.json`
(96 entries) and `tests/perf/budgets.mjs` are committed. Raw benchmark output is not committed (reproducible with
`npm run bench:baseline` and `npm run bench:compare`).
