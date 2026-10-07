// Budget metadata for tests/perf/navigator-overview.bench.ts (step 5.4c), merged into BUDGETS by budgets.mjs (same format; kept apart for the
// 400-line file limit).

export const NAVIGATOR_BUDGETS = {
  'navigator overview (design tier, dense) > overview':
    { operation: 'navigator overview (per hub pair)', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Projection build', note: 'step 5.4c: 60 anchored hubs, 7,492 arrows, 1,702 pairs' },
  'navigator overview (design tier, dense) > one hub expanded':
    { operation: 'navigator overview, the busiest hub expanded (both)', tier: 'design', shape: 'dense', budgetMs: null, informalBudgetMs: 16, note: 'step 5.4c; run once alone' },
  'navigator overview (design tier, dense) > every hub expanded':
    { operation: 'navigator overview, every hub expanded (both)', tier: 'design', shape: 'dense', budgetMs: null, informalBudgetMs: 16, note: 'step 5.4c; run once alone' },
  'navigator overview (design tier, hub_explosion) > overview':
    { operation: 'navigator overview (per hub pair)', tier: 'design', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Projection build', note: 'step 5.4c: one pair of 5,000 arrows' },
  'navigator overview (design tier, hub_explosion) > one hub expanded':
    { operation: 'navigator overview, the busiest hub expanded (both)', tier: 'design', shape: 'hub_explosion', budgetMs: null, informalBudgetMs: 16, note: 'step 5.4c; run once alone' },
  'navigator overview (design tier, hub_explosion) > every hub expanded':
    { operation: 'navigator overview, every hub expanded (both)', tier: 'design', shape: 'hub_explosion', budgetMs: null, informalBudgetMs: 16, note: 'step 5.4c; run once alone' },
  'navigator overview (stress tier, dense, 400 anchored hubs) > overview':
    { operation: 'navigator overview (per hub pair), stress tier (400 anchors)', tier: 'stress', shape: 'dense', budgetMs: null, informalBudgetMs: 32, note: 'step 5.4c; PERFORMANCE_ARCHITECTURE.md §1: stress budgets may degrade <= 2x, so 32 ms is an informal allowance' },
  'sameProjection (stress-tier overview, 400 anchored hubs) > equal projections':
    { operation: 'sameProjection, equal projections (400 nodes / 800 edges)', tier: 'stress', shape: 'dense', budgetMs: null, informalBudgetMs: 2, note: 'step 5.4c (decision Q3): the projection hook calls it once per rebuild; informal 2 ms' },
  'sameProjection (stress-tier overview, 400 anchored hubs) > differ in the last edge':
    { operation: 'sameProjection, differing in the last edge (400 nodes / 800 edges)', tier: 'stress', shape: 'dense', budgetMs: null, informalBudgetMs: 2, note: 'step 5.4c (decision Q3): worst case for a mismatch' },
};
