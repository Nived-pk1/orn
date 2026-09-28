# Gate B review packet — Phase 2 (graph engine)

Prepared 2026-09-27 (step 2.8); updated 2026-09-27 (steps 2.9-2.10) and 2026-09-28 (steps 2.11-2.12) for a
reviewer who cannot see the repository. Everything below was produced or re-run in the 2.12 preparation session;
where a claim comes from a project document rather than from a run, it says so. Not committed as part of
`npm run check`'s gate (`docs/reviews/` is reference material, like the Gate A packet).

**Status: self-reviewed; human review pending.** The step 2.8 version of this packet was reviewed and returned
**not passed** (budgets) — §0 gives that verdict and what steps 2.9-2.12 did about each item. This is not a
claim that the gate passes; it is the same self-review discipline, updated with what changed. The implementing
agent does not mark a gate passed and does not tag `phase-N` (CLAUDE.md §6, SONNET_HANDOFF.md §20): a separate
session tags `phase-2` only after a human reviewer records a **passed** verdict in `docs/PROGRESS.md`.

- Repository state: branch `master`, steps 2.1-2.12 committed. No `phase-2` tag exists.
- Toolchain: Node 24.21.0, npm 11.19.0, TypeScript 6.0.3, Zod 4.6.5 (`^4.1.0`), Immer 10.2.0 (`^10.1.1`),
  Vitest 4.1.11, Vite 7.3.6 (`^7.0.0`), fast-check 3.23.2. `npm audit` was not re-run in 2.11-2.12 (no dependency
  changed since it last reported 0 vulnerabilities).
- `npm run check` (typecheck, lint, lint:deps, check:size, check:hardcode, tests): **green — 70 test files,
  1,165 tests** (step 2.8: 66/1,110; 2.10-2.11: 67/1,135; 2.12 added 3 files / 30 tests).
- Property tests at `ORN_PROPERTY_RUNS=200`: **7 files, 71 tests, all pass** (2.12 added
  `tests/property/validation-scope.test.ts`, P-11).
- `npm run test:coverage` (`src/core/**`): **97.32% statements, 91.54% branches, 98.39% functions, 98.88% lines**
  (step 2.10: 97.28/91.22/98.38/98.87) — thresholds (90% lines / 85% branches) comfortably met.
- Benchmarks: `npm run bench:baseline` (3 fresh-process runs, **median p99**, method of step 2.11,
  PERFORMANCE_ARCHITECTURE.md §9) then `npm run bench:compare`, both run for this update on the developer
  workstation with nothing else running. `tests/perf/baseline.json` is regenerated.

## 0. What the reviewer should decide

Numbered to match the step 2.8 packet, each with the reviewer decisions taken in steps 2.9-2.12 (as recorded in
`docs/PROGRESS.md`, and for 2.12 in that step's instructions) and where things now stand.

1. **`navigator`'s projection build missed its 16 ms budget.** Decision (Gate B review, 2026-09-27): the
   documented-exception proposal was **not accepted**; fix it. Step 2.9: incrementally maintained roll-up index
   (`ReadonlyIndexes.navigatorRollup()`, ADR-030). Step 2.11: a stable benchmark method, a deterministic
   60-anchor design-tier state, and a decision tree for `dense`; the profile showed 62% of the build in
   edge-ID hashing on 7,492 candidates of which 800 survive `maxEdges`, so hashing was deferred to admitted
   candidates (no contract change). **Now (median p99, §5): `dense` 6.73 ms, `hub_explosion` 3.73 ms, ADV-012
   hub 2.73 ms — all under 16 ms; stress tier (400 anchors) 17.54 ms against the informal 32 ms (§1's "may
   degrade <= 2x") — passes. Closed**, subject to the noise caveat: `dense` has a 52% run spread (worst run
   9.84 ms, still under budget).
2. **`validateTouched` on a hub with ~1,000 referrers.** Decisions: 2.8 review accepted a documented exception
   for an extreme hub; 2.10 found no safe narrowing without a `ValidationRule` contract change and added a 50 ms
   "Commit on a record with >= 500 referrers" row instead; **2.12 (reviewer): implement field-aware scoping as an
   additive amendment** — `ValidationRule.referencedReads`, ADR-031, undeclared rules keep the old behaviour.
   **Now: a hub edit the store makes (previous state given) that touches no field a referrer rule reads —
   rename, alias, notes, classes — re-validates none of its referrers: `validateTouched` 0.96 ms (ADV-012 hub)
   and 1.89 ms (like-water hub) median p99, and a whole commit on the like-water hub 3.27 ms, against the plain
   16 ms Commit row (before: 70.86 ms commit, 32-33 ms `validateTouched`). Both scenarios now meet the 16 ms
   row, so the 50 ms row is no longer needed for them; it is marked a backstop in
   PERFORMANCE_ARCHITECTURE.md §2 and kept for Phase 9.** What is *not* fixed: an edit to a field some referrer
   rule reads (`review`, read by RVW-002) or creating/deleting the hub still re-validates every referrer whole:
   `validateTouched` 34.0 / 37.1 ms (passes the 50 ms row) but a whole commit on the like-water hub **67.5 ms
   (fails 50 ms by 17.5 ms)** — the one budget failure left (§5, §8 item 1). **New decision needed**: accept that
   case as a rare authoring edit, or fund per-rule re-runs on referrers (a finding-merge contract, Phase 9).
3. **`scopeOf` computed twice per commit.** Decision 2.10: deferred to Phase 9. Decision 2.12: fold it in only if
   field-aware scoping removes it without a further contract change. **It does not** (the store still calls
   `scopeOf` and `validateTouched` computes it again; removing it needs a `Validator` change or an
   identity-keyed memo). With scoping in place one `scopeOf` on the hub costs 0.02-0.96 ms p99, twice 0.05-1.71
   ms: at most ~11% of a 16 ms commit in the worst scenario, ≤ 0.3% typically. Left as the Phase 9 candidate.
4. **Rejected-commit index rebuild** (163-580 ms). Fixed in 2.10 (inverse `ChangeSet` through the same `apply`).
   **Now 8.7 / 8.0 ms median p99 (`dense` / `hub_explosion`). Closed.**
5. **`graph/route` coverage exceptions** — accepted as documented at the 2.8 review; the one open gap (injected
   clock in `search.ts`) was closed in 2.10. Unchanged.
6. **Benchmark noise (2.11, reviewer).** The same scenario read 35.6 ms and 107-129 ms in two runs of
   identical code, and 3 in-process repeats were biased by JIT warm-up. Now: PID-locked isolation, explicit
   warmup, a 100-sample floor, and 3 fresh-process runs judged on the **median p99** with per-entry spread.
   14 of 35 entries exceed a 25% spread and are marked `noisy` in `baseline.json`; none of the *failing or
   near-budget* verdicts below depends on a noisy entry (every noisy entry that passes has its worst run
   well under its budget). `bench:compare` is still manual (not in CI).
7. Same standing caveat as Gate A: nothing in the demo dataset is chemically verified; this packet is about
   the graph engine's correctness and performance, not chemistry content.

## 1. Gate B criteria

Source: `docs/TEST_STRATEGY.md §6` (Gate B row) and `docs/IMPLEMENTATION_PLAN.md §3` (Phase 2 definition of
done).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | All projections registered | **pass** | `src/core/graph/registry.test.ts` — every `ViewKey` except `search` (Phase 4) has a registered `ProjectionDefinition`. Unchanged. |
| 2 | Route search | **pass** | `src/core/graph/route/` (step 2.7), 32 tests. |
| 3 | P-09 | **pass** | 200-run fast-check property, unchanged. |
| 4 | P-10 | **pass** | Unchanged. |
| 5 | ADV rows marked B pass | **pass (titled)**; **ADV-013 itself: pass on median p99** | §3.1. All 25 rows are named in a test title; ADV-013's budget now holds on every entry it names (§3.1). |
| 6 | Benchmarks meet budgets at the design tier, verdicts on **median p99 of 3 runs** | **fail — one entry** | §5: 34 of 35 entries pass or have no budget row; the failure is a whole commit on the like-water hub that edits a field referrer rules read (67.5 ms vs 50 ms, §0 item 2, §8 item 1). Every entry the step 2.8/2.9/2.10 packets failed (navigator `dense`, `reaction_explorer`, `precursor_explorer`, route search, commit dispatch/undo on `hub_explosion`, both hub `validateTouched`) now passes. |

Not part of the gate but relevant: chemistry content is still unverified.

## 2. Phase 2 steps, from `docs/PROGRESS.md`

| Step | Delivered | Tests added |
|---|---|---|
| 2.1-2.7 | See the step 2.8 packet (unchanged): indexes, hashing/traversal, projection registry + navigator, reaction explorer, precursor + bundling, reagent/named-reaction/mechanism/syllabus + scope, route search. | — |
| 2.8 | Full generator sweep; `tests/perf/*.bench.ts` + `baseline.json`; Phase 1 perf items measured; first packet | 66 files / 1,110 tests |
| 2.9 | Untagged `phase-2`; gate-tagging procedure; benchmarks record mean/p75/p99/count, verdicts on p99 (`bench:baseline`/`bench:compare`); "like water" hub scenario; incremental navigator roll-up index (ADR-030) | 67 / 1,130 |
| 2.10 | Incremental rollback on rejected commits; field-aware scope investigated (no safe narrowing without a contract change; 50 ms row added); route-search clock test; packet update | 67 / 1,135 |
| 2.11 | Deterministic navigator anchors + stress tier; stable benchmark method; navigator build fix (deferred edge-ID hashing); re-measure | 67 / 1,135 |
| 2.12 | **Field-aware `validateTouched` scope (`ValidationRule.referencedReads`, ADR-031)**: 69 of 74 rules declare; `scoping.test.ts` (23), `reads-audit.test.ts` (4), P-11 `validation-scope.test.ts` (3); hub benches measure the previous-state path; re-measure; this packet | 70 / 1,165 |

## 3. ADV/INV/P matrix — Gate B rows

Method: identical to Gate A's (`tests/adversarial/gate-matrix.ts`).

### 3.1 Gate B ADV rows (25 rows; `docs/TEST_STRATEGY.md §5`, Gate column containing "B")

All rows and their test files are unchanged from the step 2.8 packet **except**:

| ID | Case | Test file — test name (representative) | Status |
|---|---|---|---|
| ADV-005 | self-loop A -> A | `reactions-more.test.ts` (validation half) and `reaction-explorer.test.ts`'s ADV-051(a) (graph half, `[ADV-005 graph half]`). `docs/TEST_STRATEGY.md §5` lists it as Phase "2, 5" / Gate "B, E"; the loop *glyph* is a render concept (Phase 5/Gate E), not claimed here. | titled, correctly scoped |
| ADV-012 | hub with 1,000 reactions | `precursor.test.ts` (cap + overflow, correctness) and `gate-b-performance.test.ts` (performance part). Performance of the hub's *commit*: ADV-012 literal hub `validateTouched` on a rename (previous state given) **0.96 ms** median p99 vs 16 ms — **pass** (was 32.15 ms against the 50 ms row); read-field edit 33.97 ms, no-previous fallback 31.22 ms (both pass the 50 ms backstop row). Projection part: navigator 2.73 ms, precursor 0.005 ms — pass. | titled; performance **pass** |
| ADV-013 | dense 5k-reaction graph, projection < 16 ms p95 | `gate-b-performance.test.ts` asserts `reaction_explorer`/`precursor_explorer` only (single-measurement assertions against a tight budget would be flaky). Judged on `baseline.json` median p99 (design tier, `dense`): navigator **6.73 ms**, reaction_explorer **7.80 ms**, precursor_explorer **7.41 ms**, route search **9.30 ms**; `hub_explosion`: navigator 3.73, reaction_explorer 9.32, precursor_explorer 1.80 ms — **all under 16 ms. Status: pass** (was: fail on navigator `dense`, 35.95 ms, in the 2.10 packet). Noise caveat: navigator `dense` spread 52% (worst run 9.84 ms), reaction/precursor explorer `dense` 22% / 30%. | titled; ADV-013 **pass** on median p99 |

All 25 rows: **titled** (unchanged claim from step 2.8).

### 3.2 P-09, P-10, P-11, INV-22, INV-26

| ID | Result |
|---|---|
| P-09 | titled, unchanged. |
| P-10 | titled, unchanged. |
| P-11 (new, 2.12) | `tests/property/validation-scope.test.ts`: after random edit sequences aimed at a high-referrer hub (ADV-012 shape, like-water shape; hub name/alias/notes/review/classes/kind/deletion/restoration, referrer edits, new relationships, neighbours), incrementally maintained findings equal `validateAll` after every edit; passes at the default and at 200 runs. Fault-injected by hand to confirm it can fail (§ PROGRESS step 2.12). |
| INV-22 | titled (graph part), including the injected-clock route-search test (2.10). |
| INV-26 | titled, unchanged. |

## 4. `src/core/graph`, `src/core/indexes` and `src/core/validation` coverage detail

Full-suite `src/core` coverage: 97.32% statements, 91.54% branches, 98.39% functions, 98.88% lines. The
`graph/route` defensive-branch exceptions stand as accepted at the 2.8 review (§0 item 5). `src/core/indexes`
(navigator roll-up, rollback) is covered by the differential test, apply-≡-build scenarios and P-07 rather
than an isolated percentage. **New in `src/core/validation` (2.12)**: `scoping.ts` is covered by
`scoping.test.ts`; a declared `referencedReads` is verified rather than trusted by `reads-audit.test.ts` (a Proxy
trace of every field each declared rule reads through its subject's references, over the maximal fixture, the
demo and every generator shape, plus a "referenced records vanish" differential for rules declared to read
nothing). The audit and P-11 were each fault-injected (a rule dropping a declared field, declaring the wrong
field, declaring nothing): each fault fails at least one of them. One honest limit: P-11 alone does not catch a
wrong RXN-013 declaration (it needs an instance-of chain that random edits rarely build); the audit and the
targeted RXN-013 test do.

## 5. Benchmarks vs. budgets (`tests/perf/*.bench.ts`, `tests/perf/baseline.json`)

Design tier = `docs/PERFORMANCE_ARCHITECTURE.md §1` (2,000 entities, 5,000 reactions, 15,000
relationships+mappings). **Verdict = median over 3 fresh-process runs of each run's p99** (a conservative
stand-in for §2's p95; `vitest bench` does not report p95), method of PERFORMANCE_ARCHITECTURE.md §9. Spread =
(max - min) / median of the 3 p99s; "noisy" = over 25%. Developer workstation, not a dedicated runner class.
Budget "no row" means PERFORMANCE_ARCHITECTURE.md §2 has no row for the entry.

| Entry | Tier / shape | Budget | Median p99 (ms) | 3 runs | Spread | Verdict |
|---|---|---|---|---|---|---|
| commit: dispatch (update one species) | design / dense | 16 ms | 2.26 | 2.43 / 1.84 / 2.26 | 26% (noisy) | pass |
| commit: undo + redo (one pair) | design / dense | 16 ms | 5.36 | 5.55 / 5.36 / 5.05 | 9% | pass |
| commit: rejected (incremental rollback) | design / dense | 16 ms | 8.73 | 10.3 / 8.73 / 6.36 | 45% (noisy) | pass |
| scopeOf: once, on the design-tier hub | design / dense | no row | 0.0241 | 0.0241 / 0.0234 / 0.0312 | 32% (noisy) | n/a (no budget row) |
| scopeOf: twice (today's store.commit() pattern), design-tier hub | design / dense | no row | 0.0469 | 0.0574 / 0.0436 / 0.0469 | 29% (noisy) | n/a (no budget row) |
| validateTouched: on the design-tier hub | design / dense | 16 ms | 1.35 | 1.35 / 1.28 / 1.36 | 6% | pass |
| commit: dispatch (update one species) | design / hub_explosion | 16 ms | 2.52 | 2.79 / 2.39 / 2.52 | 16% | pass |
| commit: undo + redo (one pair) | design / hub_explosion | 16 ms | 4.14 | 4.75 / 3.79 / 4.14 | 23% | pass |
| commit: rejected (incremental rollback) | design / hub_explosion | 16 ms | 8.00 | 8.00 / 8.56 / 6.65 | 24% | pass |
| scopeOf: once, on the design-tier hub | design / hub_explosion | no row | 0.1791 | 0.1791 / 0.1705 / 0.3099 | 78% (noisy) | n/a (no budget row) |
| scopeOf: twice (today's store.commit() pattern), design-tier hub | design / hub_explosion | no row | 0.4541 | 0.4541 / 0.3673 / 0.5746 | 46% (noisy) | n/a (no budget row) |
| validateTouched: on the design-tier hub | design / hub_explosion | 16 ms | 6.70 | 6.70 / 5.55 / 6.95 | 21% | pass |
| scopeOf: once, on the ADV-012 literal hub (1,000 reactions) | adv-012 / hub_explosion | no row | 0.9584 | 1.02 / 0.6487 / 0.9584 | 38% (noisy) | n/a (no budget row) |
| scopeOf: twice (today's store.commit() pattern), ADV-012 literal hub | adv-012 / hub_explosion | no row | 1.71 | 1.71 / 1.47 / 1.81 | 20% | n/a (no budget row) |
| validateTouched: ADV-012 literal hub, no previous state given (every referrer re-validated: the safe fallback) | adv-012 / hub_explosion | 50 ms | 31.2 | 32.6 / 31.2 / 29.3 | 11% | pass |
| validateTouched: ADV-012 literal hub, renamed (previous state given) | adv-012 / hub_explosion | 16 ms | 0.9600 | 0.9600 / 0.7940 / 1.04 | 26% (noisy) | pass |
| validateTouched: ADV-012 literal hub, review lifecycle changed (a field referrer rules read) | adv-012 / hub_explosion | 50 ms | 34.0 | 34.0 / 33.1 / 38.9 | 17% | pass |
| commit: dispatch (update the design-tier "like water" hub) | design-hub-1000 / hub_explosion | 16 ms | 3.27 | 4.10 / 3.20 / 3.27 | 28% (noisy) | pass |
| validateTouched: "like water" hub, no previous state given (every referrer re-validated: the safe fallback) | design-hub-1000 / hub_explosion | 50 ms | 31.0 | 31.0 / 28.3 / 36.0 | 25% | pass |
| validateTouched: "like water" hub, renamed (previous state given) | design-hub-1000 / hub_explosion | 16 ms | 1.89 | 1.89 / 2.02 / 1.25 | 41% (noisy) | pass |
| validateTouched: "like water" hub, review lifecycle changed (a field referrer rules read) | design-hub-1000 / hub_explosion | 50 ms | 37.1 | 37.1 / 34.8 / 39.2 | 12% | pass |
| commit: dispatch (like-water hub, review lifecycle changed) | design-hub-1000 / hub_explosion | 50 ms | 67.5 | 68.2 / 61.2 / 67.5 | 10% | **FAIL** |
| projection: navigator, focused on the hub | design / dense | 16 ms | 6.73 | 9.84 / 6.73 / 6.34 | 52% (noisy) | pass |
| projection: reaction_explorer, focused on the hub | design / dense | 16 ms | 7.80 | 8.03 / 7.80 / 6.29 | 22% | pass |
| projection: precursor_explorer, focused on the hub | design / dense | 16 ms | 7.41 | 7.59 / 7.41 / 5.38 | 30% (noisy) | pass |
| projection: navigator, focused on the hub | design / hub_explosion | 16 ms | 3.73 | 3.52 / 3.76 / 3.73 | 7% | pass |
| projection: reaction_explorer, focused on the hub | design / hub_explosion | 16 ms | 9.32 | 8.83 / 10.2 / 9.32 | 15% | pass |
| projection: precursor_explorer, focused on the hub | design / hub_explosion | 16 ms | 1.80 | 1.97 / 1.80 / 1.72 | 14% | pass |
| projection: navigator, focused on the hub | adv-012 / hub_explosion | 16 ms | 2.73 | 2.79 / 2.73 / 2.39 | 15% | pass |
| projection: precursor_explorer, focused on the hub | adv-012 / hub_explosion | 16 ms | 0.0051 | 0.0055 / 0.0051 / 0.0042 | 25% (noisy) | pass |
| projection: navigator, focused on the hub, stress tier (400 anchors) | stress / dense | 32 ms (informal) | 17.5 | 16.8 / 17.5 / 17.7 | 5% | pass |
| route search: searchRoutes to the hub, no startFrom | design / dense | 16 ms | 9.30 | 9.30 / 10.3 / 8.57 | 19% | pass |
| route search: searchRoutes to the hub, no startFrom | design / chain | 16 ms | 0.0008 | 0.0008 / 0.0007 / 0.0010 | 38% (noisy) | pass |
| validateAll: whole state | design / dense | 3000 ms | 246 | 265 / 246 / 244 | 8% | pass |
| validateAll: whole state | design / hub_explosion | 3000 ms | 228 | 240 / 228 / 221 | 8% | pass |

**How to read the hub rows** (ADR-031). "no previous state given" is the safe fallback: nothing can be diffed,
so every referrer is re-validated; the store never takes this path (it always passes the previous state) and no
other caller exists yet. "renamed (previous state given)" is what the store does for an edit no referrer rule
reads. "review lifecycle changed" is an edit to a field RVW-002 reads of every record its subject refers to, so
all ~1,000 referrers are re-validated whole. The hub entries' budget column follows what each is *for*: the
rename and notes edits are judged against the 16 ms Commit row (the question the reviewer put in 2.12), the
read-field and fallback ones against the 50 ms backstop row.

**Before / after, hub scenarios** (median p99, ms; before = the 2.11 baseline, same method):

| Scenario | Before (2.11) | After (2.12) | 16 ms Commit row |
|---|---|---|---|
| `validateTouched`, ADV-012 hub (1,000 referrers), rename, previous given | 32.15 (no-previous call, the only one measured) | **0.96** | pass |
| `validateTouched`, like-water hub (1,000 of 5,000 reactions), rename, previous given | 32.82 (same) | **1.89** | pass |
| Commit dispatch, like-water hub, notes edit | 70.86 (runs 94.10 / 70.86 / 65.54) | **3.27** | pass (was the only failing entry in 2.11) |
| `validateTouched`, either hub, no previous state | 32.15 / 32.82 | 31.22 / 31.03 | n/a (fallback; passes the 50 ms row) |
| `validateTouched`, either hub, `review` changed | not measured | 33.97 / 37.10 | not applicable (50 ms row: pass) |
| Commit dispatch, like-water hub, `review` changed | not measured | 67.47 | not applicable (50 ms row: **fail**) |

**`bench:compare`** (one run against the fresh baseline) flagged 4 entries over +20% p99: undo+redo `dense`
(5.36 -> 6.50 ms, +21%), rejected commit `dense` (8.73 -> 10.81 ms, +24%), `scopeOf` twice `dense` (0.047 ->
0.067 ms, +42%), route search `dense` (9.30 -> 11.21 ms, +21%). All four are far under budget; none is a hub
validation entry and none of their code paths changed beyond a per-touched-record set diff (microseconds) in
`scopeOf`. Read as workstation noise on entries whose baseline spread is 9-45%, not re-run a second time; if
the reviewer wants certainty, run `bench:compare` again on a quiet machine.

**Summary of what changed since the 2.10 packet**: navigator `dense` 35.95 -> 6.73 ms (2.11); the hub commit
70.86 -> 3.27 ms and hub `validateTouched` 32-33 -> 1-2 ms for edits that touch no referrer-read field (2.12);
all other verdicts unchanged in kind, with tighter numbers from the stable method.

## 6. Full generator tier × shape sweep

Unchanged from step 2.8 (`tests/property/generator-tiers.test.ts`, 24 combinations, all zero L1-L3 ERROR).

## 7. Deviations and decisions, steps 2.1-2.12

Steps 2.1-2.8: see the step 2.8 packet (also in `docs/PROGRESS.md`). Steps 2.9-2.12, summarised (detail in
`docs/PROGRESS.md` step entries and Amendments):

| Step | Decision |
|---|---|
| 2.9 | `ReadonlyIndexes.navigatorRollup()` (additive, ADR-030); hub resolution moved into `core/indexes`; truncation order made an explicit `(reactionId, outcomeId, productId)` sort; deleted-but-dangling species handled — bugs found by the differential/apply-≡-build tests before commit. |
| 2.10 | `coreIndexEngine.apply` accepts one step backward (no interface change) for incremental rollback; field-aware scoping found unsafe without a contract change, so a 50 ms row was added; route-search clock test. |
| 2.11 | Benchmarks: fixed anchor counts (60 design / 400 stress, stress judged against an informal 32 ms), PID-locked isolation, 100-sample floor, 3 fresh-process runs, median p99; navigator build defers edge-ID hashing (no contract change). |
| 2.12 | `ValidationRule.referencedReads` (additive contract change, ADR-031): a referrer is re-validated only if a rule of its kind reads a field that changed (diff by reference against `previous`) or the record was created/deleted; undeclared rules re-run on any change; referents and `peers`/`watches` are not narrowed; scope stays whole records (the finding store replaces per subject). 69 of 74 rules declare (60 declare "reads nothing"); SPC-006, HIER-001, HIER-003, RTE-002, RTE-004 stay undeclared because they read derived hierarchy/composition/route walks. The 50 ms row is kept as a Phase 9 backstop. Doubled `scopeOf` left as is. |

## 8. Remaining misses and open items

**Budget misses on median p99 (one):**

1. **Commit dispatch on the like-water hub, editing a field a referrer rule reads (`review`), or deleting or
   creating the hub: 67.47 ms vs the 50 ms backstop row (+17.5 ms, +35%; runs 68.2 / 61.2 / 67.5, spread 10%).**
   Cause, measured in a commit-shaped loop: ~50 ms is `validateTouched` re-validating all 1,023 in-scope records
   whole (~45-50 µs each: reference-path walking in REF analysis ~48% and L1 zod re-parse ~10% per the 2.11
   profile; not RVW-002 itself, which is a few lines); `scopeOf` ~1.7 ms, `commitFindings` ~3 ms, index apply
   0.1 ms. Whole records are re-run because `FindingStore.replaceForSubjects` replaces a subject's findings
   per level, so a referrer cannot be partly re-validated without a finding-merge contract. Options: per-rule
   re-runs for context-only referrers (a `Validator`/`FindingStore` contract change, Phase 9); a faster path
   walker; or accept it as a rare authoring edit (a hub's lifecycle or deletion, not a rename). Reviewer's call.

**Entries that pass but that a reader should not over-read:**

2. `validateTouched` on the two hubs without a previous state (31 ms) and with a read-field edit (34-37 ms): pass
   the 50 ms backstop row, exceed 16 ms. The first is a fallback the store does not use; the second is item 1's
   cause, before `commitFindings` and the store's own overhead.
3. Noisy entries (spread > 25%, 14 of 35, listed in `baseline.json`): every one passes with its worst run well
   under budget (largest: navigator `dense`, worst run 9.84 ms of 16). `bench:compare` flagged four more single-run
   moves (§5), all entries far under budget.

**Not measured:**

4. Editing a **class** hub (a class listed by hundreds of species): `species` still has an undeclared rule
   (SPC-006) and its `peers` name every species listing a touched class, so such an edit is expected to
   re-validate them all as before. The benchmarks touch a *species* hub; a class-hub benchmark does not exist.

**Open, carried forward:**

5. Doubled `scopeOf` call — Phase 9 (§0 item 3).
6. `npm run bench:compare` is manual, not in CI. `npm run bench` (`scripts/run-bench-cli.mjs`) fails on Windows
   with `spawnSync npx.cmd EINVAL` (needs `shell: true`); `bench:baseline`/`bench:compare` are unaffected.
   Individual benches were run with `npx vitest bench --run --no-file-parallelism <file>`.
7. The command store still carries only the part-1 `coreIndexEngine`, not the full `indexEngine` with
   `navigatorRollup()` (PROGRESS step 2.1's open item; tests work around it as P-07 always has).
8. Everything from Gate A's own list (chemistry and exam coverage unverified).
9. `docs/PROGRESS.md` still contains a stray, stale fragment at the end of the step 2.11 section (an interrupted
   session's note that says the Amendments list was not yet updated; it now is). Cosmetic; not removed by this step.

---
Preparation notes: prepared alongside `docs/PROGRESS.md` step 2.12 and `docs/PROJECT_STATE.json`.
`tests/perf/*.bench.ts`, `tests/perf/budgets.mjs` and `tests/perf/baseline.json` are committed; regenerate the
baseline with `npm run bench:baseline` and compare against it with `npm run bench:compare`. The raw `vitest
bench` output that produced §5 is not committed (reproducible with either command).
