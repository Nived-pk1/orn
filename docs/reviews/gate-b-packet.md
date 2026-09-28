# Gate B review packet — Phase 2 (graph engine)

Prepared 2026-09-27 (step 2.8); updated 2026-09-27 (steps 2.9-2.10) and 2026-09-28 (steps 2.11-2.13) for a reviewer
who cannot see the repository. Everything below was produced or re-run in the step 2.13 session; where a claim comes
from a project document rather than from a run, it says so. Not committed as part of `npm run check`'s gate
(`docs/reviews/` is reference material, like the Gate A packet).

**Status: self-reviewed; human review pending.** The step 2.8 version of this packet was reviewed and returned
**not passed** (budgets). This version is written against the **final exit rule** the reviewer set in step 2.13
(`docs/TEST_STRATEGY.md` §6) and is not a claim that the gate passes: the implementing agent does not mark a gate
passed and does not tag `phase-N` (CLAUDE.md §6, SONNET_HANDOFF.md §20); a separate session tags `phase-2` only after a
human reviewer records a **passed** verdict in `docs/PROGRESS.md`.

**Attribution convention.** "Reviewer" means the human reviewer, as recorded in `docs/PROGRESS.md` (the Gate B
review of 2026-09-27) or in the instructions of the named step (steps 2.12 and 2.13, whose decisions
`docs/PROGRESS.md` step 2.13 records). "Sonnet" means a choice the implementing agent made itself.

- Repository state: branch `master`, steps 2.1-2.13 committed. No `phase-2` tag exists.
- Toolchain: Node 24.21.0, npm 11.19.0, TypeScript 6.0.3, Zod 4.6.5 (`^4.1.0`), Immer 10.2.0 (`^10.1.1`),
  Vitest 4.1.11, Vite 7.3.6 (`^7.0.0`), fast-check 3.23.2. `npm audit` was not re-run in 2.11-2.13 (no dependency
  changed since it last reported 0 vulnerabilities).
- `npm run check` (typecheck, lint, lint:deps, check:size, check:hardcode, tests): **green — 70 test files,
  1,188 tests** (step 2.8: 66/1,110; 2.10-2.11: 67/1,135; 2.12: 70/1,165; 2.13: +23 tests).
- Property tests at `ORN_PROPERTY_RUNS=200`: **7 files, 71 tests, all pass**.
- `npm run test:coverage` (`src/core/**`): **97.38% statements, 91.57% branches, 98.42% functions, 98.91% lines**
  (step 2.10: 97.28/91.22/98.38/98.87) — thresholds (90% lines / 85% branches) comfortably met.
- Benchmarks: `npm run bench:baseline` (3 fresh-process runs, **median p99**, PERFORMANCE_ARCHITECTURE.md §9) and
  `npm run bench:compare`, run for this update with Edge closed and nothing else heavy running. **This session's
  runs were noisier than step 2.12's** (31 of 42 entries over 25% spread; run 2 was slow across the board, run 1
  and 3 agreed): the medians are the verdicts, and every over-target verdict below says how noisy it is.

## 0. What the reviewer should decide

Numbered to match the step 2.8 packet, with who decided what and where each item now stands.

1. **`navigator`'s projection build missed its 16 ms budget.** *Reviewer* (Gate B review, 2026-09-27): the
   self-review's proposed documented exception was **not accepted** for the navigator; fix it with an
   incrementally maintained index. *Sonnet*, step 2.9: `ReadonlyIndexes.navigatorRollup()` (ADR-030). *Sonnet*, step
   2.11: a fixed 60-anchor design-tier state and a profile-driven fix (edge-ID hashing deferred to admitted
   candidates, no contract change). **Now (median p99, §5): `dense` 10.87 ms, `hub_explosion` 7.11 ms, ADV-012 hub
   4.66 ms — all under 16 ms; stress tier (400 anchors) 19.94 ms against the informal 32 ms (§1's "may degrade <= 2x").
   Closed** (noise caveat: `dense` spread 30%, `hub_explosion` 100%; the worst run of any of them is 12.0 ms).
2. **`validateTouched` on a hub with ~1,000 referrers** (and, added in 2.13, on a class every species lists).
   *Reviewer* (Gate B review): an exception was accepted for an extreme hub. *Sonnet*, step 2.10: found no safe
   narrowing without a `ValidationRule` contract change (the step's instructions kept the contract unchanged) and
   added a 50 ms "Commit on a record with >= 500 referrers" row. *Reviewer*, step 2.12: implement field-aware scoping
   as an additive amendment (`ValidationRule.referencedReads`, ADR-031). *Reviewer*, step 2.13: approve an additive
   `FindingStore` method for per-rule re-validation, accept per-rule re-runs for peers as well (a reading of the
   `peers` contract that *Sonnet* proposed), approve an optional field for the fields a rule reads on its peers
   (*Sonnet* proposed it as `watchedFields`; named `peerReads`), and fix the **exit rule** (below). Implemented as
   ADR-032: `FindingStore.replaceForRules`, `Validator.validateTouchedByRule`, `ValidationRule.peerReads`.
   **Now (median p99):** like-water hub, notes edit, whole commit **2.93 ms** (was 70.86 in 2.11); `validateTouchedByRule`
   on a rename **2.04 ms** (like water) / **1.24 ms** (ADV-012); class hub (1,400 species) rename **16.5 ms**, notes
   **15.5 ms** (both were ~97 ms). Structural edits: like-water `review` status change **21.2 ms** per commit (was
   76.9), class-hub parent move **46.0 ms** (was 125.8). Details in §5 and §8.
3. **`scopeOf` computed twice per commit.** *Sonnet*, 2.10: deferred to Phase 9 (the step's own framing).
   *Reviewer*, 2.12: fold it in only if it disappears without a further contract change; it did not then.
   **Closed in 2.13 as a side effect of ADR-032:** the command store now makes one call
   (`validateTouchedByRule`) per commit; `scopeOf`/`validateTouched` remain for other callers.
4. **Rejected-commit index rebuild** (163-580 ms). *Sonnet*, 2.10 (assigned by the Gate B review): incremental rollback
   through the inverse `ChangeSet`. **Now 9.6 / 8.7 ms median p99 (`dense` / `hub_explosion`). Closed.**
5. **`graph/route` coverage exceptions** — *Reviewer* accepted them as documented at the Gate B review; the one open
   gap (injected clock in `search.ts`) was closed by *Sonnet* in 2.10. Unchanged.
6. **Benchmark noise.** `docs/PERFORMANCE_ARCHITECTURE.md` §9 records that the Gate B reviewer found the step 2.8/2.9
   numbers too noisy to judge; *Sonnet*, 2.11: PID-locked isolation, explicit warmup, a 100-sample floor, 3
   fresh-process runs judged on the **median p99** with per-entry spread. `bench:compare` is still manual (not in CI).
   `npm run bench` failed on Windows (`spawnSync npx.cmd EINVAL`); fixed in 2.13 and verified together with
   `bench:baseline` and `bench:compare`.
7. Same standing caveat as Gate A: nothing in the demo dataset is chemically verified; this packet is about the graph
   engine's correctness and performance, not chemistry content.

**Exit rule for Gate B (reviewer, step 2.13; final; general rule in `docs/TEST_STRATEGY.md` §6).** (1) Correctness
green: the ADR-031/032 property tests, the read audit, `npm run check`. (2) Ordinary edits (rename, notes) on the
like-water hub and the class hub under **50 ms** median p99. (3) Anything over its 16 ms target, and the structural
edits (class parent move, review-status change), are recorded as **documented Phase 9 exceptions** with their numbers
(§8), not re-litigated at the gate. No further rounds for Phase 2. **Assessment against it (self-review):** (1) met —
`npm run check` green, P-11 and the fixture walks pass at 200 runs and on both commit paths, the read audit passes and
was fault-injected; (2) met — like-water notes 2.93 ms, class-hub rename 16.5 ms, class-hub notes 15.5 ms; (3) the
items over 16 ms are listed in §8. The reviewer records the verdict.

## 1. Gate B criteria

Source: `docs/TEST_STRATEGY.md §6` (Gate B row and the general performance rule) and `docs/IMPLEMENTATION_PLAN.md §3`.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | All projections registered | **pass** | `src/core/graph/registry.test.ts` — every `ViewKey` except `search` (Phase 4). Unchanged. |
| 2 | Route search | **pass** | `src/core/graph/route/` (step 2.7), 32 tests. |
| 3 | P-09 | **pass** | 200-run fast-check property, unchanged. |
| 4 | P-10 | **pass** | Unchanged. |
| 5 | ADV rows marked B pass | **pass (titled)**; **ADV-013 pass on median p99 for the projections** | §3.1. |
| 6 | Benchmarks meet budgets at the design tier, judged by the general performance rule | **met under the exit rule; two entries over their 16 ms target, listed in §8** | §0 (exit rule), §5 (42 entries), §8. Correctness green; ordinary edits on both hubs under 50 ms; structural edits and over-16 items are Phase 9 exceptions. |

Not part of the gate but relevant: chemistry content is still unverified.

## 2. Phase 2 steps, from `docs/PROGRESS.md`

| Step | Delivered | Tests |
|---|---|---|
| 2.1-2.7 | See the step 2.8 packet: indexes, hashing/traversal, projection registry + navigator, reaction explorer, precursor + bundling, reagent/named-reaction/mechanism/syllabus + scope, route search. | — |
| 2.8 | Full generator sweep; `tests/perf/*.bench.ts` + `baseline.json`; Phase 1 perf items measured; first packet | 66 / 1,110 |
| 2.9 | Untagged `phase-2`; gate-tagging procedure; percentiles + `bench:compare`; "like water" hub scenario; incremental navigator roll-up index (ADR-030) | 67 / 1,130 |
| 2.10 | Incremental rollback on rejected commits; field-aware scope investigated (50 ms row added); route-search clock test | 67 / 1,135 |
| 2.11 | Fixed navigator anchors + stress tier; stable benchmark method; navigator build fix | 67 / 1,135 |
| 2.12 | Field-aware `validateTouched` scope (`ValidationRule.referencedReads`, ADR-031); read audit; P-11 hub property test | 70 / 1,165 |
| 2.13 | **Per-rule re-validation of referrers and peers (ADR-032)**: `FindingStore.replaceForRules`, `Validator.validateTouchedByRule`, `ValidationRule.peerReads`; SPC-006 declared; class-hub benchmarks; `npm run bench` fixed on Windows; this packet | 70 / 1,188 |

## 3. ADV/INV/P matrix — Gate B rows

Method: identical to Gate A's (`tests/adversarial/gate-matrix.ts`).

### 3.1 Gate B ADV rows (25 rows; `docs/TEST_STRATEGY.md §5`, Gate column containing "B")

All rows and their test files are unchanged from the step 2.8 packet **except**:

| ID | Case | Test file — test name (representative) | Status |
|---|---|---|---|
| ADV-005 | self-loop A -> A | `reactions-more.test.ts` (validation half) and `reaction-explorer.test.ts`'s ADV-051(a) (graph half). `docs/TEST_STRATEGY.md §5` lists it as Phase "2, 5" / Gate "B, E"; the loop *glyph* is a render concept (Phase 5/Gate E). | titled, correctly scoped |
| ADV-012 | hub with 1,000 reactions | `precursor.test.ts` (cap + overflow) and `gate-b-performance.test.ts` (performance part). Commit performance of the hub: `validateTouchedByRule` on a rename **1.24 ms** median p99 vs 16 ms (**pass**); review status changed **15.6 ms** (per rule; 39.1 ms through the whole-subject API); no previous state 47.1 ms (fallback, not the commit path). Projection part: navigator 4.66 ms, precursor 0.009 ms — pass. | titled; performance **pass** |
| ADV-013 | dense 5k-reaction graph, projection < 16 ms p95 | `gate-b-performance.test.ts` asserts `reaction_explorer`/`precursor_explorer` only (single-measurement assertions against a tight budget would be flaky). On `baseline.json` median p99 (design tier, `dense`): navigator **10.87 ms**, reaction_explorer **11.11 ms**, precursor_explorer **8.09 ms**; `hub_explosion`: navigator 7.11, reaction_explorer 14.46, precursor_explorer 2.62 ms — **all under 16 ms**. Route search (no §2 row; bounded like a projection) `dense` reads **17.24 ms** this run (runs 17.97 / 11.10 / 17.24; earlier baselines 9.3-12.1 ms, code untouched): over its 16 ms target, listed in §8 as noise. **Status: pass for the projections.** Noise caveat: reaction_explorer `hub_explosion` spread 222% (one 45.5 ms run; the other two 13-14 ms). | titled; ADV-013 **pass** (projections) |

All 25 rows: **titled** (unchanged claim from step 2.8).

### 3.2 P-09, P-10, P-11, INV-22, INV-26

| ID | Result |
|---|---|
| P-09 | titled, unchanged. |
| P-10 | titled, unchanged. |
| P-11 (2.12, extended 2.13) | `tests/property/validation-scope.test.ts`: after random edit sequences aimed at a high-referrer hub species and at the class hub every species lists (names incl. a twin's, aliases, notes with `[[links]]`, review lifecycle and status, classes, kind, parents incl. cycles, deletion and restoration, referrer edits, new relationships, neighbours), the findings kept by `validateTouchedByRule` + `commitTouched` equal `validateAll` after every edit; ADV-012 and like-water shapes; passes at the default and at 200 runs. Fault-injected by hand (§4). |
| INV-22 | titled (graph part), including the injected-clock route-search test (2.10). |
| INV-26 | titled, unchanged. |

## 4. `src/core/graph`, `src/core/indexes` and `src/core/validation` coverage detail

Full-suite `src/core` coverage: 97.38% statements, 91.57% branches, 98.42% functions, 98.91% lines. The `graph/route`
defensive-branch exceptions stand as accepted at the Gate B review (§0 item 5). `src/core/indexes` (navigator
roll-up, rollback) is covered by the differential test, apply-≡-build scenarios and P-07.

**`src/core/validation` (2.12-2.13).** A rule's `referencedReads` and `peerReads` declarations are promises about what
`check` reads, so they are verified rather than trusted. `reads-audit.test.ts` runs every declaring rule over the
maximal fixture (also with every exam version official), the demo and every generator shape: it traces the fields
read of records the rule refers to (a Proxy) and of records it does not (direct fetches, name-index lookups,
hierarchy walks, which it counts as reads of that kind's parent field), checks them against the declaration, requires
`peers` for reads outside the rule's references, refuses index lookups through other records' reference fields for
`peerReads` rules, and checks that a rule declared to read nothing gives the same findings with the records it refers
to hidden. Together with P-11, the fixture walks (`incremental.test.ts`, on both the whole-record and the per-rule
commit paths) and `scoping.test.ts`, fault injection by hand confirmed each can fail: RVW-002 not declaring `review`,
RXN-013 not declaring `instanceOfId`, REL-006 and SPC-006 declaring the wrong field, REF-001 declaring nothing,
SPC-001/CLS-002/HIER-001 with wrong `peerReads`, the per-rule store not removing findings, L2 rules allowed to be
partial, and the L1/L2-error gate removed. One honest limit: P-11 alone does not catch a wrong RXN-013 declaration
(it needs an instance-of chain that random edits rarely build); the audit and the targeted RXN-013 test do.

## 5. Benchmarks vs. budgets (`tests/perf/*.bench.ts`, `tests/perf/baseline.json`)

Design tier = `docs/PERFORMANCE_ARCHITECTURE.md §1` (2,000 entities, 5,000 reactions, 15,000 relationships+mappings).
**Verdict = median over 3 fresh-process runs of each run's p99** (a conservative stand-in for §2's p95; `vitest bench`
does not report p95), method of PERFORMANCE_ARCHITECTURE.md §9. Spread = (max - min) / median of the 3 p99s; "noisy" =
over 25%. Developer workstation, not a dedicated runner class. Budget "no row" means §2 has no row for the entry;
"over target" means over its listed budget (the exit rule decides what that means, §0 and §8).

| Entry | Tier / shape | Budget | Median p99 (ms) | 3 runs | Spread | Verdict |
|---|---|---|---|---|---|---|
| commit: dispatch (rename the class hub, ~1,400 species referrers) | design-class-hub / hub_explosion | 16 ms | 16.5 | 31.1 / 16.5 / 16.4 | 89% (noisy) | **over target** |
| commit: dispatch (edit the class hub notes, ~1,400 species referrers) | design-class-hub / hub_explosion | 16 ms | 15.5 | 36.9 / 15.5 / 15.0 | 141% (noisy) | pass |
| commit: dispatch (move the class hub to another parent, ~1,400 species referrers) | design-class-hub / hub_explosion | 50 ms | 46.0 | 124 / 46.0 / 44.3 | 173% (noisy) | pass |
| commit: dispatch (update one species) | design / dense | 16 ms | 3.11 | 3.11 / 6.28 / 2.82 | 111% (noisy) | pass |
| commit: undo + redo (one pair) | design / dense | 16 ms | 6.18 | 6.18 / 10.3 / 4.45 | 95% (noisy) | pass |
| commit: rejected (incremental rollback) | design / dense | 16 ms | 9.62 | 9.62 / 21.3 / 9.25 | 125% (noisy) | pass |
| scopeOf: once, on the design-tier hub | design / dense | no row | 0.0589 | 0.0550 / 0.1067 / 0.0589 | 88% (noisy) | n/a (no budget row) |
| scopeOf: twice (today's store.commit() pattern), design-tier hub | design / dense | no row | 0.0962 | 0.0889 / 0.1308 / 0.0962 | 44% (noisy) | n/a (no budget row) |
| validateTouched: on the design-tier hub | design / dense | 16 ms | 2.09 | 2.09 / 3.91 / 1.94 | 94% (noisy) | pass |
| commit: dispatch (update one species) | design / hub_explosion | 16 ms | 3.26 | 3.26 / 5.58 / 2.91 | 82% (noisy) | pass |
| commit: undo + redo (one pair) | design / hub_explosion | 16 ms | 4.88 | 4.88 / 10.9 / 4.47 | 131% (noisy) | pass |
| commit: rejected (incremental rollback) | design / hub_explosion | 16 ms | 8.72 | 8.72 / 15.8 / 7.64 | 94% (noisy) | pass |
| scopeOf: once, on the design-tier hub | design / hub_explosion | no row | 0.3657 | 0.3657 / 0.8022 / 0.3136 | 134% (noisy) | n/a (no budget row) |
| scopeOf: twice (today's store.commit() pattern), design-tier hub | design / hub_explosion | no row | 0.7145 | 0.7145 / 1.19 / 0.3803 | 114% (noisy) | n/a (no budget row) |
| validateTouched: on the design-tier hub | design / hub_explosion | 16 ms | 10.7 | 10.7 / 27.9 / 7.85 | 187% (noisy) | pass |
| scopeOf: once, on the ADV-012 literal hub (1,000 reactions) | adv-012 / hub_explosion | no row | 1.43 | 1.32 / 2.67 / 1.43 | 94% (noisy) | n/a (no budget row) |
| scopeOf: twice (today's store.commit() pattern), ADV-012 literal hub | adv-012 / hub_explosion | no row | 2.87 | 2.87 / 4.95 / 2.44 | 87% (noisy) | n/a (no budget row) |
| validateTouched: ADV-012 literal hub, no previous state given (every referrer re-validated: the safe fallback) | adv-012 / hub_explosion | 50 ms | 47.1 | 47.1 / 119 / 36.9 | 173% (noisy) | pass |
| validateTouched: ADV-012 literal hub, renamed (previous state given) | adv-012 / hub_explosion | 16 ms | 1.09 | 1.04 / 2.58 / 1.09 | 141% (noisy) | pass |
| validateTouched: ADV-012 literal hub, review lifecycle changed (a field referrer rules read) | adv-012 / hub_explosion | 50 ms | 39.1 | 36.9 / 128 / 39.1 | 234% (noisy) | pass |
| validateTouchedByRule: ADV-012 literal hub, renamed (the store's call, previous state given) | adv-012 / hub_explosion | 16 ms | 1.24 | 1.11 / 1.54 / 1.24 | 34% (noisy) | pass |
| validateTouchedByRule: ADV-012 literal hub, review lifecycle changed (per rule) | adv-012 / hub_explosion | 50 ms | 15.6 | 18.3 / 15.5 / 15.6 | 18% | pass |
| commit: dispatch (update the design-tier "like water" hub) | design-hub-1000 / hub_explosion | 16 ms | 2.93 | 2.77 / 2.93 / 3.01 | 8% | pass |
| validateTouched: "like water" hub, no previous state given (every referrer re-validated: the safe fallback) | design-hub-1000 / hub_explosion | 50 ms | 38.7 | 38.7 / 36.7 / 41.7 | 13% | pass |
| validateTouched: "like water" hub, renamed (previous state given) | design-hub-1000 / hub_explosion | 16 ms | 2.29 | 2.29 / 2.22 / 2.40 | 8% | pass |
| validateTouched: "like water" hub, review lifecycle changed (a field referrer rules read) | design-hub-1000 / hub_explosion | 50 ms | 44.7 | 44.2 / 54.0 / 44.7 | 22% | pass |
| validateTouchedByRule: "like water" hub, renamed (the store's call, previous state given) | design-hub-1000 / hub_explosion | 16 ms | 2.04 | 2.04 / 2.07 / 1.84 | 11% | pass |
| validateTouchedByRule: "like water" hub, review lifecycle changed (per rule) | design-hub-1000 / hub_explosion | 50 ms | 18.8 | 21.3 / 17.4 / 18.8 | 21% | pass |
| commit: dispatch (like-water hub, review lifecycle changed) | design-hub-1000 / hub_explosion | 50 ms | 21.2 | 21.2 / 19.8 / 24.4 | 22% | pass |
| projection: navigator, focused on the hub | design / dense | 16 ms | 10.9 | 10.9 / 8.71 / 12.0 | 30% (noisy) | pass |
| projection: reaction_explorer, focused on the hub | design / dense | 16 ms | 11.1 | 11.1 / 12.8 / 9.97 | 25% (noisy) | pass |
| projection: precursor_explorer, focused on the hub | design / dense | 16 ms | 8.09 | 10.6 / 8.09 / 7.49 | 39% (noisy) | pass |
| projection: navigator, focused on the hub | design / hub_explosion | 16 ms | 7.11 | 11.9 / 4.79 / 7.11 | 100% (noisy) | pass |
| projection: reaction_explorer, focused on the hub | design / hub_explosion | 16 ms | 14.5 | 45.5 / 14.5 / 13.4 | 222% (noisy) | pass |
| projection: precursor_explorer, focused on the hub | design / hub_explosion | 16 ms | 2.62 | 7.43 / 2.62 / 2.13 | 202% (noisy) | pass |
| projection: navigator, focused on the hub | adv-012 / hub_explosion | 16 ms | 4.66 | 8.10 / 4.45 / 4.66 | 78% (noisy) | pass |
| projection: precursor_explorer, focused on the hub | adv-012 / hub_explosion | 16 ms | 0.0090 | 0.0373 / 0.0090 / 0.0068 | 339% (noisy) | pass |
| projection: navigator, focused on the hub, stress tier (400 anchors) | stress / dense | 32 ms (informal) | 19.9 | 57.5 / 19.9 / 19.6 | 190% (noisy) | pass |
| route search: searchRoutes to the hub, no startFrom | design / dense | 16 ms | 17.2 | 18.0 / 11.1 / 17.2 | 40% (noisy) | **over target** |
| route search: searchRoutes to the hub, no startFrom | design / chain | 16 ms | 0.0014 | 0.0014 / 0.0014 / 0.0012 | 14% | pass |
| validateAll: whole state | design / dense | 3000 ms | 297 | 327 / 292 / 297 | 12% | pass |
| validateAll: whole state | design / hub_explosion | 3000 ms | 285 | 283 / 285 / 297 | 5% | pass |

**How to read the hub rows** (ADR-031, ADR-032). "no previous state given" is the safe fallback: nothing can be
diffed, so every referrer is re-validated; the store never takes this path and no other caller exists yet (Phase 4 note
in `docs/IMPLEMENTATION_PLAN.md`: the compute worker must always pass the previous state). "renamed (previous state
given)" is what the store does for an edit no referrer rule reads. "review lifecycle changed" is an edit to a field
RVW-002 reads of every record its subject refers to. `validateTouched` is the whole-subject API; `validateTouchedByRule`
is what the command store calls since 2.13 (per rule for referrers and peers). The "dispatch" entries are whole
commits through the store. The class-hub entries edit the class every one of the design tier's 1,400 `hub_explosion`
species lists.

**Before / after, hub and class-hub scenarios** (median p99, ms; before = the step 2.13 part-1 baseline, whole commits;
the 2.11/2.12 figure in brackets):

| Scenario | Row | Before | After | Verdict |
|---|---|---|---|---|
| Class hub (1,400 species), rename | 16 | 97.0 | 16.5 | over 16 by 0.5 (runs 31.1 / 16.5 / 16.4): Phase 9 exception |
| Class hub, notes edit | 16 | 97.2 | 15.5 | pass (runs 36.9 / 15.5 / 15.0) |
| Class hub, move under another parent | 50 | 125.8 | 46.0 | structural; Phase 9 exception |
| Like-water hub, notes edit, commit | 16 | 5.76 (2.12: 3.27; 2.11: 70.86) | 2.93 | pass |
| Like-water hub, rename, `validateTouchedByRule` | 16 | 2.01 (`validateTouched`) | 2.04 | pass |
| ADV-012 hub, rename, `validateTouchedByRule` | 16 | 1.31 (`validateTouched`) | 1.24 | pass |
| Like-water hub, `review` changed, commit | 50 | 76.9 (2.12: 67.5) | 21.2 | structural; Phase 9 exception |
| Like-water hub, `review` changed, `validateTouchedByRule` | 50 | 43.5 (`validateTouched`) | 18.8 | structural |
| ADV-012 hub, `review` changed, `validateTouchedByRule` | 50 | 43.0 (`validateTouched`) | 15.6 | structural |

**`bench:compare`** (once, against the final baseline): the four entries flagged in step 2.12 (undo+redo `dense`,
rejected commit `dense`, `scopeOf` twice `dense`, route search `dense`) are **no longer flagged**. Four different
entries were flagged instead, all single-run spikes on the hub commits (class-hub notes +36%, like-water notes commit
2.9 -> 13.5 ms, like-water rename `validateTouchedByRule` +30%, like-water review commit 21.2 -> 35.6 ms). No code
changed between the baseline and the compare run, so these read as this session's noise, not a regression; a
quiet-machine re-run would settle it. Against the *2.12* baseline the final medians of the four earlier entries are
undo+redo 6.18 vs 5.36 ms (+15%), rejected commit 9.62 vs 8.73 ms (+10%), `scopeOf` twice 0.096 vs 0.047 ms (a
microsecond entry), route search 17.2 vs 9.3 ms (§8 item 4).

## 6. Full generator tier × shape sweep

Unchanged from step 2.8 (`tests/property/generator-tiers.test.ts`, 24 combinations, all zero L1-L3 ERROR).

## 7. Deviations and decisions, steps 2.1-2.13

Steps 2.1-2.8: see the step 2.8 packet (also in `docs/PROGRESS.md`). Steps 2.9-2.13, summarised (detail in
`docs/PROGRESS.md` step entries and Amendments):

| Step | Decision |
|---|---|
| 2.9 | `ReadonlyIndexes.navigatorRollup()` (additive, ADR-030); hub resolution moved into `core/indexes`; truncation order made an explicit `(reactionId, outcomeId, productId)` sort; deleted-but-dangling species handled — bugs found by the differential/apply-≡-build tests before commit. |
| 2.10 | `coreIndexEngine.apply` accepts one step backward (no interface change) for incremental rollback; field-aware scoping found unsafe without a contract change, so a 50 ms row was added (Sonnet). |
| 2.11 | Fixed anchor counts (60 design / 400 stress, stress judged against an informal 32 ms), PID-locked isolation, 100-sample floor, 3 fresh-process runs, median p99; navigator build defers edge-ID hashing (no contract change). |
| 2.12 | `ValidationRule.referencedReads` (additive, ADR-031; reviewer-approved): a referrer is re-validated only if a rule of its kind reads a field that changed. |
| 2.13 | ADR-032 (additive, reviewer-approved): `FindingStore.replaceForRules`, `Validator.validateTouchedByRule`/`commitTouched`, `ValidationRule.peerReads`. Referrers and peers re-run only affected rules, merged per rule; an affected L2 rule keeps a record whole (an L2 ERROR gates L3), and a per-rule subject with an L1/L2 ERROR in the store is skipped. Peers named by an L3 rule have only that rule re-run (a reading of the `peers` contract, Sonnet's, accepted by the reviewer). SPC-006 declared for `referencedReads` and `peerReads`. Declared `peerReads`: SPC-001/005/006, CLS-001/002, HIER-001. Not declared: REF-006/008, REL-003/005, CUR-004/006, PRS-001/002, HIER-003, RTE-002/004. |

## 8. Phase 9 exceptions, remaining misses and open items

**Documented Phase 9 exceptions (exit rule item 3), median p99:**

1. **Class-hub rename: 16.5 ms vs 16** (+0.5 ms; runs 31.1 / 16.5 / 16.4, noisy). Cause, timed with a one-off script: 10.5
   of the ~11 ms in `validateTouchedByRule` is RTE-002/004's `peers` (`routesAffectedBy` walks referrers upward from a
   touched class through its 1,400 species and their reactions); without them it is 0.4 ms. They declare no `peerReads`.
   Fix: declare `peerReads` on RTE-002/004 (reactions' participants/outcomes, species `classIds`, classes'
   `parentIds`) and extend the audit; not done here because the exit rule closes rounds for Phase 2. The class-hub notes
   edit (15.5 ms) shares the cause and sits just under 16.
2. **Class-hub parent move: 46.0 ms** (row 50: under it; over 16; structural). SPC-006 re-runs on the 1,400 species that list
   it (~20 ms), the same RTE-002/004 peers walk (~10 ms), and merging ~1,400 findings into the store (8-10 ms) —
   each of those species yields an SPC-006 finding in this generator shape.
3. **Review-status change on the like-water hub: 21.2 ms per commit** (row 50: under it; over 16; structural; was 76.9).
   One RVW-002 run per referrer over ~1,000 referrers plus the finding-store merge; 18.8 ms (like water) / 15.6 ms
   (ADV-012) in `validateTouchedByRule` alone.
4. **Route search `dense`: 17.2 ms vs 16** this run (runs 18.0 / 11.1 / 17.2, spread 40%; 9.3-12.1 ms in every earlier
   baseline; no route-search code has changed). Read as noise; re-check on a quiet machine. It has no §2 row of its own.
5. **`validateTouched`/`validateTouchedByRule` without a previous state: 38.7-47.1 ms** on a 1,000-referrer hub. It is the
   safe fallback and the commit path never takes it; the compute worker must always pass the previous state (Phase 4
   note, `docs/IMPLEMENTATION_PLAN.md`; `docs/PERFORMANCE_ARCHITECTURE.md` §3).

**Also open, not budget failures:**

6. Noise: 31 of 42 entries exceed a 25% spread in this run (list in `baseline.json`). Every entry that passes has its
   median under budget; a few have one outlier run over it (e.g. reaction_explorer `hub_explosion`, one 45.5 ms run of
   three; stress navigator, one 57.5 ms run of three).
7. `npm run bench:compare` is manual, not in CI (unchanged).
8. The command store still carries only the part-1 `coreIndexEngine`, not the full `indexEngine` with
   `navigatorRollup()` (PROGRESS step 2.1's open item; tests work around it as P-07 always has).
9. HIER-001, HIER-003, RTE-002 and RTE-004 declare no `referencedReads`; REF-006/008, REL-003/005, CUR-004/006,
   PRS-001/002, HIER-003 and RTE-002/004 declare no `peerReads` (they keep the coarser behaviour).
10. Everything from Gate A's own list (chemistry and exam coverage unverified).

**Closed in 2.13:** the doubled `scopeOf` call (§0 item 3); `npm run bench` on Windows (§0 item 6); the stale fragment in
`docs/PROGRESS.md`.

---
Preparation notes: prepared alongside `docs/PROGRESS.md` step 2.13 and `docs/PROJECT_STATE.json`.
`tests/perf/*.bench.ts`, `tests/perf/budgets.mjs` and `tests/perf/baseline.json` are committed; regenerate the baseline
with `npm run bench:baseline` and compare against it with `npm run bench:compare`. The raw `vitest bench` output that
produced §5 is not committed (reproducible with either command).
