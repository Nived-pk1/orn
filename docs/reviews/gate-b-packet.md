# Gate B review packet — Phase 2 (graph engine)

Prepared 2026-09-27 for a reviewer who cannot see the repository. Everything below was produced or re-run in the preparation session; where a claim comes from a project document rather than from a run, it says so. Not committed as part of `npm run check`'s gate (`docs/reviews/` is reference material, like the Gate A packet).

- Repository state: branch `master`, HEAD `881c91b` (`phase-2.7: route search`) — this packet's own step (2.8) is committed after it. No `phase-2` tag exists yet.
- Toolchain: Node 24.21.0, npm 11.19.0, TypeScript 6.0.3, Zod 4.6.5 (`^4.1.0`), Immer 10.2.0 (`^10.1.1`), Vitest 4.1.11, Vite 7.3.6 (`^7.0.0`), fast-check 3.23.2. (Gate A's Vitest advisory, GHSA-82fw-gwwq-j7x9, is closed: the project is already on the recommended 4.1.11; `npm audit` reports **0 vulnerabilities**.)
- `npm run check` (typecheck, lint, lint:deps, check:size, check:hardcode, tests): **green — 66 test files, 1,110 tests**.
- Property tests at `ORN_PROPERTY_RUNS=200`: 5 files, 48 tests, all pass (re-run for this packet).
- `npm run test:coverage` (`src/core/**`): **97.11% statements, 91.12% branches, 98.55% functions, 98.8% lines** — thresholds (90% lines / 85% branches) comfortably met.

## 0. What the reviewer should decide

1. **Two measured budget misses at the design tier** (§5): `navigator`'s projection build (≈20–29 ms against a 16 ms budget, because it scans every reaction in the state once per call by design — GRAPH_SEMANTICS.md §3) and `validateTouched` on a reaction-level hub with ~1,000 reactions attached (≈24 ms against the same 16 ms *commit* budget). Neither is a correctness bug; both are measured, quantified, and explained below. Is Gate B's "benchmarks meet budgets at the design tier" criterion satisfied as a **documented, scoped exception**, or does it block the gate until fixed?
2. `scopeOf` is measurably computed twice per commit (`core/commands/store.ts` calls it directly, then `validateTouched` calls it again internally) — quantified at 2× its own (small) cost, ≈3–5% of a hub-heavy `validateTouched` call. Worth a contract change now (splitting scope computation out of `validateTouched`), or an accepted, tracked inefficiency?
3. The rejected-commit index rebuild (`coreIndexEngine.build` from scratch) costs ≈160–180 ms at the design tier. There is no §2 budget row for this specific case (only "Commit" at 16 ms, which is about a *successful* commit). Should PERFORMANCE_ARCHITECTURE.md gain an explicit budget row for it?
4. Whether the two-parameter `graph/route` exceptions to 100% branch coverage (defensive/near-unreachable guards, §4) are acceptable as documented rather than chased to 100%.
5. Same standing caveat as Gate A: nothing in the demo dataset is chemically verified; this packet is about the graph engine's correctness and performance, not chemistry content.

## 1. Gate B criteria

Source: `docs/TEST_STRATEGY.md §6` (Gate B row) and `docs/IMPLEMENTATION_PLAN.md §3` (Phase 2 definition of done).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | All projections registered | **pass** | `src/core/graph/registry.test.ts` — completeness test: every `ViewKey` except `search` (Phase 4) has a registered `ProjectionDefinition` (navigator, reaction_explorer, precursor_explorer, reagent_explorer, named_reactions, mechanisms, syllabus). |
| 2 | Route search | **pass** | `src/core/graph/route/` (step 2.7): `searchRoutes` against the `RouteQuery`/`RouteSearchResult` contracts declared in Phase 0. 30 tests (§3). |
| 3 | P-09 | **pass** | `src/core/graph/route/search.test.ts` — 200-run fast-check property over random directed graphs (possibly cyclic, possibly self-looping): the explored-state budget is never exceeded, `maxRoutes` is never exceeded, no route revisits a substance. |
| 4 | P-10 | **pass** | `src/test-support/projection-harness.ts`'s `checkRegistry`, run over every registered projection by `tests/property/projections.test.ts`: same state + request → byte-identical projection, on a repeat build and on reordered records with fresh indexes. |
| 5 | ADV rows marked B pass | **pass** | All 25 Gate B rows are named in a test title (§3.1; the `gate-matrix.ts` title-level scan, re-run for this packet, finds zero missing). |
| 6 | Benchmarks meet budgets at the design tier | **pass, with two documented exceptions** | §5. Commit, undo/redo, route search, full `validateAll`, and both *local, bounded* projections (`reaction_explorer`, `precursor_explorer`) meet their §2 budgets at the design tier (5,000 reactions) with wide margins. `navigator`'s build and `validateTouched` on an extreme hub do not; both are measured, explained, and left for the reviewer (§0). |

Not part of the gate but relevant: chemistry content is still unverified (Gate A's own caveat; nothing here changes it).

## 2. Phase 2 steps, from `docs/PROGRESS.md`

| Step | Delivered | Tests added |
|---|---|---|
| 2.1 | Remaining cross-record indexes (participations, productions, by-reagent/family/named/transformation/concept/mechanism, topics, relationships, caveats, anchors, display); incremental apply | 17 + 1 property |
| 2.2 | Stable hashing (`hashParts`/`hash64`); bounded traversal primitive (`traverse`, depth/nodes/edges/time/signal); deterministic edge IDs | 15 (+3 hashing) |
| 2.3 | Projection registry; the P-10/INV-26 projection harness; navigator projection (hub roll-up, Unclassified, Unanchored) | 35 + 5 + 6 + 11 |
| 2.4 | Reaction explorer projection: bipartite consumes/produces, condition-variant filter, stages, spectators/`showAsNode`, intermediates | 18 |
| 2.5 | Precursor projection (backward, reversed layout, forward arrows); bundling; degree caps/overflow; the ⇌ badge rule (`reverse_of` pairs whose endpoints mirror, reviewer decision, no schema change) | 20 |
| 2.6 | Reagent/named-reaction/mechanism/syllabus projections (one-hop or closure, per view); derived exam scope (`createScopeOf`); registry completeness test | 8 + 9 + 6 + 12 + 19 |
| 2.7 | Route search: backward, per-path-cycle-safe walk from the target; class-membership inference; ranking and dedup | 11 + 17 + 4 |
| 2.8 (this step) | Full generator tier×shape sweep (24 combinations, closing 1.11's sampling); `tests/perf/*.bench.ts` + `tests/perf/baseline.json`; the three Phase 1 perf open items measured; Gate B ADV-012/013 performance tests; this packet | net +20 (65→66 files, 1090→1110 tests): the sweep grew from 10 to 25 tests (+15), plus 2 new route-search completion tests (§4), plus 3 new Gate B performance tests |

`npm run check` test-file/test count, from `docs/PROGRESS.md`: 2.1 → 48/893; 2.2 → 50/911; 2.3 → 54/968; 2.4 → 55/986; 2.5 → 57/1006; 2.6 → 62/1060; 2.7 → 65/1090; 2.8 (now, re-run for this packet) → 66/1110.

## 3. ADV/INV/P matrix — Gate B rows

Method: identical to Gate A's (`tests/adversarial/gate-matrix.ts` — a script walks every `*.test.ts` under `src/` and `tests/`, records `describe`/`it`/`test` titles including `it.each` templates, and counts an ID only when it is in a title, never a comment). Re-run for this packet.

### 3.1 Gate B ADV rows (25 rows; `docs/TEST_STRATEGY.md §5`, Gate column containing "B")

| ID | Case | Test file — test name (representative) |
|---|---|---|
| ADV-001 | A → B, one reaction | `navigator.test.ts` |
| ADV-002 | A → B via two reactions | `precursor.test.ts` — bundling, with INV-26 |
| ADV-003 | A → B → C plus A → C | `precursor.test.ts` — no transitive reduction |
| ADV-004 | A → B and B → A | `precursor.test.ts` — ⇌ only with `reverse_of`, mirrored endpoints |
| ADV-005 | self-loop A → A | `reactions-more.test.ts` — RXN-017 (Phase 1; the validation half only). The graph shape itself (consumes+produces between the same node) is exercised under a different ID: `reaction-explorer.test.ts`'s ADV-051(a). **The "loop glyph" GRAPH_SEMANTICS.md §9 describes is a render/layout concept (Phase 5) — not claimed here.** |
| ADV-006 | 2 reactants → 3 products | `precursor.test.ts` — full-fidelity reaction reveal |
| ADV-007 | same product major in R1, minor in R2 | `precursor.test.ts` — widened bundling |
| ADV-011 | chain depth 60 | `traversal.test.ts` |
| ADV-012 | hub with 1,000 reactions | `precursor.test.ts` (cap+overflow, correctness) **and** `gate-b-performance.test.ts` (performance part, new this step) |
| ADV-013 | dense 5k-reaction graph, projection < 16 ms p95 | `gate-b-performance.test.ts` (new this step — see §5 for the honest scope: local/bounded projections only) |
| ADV-014 | disconnected components, unanchored reactions | `navigator.test.ts` |
| ADV-015 | species in several classes | `navigator.test.ts` |
| ADV-027 | water never a node but referenced | `reaction-explorer.test.ts` |
| ADV-046 | A → B and A → C (divergent) | `navigator.test.ts` |
| ADV-047 | A → C and B → C (convergent) | `navigator.test.ts` |
| ADV-048 | A + B → C | `navigator.test.ts`, `precursor.test.ts` |
| ADV-049 | diamond A→B, A→C, B→D, C→D | `search.test.ts` — both A→D routes |
| ADV-050 | A → B → C → A | `traversal.test.ts` (traversal part); `search.test.ts` (route part) |
| ADV-051 | same compound twice in one reaction | `reaction-explorer.test.ts` |
| ADV-052 | one product made by 25 reactions | `precursor.test.ts` |
| ADV-053 | spectator, no visual node | `reaction-explorer.test.ts` |
| ADV-054 | reaction with intermediates | `reaction-explorer.test.ts` |
| ADV-055 | multiple mechanism variants | `mechanisms.test.ts` |
| ADV-056 | conditional reversibility | `precursor.test.ts` |
| ADV-057 | cross-chapter reaction | `syllabus.test.ts` |

All 25: **titled**. (Gate A's caveat about "titled" not implying rigour applies equally here; the title-level scan is a completeness floor, not a quality measure — the rows above were also read directly, in earlier steps' PROGRESS.md entries, when each was built.)

### 3.2 P-09, P-10, INV-22, INV-26

| ID | Result |
|---|---|
| P-09 | titled, `src/core/graph/route/search.test.ts` |
| P-10 | titled, `tests/property/projections.test.ts`, `src/core/graph/*/*.test.ts` (per-projection) |
| INV-22 | titled (graph part), `traversal.test.ts`, `search.test.ts`; the Phase 1 part was already covered at Gate A |
| INV-26 | titled, `tests/property/projections.test.ts`'s harness (`checkRegistry`) plus multiple per-projection tests |

## 4. `src/core/graph` coverage detail

Full-suite `src/core` coverage: 97.11% statements, 91.12% branches, 98.55% functions, 98.8% lines (thresholds 90%/85% comfortably met). Per-subfolder (isolated run, for detail only — thresholds are enforced on the full suite, not per-folder):

| Folder | Lines | Branches | Note |
|---|---|---|---|
| `src/core/graph` (contracts/kit/registry/scope/traversal/ids) | 99.3% | 96.7% | — |
| `src/core/graph/navigator` | 95.6% | 91.4% | — |
| `src/core/graph/reaction-explorer` | 98.3% | 82.2% | a couple of defensive guards (missing record mid-traversal) |
| `src/core/graph/precursor` | 96.7% | 76.8% | degree-cap/overflow edge cases, mostly defensive |
| `src/core/graph/route` | 94.1% | **73.7%** | see below |
| `src/core/graph/{mechanisms,named-reactions,reagent-explorer,syllabus}` | 97–100% | 82–87% | one-hop views, small files |
| `src/core/indexes` | 98.6% | 98.7% | — |

**`src/core/graph/route`'s 73.7% branches, in detail** (isolated-folder run; not a threshold failure — the full-suite run above is what `npm run check`'s coverage target measures):
- `moves.ts` (87.1%): the `reaction?.kind !== 'reaction'` and `outcome === undefined` guards in `backwardMovesInto` are defensive against an inconsistent index (never actually inconsistent, since `productionsOf` only returns rows for reactions that exist and outcomes that exist on them) — effectively unreachable with a correct index.
- `rank.ts` (75%): `compareRoutes`'s final tie-break loop falls back to `?? ''` for `a[i]?.reactionId`; by the time this loop runs, `a.length === b.length` is already established, so `a[i]` is never actually `undefined` — the `?? ''` side is defensive, not reachable.
- `search.ts` (70.1%): the two class-membership completion branches (`startFrom` containing a class that the reached species belongs to, or a species whose class was reached) **were genuinely untested** until this step — added (`search.test.ts`, "startFrom completion by class membership", 2 new tests). The `withExtraWarning` function's `first === undefined` guard is defensive (the array it receives is never empty when called). One line (`options.now !== undefined && ...`, the injected-clock branch) is untested because no route-search test injects a clock — `traverse`'s own tests already cover that pattern once (`traversal.test.ts`); not duplicated here for a second bounded primitive with the same shape.

None of these represent an untested *documented behaviour*; they are either now covered (the class-membership completion gap, fixed this step) or defensive code with no reachable false path given index/array invariants already established elsewhere. Not chased further, matching Gate A's own precedent (`commands/replace.ts`, `validation/rules/helpers.ts` were left below 95%/85% with a named reason).

## 5. Benchmarks vs. budgets (`tests/perf/*.bench.ts`, `tests/perf/baseline.json`)

Design tier = `docs/PERFORMANCE_ARCHITECTURE.md §1` (2,000 entities, 5,000 reactions, 15,000 relationships+mappings). Numbers are `vitest bench` means, one run, developer workstation — not a dedicated CI runner class; see the caveat in `baseline.json` and §0 item 3. Full detail (min/max/p75/p99/p995/p999, all six shapes touched, both `dense` and `hub_explosion` for most operations) is in `tests/perf/baseline.json`, regenerable with `npm run bench`.

| Operation | Budget (§2 row) | Design tier, `dense` | Design tier, `hub_explosion` | Verdict |
|---|---|---|---|---|
| Commit (`dispatch`, one field) | 16 ms (Commit) | 2.64 ms | 2.77 ms | **pass**, 6× margin |
| Undo + redo (one pair) | 16 ms (Undo / redo) | 4.07 ms | 2.69 ms | **pass** |
| Rejected commit (index rebuild) | *no §2 row* | 180.19 ms | 163.36 ms | flagged — §0 item 3 |
| `scopeOf`, once, on the hub | *no §2 row* | 0.016 ms | 0.122 ms | negligible |
| `scopeOf`, twice (today's pattern) | *no §2 row* | 0.031 ms | 0.244 ms | 2.0× the once-cost, as expected — §0 item 2 |
| `validateTouched`, on the design-tier hub | 16 ms (inside Commit) | 0.54 ms | 4.99 ms | **pass** |
| `validateTouched`, on the ADV-012 literal hub (1,000 reactions, ~60 total species) | 16 ms (inside Commit) | — | 24.34 ms | **fail** — §0 item 1 |
| `navigator` build, focused on the hub | 16 ms (Projection build) | 27.2 ms | 21.81 ms | **fail** — §0 item 1 |
| `navigator` build, ADV-012 literal case (1,000 total reactions) | 16 ms | — | 3.65 ms | **pass** (see note below) |
| `reaction_explorer` build, focused on the hub | 16 ms | 5.89 ms | 8.67 ms | **pass** |
| `precursor_explorer` build, focused on the hub | 16 ms | 5.10 ms | 1.22 ms | **pass** |
| Route search to the hub, no `startFrom` | *no §2 row; bounded like a projection* | 6.25 ms (`dense`) | 0.0005 ms (`chain`) | **pass** |
| `validateAll`, whole state | 3,000 ms (Full validation, design target) | 248.21 ms | 219.15 ms | **pass**, 12× margin |

**Root cause of the two failures**, both genuinely measured, neither a bug:
- **`navigator`**: its build scans every reaction in `ctx.state.records.reaction` once per call (`src/core/graph/navigator/build.ts`), because it is a whole-dataset hub-and-arrow overview (GRAPH_SEMANTICS.md §3), not a local seeded traversal — `TraversalLimits` bounds its *output* (≤ `maxNodes` hubs, ≤ `maxEdges` arrows) but not its *input scan*. Cost tracks total reactions in the state, not the focused hub's degree: the same view over the ADV-012 literal case (1,000 total reactions) measures 3.65 ms, comfortably inside budget, while the design tier (5,000 reactions, any shape) measures 20–29 ms regardless of which hub is focused. `reaction_explorer` and `precursor_explorer` are genuinely local (bounded traversal from a seed) and stay fast at every scale tested.
- **`validateTouched` on a hub**: `scopeOf` walks every referrer of the touched record (`src/core/validation/validator.ts`); for a species referenced by ~1,000 reactions, that is ~1,000 records' worth of L2/L3 rule execution in one commit. The doubled `scopeOf` call (§0 item 2) is real but small (≈3–5% of the 24.34 ms); the dominant cost is rule execution itself, proportional to the touched record's fan-out.

Both are architecture-level characteristics, not implementation bugs, and neither was fixed this step (per the step's own framing: "measure Phase 1 performance open items", not "fix"). Recommendations, for the reviewer to accept, defer, or redirect:
1. `navigator`: maintain its hub/arrow candidates incrementally (an index updated from each `ChangeSet`, like `Participation`/`Production`) instead of a full-state scan per build — a real but scoped follow-up, not attempted here to avoid an unreviewed architecture change late in a benchmarking step.
2. `validateTouched` on an extreme hub: no change proposed; 24 ms is under the "no main-thread task > 50 ms" budget (§2), so it does not visibly stall the UI even though it exceeds the specific 16 ms *commit* row. If real content ever produces a 1,000-reaction hub, worth re-measuring against the actual number rather than this synthetic case.
3. The doubled `scopeOf`: a real, contract-shaped fix (`Validator.validateTouched` would need to accept or return the scope it already computes) — small enough saving (§ table) that it is left as a tracked inefficiency rather than an amendment this step.

## 6. Full generator tier × shape sweep (closes step 1.11's sampling gap)

`tests/property/generator-tiers.test.ts` now runs all 4 tiers (`tiny`, `initial`, `design`, `stress`) × all 6 shapes (`chain`, `wide`, `dense`, `cyclic`, `duplicate_endpoint`, `hub_explosion`) = 24 combinations (25th test just asserts the sweep itself has 24 cases, so a future edit to the tier/shape lists cannot silently shrink it). Every combination validates with zero L1–L3 ERRORs. Measured cost: ≈12 s for the full sweep (`design`/`stress` tiers dominate; `validateAll` alone is ≈220–260 ms per design-tier combination per §5), added to `npm run check` without a noticeable difference in total run time (66 files / 1,110 tests / ~17 s test-execution time, vs. 65 files / 1,090 tests / ~11 s before this step — the increase is almost entirely this sweep and the new perf/completion tests).

Step 1.11's original caveat ("design/stress are sampled for two shapes each; full tier × shape sweeps are planned for step 2.7" — actually delivered in 2.8, since 2.7 turned out to be route search) is now closed.

## 7. Deviations and decisions, steps 2.1–2.8

Summarised from `docs/PROGRESS.md`'s per-step "Decisions" sections (full detail there); repeating only what a reviewer would need without opening every step.

| Step | Decision |
|---|---|
| 2.3 | Arrows drawn for **main** products only; a reaction unreachable from any anchored hub is listed *and* drawn on Unclassified (never zero times). |
| 2.4 | `EdgeSemantic`/edge builders take a required `view: ViewKey` (ADR-027, contract change, additive) so the same participation gets a distinct ID per view. |
| 2.5 | `EdgeSemantic: 'overflow'`, `DEFAULT_DEGREE_CAP = 12` (ADR-028, additive). The ⇌ badge is drawn only between mirrored `reverse_of` pairs — a reviewer decision recorded in GRAPH_SEMANTICS.md, no schema change. |
| 2.6 | `EdgeSemantic: 'uses_mechanism'`; classification edges from a reaction (topic mapping, named-reaction family, reaction-level mechanism link) never carry `reactionId`, only participation/production edges do (ADR-029, additive) — caught by the projection harness's own INV-26 check on the first real cross-chapter reaction. |
| 2.7 | Any qualifying `reactant`-role participant (not only `isPrimarySubstrate`) is a valid backward "carried" substance — GRAPH_SEMANTICS.md §9 says "reactants", plural. A side input must not already be on the current path (else Fischer esterification ⇌ its own hydrolysis would let a route "assume available" the very thing it is making — found by the demo test, fixed before commit). `DEFAULT_ROUTE_MAX_STEPS`/`MAX_ROUTES` added (additive, same precedent as `DEFAULT_TRAVERSAL_LIMITS`). |
| 2.8 | No contract or schema change. Two class-membership-completion test gaps found and closed (§4). `oneHubState()` (`src/test-support/perf-kit.ts`) added as a literal-ADV-012 generator scenario, reusing the existing generator machinery with parameters chosen to match the row, not a bespoke fixture. |

No amendment-procedure entries were needed this step (all Phase 2 contract changes are ADR-027…029 from earlier steps, already recorded).

## 8. Review-required and open items carried forward or added

- Everything from Gate A's own list still stands (chemistry unverified, exam coverage unverified, the propanone/ethanal demo deviation).
- **New, from this step** (§0, §5): the two budget misses (`navigator` at the design tier; `validateTouched` on an extreme hub) and the doubled `scopeOf` call — measured, explained, not fixed; reviewer to decide fix-now vs. defer.
- **New, from this step**: no CI workflow exists yet to enforce `PERFORMANCE_ARCHITECTURE.md §9`'s ">20% regression against baseline fails" rule automatically; `tests/perf/baseline.json` is today's recorded evidence, re-generated by `npm run bench`, not yet diffed by any script.
- Carried from Gate A, still true: `validateTouched reruns all rules per subject in scopeOf; hub records may exceed the 16 ms commit budget` — **now confirmed and quantified** (§5), closing that specific open item's uncertainty even though the underlying behaviour is unchanged.

---
Preparation notes: `docs/reviews/gate-b-packet.md`, prepared alongside `docs/PROGRESS.md` step 2.8 and `docs/PROJECT_STATE.json`. `tests/perf/*.bench.ts` and `tests/perf/baseline.json` are committed; the raw `vitest bench` console output that produced the numbers in §5 is not (it is reproducible with `npm run bench`).
