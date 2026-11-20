# Step C notes (current; says where to resume)

- Section 0 done: 35cea0c (8.4g Part B review in PROGRESS).
- START ok: clean, stash empty, HEAD 98c7771, pushed.
- RED C1: `npx vitest run src/core/graph/scope-edges.test.ts` -> 2 failed (a: official not enrichment; b: outside not prerequisite).
- RED C2: `npx vitest run src/core/graph/scope-cost.test.ts` -> median 98.3 ms (target 20 ms).
- GREEN C1/C2: scope.ts builds coverage table + parent map once per createScopeOf, per-ref caches. Median 1.4 ms. Demo scope dump (609 lines, 3 exam versions' rows) byte-equal before/after.
- RESUME AT: C3 (routes).
- RED C3: `npx vitest run route-generic-product.test.ts` -> 2 failed (no route through generic; no stated-first). RED C4: route-shortest-first -> 1 failed (one-step route missed).
- GREEN C3/C4: moves.ts producedAs (classes/ancestors), class reactant = ONE move; search.ts iterative deepening, one budget, stops when frontier closed or maxRoutes filled; explored = nodes of the last pass; rank ties end on route key. Old tests changed on purpose (moves.test member expansion, 2 search.test, 2 demo tests now see the inferred generic PCC route). Search runs in the worker (replica.ts), not the main thread.
- Limit: a route that continued through one member's own producers of a class reactant is no longer found (spec: ONE move any <class>). Recorded in ADR-049.
- RESUME AT: real-data route probe (C4), then C5.
