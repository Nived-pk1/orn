# Performance Architecture

Package section **#20 Performance**. Contracts: `src/workers/rpc/contracts.ts`, `src/layout/contracts.ts`, `src/render/scene/contracts.ts`.

## 1. Scale targets

| Tier | Entities (species + classes + reagents) | Reactions | Relationships + mappings | Purpose |
|---|---|---|---|---|
| Initial content | 500 | 1,000 | 3,000 | expected real dataset in year 1 |
| Design & test target | 2,000 | 5,000 | 15,000 | all budgets in §2 must hold here |
| Stress | 5,000 | 10,000+ | 30,000+ | must stay usable and bounded, budgets may degrade ≤ 2× |

**Amendment, 2026-09-27 (step 2.11, benchmark-only — no contract change):** navigator benchmarks anchor a
fixed hub count per tier rather than a class-count ratio, so "the design-tier anchored benchmark" names the
same state shape regardless of how the generator's class count changes later (§10 has the deterministic
rule). Design tier: 60 anchored hubs. Stress tier: 400 anchored hubs, judged against this table's "budgets
may degrade ≤ 2×" allowance applied to §2's 16 ms projection-build budget — 32 ms, informal (no §2 row of
its own; `tests/perf/budgets.mjs`'s `informalBudgetMs`).

## 2. Budgets (measurable, p95 unless stated)

Benchmarked entries are judged on the median p99 of 3 fresh-process runs (§9): `vitest bench` does not report p95, and p99 is the conservative stand-in. Gate judgement follows the general performance rule in TEST_STRATEGY.md §6.

| Operation | Budget | Where measured |
|---|---|---|
| Cold boot to interactive (design target) | < 2.5 s (warm cache < 1.5 s) | Playwright trace, mid-range laptop profile |
| Commit, accepted or rejected (command → state + indexes + L1–L3 incremental) | < 16 ms | vitest bench |
| Commit on a record with ≥ 500 referrers (backstop, see below) | < 50 ms p95 | bench |
| Undo / redo | < 16 ms | bench |
| Projection build (bounded, ≤ 400 nodes) | < 16 ms | bench |
| Layout (≤ 400 nodes, worker) | < 300 ms; hard timeout 2 s → fallback | bench (worker code in Node) |
| Scene build | < 8 ms | bench |
| Pan / zoom | 60 fps, zero React renders | Playwright + React profiler counter |
| Search query | < 50 ms (worker); debounce 80–120 ms | bench |
| Full validation L1–L3 (design target) | < 3 s in compute worker | bench |
| Import 5k reactions (parse → preview) | < 5 s | bench |
| Export full dataset | < 2 s | bench |
| Main-thread long tasks | none > 50 ms during any interaction | Playwright long-task observer |
| Heap after boot (design target) | < 150 MB | Chrome memory snapshot at Gate F |

**Backstop row (steps 2.12-2.13).** With field-aware scope (§4, ADR-031) and per-rule re-validation (ADR-032) the hub
scenarios this row was added for (ADV-012 hub, design-tier "like water" hub, the class hub every species lists) meet
the plain 16 ms Commit row for the edits an author makes all day (rename, notes, alias): 1-3 ms p99 on the species
hubs (was 33-71 ms), 15-17 ms on the class hub (was 97 ms), so the row is **no longer needed for them**. It is kept as
a backstop for Phase 9 for the structural edits that still re-validate many records: a field every referrer reads
(e.g. `review`, read by RVW-002; 21 ms per whole commit on the like-water hub, was 77 ms) and moving the class hub
under another parent (46 ms, was 126 ms; SPC-006 re-runs on the 1,400 species that list it). Those are recorded as
documented Phase 9 exceptions if over 16 ms (docs/TEST_STRATEGY.md §6, docs/reviews/gate-b-packet.md §8).

## 3. Threading

| Thread | Responsibilities |
|---|---|
| Main | React UI, canonical store, commands, incremental indexes and L1–L3 for touched records, projections, scene building, viewport |
| Chem worker | RDKit.js (WASM): parse, depict (sanitised SVG), L4 checks, SMARTS matching |
| Layout worker | ELK layered/radial/stress; fallback layered layout |
| Search worker | MiniSearch index, incremental updates, queries |
| Compute worker | Replica of canonical state: full validation, route search, import parse/preview, export building, migrations |

RPC (`src/workers/rpc`): numbered requests, structured-clone params, transferables for large buffers, `cancel` messages wired to `AbortSignal`, progress events, per-call timeouts, automatic worker restart on crash with replica reload. The compute replica stays in sync by applying the same ChangeSets (Immer patches) with a revision check; on mismatch it reloads the full state. Any incremental re-validation in the compute worker must pass the **previous state** to `validateTouchedByRule`/`validateTouched` (ADR-031/032): without it every referrer of a touched record is re-validated whole (39–47 ms on a 1,000-referrer hub at the design tier, median p99 in step 2.13, instead of 1–4 ms).

## 4. Incremental computation

- Immer structural sharing: a commit touching one reaction allocates only that path.
- Indexes update from the ChangeSet: cost O(changed records × their reference count), never O(dataset).
- Validation re-runs only affected work for touched records and their reverse-index dependents. `scopeOf`'s expansion has three parts. The touched records and their referents are re-validated whole. **Referrers** are re-run only for the rules that read a field that changed (`ValidationRule.referencedReads`, ADR-031): renaming, aliasing or annotating a record with hundreds of referrers re-runs nothing on them. **Peers** (name twins, class ancestors, species listing a class) are called only when a field their rule reads changed (`ValidationRule.peerReads`, ADR-032), and a peer named by an L3 rule has only that rule re-run. When a referrer or peer does need work, only the affected L3 rules run and their findings are merged into the finding store per rule (`Validator.validateTouchedByRule`, `FindingStore.replaceForRules`, ADR-032); an affected L2 rule keeps the record whole, because an L2 ERROR gates its L3 rules. Rules that declare nothing keep the coarser behaviour (docs/PROGRESS.md steps 2.10, 2.12, 2.13). Known remaining cost: RTE-002/004's `peers` walk every referrer chain upward from a touched species or class (~10 ms when a class listed by 1,400 species is touched) and have no `peerReads` yet (a Phase 9 candidate).
- Projections are memoised by request + revisions of records they read; unrelated edits reuse them.
- Search receives upserts/removals only.
- Hot paths never use `JSON.stringify` for equality or deep clones; equality is by reference (structural sharing) or by revision.

## 5. Layout

ELK (`elkjs`) in the layout worker: `layered` for navigator, reaction and precursor views; `radial` for focus-neighbourhood views; `stress` for relationship maps. Inputs are sorted and seeded, so identical requests produce identical outputs. Results are cached in `derivedCache` by `cacheKey`. Superseded requests are cancelled. If ELK throws or exceeds 2 s, a deterministic in-house layered layout (longest-path layering + barycentric ordering, O(V + E) per sweep) is used and Diagnostics records the fallback.

## 6. Rendering

Render budget 400 visible nodes / 800 visible edges; above it LOD is capped at 1. Viewport culling via a uniform grid index; pan/zoom by a single imperative transform; hover and focus rings on an overlay layer so the node layer does not re-render; text measurement cached per (string, font size); depictions lazily loaded and cached; long lists (inspector, overflow, search, diagnostics) virtualised with TanStack Virtual.

## 7. Boot and bundle

Code-split per view; RDKit WASM (~6 MB), ELK and Ketcher load lazily on first need; the navigator can render with names and formulas before RDKit is ready. Warm boot reuses the cached search index and layouts keyed by revision. Initial JS (excluding lazy chunks) target < 400 KB gzip.

## 8. Memory

Estimate at the design target: records ≈ 10–15 MB as JS objects, indexes ≈ 2–3× records, search index ≈ 10 MB in its worker, compute replica ≈ records + indexes. Depiction cache is LRU-bounded in memory (500 entries) and in IndexedDB (100 MB soft cap).

## 9. Measurement

**Method (docs/PROGRESS.md step 2.11 — replaces the step 2.8/2.9 single-run method after the Gate B
reviewer found its numbers too noisy to judge: the same design-tier hub-commit scenario read 35.6 ms p99 in
one run and 107–129 ms in another, "full-suite contention" named but not fixed until this step).**

- **Isolation.** Benches never run alongside tests or another bench run. `npm run bench`
  (`scripts/run-bench-cli.mjs`), `npm run bench:baseline` and `npm run bench:compare`
  (`scripts/generate-baseline.mjs`/`bench-compare.mjs`, both via `scripts/bench-report.mjs`) all take a PID
  lock file (`scripts/bench-guard.mjs`, `tests/perf/.bench.lock`, git-ignored) before starting and refuse to
  start — a hard error naming the other process's PID — if a different, still-live process already holds
  it; nested calls within the same process (the 3 runs inside `bench:baseline`) reuse it correctly. Every
  entry point also runs with no file parallelism and a single worker (`--no-file-parallelism` on the CLI,
  `fileParallelism: false` on the Node-API calls — vitest's own semantics then cap `maxWorkers` at 1).
  **Not covered**: an unrelated `npm test` / `npm run test:watch` process started in another terminal.
  Reliable cross-platform detection of "another vitest process is running" from outside was judged
  impractical to build correctly here — Windows' `tasklist` does not show command lines by default (a
  `wmic`/CIM query that does is slow and permission-sensitive), and matching by process name alone (`node`)
  would false-positive on any unrelated Node process. **Manual check**: before running any `npm run bench*`
  command, confirm no other `npm test`, `npm run test:watch`, or `npm run bench*` process is active in
  another terminal (or Task Manager / `ps`).
- **Warmup and sample count.** Every `bench()` call passes explicit options
  (`src/test-support/perf-kit.ts`'s `FAST_BENCH_OPTIONS`/`SLOW_BENCH_OPTIONS`) rather than relying on
  `vitest bench`'s defaults (500 ms time budget, 10-iteration floor, 100 ms/5-iteration warmup): those
  defaults left the slower entries with only 10–30 samples, and since tinybench's p99 is the
  `ceil(0.99·n) − 1`th sorted sample, it is mathematically identical to the observed max whenever `n < 100`
  — not a percentile at all below that floor, however many times it is re-run. `FAST_BENCH_OPTIONS`
  (commit/projection/route-search benches) sets a 100-sample floor with a 10-iteration, 200 ms warmup.
  `SLOW_BENCH_OPTIONS` (`validateAll`, 300–400 ms/sample) instead takes a fixed 3 s time window — reaching
  100 samples there would take minutes for a budget (3,000 ms) already passed with a wide margin.
- **Setup stays outside the timed region.** Dataset construction (`tierState`/`oneHubState`/
  `designTierHubState`/`withNavigatorAnchors`), index building and hub/context lookup all happen once in
  each bench file's `describe` body, before any `bench()` call — the callback passed to `bench()` is only
  the operation under measurement (dispatching one command, building one projection, one `scopeOf` call,
  …). Per-iteration bookkeeping needed to make each call distinct without a reaction-specific hack (e.g.
  `commit.bench.ts` cycling `n` to pick the next species to touch) stays in the callback because it is part
  of what a real caller would also pay — an ID-table lookup, not the dataset construction itself.
- **3 runs, each a fresh process, median p99, spread recorded.** `npm run bench:baseline` runs the whole
  suite 3 times, each run spawned as its own `node` process (`scripts/bench-run-once.mjs`), and writes
  `tests/perf/baseline.json` with, per entry: `p99Runs` (each run's own p99, in run order), `p99Ms` (their
  median — what `pass` is computed against), and `p99SpreadPct` (`(max − min) / median` across the 3 runs).
  An entry whose spread exceeds 25% also gets a `noisy` field naming the threshold, so a wide spread is
  visible on the entry itself, not just in prose — nothing is hidden (CLAUDE.md §1.5).
  **Investigated (docs/PROGRESS.md step 2.11)**: the first version of this method ran all 3 passes inside
  one shared Node process (3 sequential in-process `startVitest` calls) — that was itself a measurement bug,
  not neutral: V8's JIT and the module-resolution cache warmed across the 3 calls, so the *third* call came
  out fastest in the large majority of entries (not randomly any of the three, which real noise would
  produce) — every entry showed a spread over 25%, and the pattern (a near-monotonic decrease run 1 → run 3)
  gave it away as bias, not variance. Fixed by spawning each run as an independent OS process. After the fix
  the monotonic pattern is gone (confirmed: no consistent run-1-vs-run-3 direction across entries any more),
  but the *remaining* spread on this particular developer workstation was still large — most entries over
  25%, several over 100% — for both slow (design-tier hub commit/validateTouched, `validateAll`) and
  sub-millisecond (`scopeOf`) operations alike, which a real GC pause or scheduler contention on a
  non-dedicated machine can plausibly produce at any timescale. This is the workstation-noise case §9's
  `runner` field and `bench:compare`'s 20% (not tighter) threshold already assume, not a new bug to chase
  further — a dedicated CI runner class (still not wired in, see PROJECT_STATE.json's open items) would be
  the actual fix, not another round of investigation on this machine. A flagged entry should still be spot-
  checked before trusting its verdict on a *specific* run; §5's own table names which entries this step
  measured as failing and whether that entry was also noisy.
- **Machine conditions**, recorded in `baseline.json`'s own `runner` field: plugged in (not on battery), no
  other heavy applications open, isolation and worker settings as above. Still a developer workstation, not
  a dedicated CI runner class — `bench:compare`'s 20% regression threshold (below) is sized for that, not
  for a tighter CI-grade comparison.
- `npm run bench:compare` (`scripts/bench-compare.mjs`) runs the suite once and fails when any entry's p99
  regresses > 20% against `baseline.json`'s median p99, on the same runner-class assumption above. Run at
  gates, not in `npm run check` — a single run against a workstation baseline is still noisy enough that
  running it on every commit would be flaky rather than informative; re-run before concluding a flagged
  regression is real.
- Dev-only performance marks (`performance.mark`) around commit, projection, layout and scene; the Diagnostics › Performance panel shows the last 100 samples.
- Playwright traces at Gates E and F for FPS, long tasks and boot time.

## 10. Synthetic data generator

`src/test-support/generator.ts` (Phase 1): seeded PRNG (mulberry32) producing a **valid** DatasetDocument for parameters `{ species, classes, reagents, reactions, relationshipsPerReaction, topics, shape, seed }`. Shapes: `chain` (long linear sequences, depth 50+), `wide` (few substrates, many products), `dense` (random bipartite with high degree), `cyclic` (many 2- and 3-cycles), `duplicate_endpoint` (many reactions between the same pairs), `hub_explosion` (one class with 1,000+ reactions). Every generated dataset passes L1–L3 with zero ERRORs, which itself is a test.

**Navigator-anchor benchmark parameter (docs/PROGRESS.md step 2.11, `src/test-support/perf-kit.ts`'s
`withNavigatorAnchors`).** The generator creates no `navigator_anchor` records at all (this section is
graph/index scale only, not curated content), so an un-anchored generated state puts every reaction on the
single virtual Unclassified hub — the degenerate case, not what a curated dataset (the demo has 15 anchored
hubs) looks like. `withNavigatorAnchors(state, anchorCount)` anchors exactly `anchorCount` classes,
**deterministically**: sort every class ID, then for `k` in `[0, min(anchorCount, classCount))` anchor the
class at index `floor(k · classCount / anchorCount)`. That index strictly increases with `k` whenever
`classCount ≥ anchorCount` (true at every tier this file's benches use), so the chosen classes are spread
evenly across the sorted range with no repeats, from a stated rule rather than an accident of iteration
order (superseding step 2.9's `every`-based ratio, which gave a different hub count per tier without saying
so). Default 60 (design tier); the stress-tier scenario (`tests/perf/projection.bench.ts`) passes 400 — see
§1's amendment for the budget each is judged against.

## 11. Banned patterns

Full-state scans on user input; synchronous layout or validation-all on the main thread; unbounded recursion or traversal; storing derived data; React state for viewport transforms; re-rendering the whole scene on hover or selection; `setTimeout` polling for data changes (subscribe to ChangeSets instead).
