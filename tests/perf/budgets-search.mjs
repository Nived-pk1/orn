// Budget metadata for tests/perf/search.bench.ts (step 4.5), merged into BUDGETS by budgets.mjs (same format; kept apart for the
// 400-line file limit).

export const SEARCH_BUDGETS = {
  [`search: queries at the design tier (5,000 reactions), worker code in Node (step 4.5) > name prefix: "Reaction 41"`]:
    { operation: `step 4.5: search: name prefix`, tier: 'design', shape: 'dense', budgetMs: 50, budgetRow: 'Search query', note: `worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline; the synthetic names make 'reaction' a prefix of 5,000 joined terms (reaction1, reaction2, ...), a harder case than real names` },
  [`search: queries at the design tier (5,000 reactions), worker code in Node (step 4.5) > fuzzy name: "Reactin 4100" (one missing letter)`]:
    { operation: `step 4.5: search: fuzzy name`, tier: 'design', shape: 'dense', budgetMs: 50, budgetRow: 'Search query', note: `worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: queries at the design tier (5,000 reactions), worker code in Node (step 4.5) > formula: a species formula, exact ("C0H..O.." form)`]:
    { operation: `step 4.5: search: exact formula`, tier: 'design', shape: 'dense', budgetMs: 50, budgetRow: 'Search query', note: `worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: queries at the design tier (5,000 reactions), worker code in Node (step 4.5) > palette-prefixed: "r: Reaction 4100"`]:
    { operation: `step 4.5: search: palette prefix r:`, tier: 'design', shape: 'dense', budgetMs: 50, budgetRow: 'Search query', note: `worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: queries at the design tier (5,000 reactions), worker code in Node (step 4.5) > worst case, a prefix every reaction matches: "reacti"`]:
    { operation: `step 4.5: search: worst case, prefix of every reaction`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: queries at the design tier (5,000 reactions), worker code in Node (step 4.5) > worst case, fuzzy over every species: "specias"`]:
    { operation: `step 4.5: search: worst case, fuzzy over every species`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: full builds at the design tier (5,000 reactions), step 4.5 > every document built from the state (main thread: the pure builder, exam scope per version)`]:
    { operation: `step 4.5: every document built, indexes built too (main thread)`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; main thread in the app; includes the index build the store would already have; SLOW_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: full builds at the design tier (5,000 reactions), step 4.5 > the same, with the indexes already built (the builder and scopeOf alone)`]:
    { operation: `step 4.5: every document built, indexes ready (main thread)`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; the main-thread part of a full load; SLOW_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: full builds at the design tier (5,000 reactions), step 4.5 > the index built from the documents (worker: load)`]:
    { operation: `step 4.5: full index build (worker)`, tier: 'design', shape: 'dense', budgetMs: 1500, budgetRow: 'Full search index build (SEARCH §5)', note: `worker code in Node, 5,000 reactions plus the other entities; SLOW_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: full builds at the design tier (5,000 reactions), step 4.5 > serialize the index (worker)`]:
    { operation: `step 4.5: serialize (worker)`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; SLOW_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: full builds at the design tier (5,000 reactions), step 4.5 > loadSerialized (worker, warm boot)`]:
    { operation: `step 4.5: loadSerialized (worker)`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; SLOW_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: one incremental update, design tier, step 4.5 > the index takes one upserted document (worker: apply, ordinary edit)`]:
    { operation: `step 4.5: engine.apply, one document`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: one incremental update, design tier, step 4.5 > sync: an ordinary edit end to end (change, document build, hash, in-process engine)`]:
    { operation: `step 4.5: sync, an ordinary edit`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; main-side change analysis, document build, hash and an in-process engine (no RPC); worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: one incremental update, design tier, step 4.5 > sync: rename of the 1,000-referrer hub (one document: documents hold no other record's name)`]:
    { operation: `step 4.5: sync, rename of the 1,000-referrer hub`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; documents hold no other record's name, so one document is rebuilt; worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
  [`search: one incremental update, design tier, step 4.5 > sync: a curriculum edit (exam version coverage): every document rebuilt, 500 at a time, only the changed sent`]:
    { operation: `step 4.5: sync, a curriculum edit`, tier: 'design', shape: 'dense', budgetMs: null, note: `informal; every document is rebuilt and hashed, in slices of 500, and the changed ones sent; worker code in Node, one index over the design tier (5,000 reactions, formulas on the species), no RPC; FAST_BENCH_OPTIONS; run once alone; not bench:baseline` },
};
