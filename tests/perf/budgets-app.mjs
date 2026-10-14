// Budget metadata for tests/perf/app-services.bench.ts (step 5.1a) and tests/perf/app-engines.bench.ts (step 5.1b) and tests/perf/app-import.bench.ts (step 5.1c), merged into BUDGETS by budgets.mjs (kept apart so no file passes 400 lines).

export const APP_BUDGETS = {
  "DerivedIndexes (design tier, hub_explosion): first build > first build (indexEngine.build at the first current())":
    { operation: "DerivedIndexes: first build", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 5.1a (Q1 option B): informal, no §2 row; main-thread code in Node; SLOW_BENCH_OPTIONS" },
  "DerivedIndexes (design tier, hub_explosion): apply at the first read after an edit > apply after an ordinary edit (1 record)":
    { operation: "DerivedIndexes: apply after an ordinary edit", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 5.1a: informal; the cost lands at the first read after the commit, off the commit path" },
  "DerivedIndexes (design tier, hub_explosion): apply at the first read after an edit > apply after a hub record edit (1 record, 1,000 referrers)":
    { operation: "DerivedIndexes: apply after a hub record edit", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 5.1a: informal; one record with 1,000 referrers" },
  "DerivedIndexes (design tier, hub_explosion): apply at the first read after an edit > apply after replaceReferences on the hub (~1,020 records)":
    { operation: "DerivedIndexes: apply after replaceReferences on the hub", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 5.1a: informal; about 1,020 records; SLOW_BENCH_OPTIONS" },
  "services boot (design tier, hub_explosion): the main-thread parts > store from boot precomputed findings (indexes built once, findings checked)":
    { operation: "services boot: the store from precomputed findings (main-thread part)", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 5.1a: informal; SLOW_BENCH_OPTIONS" },
  "services boot (design tier, hub_explosion): the main-thread parts > whole createAppServices over fake-indexeddb, compute host in memory on this thread (upper bound)":
    { operation: "services boot: whole createAppServices (upper bound)", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 5.1a: informal; compute host in memory on this thread and fake-indexeddb reads are not main-thread time or our code; SLOW_BENCH_OPTIONS" },
  "search full load on the main thread (design tier, dense, 5,000 reactions) > documents built from the state, first DerivedIndexes build included (worker stubbed, no message copy)":
    { operation: "search full load on main: documents + first DerivedIndexes build", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1b: informal; Gate E watch item; worker stubbed; SLOW_BENCH_OPTIONS" },
  "search full load on the main thread (design tier, dense, 5,000 reactions) > the same plus the structuredClone of the load message (what postMessage costs the sender)":
    { operation: "search full load on main: documents + first build + message copy", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1b: informal; SLOW_BENCH_OPTIONS" },
  "search boot until the index answers: warm cache against a full load (design tier, no RPC) > full load: documents + first index build (main) + engine.load (worker)":
    { operation: "search boot: full load until the index answers", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1b: informal; no RPC; SLOW_BENCH_OPTIONS" },
  "search boot until the index answers: warm cache against a full load (design tier, no RPC) > warm boot: engine.loadSerialized (worker) + adopt (main)":
    { operation: "search boot: warm cache until the index answers", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1b: informal; no RPC; SLOW_BENCH_OPTIONS" },
  "import apply, the main-thread parts (design tier, dense, 5,000 reactions) > receive the merged state and the worker findings (structuredClone)":
    { operation: "import apply on main: receive the merged state and findings", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c: informal; Gate E watch item (main-thread part of an import apply); Node; SLOW_BENCH_OPTIONS" },
  "import apply, the main-thread parts (design tier, dense, 5,000 reactions) > store.replaceState(merged, \"import\", the worker findings) into an empty store":
    { operation: "import apply on main: replaceState with the worker findings", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c: informal; Gate E watch item (main-thread part of an import apply); Node; SLOW_BENCH_OPTIONS" },
  "import apply, the main-thread parts (design tier, dense, 5,000 reactions) > DerivedIndexes: the first build over the imported state":
    { operation: "import apply on main: first DerivedIndexes build", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c: informal; Gate E watch item (main-thread part of an import apply); Node; SLOW_BENCH_OPTIONS" },
  "import apply, the main-thread parts (design tier, dense, 5,000 reactions) > search full load on main: documents built, first DerivedIndexes build included (worker stubbed)":
    { operation: "import apply on main: search full load", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c: informal; Gate E watch item (main-thread part of an import apply); Node; SLOW_BENCH_OPTIONS" },
  "first DerivedIndexes build > (i) the generator state":
    { operation: "index state form: first DerivedIndexes build, generator state", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c review follow-up a (budget entry added in step 5.10b so the bench runs under bench:compare): informal; SLOW_BENCH_OPTIONS" },
  "first DerivedIndexes build > (ii) a structuredClone of it":
    { operation: "index state form: first DerivedIndexes build, structuredClone", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c review follow-up a (budget entry added in step 5.10b so the bench runs under bench:compare): informal; SLOW_BENCH_OPTIONS" },
  "first DerivedIndexes build > (iii) the state after replaceState of a clone":
    { operation: "index state form: first DerivedIndexes build, state after replaceState", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c review follow-up a (budget entry added in step 5.10b so the bench runs under bench:compare): informal; SLOW_BENCH_OPTIONS" },
  "the store's own index build (createCanonicalStore) > (i) the generator state":
    { operation: "index state form: store index build, generator state", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c review follow-up a (budget entry added in step 5.10b so the bench runs under bench:compare): informal; SLOW_BENCH_OPTIONS" },
  "the store's own index build (createCanonicalStore) > (ii) a structuredClone of it":
    { operation: "index state form: store index build, structuredClone", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c review follow-up a (budget entry added in step 5.10b so the bench runs under bench:compare): informal; SLOW_BENCH_OPTIONS" },
  "the store's own index build (createCanonicalStore) > (iii) the state after replaceState of a clone":
    { operation: "index state form: store index build, state after replaceState", tier: 'design', shape: 'dense', budgetMs: null, note: "step 5.1c review follow-up a (budget entry added in step 5.10b so the bench runs under bench:compare): informal; SLOW_BENCH_OPTIONS" },
};
