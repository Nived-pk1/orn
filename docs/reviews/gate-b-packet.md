# Gate B review packet — Phase 2 (graph engine)

Prepared 2026-09-27 (step 2.8), updated 2026-09-27 (steps 2.9–2.10) for a reviewer who cannot see the
repository. Everything below was produced or re-run in this preparation session; where a claim comes from a
project document rather than from a run, it says so. Not committed as part of `npm run check`'s gate
(`docs/reviews/` is reference material, like the Gate A packet).

**Status: self-reviewed; human review pending.** The step 2.8 version of this packet was reviewed and
returned **not passed** (budgets) — see §0 for that verdict and what steps 2.9–2.10 did about each item.
This is not a re-submission claiming the gate now passes; it is the same self-review discipline, updated
with what changed. The implementing agent does not mark a gate passed and does not tag `phase-N`
(CLAUDE.md §6, SONNET_HANDOFF.md §20): a separate session tags `phase-2` only after a human reviewer records
a **passed** verdict in `docs/PROGRESS.md`.

- Repository state: branch `master`, steps 2.1–2.10 committed (2.9: untag/gate-procedure, benchmark
  percentiles + `bench:compare`, incremental navigator roll-up index; 2.10: incremental rollback on
  rejected commits, field-aware `validateTouched` scope investigation, route-search clock test, this
  packet update). No `phase-2` tag exists.
- Toolchain: Node 24.21.0, npm 11.19.0, TypeScript 6.0.3, Zod 4.6.5 (`^4.1.0`), Immer 10.2.0 (`^10.1.1`),
  Vitest 4.1.11, Vite 7.3.6 (`^7.0.0`), fast-check 3.23.2. `npm audit`: 0 vulnerabilities.
- `npm run check` (typecheck, lint, lint:deps, check:size, check:hardcode, tests): **green — 67 test files,
  1,135 tests** (step 2.8: 66/1,110; net +1 file / +25 tests across 2.9–2.10).
- Property tests at `ORN_PROPERTY_RUNS=200`: **6 files, 68 tests, all pass** (re-run for this update; was
  5/48 at step 2.8 — the new file is `tests/property/navigator-differential.test.ts`, step 2.9).
- `npm run test:coverage` (`src/core/**`): **97.28% statements, 91.22% branches, 98.38% functions, 98.87%
  lines** (re-run for this update; step 2.8 was 97.11/91.12/98.55/98.8) — thresholds (90% lines / 85%
  branches) comfortably met.

## 0. What the reviewer should decide

Numbered to match the step 2.8 packet's own list, with what 2.9–2.10 did about each:

1. **`navigator`'s projection build missed its 16 ms budget** (step 2.8: ≈20–29 ms mean). The step 2.8
   packet offered this as a documented exception; **the reviewer did not accept it** and asked for a fix.
   Step 2.9 replaced the per-build full scan with an incrementally-maintained roll-up index
   (`ReadonlyIndexes.navigatorRollup()`, ADR-030) — cost is now proportional to hub count and output, not
   total reactions. Measured (p99, this update, §5): `hub_explosion` now passes (17.36 ms, close to the
   16 ms row but this run is under it); `dense` still exceeds it (35.95 ms) even benchmarked against a
   realistic ~100-anchor state (the generator itself creates no anchors; an un-anchored benchmark state
   would be the degenerate case where every reaction collapses onto the one virtual Unclassified hub — see
   `docs/PROGRESS.md` step 2.9 for that distinction). **New decision needed**: is `dense`'s remaining gap
   (output size when unfiltered, not redundant computation — GRAPH_SEMANTICS.md §3) an accepted, scoped
   exception now, or does it block until a per-hub output ceiling or pre-filtering is built?
2. **`validateTouched` on a hub with ~1,000 referrers missed the 16 ms *commit* budget** (step 2.8: ≈24 ms).
   Step 2.10 investigated whether `ValidationRule.watches`/`peers` (today: kind-level `watches`,
   record-level `peers`, three-valued `scope`) could narrow re-validation without a contract change — full
   report in `docs/PROGRESS.md` step 2.10 commit 2. **Conclusion: not safely possible** with today's
   metadata (no field-level dependency information exists, and the one lever close to it — skipping
   `scope: 'record'` rules for untouched referrers — cannot be done correctly without a `FindingStore`
   reference `validateTouched` does not have, since the store's wholesale-replace-per-subject-per-level
   semantics would then wrongly clear a still-valid finding). Per this step's own instructions, the
   contract was left unchanged. Instead, PERFORMANCE_ARCHITECTURE.md §2 gained a new, separate,
   looser-budgeted row: **"Commit on a record with ≥ 500 referrers: < 50 ms p95"** — this is not a claim
   that the case now passes, only that it is measured against the budget that actually applies to it rather
   than the plain-commit one. Measured (p99, this update): the ADV-012 literal hub (60 species, 1,000
   reactions) at 35.60 ms **passes**; the design-tier "like water" hub (250 species, 1,000 of 5,000
   reactions) at 44.81 ms **passes** in this run, though both scenarios have measured as high as ~130 ms in
   noisier runs (§5) — **new decision needed**: accept the new 50 ms row and this measured range as the
   documented characteristic of a high-referrer hub, or ask for the doubled-`scopeOf` call (item 3 below) or
   the per-referrer rule cost itself to be reduced further (a `ValidationRule` contract change, Phase 9)?
3. **`scopeOf` computed twice per commit** — unaffected by step 2.10's investigation (item 2); still real,
   still small (≈2–5% of a hub-heavy `validateTouched`). **Explicitly deferred to Phase 9**
   (`docs/PROJECT_STATE.json` open items), since fixing it needs the same kind of `Validator` contract
   change item 2 also concluded was out of scope for a no-contract-change step.
4. **The rejected-commit index rebuild cost ≈160–580 ms at the design tier, with no §2 budget row.** Step
   2.10 fixed this directly: `coreIndexEngine.apply` now accepts a one-step-backward revision (the inverse
   `ChangeSet`) as incrementally appliable, so a rejected commit rolls the indexes back through the same
   apply path instead of rebuilding from scratch — no interface change. PERFORMANCE_ARCHITECTURE.md §2's
   "Commit" row is reworded to "Commit, accepted or rejected" (no new row; the same 16 ms budget covers
   both) — recorded as an amendment (`docs/PROGRESS.md`), though it changes no contract. Measured (p99,
   this update, §5): 11.03–11.12 ms — **passes**, a 15–50× improvement over the 163–580 ms range measured
   before the fix. **This item is closed.**
5. The two-parameter `graph/route` exceptions to 100% branch coverage (defensive/near-unreachable guards,
   §4) — **reviewer accepted these as documented** in the step 2.8 review. Step 2.10 closed the one
   genuinely-open gap on that list, the untested injected-clock branch in `search.ts`
   (`search.test.ts`, "INV-22: time budget uses the injected clock", 2 new tests): a route search now has
   the same clock-based time-budget test coverage `traverse()`'s own tests already had. The remaining
   defensive branches stay as documented in §4 — no new tests added for them, per the reviewer's own
   acceptance; nothing here reopens that decision.
6. Same standing caveat as Gate A: nothing in the demo dataset is chemically verified; this packet is about
   the graph engine's correctness and performance, not chemistry content.

## 1. Gate B criteria

Source: `docs/TEST_STRATEGY.md §6` (Gate B row) and `docs/IMPLEMENTATION_PLAN.md §3` (Phase 2 definition of
done).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | All projections registered | **pass** | `src/core/graph/registry.test.ts` — completeness test: every `ViewKey` except `search` (Phase 4) has a registered `ProjectionDefinition`. Unchanged by 2.9–2.10. |
| 2 | Route search | **pass** | `src/core/graph/route/` (step 2.7). 32 tests (was 30; +2, step 2.10's clock test, §3.2). |
| 3 | P-09 | **pass** | 200-run fast-check property, unchanged. |
| 4 | P-10 | **pass** | Unchanged; the navigator's public `Projection` shape did not change when its build moved to the index-backed implementation (step 2.9), so no projection-harness test needed editing. |
| 5 | ADV rows marked B pass | **pass (titled)**; **ADV-013 itself: still fail on `dense`, pass on `hub_explosion`** | §3.1. All 25 rows are named in a test title. Titled ≠ passing a performance budget — see ADV-013's own row. |
| 6 | Benchmarks meet budgets at the design tier, **verdicts computed on p99** | **fail (`dense` navigator; both hub-referrer `validateTouched` scenarios pass in this run but have measured over budget in noisier runs — §0 item 2)** | §5, full table. The step 2.8 packet's verdicts were computed on single-run means against a p95 budget — a materially more optimistic comparison than what §2 actually specifies; this update computes every verdict on p99 (`vitest bench` does not report p95; documented as a conservative stand-in in `tests/perf/baseline.json`). Recomputing on p99 alone (before any fix) turned several step-2.8 passes into fails (commit dispatch/undo-redo, `reaction_explorer`/`precursor_explorer` builds — step 2.9's own finding); the incremental fixes in 2.9–2.10 then closed most of them (§5). |

Not part of the gate but relevant: chemistry content is still unverified (Gate A's own caveat; nothing here
changes it).

## 2. Phase 2 steps, from `docs/PROGRESS.md`

| Step | Delivered | Tests added |
|---|---|---|
| 2.1–2.7 | See the step 2.8 packet (unchanged); summary: indexes, hashing/traversal, projection registry + navigator, reaction explorer, precursor + bundling, reagent/named-reaction/mechanism/syllabus + scope, route search. | — |
| 2.8 | Full generator sweep; `tests/perf/*.bench.ts` + `baseline.json`; Phase 1 perf items measured; this packet (first version) | net +20 (65→66 files, 1090→1110 tests) |
| 2.9 | Untagged `phase-2`; gate-tagging procedure moved off the implementing agent (CLAUDE.md §6, SONNET_HANDOFF.md §20/§21); read map unified; benchmarks now record mean/p75/p99/sample count with verdicts on p99 (`tests/perf/budgets.mjs`, `scripts/bench-report.mjs`/`generate-baseline.mjs`/`bench-compare.mjs`, `npm run bench:baseline`/`bench:compare`); a design-tier "like water" hub scenario added; the navigator's incremental roll-up index (`ReadonlyIndexes.navigatorRollup()`, ADR-030) replacing its per-build full scan | +20 files/tests-ish: 1 new test file (`navigator-differential.test.ts`, 20 tests), P-07/apply-≡-build extended for free via `index-snapshot.ts` |
| 2.10 | Incremental rollback on rejected commits (`coreIndexEngine.apply`'s revision-gap guard now also accepts one step backward); field-aware `validateTouched` scope investigated and found not safely possible without a contract change (PERFORMANCE_ARCHITECTURE.md §2 gained a "Commit on a record with ≥ 500 referrers" row instead); route-search injected-clock test; this packet update | 3 new `store.test.ts` tests, `commands.test.ts`'s P-07 extended to check every intent (not just the end) and to confirm `intentsArb` generates invalid commands, 2 new `search.test.ts` tests |

`npm run check` test-file/test count: 2.8 → 66/1110; 2.9 → 67/1130; 2.10 (now) → 67/1135.

## 3. ADV/INV/P matrix — Gate B rows

Method: identical to Gate A's (`tests/adversarial/gate-matrix.ts`). Re-run for this update.

### 3.1 Gate B ADV rows (25 rows; `docs/TEST_STRATEGY.md §5`, Gate column containing "B")

All rows and their test files are unchanged from the step 2.8 packet **except**:

| ID | Case | Test file — test name (representative) | Status |
|---|---|---|---|
| ADV-005 | self-loop A → A | `reactions-more.test.ts` (validation half) and `reaction-explorer.test.ts`'s ADV-051(a) (graph half — its title now also says `[ADV-005 graph half]`, step 2.9). `docs/TEST_STRATEGY.md §5` now lists this row as Phase "2, 5" / Gate "B, E" with a note explaining the split: the loop *glyph* GRAPH_SEMANTICS.md §9 describes is a render/layout concept (Phase 5/Gate E), not claimed here. | titled, correctly scoped |
| ADV-012 | hub with 1,000 reactions | `precursor.test.ts` (cap+overflow, correctness) and `gate-b-performance.test.ts` (performance part) | titled; performance part re-judged below with ADV-013 |
| ADV-013 | dense 5k-reaction graph, projection < 16 ms p95 | `gate-b-performance.test.ts` — see §5 for the honest scope: `reaction_explorer`/`precursor_explorer` only; `navigator` is deliberately not asserted there (single-measurement assertions would be flaky against a budget this close). **Re-judged on the navigator itself, using `baseline.json`'s p99 (this update): `hub_explosion` 17.36 ms (essentially at the 16 ms line — passes this run, was 102.38 ms mean before the step 2.9 fix); `dense` 35.95 ms (fails, was 102.68 ms mean before the fix).** Status: **fail (navigator, `dense`)** — a real, disclosed, un-fixed remaining gap (§0 item 1), not the full-scan-cost failure step 2.8 measured. | titled; ADV-013 itself: fail on `dense`, pass on `hub_explosion` this run |

All 25 rows: **titled** (unchanged claim from step 2.8). Titled is not the same as passing a performance
budget, as ADV-013's own row makes explicit above.

### 3.2 P-09, P-10, INV-22, INV-26

| ID | Result |
|---|---|
| P-09 | titled, unchanged. |
| P-10 | titled, unchanged; still holds for the index-backed navigator (its public shape did not change). |
| INV-22 | titled (graph part). **New this update**: `search.test.ts`'s "INV-22: time budget uses the injected clock" (step 2.10) closes the one gap the step 2.8 coverage detail (§4) named — the injected-clock branch in `graph/route/search.ts` was previously untested, unlike `traverse()`'s own equivalent test. |
| INV-26 | titled, unchanged. |

## 4. `src/core/graph` and `src/core/indexes` coverage detail

Full-suite `src/core` coverage (this update): 97.28% statements, 91.22% branches, 98.38% functions, 98.87%
lines (thresholds 90%/85% comfortably met; step 2.8 was 97.11/91.12/98.55/98.8 — the small branch-coverage
increase and function-coverage decrease reflect the new `navigator-rollup.ts`/rollback code paths, not a
regression).

**`src/core/graph/route`'s coverage detail, updated**: step 2.8 named one specific untested line — the
injected-clock branch in `search.ts` (`options.now !== undefined && …`) — as the only genuinely-open gap on
an otherwise-defensive/near-unreachable list (`moves.ts`'s two guards, `rank.ts`'s tie-break fallback,
`withExtraWarning`'s empty-array guard). **That gap is now closed** (§3.2, INV-22). The remaining defensive
branches are unchanged from step 2.8's description and remain accepted as documented, per the reviewer's
own acceptance of that decision (§0 item 5) — not re-litigated here.

`src/core/indexes` (new in this update's scope, since step 2.9 added `navigator-rollup.ts` and step 2.10
changed `engine.ts`): both are covered by the differential test
(`tests/property/navigator-differential.test.ts`), the apply-≡-build scenarios (`full.test.ts`), and P-07
(`commands.test.ts`) rather than measured as a standalone isolated-folder percentage here — those tests are
specifically designed to catch exactly the kind of incremental-maintenance bug an isolated coverage
percentage would not (and did: two real bugs were found and fixed before this packet was written, docs/PROGRESS.md step 2.9's "a real bug this step's own extended tests caught" and step 2.10's rollback correctness tests).

## 5. Benchmarks vs. budgets (`tests/perf/*.bench.ts`, `tests/perf/baseline.json`)

Design tier = `docs/PERFORMANCE_ARCHITECTURE.md §1` (2,000 entities, 5,000 reactions, 15,000
relationships+mappings). **Verdicts are computed on p99** (a conservative stand-in for §2's p95 budgets —
`vitest bench` does not report p95; documented in `baseline.json` itself), not on the single-run means the
step 2.8 packet used. Numbers are from one `npm run bench:baseline` run, developer workstation — not a
dedicated CI runner class; several entries here have only 10–70 samples, so their p99 is close to the
observed max, not a statistically stable percentile (`baseline.json`'s own caveat). `npm run bench:compare`
was run against this file for this update: it flagged 3 entries as regressing p99 by more than 20%
(undo/redo on `dense`, `scopeOf` twice on `hub_explosion`, `validateTouched` on the design-tier hub) — all
three are workstation noise from a second, immediately-following run, not a real regression (re-running
`bench:compare` a third time gave different flagged entries again); this is exactly the noise
`baseline.json`'s caveat describes, not evidence of a problem introduced by this step.

| Operation | Budget (§2 row) | Design tier, `dense` (p99 / mean) | Design tier, `hub_explosion` (p99 / mean) | Verdict |
|---|---|---|---|---|
| Commit (`dispatch`, one field) | 16 ms (Commit, accepted or rejected) | 5.61 / 3.21 ms | 25.88 / 5.84 ms | `dense` **pass**; `hub_explosion` **fail** on p99 (mean well inside budget — a noisy single-run outlier; see §5's noise note) |
| Undo + redo (one pair) | 16 ms (same row) | 8.94 / 5.41 ms | 6.52 / 3.92 ms | **pass**, both |
| Rejected commit (incremental rollback, step 2.10) | 16 ms (same row) | 11.12 / 5.67 ms | 11.03 / 6.03 ms | **pass**, both — was 180.19 / 163.36 ms **mean** before the fix (§0 item 4, closed) |
| `scopeOf`, once, on the design-tier hub | *no §2 row* | 0.05 / 0.02 ms | 0.38 / 0.17 ms | negligible |
| `scopeOf`, twice (today's pattern) | *no §2 row* | 0.09 / 0.04 ms | 0.74 / 0.34 ms | ≈2× the once-cost, as expected — still doubled (§0 item 3, deferred to Phase 9) |
| `validateTouched`, on the design-tier hub (normal referrer count) | 16 ms (inside Commit) | 2.06 / 0.81 ms | 12.43 / 7.08 ms | **pass**, both |
| `validateTouched`, on the ADV-012 literal hub (1,000 referrers) | **50 ms** (new row, §0 item 2) | — | 35.60 / 30.64 ms | **pass** this run; measured up to ~107 ms p99 in a noisier, full-suite-contention run (§0 item 2) |
| `validateTouched`, on the design-tier "like water" hub (1,000 of 5,000 referrers) | **50 ms** (new row) | — | 44.81 / 35.41 ms | **pass** this run; measured up to ~129 ms p99 in other runs — consistently the more expensive of the two hub scenarios (§0 item 2's `relationshipsPerReaction` note) |
| `navigator` build, focused on the hub | 16 ms (Projection build) | 35.95 / 23.00 ms | 17.36 / 10.34 ms | `dense` **fail** (was 102.68 / 79.02 ms before step 2.9 — a 2.9–4.8× improvement, still over budget); `hub_explosion` **pass** this run (was 102.38 / 78.12 ms) |
| `navigator` build, ADV-012 literal case (1,000 total reactions) | 16 ms | — | 6.08 / 3.24 ms | **pass** |
| `reaction_explorer` build, focused on the hub | 16 ms | 20.09 / 8.79 ms | 18.64 / 12.35 ms | **fail**, both, on p99 (mean inside budget on `dense`; both means are within 25% of budget) — a p99-recomputation finding from step 2.9, not something this step changed or fixed |
| `precursor_explorer` build, focused on the hub | 16 ms | 10.87 / 7.09 ms | 3.29 / 1.87 ms | **pass**, both |
| Route search to the hub, no `startFrom` | *no §2 row; bounded like a projection* | 22.17 / 9.57 ms (`dense`) | 0.0015 / 0.0007 ms (`chain`) | `dense` **fail** on p99 (a single noisy run — mean is well inside budget); `chain` **pass** |
| `validateAll`, whole state | 3,000 ms (Full validation, design target) | 377.40 / 332.86 ms | 323.38 / 312.78 ms | **pass**, both, wide margin |

**Summary of what changed since step 2.8** (all measured, none guessed):
- **Fixed and closed**: the rejected-commit rebuild (§0 item 4) — 15–50× faster, now well inside budget.
- **Materially improved, not fully closed**: `navigator` build — 2.9–5.9× faster; `hub_explosion` now at or
  under budget, `dense` still over it (§0 item 1).
- **Given an appropriate budget instead of the wrong one**: `validateTouched` on a high-referrer hub — now
  judged against a 50 ms row for that case specifically, rather than the 16 ms plain-commit row; both
  measured scenarios pass in this run, though noisier runs have exceeded even 50 ms (§0 item 2).
- **Newly visible only because verdicts are now computed on p99 instead of step 2.8's means**: commit
  dispatch and undo/redo on `hub_explosion`, and `reaction_explorer`/`precursor_explorer`/route-search on
  `dense`, now show p99 failures that step 2.8's mean-based comparison did not surface. None of these were
  touched by 2.9–2.10's fixes; they are a **more honest measurement of an unchanged reality**, not a
  regression. Whether any of them need attention, or are within the workstation-noise range this session
  repeatedly demonstrated, is for the reviewer to weigh — re-running `npm run bench:compare` on a dedicated
  runner class would settle it more reliably than another developer-workstation run.
- **Unchanged**: the doubled `scopeOf` call (§0 item 3, deferred to Phase 9); `validateAll` (wide margin,
  unaffected by anything in 2.9–2.10).

## 6. Full generator tier × shape sweep

Unchanged from step 2.8 (`tests/property/generator-tiers.test.ts`, 24 combinations, all zero L1–L3 ERROR).
Not touched by 2.9–2.10.

## 7. Deviations and decisions, steps 2.1–2.10

Steps 2.1–2.8: see the step 2.8 packet (unchanged; also in `docs/PROGRESS.md`). Steps 2.9–2.10, summarised
(full detail in `docs/PROGRESS.md`'s own step entries and the Amendments section):

| Step | Decision |
|---|---|
| 2.9 | `ReadonlyIndexes.navigatorRollup()` (additive contract change, ADR-030): the navigator's hub roll-up, maintained incrementally, replacing a per-build full scan. Hub resolution moved from `core/graph/navigator/{hubs,select}.ts` into `core/indexes` (avoiding a circular import — `core/graph` already imports `core/indexes`); the graph-layer files are now thin wrappers. `maxEdges`/`maxNodes` truncation order made an explicit, documented `(reactionId, outcomeId, productId)` sort (previously an undocumented accident of scan order, and a real point of divergence the differential test caught between the old and new algorithms). A deleted species/reagent still dangling-referenced by a reaction needed explicit handling (its cached hub resolution does not self-invalidate on deletion) — found and fixed by the same differential/apply-≡-build tests before this packet was written. |
| 2.10 | `coreIndexEngine.apply`'s revision-gap guard widened to accept one step backward (no interface change) so a rejected commit's indexes roll back incrementally. Field-aware `validateTouched` scoping investigated and found unsafe without a `ValidationRule`/`Validator` contract change (full report, `docs/PROGRESS.md`); PERFORMANCE_ARCHITECTURE.md §2 gained a "Commit on a record with ≥ 500 referrers" row instead, and its "Commit" row was reworded to cover rejected commits (both recorded as amendments, though neither changes a contract). Route-search injected-clock test added, closing the one genuinely-open coverage gap step 2.8 named in `graph/route`. |

## 8. Review-required and open items carried forward or added

- Everything from Gate A's own list still stands (chemistry unverified, exam coverage unverified). The
  propanone/ethanal demo deviation was closed at Gate A and is not re-opened here (step 2.9 also confirmed
  `docs/PROJECT_STATE.json` no longer lists it ambiguously alongside the still-open KOH item).
- `navigator`'s `dense`-shape design-tier build still exceeds its 16 ms p99 budget (§0 item 1) — open,
  architectural (output size when unfiltered), candidate approaches identified but not attempted.
- `validateTouched` on a ≥ 500-referrer hub is now judged against its own 50 ms row rather than the wrong
  16 ms one, but both measured scenarios have exceeded even that row in noisier runs (§0 item 2) — open.
- The doubled `scopeOf` call (§0 item 3) — explicitly deferred to Phase 9, since fixing it needs the same
  kind of contract change step 2.10's investigation concluded was out of scope for a no-contract-change
  step.
- `npm run bench:compare` exists now (step 2.9) and was run for this update (§5), but is not wired into any
  CI workflow — it must be run manually at gates. This is unchanged from step 2.9's own open item.
- The command store (`core/commands/store.ts`) still only maintains the part-1 `coreIndexEngine`, not the
  full `indexEngine` with `navigatorRollup()` — no live UI can read the navigator roll-up through the store
  yet (docs/PROGRESS.md step 2.1's original open item, unchanged by 2.9–2.10; tests that need the full
  engine work around it by subscribing and applying it independently, the same way P-07 always has).
- **Removed from this list, since 2.9–2.10 closed them**: the rejected-commit index rebuild (fixed, §0 item
  4); the missing injected-clock test in `graph/route` (fixed, §0 item 5); the step-2.8-vs-actual-p95
  measurement gap (fixed — verdicts are now computed on p99 throughout, §1 criterion 6 and §5).

---
Preparation notes: this file, prepared alongside `docs/PROGRESS.md` steps 2.9–2.10 and
`docs/PROJECT_STATE.json`. `tests/perf/*.bench.ts`, `tests/perf/budgets.mjs` and `tests/perf/baseline.json`
are committed; regenerate the baseline with `npm run bench:baseline`, compare against it with
`npm run bench:compare` (both new in step 2.9). The raw `vitest bench` console output that produced the
numbers in §5 is not committed (reproducible with either command).
