# Test Strategy

Package sections: **#24 Test Architecture**, **#25 Adversarial Test Matrix**, the **demo dataset specification**, property tests and **Gates A–F** (also summarised in IMPLEMENTATION_PLAN.md).

## 1. Test architecture (#24)

| Layer | Tool | Location | Scope |
|---|---|---|---|
| Unit | Vitest (node env) | colocated `src/**/x.test.ts` | pure functions: schema, reference engine, rules, indexes, projections, parsers |
| Property | fast-check | `tests/property/` | invariants over random command sequences and generated datasets (§4) |
| Integration | Vitest + fake-indexeddb | `tests/integration/` | store + persistence + import/export + migrations + worker APIs called in-process |
| Adversarial | Vitest | `tests/adversarial/` | the ADV matrix (§5), one file per group |
| Component | Testing Library + jsdom (`// @vitest-environment jsdom`) | colocated in `src/ui`, `src/features` | rendering, keyboard, a11y attributes |
| End-to-end | Playwright (Chromium, Firefox, WebKit) | `tests/e2e/` | boot, navigation, authoring, import/export, multi-tab, offline, performance traces |
| Benchmarks | Vitest bench | `tests/perf/` | budgets in PERFORMANCE_ARCHITECTURE.md §2 |

Rules:
- Tests are deterministic: clocks, IDs and randomness are injected (`CommandContext`, seeded mulberry32). No sleeps; use fake timers.
- No test depends on the demo dataset's specific names for *logic*; fixtures are loaded and referenced by ID in tests only (the hardcode check excludes test files).
- Every bug fix adds a failing test first.
- Coverage targets: `src/core` ≥ 90% lines and ≥ 85% branches; services ≥ 80%; UI covered by component + e2e flows rather than a line target.
- `npm run check` (typecheck, lint, dependency rules, file size, hardcode, unit/property/integration/adversarial) must pass on every commit; e2e and benchmarks run at every gate and before tagging a phase.
- **Wall-clock assertions are not part of `npm run check` or `npm run test:coverage`** (reviewer decision, step 3.3 review; determinism). A test that asserts elapsed milliseconds (a performance budget, a "bounded time" claim) lives in `tests/timing/` and runs only through `npm run test:timing` (`vitest.timing.config.ts`, serial), at gates next to `bench:baseline`. Its title and assertions stay as they were, and the file is still named `*.test.ts` under `tests/`, so the gate-matrix title scan finds it. The functional part of such a claim (the input terminates, the answer is right) stays in `check` under a title that makes no time claim. A per-test timeout raised to 120 s on a property test is a resource limit, not an assertion, and is allowed (`tests/property/validation-scope.test.ts`); likewise the real-thread tests (`tests/integration/compute-restore-threads.test.ts`: 5 s default raised to 60 s after a timeout under load, step 4.2d review; `compute-worker-threads.test.ts`, `rpc-worker-threads.test.ts` and `compute-export-threads.test.ts`: 60 s). **Test workers are capped at 4** in `vitest.config.ts` (also a resource limit: with the default of one worker per core, heavy tests time out under load on the reference workstation, different tests every run, all green alone). Override with the environment variable `ORN_TEST_WORKERS` (a positive integer; anything else is an error); `npm run check` must pass as ONE command at the default. Never raise a timeout to make a run pass. (Reviewer, 2026-10-08: ONE per-test limit of 60 s for the whole `real-threads` Vitest project, set in `vitest.config.ts` (`REAL_THREAD_TEST_TIMEOUT_MS`), so `compute-import-threads.test.ts` is no longer on the 5 s default. Reason: on battery a thread start can take over 5 s. A resource limit of a test that starts a real thread, not a product limit; the 2 s call limit and the 20 s warm-up are unchanged, and the rule above stands for everything else.)
- **Worker cap and real threads** (step 4.6 close review). Vitest runs at most 4 workers (`ORN_TEST_WORKERS`, `vitest.config.ts`), and the test files that start a real `worker_threads` thread (`tests/integration/*-threads.test.ts`, `worker-crash-recovery.test.ts`) run as their own serial project after the rest of the suite, with no results cache, so file order never depends on an earlier run. A resource arrangement, not an assertion or timeout change.

## 2. Fixtures

| Fixture | Purpose |
|---|---|
| `data/fixtures/schema/v1/minimal-valid.orn.json` | smallest valid dataset touching most kinds (exists) |
| `data/fixtures/schema/v1/maximal-valid.orn.json` | every field of every kind populated (exists; completeness is checked against the schema by `maximal-fixture.test.ts`); drives the reference-registry coverage test |
| `data/fixtures/schema/v1/invalid/*.json` | one file per L1/L2 failure class (exists); `invalid/manifest.json` records each file's level, rule, and the issue path (L1) or record + registry field (L2) |
| `data/seed/demo.orn.json` | demo dataset (§3) |
| `data/fixtures/demo-invalid.orn.json` | demo variant with deliberate L3 problems for diagnostics UI tests |
| `data/fixtures/legacy/*` | v6/v4 legacy fixtures and oracle (exists; see its README) |
| generator (`src/test-support/generator.ts`) | synthetic datasets by tier and shape (PERFORMANCE_ARCHITECTURE.md §10) |

## 3. Demo dataset specification

The demo is real JEE chemistry chosen to exercise every feature. It is built in Phase 1 as `data/seed/demo.orn.json`, validated with zero L1–L3 ERRORs, and loaded from the first-run screen.

**Classes and hubs**: alkanes, alkenes, alkynes, arenes, haloalkanes, alcohols (with 1°/2°/3° children), phenols, ethers, aldehydes, ketones, carboxylic acids, esters, amines, diazonium salts — each anchored as a navigator hub with a generic formula, none with a representative structure.

**Reactions** (feature exercised in brackets):
1. Ethanol → ethanal with PCC, specific, `instanceOfId` → generic "1° alcohol → aldehyde (PCC)" [generic/specific, transformation, caveat "stops at aldehyde"].
2. Ethanal → ethanoic acid (acidified K₂Cr₂O₇) and ethanol → ethanoic acid directly [branch and merge; parallel paths A→C and A→B→C].
3. Ethanol → ethanal with K₂Cr₂O₇/H⁺ (distillation) as an alternative to PCC [parallel A→B edges, `alternative_to`].
4. Fischer esterification ⇌ ester hydrolysis [equilibrium, `reverse_of` microscopic, cycle; water with `showAsNode: never`].
5. Ethanol + conc. H₂SO₄: variant 413 K → diethyl ether, variant 443 K → ethene [condition variants, variant-scoped outcomes].
6. Acid-catalysed hydration of ethene vs dehydration [`reverse_of` synthetic].
7. Propene + HBr: 2-bromopropane major, 1-bromopropane minor; propene + HBr/peroxide: anti-Markovnikov major [selectivity, isomer group, `contrasts_with`, exception caveat].
8. (R)-2-bromobutane + aq. KOH → (S)-butan-2-ol (SN2, inversion) vs + alc. KOH → but-2-ene major / but-1-ene minor (E2, Saytzeff) [same reagent family different outcome, stereo outcome, `competing_with`, mechanism variants].
9. Cannizzaro of benzaldehyde (coefficient 2) [`commonly_confused_with` Aldol].
10. Aldol of ethanal with a mechanism having base- and acid-catalysed variants [mechanism variants, steps with atom maps and electron movements].
11. Haloform test on ethanol/propanone [purpose `qualitative_test`].
12. Aniline diazotisation at 0–5 °C [temperature range], Sandmeyer to chlorobenzene [byproduct N₂], diazonium → phenol [cross-chapter topic mapping].
13. Grignard: CH₃MgBr + propanone, stage 1 dry ether, stage 2 H₃O⁺ work-up → 2-methylpropan-2-ol [stages, reaction scheme placements].
14. But-2-yne + H₂/Lindlar → cis-but-2-ene [reagent with components: Pd/CaCO₃ support, quinoline poison; syn addition].
15. Friedel–Crafts acylation with AlCl₃ modelled as stoichiometric reagent [trap caveat, RXN-005 teaching].
16. KMnO₄ with the "Baeyer's reagent" profile (cold, dilute, alkaline) on ethene → ethane-1,2-diol [reagent profiles].
17. Beckmann rearrangement, unanchored and mapped outside JEE Main scope [Unanchored list, outside-scope dimming].

**Edge records**: a species with an invalid SMILES (CHEM-001, review), a species without structure, palmitic acid (long chain depiction), a very long IUPAC name, Unicode aliases (α, subscripts), a draft reaction with no product (RXN-002 warning).

**Routes**: ethanol → propan-2-ol via ethanal + CH₃MgBr (curated); alternative paths are found by route search; aniline → phenol via diazonium.

**Curriculum**: baseline topic tree (JEE_ONTOLOGY.md §2), JEE Main and JEE Advanced exams, one `provisional` version each (review required), topic mappings for every reaction, one explicit `exam_relevance` override.

**Presentation**: anchors for all hubs, a reaction scheme for the Grignard reaction, a view preset "Carbonyl chemistry", entity display for water.

## 4. Property tests

| ID | Property |
|---|---|
| P-01 | save → load (fake-indexeddb) yields a state deep-equal to the original |
| P-02 | export → import → export is byte-identical |
| P-03 | migrate(vN fixture) then export equals the committed expected output; migration is deterministic (framework form with synthetic test-only steps until the first real schema bump; IMPLEMENTATION_PLAN Phase 3 notes) |
| P-04 | after any delete with `apply_cascade`, no reference dangles (INV-04) |
| P-05 | rename never changes any reference or ID |
| P-06 | duplicate produces globally unique record and nested IDs |
| P-07 | incremental indexes after random commands equal a full rebuild (INV-18) |
| P-08 | for random command sequences, undo^n returns to the initial state and redo^n returns to the final state exactly (INV-27) |
| P-09 | traversal and route search terminate within limits on random cyclic graphs (INV-22) |
| P-10 | projections are deterministic: same state + request → byte-identical projection |
| P-11 | incremental validation equals `validateAll` after random edit sequences aimed at high-referrer hubs and at the class hub every species lists (renames, aliases, notes, review status and lifecycle, classes, parents incl. cycles, deletion and restoration, neighbours), on both commit paths (INV-18; step 2.12, extended in 2.13, ADR-031/032; `tests/property/validation-scope.test.ts`) |

Commands for P-04…P-08 are generated by a fast-check model (`src/test-support/arbitraries.ts`) that produces only schema-valid commands against the current model state, so failures shrink to minimal sequences.

## 5. Adversarial matrix (#25)

ADV-001…ADV-058 cover the adversarial cases requested in the requirements (§46). Level: U unit, P property, I integration, E e2e, B benchmark.

| ID | Case | Level | Module | Expected | Phase | Gate |
|---|---|---|---|---|---|---|
| ADV-001 | A → B, one reaction | U | graph | one edge; stable ID | 2 | B |
| ADV-002 | A → B via two reactions | U | graph | two edges, one bundle (count 2); never merged | 2 | B |
| ADV-003 | A → B → C plus A → C | U | graph | three edges; no transitive reduction | 2 | B |
| ADV-004 | A → B and B → A | U | graph | two edges; no reversibility inferred; ⇌ only with `reverse_of` | 2 | B |
| ADV-005 | self-loop A → A | U | graph, validation | loop glyph; RXN-017 warning | 2, 5 | B, E |
| ADV-006 | 2 reactants → 3 products | U | graph | 2 consumes + 3 produces edges | 2 | B |
| ADV-007 | same product major in R1, minor in R2 | U | graph | distinct edge styles per outcome, including one reaction with both a major and a minor product | 2 | B |
| ADV-008 | outcomes differ by condition variant (413/443 K) | U | validation, graph | edges carry variant IDs; filters by variant | 1–2 | A |
| ADV-009 | exclusive overlaps another outcome | U | validation | RXN-008 ERROR; commit rejected | 1 | A |
| ADV-010 | minor without major | U | validation | RXN-009 WARNING; commit allowed | 1 | A |
| ADV-011 | chain depth 60 | U/B | graph | truncation at depth 12 with notice; no recursion overflow | 2 | B |
| ADV-012 | hub with 1,000 reactions | B/E | graph, render | bundles + overflow; ≤ render budget; 60 fps | 2, 5 | B, E |
| ADV-013 | dense 5k-reaction graph | B | graph | projection < 16 ms p95 | 2 | B |
| ADV-014 | disconnected components, unanchored reactions | U | graph | Unanchored list complete; nothing hidden | 2 | B |
| ADV-015 | species in several classes | U | graph | deterministic hub choice; inferred edges dotted | 2 | B |
| ADV-016 | class hierarchy cycle | U | validation | HIER-001 ERROR; rejected | 1 | A |
| ADV-017 | delete species used by 30 reactions | U/I | commands | restrict: blocked with full impact list | 1 | A |
| ADV-018 | delete reaction used by route, scheme, relationship, mapping | U | commands | route blocks; others cascade per registry | 1 | A |
| ADV-019 | rename a species | P | commands, search | references unchanged; search finds new name | 1, 3 | A |
| ADV-020 | duplicate a complex reaction | P | commands | all nested IDs regenerated and unique | 1 | A |
| ADV-021 | merge duplicate species | U | commands | replaceReferences + delete in one undoable batch | 1 | A |
| ADV-022 | two species with the same name | U | validation | SPC-001 WARNING; both kept | 1 | A |
| ADV-023 | same substance reagent here, reactant there | U | domain | role is per participation; both valid | 1 | A |
| ADV-024 | aq. KOH vs alc. KOH | U | domain, graph | one reagent; two reactions; different outcomes | 1–2 | A |
| ADV-025 | catalyst marked consumed (AlCl₃) | U | validation | RXN-005 WARNING | 1 | A |
| ADV-026 | spectator contributes atoms | U | validation | RXN-004 ERROR | 1 | A |
| ADV-027 | water never a node but referenced | U | graph | shown on arrow text; chemistry intact | 2 | B |
| ADV-028 | delete all presentation records | P | domain | chemistry valid and unchanged (INV-14) | 1 | A |
| ADV-029 | UI state keys injected into a record | U | schema | rejected (strict) | 1 | A |
| ADV-030 | import with dangling references | I | io | offending records flagged; nothing applied until resolved | 3 | C |
| ADV-031 | wrong ID prefix / wrong-kind ref in import | I | io | quarantined with issues | 3 | C |
| ADV-032 | 60 MB file, depth-100 JSON, 5 MB string | I | io | rejected by caps before parse; app responsive | 3 | C |
| ADV-033 | HTML/script in names, `javascript:` URL, scripted SVG asset | U/E | schema, render | rendered inert as text/img; URL rejected | 1, 5 | E |
| ADV-034 | bidi override/control characters | U | schema | rejected | 1 | A |
| ADV-035 | `__proto__` keys in JSON | I | io | renamed and reported; no prototype change | 3 | C |
| ADV-036 | unparsable SMILES | U/I | chem | CHEM-001 WARNING; record saves | 4 | D |
| ADV-037 | NaN, Infinity, < 0 K temperatures | U | schema, validation | rejected / RXN-014 ERROR | 1 | A |
| ADV-038 | crash during a write | I/E | persistence | reload shows last committed revision; no partial record | 3 | C |
| ADV-039 | two tabs | E | persistence | second tab read-only, follows changes, promotes on close | 3, 5 | C |
| ADV-040 | quota exceeded while saving | I | persistence | cache evicted → failed status; memory kept; export works | 3 | C |
| ADV-041 | newer schema version on disk / in file | I | persistence, io | read-only / import refused with explanation | 3 | C |
| ADV-042 | import ID conflicts | I | io | identical skip, keep, replace, import as copy all correct | 3 | C |
| ADV-043 | v6 import with representative hub SMILES, dangling IDs, duplicate names | I | io/legacy | no loss (completeness test); review items listed | 3 | C |
| ADV-044 | 200 mixed commands, undo all, redo all | P | commands | exact states (P-08) | 1 | A |
| ADV-045 | redo after migration or import | I | commands, persistence | history cleared; redo unavailable; snapshot restore returns prior state | 3 | C |
| ADV-046 | A → B and A → C via separate reactions (divergent) | U | graph | two edges from A; A appears once; nothing merged | 2 | B |
| ADV-047 | A → C and B → C (convergent) | U | graph | two edges into C; C appears once | 2 | B |
| ADV-048 | A + B → C | U | graph | one reaction node, 2 consumes + 1 produces edge; A and B both upstream of C in the precursor view | 2 | B |
| ADV-049 | diamond A→B, A→C, B→D, C→D | U | graph, route | four edges; D appears once; no transitive reduction; route search returns both A→D routes | 2 | B |
| ADV-050 | A → B → C → A | U/P | graph, route | three arrows; traversal terminates, each node once; no endless routes; truncation reported, never silent | 2 | B |
| ADV-051 | same compound twice in one reaction: (a) reactant and product, (b) twice as reactant | U | validation, indexes, graph | (a) RXN-017 warning; (b) no ERROR, two participations with distinct IDs; indexes and edges one per participation (INV-26) | 1–2 | A, B |
| ADV-052 | one product made by 25 reactions | U | indexes, graph | productions index lists all 25; precursor view shows all producers or a bundle with overflow count; nothing dropped | 2 | B |
| ADV-053 | spectator participant with no visual node | U | graph | no node or edge; listed in the reaction view; still indexed | 2 | B |
| ADV-054 | reaction with intermediates | U | graph | stored on the reaction; shown in the reaction view; never navigator nodes/edges; not counted as products | 2 | B |
| ADV-055 | reaction with multiple mechanism variants | U | validation, graph | outcomes link to different variants and resolve (INV-16); mechanism view shows each variant with its outcomes | 1–2 | A, B |
| ADV-056 | conditional reversibility | U | graph | reversible_under_other_conditions → one-way arrow plus annotation; ⇌ only with reverse_of | 2 | B |
| ADV-057 | cross-chapter reaction (two topic mappings) | U | validation, indexes, graph | no finding; resolves under both chapters via topic ancestry; syllabus view lists it in both | 1–2 | A, B |
| ADV-058 | multiple aliases for one entity (incl. Unicode α, subscripts) | U | text, indexes, search | every alias folds and resolves to the one record; own aliases never trigger SPC-001; search finds it by every alias | 1, 4 | A |

ADV-005 splits across two gates: the validation half (RXN-017 warning) and the graph shape itself
(consumes+produces between the same node) are Phase 2/Gate B; the "loop glyph" GRAPH_SEMANTICS.md §9
describes is a render/layout concept and is Phase 5/Gate E.

ADV-038 and ADV-039 split the same way: the integration half (fake-indexeddb, in-process lock/channel fakes) is Gate C; the real-browser e2e half is Gate E.

ADV-019's search half is Phase 4 (step 4.5; done: `src/workers/search/search.test.ts`, with ADV-058's search part and the incremental-equals-rebuild property in `tests/property/search-incremental.test.ts`).

## 6. Gates

| Gate | After | Must be true |
|---|---|---|
| A — Domain core | Phase 1 | Schemas + maximal fixture; reference registry coverage test passes; commands, undo/redo; L1–L3 rules with tests; INV tests; P-01 (in-memory variant), P-02, P-04…P-08; demo dataset validates with 0 ERROR; generator produces valid data at all tiers; ADV rows marked A pass |
| B — Graph engine | Phase 2 | All projections registered; route search; P-09, P-10; ADV rows marked B pass; benchmarks meet budgets at the design tier, judged by the general performance rule below |
| C — Persistence & import | Phase 3 | Dexie adapter, write queue, boot integrity, snapshots, multi-tab lock; import/export incl. `.ornpkg`; migrations framework; v6 dry run on fixtures with zero `notImported`; ADV rows marked C pass |
| D — Authoring | Phase 6 | Every demo reaction can be authored through the UI from scratch; drafts survive reload; conflicts handled; L4 streaming; ADV-036 |
| E — UI & rendering | Phase 5 | Shell, navigator, inspector, keyboard map, list view, a11y checks (axe) pass; 60 fps pan/zoom at render budget; ADV-005 (glyph), ADV-012, ADV-033 in e2e; ADV-038 and ADV-039 browser halves (§5 notes) |
| F — Release | Phase 10 | Full ADV matrix and property suite green; v6 end-to-end audit; stress tier usable; security review checklist; performance traces within budget; documentation updated |

**General performance rule for gates (reviewer decision, step 2.13; final for Phase 2, and the model for later gates).** "Benchmarks meet budgets" is judged as follows. (1) **Correctness is green**: the incremental ≡ full property tests, the read audit, and `npm run check`. (2) **Ordinary edits** (the ones an author makes all day: rename, notes edit, add an alias) on the hub and class-hub scenarios are under **50 ms median p99** (median of 3 fresh-process runs, PERFORMANCE_ARCHITECTURE.md §9). (3) Anything over its own §2 target (16 ms for a commit) but under 50 ms, and **structural edits** (moving a class under another parent, changing a review status that every referrer reads, deleting a hub), are not gate failures: they are recorded as documented exceptions for Phase 9 with their measured numbers in the gate packet, and are not re-litigated at the gate. A step that adds or changes a hot path adds or updates its benchmark in the same step (IMPLEMENTATION_PLAN.md §1).

**Standing rules (Gate E review, 2026-10-14).** `bench:compare` runs in every phase-closing step. The boot rows (cold 2.5 s, warm 1.5 s) are Chromium rows; Firefox and WebKit boot are REPORTED, not gated, until Phase 9.

**Documented Phase 9 exceptions (step 5.4c review, 2026-10-07).** (1) The navigator overview with EVERY hub expanded at the design dense tier: 18.9 ms mean / 25.0 ms p99 (target 16 ms, under 50 ms). (2) A FILTERED navigator overview (topic, reagent family, scope or text filter; it scans, the pair table holds unfiltered counts): about 12 ms mean / 23 ms p99. The default navigator request is UNFILTERED (exam scope dims, it does not filter; step 5.5a), so neither is on the default path.
