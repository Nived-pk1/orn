// Budget metadata for tests/perf/app-services.bench.ts (step 5.1a), merged into BUDGETS by budgets.mjs (kept apart so no file passes 400 lines).

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
};
