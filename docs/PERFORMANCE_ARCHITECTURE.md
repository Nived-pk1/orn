# Performance Architecture

Package section **#20 Performance**. Contracts: `src/workers/rpc/contracts.ts`, `src/layout/contracts.ts`, `src/render/scene/contracts.ts`.

## 1. Scale targets

| Tier | Entities (species + classes + reagents) | Reactions | Relationships + mappings | Purpose |
|---|---|---|---|---|
| Initial content | 500 | 1,000 | 3,000 | expected real dataset in year 1 |
| Design & test target | 2,000 | 5,000 | 15,000 | all budgets in §2 must hold here |
| Stress | 5,000 | 10,000+ | 30,000+ | must stay usable and bounded, budgets may degrade ≤ 2× |

## 2. Budgets (measurable, p95 unless stated)

| Operation | Budget | Where measured |
|---|---|---|
| Cold boot to interactive (design target) | < 2.5 s (warm cache < 1.5 s) | Playwright trace, mid-range laptop profile |
| Commit (command → state + indexes + L1–L3 incremental) | < 16 ms | vitest bench |
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

## 3. Threading

| Thread | Responsibilities |
|---|---|
| Main | React UI, canonical store, commands, incremental indexes and L1–L3 for touched records, projections, scene building, viewport |
| Chem worker | RDKit.js (WASM): parse, depict (sanitised SVG), L4 checks, SMARTS matching |
| Layout worker | ELK layered/radial/stress; fallback layered layout |
| Search worker | MiniSearch index, incremental updates, queries |
| Compute worker | Replica of canonical state: full validation, route search, import parse/preview, export building, migrations |

RPC (`src/workers/rpc`): numbered requests, structured-clone params, transferables for large buffers, `cancel` messages wired to `AbortSignal`, progress events, per-call timeouts, automatic worker restart on crash with replica reload. The compute replica stays in sync by applying the same ChangeSets (Immer patches) with a revision check; on mismatch it reloads the full state.

## 4. Incremental computation

- Immer structural sharing: a commit touching one reaction allocates only that path.
- Indexes update from the ChangeSet: cost O(changed records × their reference count), never O(dataset).
- Validation re-runs only affected rules for touched records and their reverse-index dependents.
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

- `tests/perf/*.bench.ts` (vitest bench) at each tier and topology shape; baseline numbers committed in `tests/perf/baseline.json`; CI fails when a benchmark regresses > 20% against the baseline on the same runner class.
- Dev-only performance marks (`performance.mark`) around commit, projection, layout and scene; the Diagnostics › Performance panel shows the last 100 samples.
- Playwright traces at Gates E and F for FPS, long tasks and boot time.

## 10. Synthetic data generator

`src/test-support/generator.ts` (Phase 1): seeded PRNG (mulberry32) producing a **valid** DatasetDocument for parameters `{ species, classes, reagents, reactions, relationshipsPerReaction, topics, shape, seed }`. Shapes: `chain` (long linear sequences, depth 50+), `wide` (few substrates, many products), `dense` (random bipartite with high degree), `cyclic` (many 2- and 3-cycles), `duplicate_endpoint` (many reactions between the same pairs), `hub_explosion` (one class with 1,000+ reactions). Every generated dataset passes L1–L3 with zero ERRORs, which itself is a test.

## 11. Banned patterns

Full-state scans on user input; synchronous layout or validation-all on the main thread; unbounded recursion or traversal; storing derived data; React state for viewport transforms; re-rendering the whole scene on hover or selection; `setTimeout` polling for data changes (subscribe to ChangeSets instead).
