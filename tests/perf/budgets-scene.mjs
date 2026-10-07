// Budget metadata for tests/perf/scene.bench.ts (step 5.3), merged into BUDGETS by budgets.mjs (same format; kept apart for the
// 400-line file limit).

export const SCENE_BUDGETS = {
  'scene builders (stress tier, 400 anchored hubs: 400 nodes / 800 edges) > buildScene':
    { operation: 'buildScene (400 nodes / 800 edges)', tier: 'stress', shape: 'dense', budgetMs: 8, budgetRow: 'Scene build', note: 'step 5.3: the stress-tier navigator overview, the fallback layout as the layout result' },
  'scene builders (stress tier, 400 anchored hubs: 400 nodes / 800 edges) > buildLayoutRequest':
    { operation: 'buildLayoutRequest (400 nodes / 800 edges)', tier: 'stress', shape: 'dense', budgetMs: null, informalBudgetMs: 8, note: 'step 5.3; informal (same row as the scene build)' },
  'scene builders (stress tier, 400 anchored hubs: 400 nodes / 800 edges) > nodeSizes':
    { operation: 'nodeSizes with a fake measurer (400 nodes)', tier: 'stress', shape: 'dense', budgetMs: null, informalBudgetMs: 8, note: 'step 5.3; informal; the real measurer is DOM work, measured in step 5.5a' },
  'scene pipeline (design tier, dense overview) > projection -> sizes -> request -> fallback layout -> scene':
    { operation: 'navigator overview end to end with the fallback layout (60 hubs, 800 pairs)', tier: 'design', shape: 'dense', budgetMs: null, informalBudgetMs: 2000, note: 'step 5.3; for information; SLOW_BENCH_OPTIONS; the layout here is the pure fallback of src/layout, not the ELK path' },
};
