# Step C notes (current; says where to resume)

- Section 0 done: 35cea0c (8.4g Part B review in PROGRESS).
- START ok: clean, stash empty, HEAD 98c7771, pushed.
- RED C1: `npx vitest run src/core/graph/scope-edges.test.ts` -> 2 failed (a: official not enrichment; b: outside not prerequisite).
- RED C2: `npx vitest run src/core/graph/scope-cost.test.ts` -> median 98.3 ms (target 20 ms).
- GREEN C1/C2: scope.ts builds coverage table + parent map once per createScopeOf, per-ref caches. Median 1.4 ms. Demo scope dump (609 lines, 3 exam versions' rows) byte-equal before/after.
- RESUME AT: C3 (routes).
