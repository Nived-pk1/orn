// Budget metadata for tests/perf/viewport.bench.ts (step 5.4b), merged into BUDGETS by budgets.mjs (same format; kept apart for the
// 400-line file limit). A culling query runs once per frame of pan, so its informal budget is a quarter of a 60 fps frame.

const row = (nodes, edges, tier) => ({
  [`viewport culling (${nodes} nodes / ${edges} edges) > visibleIn (screen plus overscan)`]:
    { operation: `culling query (${nodes} nodes / ${edges} edges)`, tier, shape: 'dense', budgetMs: null, informalBudgetMs: 4, note: 'step 5.4b; informal (one query per frame of pan; the frame is 16 ms)' },
  [`viewport culling (${nodes} nodes / ${edges} edges) > buildGridIndex`]:
    { operation: `grid index build (${nodes} nodes / ${edges} edges)`, tier, shape: 'dense', budgetMs: null, informalBudgetMs: 16, note: 'step 5.4b; informal (once per new Scene)' },
});

export const VIEWPORT_BUDGETS = { ...row(400, 800, 'stress'), ...row(2000, 4000, 'stress') };
