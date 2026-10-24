// Budget metadata for tests/perf/reaction-filter.bench.ts (step 7.1a, ADR-042 E10), merged into BUDGETS by budgets.mjs (same format).
// The filter runs on the main thread from the derived indexes when it answers in 50 ms or less at the design tier.

const entry = (operation, shape, note) => ({ operation, tier: 'design', shape, budgetMs: 50, note });

export const EXPLORER_BUDGETS = {};
for (const shape of ['dense', 'hub_explosion']) {
  const title = `reaction filter (design tier, ${shape})`;
  EXPLORER_BUDGETS[`${title} > empty filter (rows and facets)`] = entry('reaction filter: empty filter, rows and facets', shape, 'step 7.1a: 5,000 reactions; ADR-042 E10');
  EXPLORER_BUDGETS[`${title} > type, family and exam scope`] = entry('reaction filter: type, family and exam scope', shape, 'step 7.1a');
  EXPLORER_BUDGETS[`${title} > substance and name`] = entry('reaction filter: substance and name', shape, 'step 7.1a');
  EXPLORER_BUDGETS[`${title} > build the input`] = entry('reaction filter: build the input (once per state)', shape, 'step 7.1a: families come from the navigator roll-up');
}
