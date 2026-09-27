# Gate A review packet — Phase 1 (domain core)

Prepared 2026-09-27 for a reviewer who cannot see the repository. Everything below was produced or re-run in the preparation session; where a claim comes from a project document rather than from a run, it says so. Not committed.

- Repository state: branch `master`, HEAD `45d318e` (`phase-1: spec corrections after Gate A self-review`) on top of `e6183a5` (step 1.12). No `phase-1` tag has been created.
- Toolchain: Node 24.21.0, npm 11.19.0, TypeScript 6.0.3, Zod 4.6.5, Immer 10.2.0, Vitest 3.2.7, Vite 7.3.6, fast-check 3.23.2.
- `npm run check` (typecheck, lint, lint:deps, check:size, check:hardcode, tests): **green — 44 test files, 849 tests**.
- Property tests at `ORN_PROPERTY_RUNS=200`: 3 files, 19 tests, all pass (re-run for this packet).

## 0. What the reviewer should decide

1. Is the Phase 1 evidence enough to declare Gate A passed? Everything is a self-review; chemistry content is **unverified** (nothing is marked `verified`).
2. Two demo-data choices need a ruling (§8): `ethanone` was corrected in the spec to *ethanal*, but the demo dataset still models the second haloform test on *propanone*; and reaction 8 uses KOH for both conditions (now the spec too).
3. Whether to accept the `check:hardcode` schema exemption as is, or replace it with the narrower guard in §6 (verified to pass on the current tree).
4. Vitest advisory (§9): recommended path is a Vitest 4.1.11 upgrade as its own commit at this phase boundary (tested in a throwaway clone; not applied).
5. P-01 is named by no test; it is covered in substance by P-02 (§2, row 6). Confirm that is acceptable for Gate A.

## 1. Gate A criteria

Source: `docs/TEST_STRATEGY.md §6` (Gate A row) and `docs/IMPLEMENTATION_PLAN.md §3` (Phase 1 definition of done).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Schemas + maximal fixture | **pass** | `src/core/schema/maximal-fixture.test.ts` (fixture parses unchanged; 335 schema-derived coverage expectations met; unique IDs; sorted collections); `schema-mutations.test.ts` (67 tests: every kind mutated at every node); `invalid-fixtures.test.ts` (37 L1 + 9 L2 invalid fixtures, each fails only at its declared path). |
| 2 | Reference registry coverage test | **pass** | `src/core/references/registry-coverage.test.ts`: every ID-shaped value in the maximal fixture is covered (with a non-vacuity check), every spec matches something, every extracted reference resolves with the right kind, remap ≡ plain string replacement, detach keeps records schema-valid. |
| 3 | Commands, undo/redo | **pass** | `src/core/commands/{store,undo,impact,walk}.test.ts`, `builders/builders.test.ts`; P-08 and ADV-044 (200 mixed commands, undo all, redo all: exact states at every step). |
| 4 | L1–L3 rules with tests | **pass** | `src/core/validation/`: `l1.test.ts`, `rules/{references,reactions,reactions-more,substances,structure,…}.test.ts`, `validator.test.ts`. A catalogue-coverage test fails when a rule in VALIDATION_RULES.md has no implementation (it caught SPC-007 in step 1.8). L4 (CHEM-*) and AST-002/003 are out of Gate A scope (Phases 3/4). |
| 5 | INV tests | **pass, with caveats** | See §3. INV-01…08, 10…19, 23…25, 27, 29, 30 each have at least one test that names them in its title. INV-09 and INV-15 are tested by rule ID (HIER-001/003, REL-001…005, RTE-001), not by INV ID. INV-20, 21, 22, 26, 28 are Phase 2/3/5 invariants and have no test yet (planned steps in §3). |
| 6 | P-01 (in-memory variant), P-02, P-04…P-08 | **pass, with a naming gap** | P-02, 04, 05, 06, 07, 08 are named tests in `tests/property/` (19 tests pass at 200 runs). **No test carries the name P-01.** Its in-memory variant (state → document → state deep-equal) is exercised by `export-roundtrip.test.ts` (P-02 checks "state and document equality") and by `src/core/dataset/document.test.ts`. P-01 proper needs fake-indexeddb: Phase 3 step 3.5. |
| 7 | Demo dataset validates with 0 ERROR | **pass** | `src/test-support/demo/demo.test.ts` (22 tests): 0 ERROR at L1–L3; exactly one WARNING (RXN-002, planted draft). Summary in §7. |
| 8 | Generator valid at all tiers | **pass** | `tests/property/generator-tiers.test.ts` (10 tests): 0 L1–L3 ERROR for all six shapes at initial tier, dense and hub at design tier, chain and duplicate-endpoint at stress tier. Caveat: design/stress are sampled for two shapes each (PROGRESS 1.11 decision); full tier × shape sweeps are planned for step 2.7. |
| 9 | ADV rows marked A pass | **pass** | All 19 rows have at least one titled test (§2 table; the `tests/adversarial/gate-a.test.ts` completeness check plus my own title-level scan). Caveat: the completeness check only tests that the ID string occurs somewhere in a test file, so a comment would satisfy it. The title-level scan in §2 shows none of the 19 rows relies on a comment alone. |
| 10 | `src/core` imports only core / zod / immer | **pass** | `npm run lint:deps` (dependency-cruiser, part of `npm run check`) green. |
| 11 | ≥ 90 % line coverage in `src/core` | **pass** | 99.46 % lines, 95.07 % branches, 99.15 % functions (re-run for this packet; PROGRESS.md records 95.09 % branches, a 0.02-point run-to-run difference from random-walk tests). Per folder in §4. |
| 12 | `npm run check` green | **pass** | Exit 0, 44 files / 849 tests, run for this packet. |

Not part of the gate but relevant: the reviewer cannot rely on this packet for chemical correctness. All demo SMILES, stereodescriptors, conditions, mechanism atom maps and exam coverage are unverified.

## 2. Gate A table from `docs/PROGRESS.md` (step 1.12), verbatim

| Criterion | Result |
|---|---|
| Schemas + maximal fixture; registry coverage test | pass (steps 1.2, 1.4) |
| Commands, undo/redo | pass (1.9; P-08, ADV-044) |
| L1–L3 rules with tests; INV tests | pass; every Phase 1 INV is named by a test (INV-03/06/16/17/25 added here) |
| P-01 in-memory variant, P-02, P-04…P-08 | pass at default and at `ORN_PROPERTY_RUNS=200` (19 tests) |
| Demo validates with 0 ERROR | pass |
| Generator valid at all tiers | pass (1.11) |
| ADV rows marked A pass | pass: all 19 rows named and exercised; the matrix check fails if a row loses its test |
| `src/core` coverage ≥ 90% lines | 99.46% lines, 95.09% branches, 99.15% functions (`npm run test:coverage`) |
| `src/core` imports only core/zod/immer | pass (`lint:deps`) |

"Human review is still needed: the chemistry, SMILES and all exam coverage are unverified."

Two statements in that table are looser than this packet's evidence: "every Phase 1 INV is named by a test" (INV-09 and INV-15 are named only through rule IDs) and "P-01 in-memory variant" (no test carries that name).

## 3. ADV and INV matrices

Method: a script walks every `*.test.ts` under `src/` and `tests/`, tracks the `describe` nesting, and records each `describe`/`it` title (including `it.each` templates) that contains an ID. A "comment-only" mention is not counted as a test. Rows are listed in spec order. Gate is from `docs/TEST_STRATEGY.md §5`. Test names are trimmed to 150 characters; "(+N more)" means further titled tests exist.

"Planned step" for rows with no test is **my reading** of `docs/IMPLEMENTATION_PLAN.md §2`: the plan assigns rows to gates (2.7 for B, 3.9 for C, 5.9 for E) but not to individual steps, so the step listed is where the behaviour is built.

### 3.1 ADV-001…045 (45 rows: 24 have a titled test — all 19 Gate A rows plus 5 later-gate rows tested in part; 21 have none yet)

| ID | Case (spec) | Phase / Gate | Test file — test name |
|---|---|---|---|
| ADV-001 | A → B, one reaction | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-002 | A → B via two reactions | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-003 | A → B → C plus A → C | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-004 | A → B and B → A | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-005 | self-loop A → A | 2 / B | `src/core/validation/rules/reactions-more.test.ts` — RXN-017 product equals reactant (ADV-005)<br>`src/core/validation/rules/reactions-more.test.ts` — RXN-017 product equals reactant (ADV-005) › warns at the product |
| ADV-006 | 2 reactants → 3 products | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-007 | same product major in R1, minor in R2 | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-008 | outcomes differ by condition variant (413/443 K) | 1–2 / A | `src/core/validation/rules/reactions.test.ts` — RXN-008 exclusive outcome overlap (ADV-009) › is an ERROR when an exclusive outcome shares a variant with another; disjoint variants are fine (ADV-…<br>`tests/adversarial/gate-a.test.ts` — ADV-008: outcomes that differ by condition variant carry the variant IDs (413 K / 443 K) |
| ADV-009 | exclusive overlaps another outcome | 1 / A | `src/core/validation/rules/reactions.test.ts` — RXN-008 exclusive outcome overlap (ADV-009)<br>`src/core/validation/rules/reactions.test.ts` — RXN-008 exclusive outcome overlap (ADV-009) › is an ERROR when an exclusive outcome shares a variant with another; disjoint variants are fine (ADV-… |
| ADV-010 | minor without major | 1 / A | `src/core/validation/rules/reactions.test.ts` — RXN-009 minor without major (ADV-010)<br>`src/core/validation/rules/reactions.test.ts` — RXN-009 minor without major (ADV-010) › warns when no major overlaps, and is silent when one does |
| ADV-011 | chain depth 60 | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-012 | hub with 1,000 reactions | 2, 5 / B, E | **not yet** — planned Phase 2, 5 (Gate B, E) |
| ADV-013 | dense 5k-reaction graph | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-014 | disconnected components, unanchored reactions | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-015 | species in several classes | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-016 | class hierarchy cycle | 1 / A | `src/core/validation/rules/substances.test.ts` — HIER-001 hierarchy cycles (ADV-016) |
| ADV-017 | delete species used by 30 reactions | 1 / A | `src/core/commands/impact.test.ts` — delete commands › ADV-017: a species used by 30 reactions is blocked in both modes, with the full impact list<br>`tests/adversarial/gate-a.test.ts` — ADV-017: deleting water, used by many reactions, is blocked with the full impact list |
| ADV-018 | delete reaction used by route, scheme, relationship, mapping | 1 / A | `src/core/commands/impact.test.ts` — ADV-018: the route blocks the reaction; once the route is gone the scheme, mapping and relevance cascade<br>`tests/adversarial/gate-a.test.ts` — ADV-018: a reaction in a route is blocked by it; a reaction with a scheme, relationships and mappings cascades them |
| ADV-019 | rename a species | 1, 3 / A | `src/core/commands/builders/builders.test.ts` — ADV-019: rename a species<br>`src/core/commands/builders/builders.test.ts` — ADV-019: rename a species › changes names, not IDs: every reference and every referrer is unchanged, the name index follows |
| ADV-020 | duplicate a complex reaction | 1 / A | `src/core/commands/builders/builders.test.ts` — duplicateRecord › ADV-020: regenerates every nested ID, keeps them unique, keeps references to other records, resets provenance |
| ADV-021 | merge duplicate species | 1 / A | `src/core/commands/builders/builders.test.ts` — mergeRecords › ADV-021: re-points every reference and deletes the source in one undoable batch |
| ADV-022 | two species with the same name | 1 / A | `src/core/validation/rules/substances.test.ts` — SPC-001 same canonical name (ADV-022) |
| ADV-023 | same substance reagent here, reactant there | 1 / A | `src/core/schema/schema-layering.test.ts` — SubstanceRef allows species, class and reagent only; the role is per participation (ADV-023)<br>`src/core/validation/rules/reactions.test.ts` — RXN-011 profile on a non-reagent (ADV-023: role and ref are per participation)<br>(+2 more) |
| ADV-024 | aq. KOH vs alc. KOH | 1–2 / A | `tests/adversarial/gate-a.test.ts` — ADV-024: aq. KOH and alc. KOH are one reagent in two reactions with different outcomes |
| ADV-025 | catalyst marked consumed (AlCl₃) | 1 / A | `src/core/validation/rules/reactions.test.ts` — RXN-005 catalyst consumed (ADV-025)<br>`src/core/validation/rules/reactions.test.ts` — RXN-005 catalyst consumed (ADV-025) › warns on a catalyst marked consumed only |
| ADV-026 | spectator contributes atoms | 1 / A | `src/core/validation/rules/reactions.test.ts` — RXN-004 spectator contributing atoms (ADV-026)<br>`src/core/validation/rules/reactions.test.ts` — RXN-004 spectator contributing atoms (ADV-026) › is an ERROR at the flag; a spectator without the flag, or a reagent with it, is fine |
| ADV-027 | water never a node but referenced | 2 / B | **not yet** — planned Phase 2 (Gate B) |
| ADV-028 | delete all presentation records | 1 / A | `src/core/validation/validator.test.ts` — INV-14 / ADV-028: presentation records do not affect chemistry findings<br>`src/core/validation/validator.test.ts` — INV-14 / ADV-028: presentation records do not affect chemistry findings › deleting every presentation record leaves the findings of chemistry recor…<br>(+1 more) |
| ADV-029 | UI state keys injected into a record | 1 / A | `src/core/schema/invalid-fixtures.test.ts` — covers the L1 adversarial rows of Gate A and E (ADV-029, ADV-033, ADV-034, ADV-037)<br>`src/core/validation/l1.test.ts` — parseRecord: findings › rejects UI state smuggled into a record with a message naming the key, not its value (ADV-029) |
| ADV-030 | import with dangling references | 3 / C | **not yet** — planned Phase 3 (Gate C) |
| ADV-031 | wrong ID prefix / wrong-kind ref in import | 3 / C | **not yet** — planned Phase 3 (Gate C) |
| ADV-032 | 60 MB file, depth-100 JSON, 5 MB string | 3 / C | `src/core/schema/primitives.test.ts` — Base64 (embedded assets, ADV-032)<br>`src/core/schema/primitives.test.ts` — Base64 (embedded assets, ADV-032) › enforces the cap and stays linear on a maximum-size payload |
| ADV-033 | HTML/script in names, `javascript:` URL, scripted SVG asset | 1, 5 / E | `src/core/schema/invalid-fixtures.test.ts` — covers the L1 adversarial rows of Gate A and E (ADV-029, ADV-033, ADV-034, ADV-037)<br>`src/core/schema/primitives.test.ts` — $name accepts Unicode chemistry text and inert markup verbatim (ADV-033)<br>(+1 more) |
| ADV-034 | bidi override/control characters | 1 / A | `src/core/schema/invalid-fixtures.test.ts` — covers the L1 adversarial rows of Gate A and E (ADV-029, ADV-033, ADV-034, ADV-037)<br>`src/core/schema/primitives.test.ts` — $name rejects every C0 control except TAB/LF/CR, DEL and bidi controls (ADV-034)<br>(+1 more) |
| ADV-035 | `__proto__` keys in JSON | 3 / C | **not yet** — planned Phase 3 (Gate C) |
| ADV-036 | unparsable SMILES | 4 / D | `src/core/schema/primitives.test.ts` — StructureRep › rejects empty values and unknown formats; keeps unparsable SMILES for CHEM-001 (ADV-036) |
| ADV-037 | NaN, Infinity, < 0 K temperatures | 1 / A | `src/core/schema/invalid-fixtures.test.ts` — covers the L1 adversarial rows of Gate A and E (ADV-029, ADV-033, ADV-034, ADV-037)<br>`src/core/schema/primitives.test.ts` — numbers (ADV-037)<br>(+5 more) |
| ADV-038 | crash during a write | 3 / C | **not yet** — planned Phase 3 (Gate C) |
| ADV-039 | two tabs | 3, 5 / C | **not yet** — planned Phase 3, 5 (Gate C) |
| ADV-040 | quota exceeded while saving | 3 / C | **not yet** — planned Phase 3 (Gate C) |
| ADV-041 | newer schema version on disk / in file | 3 / C | **not yet** — planned Phase 3 (Gate C) |
| ADV-042 | import ID conflicts | 3 / C | **not yet** — planned Phase 3 (Gate C) |
| ADV-043 | v6 import with representative hub SMILES, dangling IDs, duplicate names | 3 / C | **not yet** — planned Phase 3 (Gate C) |
| ADV-044 | 200 mixed commands, undo all, redo all | 1 / A | `src/core/commands/walk.test.ts` — ADV-044 random walk (seed %i)<br>`src/core/commands/walk.test.ts` — ADV-044 random walk (seed %i) › 200 mixed commands, undo all, redo all: exact states at every step |
| ADV-045 | redo after migration or import | 3 / C | `src/core/commands/undo.test.ts` — ADV-045: history is cleared by replaceState; the replaced state cannot be undone into |

Rows with a test today although their gate is later: ADV-005 (RXN-017 part), ADV-032 (base64 cap part), ADV-033 (L1 part), ADV-036 (schema keeps unparsable SMILES), ADV-045 (`replaceState` clears history). The graph, IO, persistence and render halves are still to come. Planned steps for the untested rows:

| Rows | Planned step | Rows | Planned step |
|---|---|---|---|
| ADV-001, 002, 003, 004, 006, 007, 015 | 2.3–2.4 (navigator and explorer projections, bundling) | ADV-030, 031, 035, 042 | 3.6 (importer, quarantine, conflicts) |
| ADV-011 | 2.2 (bounded traversal, truncation) | ADV-043 | 3.8 (legacy v5 mapper, completeness test) |
| ADV-012, 013 | 2.4 / 2.7 (degree caps, benchmarks); 5.4 for render | ADV-038, 041 | 3.2 (boot, integrity), 3.6 |
| ADV-014 | 2.3 (Unanchored list) | ADV-039 | 3.4 (writer lock); 5.x e2e |
| ADV-027 | 2.4 (arrow text for water) | ADV-040 | 3.1 (write queue, quota) |
| ADV-019 (search half) | 4.5 (search worker) | ADV-036 (CHEM-001) | 4.3 (chem worker, L4) |

### 3.2 INV-01…30

| ID | Invariant | Test file — test name |
|---|---|---|
| INV-01 | IDs are globally unique across records and nested objects | `src/core/commands/builders/builders.test.ts` — duplicateRecord › duplicating twice gives two records that coexist (all IDs globally unique, INV-01)<br>`src/core/dataset/document.test.ts` — documentToState › reports an ID repeated across kinds (INV-01 is global)<br>(+3 more) |
| INV-02 | An ID's prefix matches its kind | `src/core/schema/ids.test.ts` — typed ID schemas (INV-02)<br>`src/core/schema/schema-layering.test.ts` — typed references › RecordRef accepts exactly the kind matching the ID prefix (INV-02)<br>(+1 more) |
| INV-03 | IDs never change; generated IDs are ULIDs, deterministic IDs map the same source entity to | `tests/integration/invariants-gate-a.test.ts` — INV-03 generated IDs are deterministic ULIDs and never derived from names<br>`tests/integration/invariants-gate-a.test.ts` — INV-03 generated IDs are deterministic ULIDs and never derived from names › the same clock and RNG give the same IDs; IDs are strictly increasing a… |
| INV-04 | Every reference in committed state resolves | `src/core/validation/rules/references.test.ts` — valid fixtures › %s has no reference findings (INV-04, INV-05, INV-07) |
| INV-05 | References point only to allowed kinds in the same or a lower layer | `src/core/schema/schema-layering.test.ts` — layering of typed ID fields (INV-05, INV-29)<br>`src/core/schema/schema-layering.test.ts` — layering of typed ID fields (INV-05, INV-29) › %s references only same- or lower-layer kinds by typed ID<br>(+1 more) |
| INV-06 | A published reaction has ≥ 1 reactant and ≥ 1 outcome with ≥ 1 product | `tests/integration/invariants-gate-a.test.ts` — INV-06 a published reaction has a reactant and an outcome with a product<br>`tests/integration/invariants-gate-a.test.ts` — INV-06 a published reaction has a reactant and an outcome with a product › holds for every published reaction of the demo dataset |
| INV-07 | Local and nested references resolve within their owning or named container record | `src/core/validation/rules/references.test.ts` — valid fixtures › %s has no reference findings (INV-04, INV-05, INV-07) |
| INV-08 | Selectivity (major/minor/exclusive…) exists only on outcomes | `src/core/schema/schema-layering.test.ts` — selectivity lives only on outcomes (INV-08)<br>`src/core/schema/schema-layering.test.ts` — selectivity lives only on outcomes (INV-08) › no other field is named selectivity |
| INV-09 | Declared hierarchies are acyclic (classes, concepts, named reactions, topics, reagent comp | comment-only mention in src/core/validation/rules/structure.test.ts; no titled test |
| INV-10 | Schemas are strict; UI state never appears in records | `src/core/dataset/document.test.ts` — serializeDocument / deserializeDocument › refuses unknown keys in a document (strict, INV-10)<br>`src/core/schema/schema.smoke.test.ts` — rejects unknown keys, so UI state cannot leak into records (INV-10) |
| INV-11 | Derived data (graphs, indexes, derived relations, computed chemistry, findings, scope) is  | `src/core/schema/schema-layering.test.ts` — relationships (INV-11, INV-15)<br>`src/core/schema/schema-layering.test.ts` — relationships (INV-11, INV-15) › derived relations are not storable relationship types |
| INV-12 | Committed state has zero L1–L3 ERROR findings | `src/core/commands/store.test.ts` — dispatch › INV-12: an ERROR rejects the command and leaves state, indexes and findings exactly as before<br>`src/core/validation/validator.test.ts` — validateAll › committed fixtures have no L1–L3 ERROR (INV-12) and no L1 finding |
| INV-13 | No chemistry record requires a topic, chapter or exam to exist | `src/core/schema/schema-layering.test.ts` — foundation and chemistry schemas have no curriculum fields (INV-13, INV-30) |
| INV-14 | Removing all presentation records leaves chemistry valid and unchanged | `src/core/schema/schema-layering.test.ts` — presentation records (INV-14)<br>`src/core/schema/schema-layering.test.ts` — presentation records (INV-14) › carry provenance only: no tags, citations or review state<br>(+2 more) |
| INV-15 | Relationships obey their type spec (endpoint kinds, no self-links, unique symmetric pairs, | `src/core/schema/schema-layering.test.ts` — relationships (INV-11, INV-15)<br>`src/core/schema/schema-layering.test.ts` — relationships (INV-11, INV-15) › derived relations are not storable relationship types |
| INV-16 | Outcome → mechanism variant links resolve (blocking); mechanism atom-map references are ch | `tests/integration/invariants-gate-a.test.ts` — INV-16 outcome → mechanism variant links resolve<br>`tests/integration/invariants-gate-a.test.ts` — INV-16 outcome → mechanism variant links resolve › the demo links resolve; a variant that is not in the linked mechanism is a blocking REF-005 |
| INV-17 | Assets are optional: no chemistry exists only as an image; deleting an asset never invalid | `tests/integration/invariants-gate-a.test.ts` — INV-17 assets are optional and chemistry never depends on them<br>`tests/integration/invariants-gate-a.test.ts` — INV-17 assets are optional and chemistry never depends on them › no chemistry, knowledge or curriculum record can reference an asset |
| INV-18 | Derived state is recomputable: incremental results equal full rebuilds | `src/core/indexes/incremental.test.ts` — apply ≡ build (INV-18) — scenarios<br>`src/core/indexes/incremental.test.ts` — apply ≡ build (INV-18) — scenarios › create, rename, retarget, reparent, delete, recreate<br>(+7 more) |
| INV-19 | Serialisation is deterministic: export → import → export is byte-identical | `src/core/dataset/document.test.ts` — fixture %s › export → import → export is byte-identical through state (INV-19, P-02) |
| INV-20 | Persistence is atomic: one transaction per commit | not yet |
| INV-21 | Imports never mutate state before confirmation and apply atomically after a snapshot | not yet |
| INV-22 | All traversals and searches are bounded and terminate on cyclic data | not yet |
| INV-23 | No silent loss: unmapped legacy/unknown data is preserved in `provenance.legacy.unmapped`  | `src/core/dataset/document.test.ts` — fixture %s › hands embedded assets back beside the state instead of dropping them (INV-23)<br>`src/core/schema/primitives.test.ts` — JsonValue (legacy.unmapped, INV-23)<br>(+1 more) |
| INV-24 | Validation never modifies data; fixes are explicit commands | `src/core/schema/maximal-fixture.test.ts` — maximal valid fixture › parses without any change (schemas validate, never transform — INV-24)<br>`src/core/schema/primitives.test.ts` — never trims or normalises (INV-24)<br>(+3 more) |
| INV-25 | Code never branches on specific record IDs or names | `tests/integration/invariants-gate-a.test.ts` — INV-25 code never branches on specific record IDs or names<br>`tests/integration/invariants-gate-a.test.ts` — INV-25 code never branches on specific record IDs or names › the hardcode guard passes against the demo dataset and counts its names |
| INV-26 | Edges are never deduplicated by endpoints | not yet |
| INV-27 | Undo/redo restore exact states | `src/core/dataset/changeset.test.ts` — assembleChangeSet from patches › carries revision, label, cause and the patches through unchanged, and they round-trip (INV-27)<br>`tests/property/commands.test.ts` — P-08 undo^n and redo^n restore exact states (INV-27)<br>(+1 more) |
| INV-28 | Exactly one tab writes | not yet |
| INV-29 | Chemistry never references curriculum or presentation; exam scope is derived | `src/core/schema/schema-layering.test.ts` — layering of typed ID fields (INV-05, INV-29)<br>`src/core/schema/schema-layering.test.ts` — layering of typed ID fields (INV-05, INV-29) › %s references only same- or lower-layer kinds by typed ID |
| INV-30 | No exam name, exam year or syllabus field exists in the chemistry schema | `src/core/schema/schema-layering.test.ts` — foundation and chemistry schemas have no curriculum fields (INV-13, INV-30) |

Notes on the INV matrix:
- **INV-09** (acyclic hierarchies): tested by rule, with the INV ID only in a comment. `src/core/validation/rules/substances.test.ts` — *HIER-001 hierarchy cycles (ADV-016)*, *HIER-003 reagent composition cycles*; `src/core/validation/rules/structure.test.ts` — *REL-005: a cycle of prerequisite_of relationships flags every link; a chain is fine*, *RTE-001: a step listing itself, and a cycle through two steps*. The same HIER-001 describe block has *covers concept, named-reaction and topic hierarchies* and *terminates on a large cycle*.
- **INV-15** (relationship type specs): the named tests only cover the schema side. The rule side is `structure.test.ts` — *REL-001 … REL-004* (endpoint kinds, self-link, symmetric pairs, reverseKind), which do not carry the INV ID.
- **INV-22** (bounded traversals): the Phase 1 pieces are bounded (hierarchy walks: `src/core/indexes/hierarchy.test.ts` — *walks a 5,000-deep chain without recursion and in bounded time*; rich text: `richtext.test.ts` — *bounded work*; rule walks cap at 10,000 nodes). The graph traversals are Phase 2 (P-09 is the planned property test, step 2.6).
- **INV-20, 28**: persistence and tab locking, steps 3.1 and 3.4. **INV-21**: step 3.6. **INV-26** (edges never deduplicated by endpoints): step 2.4, with ADV-002.

## 4. Coverage per folder under `src/core`

Command: `vitest run --testTimeout=120000 --coverage` with `include=src/core/**/*.ts`, excluding `*.test.ts`, `**/contracts.ts`, `**/index.ts` (the same as `npm run test:coverage`, with a JSON reporter added so folders can be summed). Run for this packet, 61 files.

| Folder | Files | Lines | Branches | Functions |
|---|---|---|---|---|
| src/core/commands | 11 | 97.31% (616/633) | 91.02% (294/323) | 98.61% (71/72) |
| src/core/dataset | 4 | 100.00% (198/198) | 96.43% (108/112) | 100.00% (19/19) |
| src/core/indexes | 4 | 100.00% (239/239) | 99.25% (132/133) | 100.00% (29/29) |
| src/core/migrations | 1 | 100.00% (63/63) | 100.00% (29/29) | 100.00% (3/3) |
| src/core/references | 2 | 100.00% (191/191) | 97.48% (155/159) | 100.00% (23/23) |
| src/core/schema | 17 | 100.00% (1634/1634) | 100.00% (31/31) | 100.00% (17/17) |
| src/core/text | 2 | 100.00% (224/224) | 98.25% (112/114) | 100.00% (20/20) |
| src/core/validation | 20 | 99.47% (2046/2057) | 94.65% (955/1009) | 98.83% (169/171) |
| **total** | 61 | 99.46% (5211/5239) | 95.07% (1816/1910) | 99.15% (351/354) |

Files under 95 % lines or 85 % branches: `commands/batch.ts` (94.73 % lines, 84.61 % branches), `commands/replace.ts` (90.62 % lines), `validation/rules/helpers.ts` (86.2 % lines). Notes: `src/core/graph` holds only `contracts.ts` and is therefore excluded; `src/core/schema` is mostly declarative, so its 100 % line figure says little — its strength is the mutation suite in §1 row 1. Coverage runs need `--testTimeout=120000` (v8 instrumentation slows the random-walk tests past the 5 s default); plain `npm test` does not.

## 5. Phase 1 history (`git log --oneline`, first commit after Phase 0 through HEAD)

```
45d318e phase-1: spec corrections after Gate A self-review
e6183a5 phase-1.12: demo dataset builder, seed + demo-invalid, Gate A ADV rows and review
47e8f04 phase-1.11: test-support generator (6 shapes, 4 tiers), fast-check command model, property tests P-02, P-04…P-08
1736711 phase-1.10: core/migrations runner (no steps yet), result-valued run contract
8ad552a phase-1.9: core/commands store, dispatch pipeline, deleteImpact, undo/redo, replaceState, builders
a3dc359 phase-1.8: L3 rule catalogue, validateTouched/validateAll, scopeOf, linkers index
dcfde34 phase-1.7: core/validation L1 wrapper, L2 reference rules REF-001..008, finding IDs, finding store
1090084 phase-1.6: core/indexes part 1 (reverse references, folded names, class/concept/named-reaction/topic ancestry, incremental apply)
8016860 phase-1.5: core/dataset document/state conversion, deterministic serialisation, ULID ID factory, ChangeSet assembly
fc0c11f phase-1.4: core/references path walker and reference engine with registry coverage test
e27d830 phase-1.3: core/text normaliser (fold, tokens) and mini-markup parser
d4de60b phase-1.2a: tighten URL/base64 validation, record REF rule and guard note
8579c16 phase-1.2: maximal and invalid fixtures, schema-derived L1 test suite
6aed33a phase-1.1: approve esbuild script, enforce LF line endings
ceddcae phase-1.1: install and lock toolchain, add tsx, make npm run check green
```

## 6. `scripts/check-hardcode.mjs` (current) and the schema exemption

```js
#!/usr/bin/env node
// Guards the "no reaction-specific hacks" rule (docs/ARCHITECTURE.md §2.6, INV-25).
// Collects record IDs and names from data/seed and data/fixtures and fails if any appears
// as a string literal in production source. Justified exceptions: append `// hardcode-ok: <reason>`.
// src/core/schema is exempt: it defines the vocabulary (enum words such as 'elimination'), not dataset
// content, so a dataset name that shares a word with the schema is not a hardcoded record name.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const DATA_ROOTS = ['data/seed', 'data/fixtures'];
const MIN_NAME_LENGTH = 5;
const SCHEMA_VOCABULARY = join('src', 'core', 'schema') + sep;

function* walk(dir, exts) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path, exts);
    else if (exts.has(extname(name))) yield path;
  }
}

const ids = new Set();
const names = new Set();
function collect(value, key) {
  if (Array.isArray(value)) { value.forEach((v) => collect(v, key)); return; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, k);
    return;
  }
  if (typeof value !== 'string') return;
  // IDs are collected where they are defined (`id` keys). Matching every ID-shaped string would also
  // collect enum values such as "non_polar", which are schema vocabulary, not dataset content.
  if (key === 'id' && /^[a-z]{3}_[0-9a-z][0-9a-z-]{1,62}$/.test(value)) ids.add(value);
  if ((key === 'canonical' || key === 'name') && value.trim().length >= MIN_NAME_LENGTH) names.add(value.trim().toLowerCase());
}
for (const root of DATA_ROOTS) {
  for (const file of walk(root, new Set(['.json']))) {
    try { collect(JSON.parse(readFileSync(file, 'utf8'))); } catch { /* non-JSON or malformed fixtures are ignored here */ }
  }
}

const literal = /(['"`])((?:\\.|(?!\1).)*)\1/g;
let failures = 0;
for (const file of walk('src', new Set(['.ts', '.tsx']))) {
  if (/\.(test|bench)\.tsx?$/.test(file) || file.startsWith(join('src', 'test-support'))) continue;
  if (file.startsWith(SCHEMA_VOCABULARY)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Examples in documentation comments are allowed; code is not.
    if (line.includes('hardcode-ok:') || trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    for (const match of line.matchAll(literal)) {
      const text = match[2];
      const hit = ids.has(text) || names.has(text.trim().toLowerCase()) || [...ids].some((id) => text.includes(id));
      if (hit) {
        failures += 1;
        console.error(`✖ ${relative(process.cwd(), file)}:${index + 1} hardcodes dataset content: ${match[0]}`);
      }
    }
  });
}
if (failures > 0) process.exit(1);
console.log(`check:hardcode passed (${ids.size} ids, ${names.size} names checked)`);
```

**What it does.** It collects every `id` value (shape `abc_slug`) and every `canonical` / `name` value of 5+ characters from `data/seed/*.json` and `data/fixtures/**/*.json` (654 ids, 283 names today) and fails if any of them appears as a string literal in production `src/**/*.ts(x)` (tests, benches, `src/test-support/` and comment lines excluded; `// hardcode-ok: <reason>` is a line-level escape hatch).

**Why the schema is skipped.** In step 1.12 the demo's names coincided with schema vocabulary (a name such as "Nitrogen" against `'nitrogen'` in an enum, "Elimination"…). I ran the guard without the exemption to see: it fails on exactly 7 literals, all enum words — `conditions.ts:61` `'nitrogen'`, `'hydrogen'`; `knowledge.ts:38` `'rearrangement'`, `knowledge.ts:91` `'stereochemistry'`; `mechanism.ts:26` `'rearrangement'`, `:33` `'addition'`, `:34` `'elimination'`.

**What skipping all of `src/core/schema` could miss.**
1. A dataset **record ID** hard-coded in a schema file — for instance a refinement such as `if (id === 'rxn_…')` or a default that names a seeded record. IDs cannot collide with vocabulary (they are collected only from `id` keys and have a prefix), so exempting them buys nothing and costs the strongest signal for INV-25.
2. A **reaction-specific rule** encoded as a literal name in a schema `.refine()`; names are checked against dataset names, so a real name (as opposed to an enum word) is exactly what the exemption lets through.
3. Anything later added to `schema/` (new files, generated tables) is exempt automatically, with no review point.

Independent of the exemption, the guard is also blind to: literals built by concatenation or template interpolation, IDs held in JSON/asset files loaded at run time, and names shorter than 5 characters.

**Narrower alternative (tried, passes today: "654 ids, 283 names checked").** Keep scanning `src/core/schema`, but skip only the *name* comparison there; the ID comparison stays on everywhere. Two edits in the loop:

```js
// replace:  if (file.startsWith(SCHEMA_VOCABULARY)) continue;
const inSchema = file.startsWith(SCHEMA_VOCABULARY);
// replace the hit test with:
const hit = ids.has(text) || (!inSchema && names.has(text.trim().toLowerCase())) || [...ids].some((id) => text.includes(id));
```

A stricter variant, if the reviewer wants names guarded in the schema too: keep name matching there but allow a literal that is an argument of `z.enum([...])` / `z.literal(...)`. That needs a small parser and is not tried. Not applied to the repository.

## 7. Demo dataset summary

Files: `data/seed/demo.orn.json` and `data/fixtures/demo-invalid.orn.json`, both generated by `npm run build:demo` from `src/test-support/demo/*` (deterministic, fixed timestamp; `demo.test.ts` fails if a committed file differs from the builders).

**Contents.** 27 reactions, 66 species, 20 classes (15 anchored hubs, none with a structure), 16 reagents (Lindlar components, Baeyer's profile, KOH aq./alc. profiles), 36 concepts, 22 transformations, 13 named reactions, 3 mechanisms (SN2; E2 with 2 variants; aldol with base/acid variants and atom-mapped steps), 6 caveats, 13 relationships, 2 curated routes, a 27-node topic tree, JEE Main/Advanced provisional exam versions, 31 topic mappings, one `exam_relevance` override, a Grignard scheme, a "Carbonyl chemistry" preset; water has `showAsNode: never`.

**The 27 reactions by TEST_STRATEGY §3 group** (group numbers as in that document):

| Group | Topic | Reactions in demo |
|---|---|---|
| 1 | Ethanol → ethanal, PCC; generic/specific | `rxn_ethanol-to-ethanal-pcc`, `rxn_alcohol1-to-aldehyde-pcc` (generic) |
| 2 | Ethanal → acid; ethanol → acid | `rxn_ethanal-to-ethanoic-acid`, `rxn_ethanol-to-ethanoic-acid` |
| 3 | Ethanol → ethanal, dichromate (alternative) | `rxn_ethanol-to-ethanal-dichromate` |
| 4 | Fischer esterification ⇌ hydrolysis | `rxn_fischer-esterification`, `rxn_ethyl-ethanoate-hydrolysis` |
| 5 | Ethanol + conc. H₂SO₄, 413 K / 443 K variants | `rxn_ethanol-conc-h2so4` |
| 6 | Ethene hydration vs dehydration | `rxn_ethene-hydration` |
| 7 | Propene + HBr; peroxide effect | `rxn_propene-hbr`, `rxn_propene-hbr-peroxide` |
| 8 | (R)-2-bromobutane, SN2 vs E2 | `rxn_r-2-bromobutane-aq-koh`, `rxn_r-2-bromobutane-alc-koh` |
| 9 | Cannizzaro of benzaldehyde | `rxn_benzaldehyde-cannizzaro` |
| 10 | Aldol of ethanal | `rxn_ethanal-aldol` |
| 11 | Haloform (iodoform) test | `rxn_haloform-ethanol`, `rxn_haloform-propanone` |
| 12 | Diazotisation, Sandmeyer, diazonium → phenol | `rxn_aniline-diazotisation`, `rxn_benzenediazonium-sandmeyer`, `rxn_benzenediazonium-to-phenol` |
| 13 | Grignard, stages | `rxn_methylmgbr-propanone` |
| 14 | Lindlar | `rxn_but-2-yne-lindlar` |
| 15 | Friedel–Crafts acylation, AlCl₃ trap | `rxn_benzene-friedel-crafts-acylation` |
| 16 | Baeyer's reagent | `rxn_ethene-baeyers` |
| 17 | Beckmann (unanchored, outside JEE Main) | `rxn_cyclohexanone-oxime-beckmann` |
| edge | Draft reaction with no product | `rxn_benzene-nitration-draft` |
| route | Ethanol → propan-2-ol (via ethanal + CH₃MgBr) | `rxn_methylmgbr-ethanal` |

That is 25 (groups 1–17) + 1 (edge) + 1 (route step) = 27.

**Validation of the demo.** 0 ERROR; **1 WARNING**: RXN-002 on the deliberate draft `rxn_benzene-nitration-draft` (no product). INFO: RXN-016 ×16 (no mechanism class on most reactions) and RVW-002 ×1. REVIEW_REQUIRED: RVW-001 ×38 (curriculum records, mechanisms, the Beckmann reaction, edge species). Nothing is `verified`.

**`demo-invalid` — 11 planted problems** (demo plus deliberate L3 faults; each is schema-valid and referentially intact; `INVALID_EXPECTATIONS` in `src/test-support/demo/invalid.ts` names rule and record, and the test checks each fires on that record):

| # | Rule | Severity | Record | Problem |
|---|---|---|---|---|
| 1 | RXN-008 | error | `rxn_propene-hbr` | an exclusive outcome overlaps the minor one (ADV-009) |
| 2 | RXN-004 | error | `rxn_ethanol-to-ethanal-dichromate` | a spectator contributes atoms (ADV-026) |
| 3 | RXN-007 | error | `rxn_ethanol-to-ethanal-pcc` | a participant is in no stage |
| 4 | RXN-014 | error | `rxn_ethanol-conc-h2so4` | a temperature below absolute zero (ADV-037) |
| 5 | RXN-005 | warning | `rxn_fischer-esterification` | a catalyst is marked consumed (ADV-025) |
| 6 | HIER-001 | error | `cls_alcohols` | cycle in the class hierarchy (ADV-016) |
| 7 | SPC-001 | warning | `spc_ethanol-duplicate` | two species share a name (ADV-022) |
| 8 | REL-004 | error | `rel_fischer-hydrolysis` | `reverse_of` without a `reverseKind` |
| 9 | RTE-001 | error | `rte_aniline-to-phenol` | cycle in the route step graph |
| 10 | CUR-001 | error | `exv_jee-main-2026` | `effectiveFrom` after `effectiveTo` |
| 11 | MEC-002 | error | `mec_aldol-ethanal` | a step species has no ref, label or structure |

That is 9 errors and 2 warnings.

## 8. Deviations from the docs and "review required" items in Phase 1

### 8.1 Spec corrections just made (commit `45d318e`)

- `docs/TEST_STRATEGY.md` §3 item 8 and `docs/DOMAIN_MODEL.md` (the (R)-2-bromobutane row): *aq. NaOH* → *aq. KOH*. Reaction 8 uses one reagent (KOH) with aq. and alc. phases, which is what ADV-024 needs and what DOMAIN_MODEL.md §3 already said in prose.
- `docs/TEST_STRATEGY.md` §3 item 11: haloform test "ethanol/ethanone" → "ethanol/ethanal". **Where this differs from the request:** the request placed "ethanone" in the propan-2-ol route. In the text, the word appears only in item 11 (the haloform test); the propan-2-ol route (line 63, and demo reaction `rxn_methylmgbr-ethanal`) already says ethanal. I corrected the one place it occurs.
- **Open inconsistency created by that correction:** the demo builds `rxn_haloform-propanone` (iodoform test on propanone, an equally valid methyl ketone) because step 1.12 read "ethanone" as propanone. The spec now says ethanal. `docs/PROGRESS.md` (step 1.12 decisions) and `docs/PROJECT_STATE.json` (`openItems`) still record the propanone reading and "demo deviations to confirm". Neither was changed; the demo needs a decision (replace with an ethanal reaction, or keep propanone as an addition), and the two records need updating with it.

### 8.2 Decisions and deviations, by step

| Step | Item | Nature |
|---|---|---|
| 1.1 | TypeScript 6.0.3 kept: typescript-eslint 8.70.1 supports `<6.1.0`, so ADR-020's `~5.9` fallback was not needed. | ADR check, no deviation |
| 1.1 | `allowScripts` approval for esbuild, pinned to 0.28.2; `.gitattributes` `eol=lf`; two line-scoped `no-control-regex` disables in `schema/primitives.ts`; `tsx` added. | tooling; Amendments |
| 1.2 | `check:hardcode` collects IDs only from `id` keys (before: every ID-shaped string, which flagged enum values such as `non_polar`). | guard behaviour change |
| 1.2 | Fixture completeness derived from the schema rather than a hand-kept list; generator script was throwaway. | method |
| 1.2a | **Amendment**: `SafeUrlSchema` rejects control/bidi characters; new `Base64Schema` (alphabet, padding, length % 4, non-empty, cap 28,000,000). Tightening only: no schema-version bump, no migration. | schema amendment |
| 1.2a | REF-002 vs REF-003: a reference to a higher layer reports only REF-003. | interpretation |
| 1.3 | Dash rule refines SEARCH.md §2 item 4 (which was self-contradictory for `Br⁻ → br-`): dash after a letter/digit and not before one is a charge sign and is kept; other dashes become a space. `10⁻³` folds to `10 3`. Docs updated. | doc correction |
| 1.3 | Only U+0300–U+036F stripped as diacritics; markup bounds: nesting ≤ 4, closer work budget 1,000 + 50 × length. | decision |
| 1.4 | `detach` removes exactly the declared location and does not invent a replacement (MEC-002 reports it). `provenance.legacy.*` excluded from reference coverage. | decision |
| 1.4 | `remap` does not rewrite `[[id]]` links in rich text; import-as-copy must decide (step 3.x). | **open item** |
| 1.5 | Embedded asset bytes are handed back beside the state, not stored in it; `serializeDocument` refuses invalid state; free-form `legacy.unmapped` keeps its own key order. | decision |
| 1.5 | Tolerant envelope, quarantine and `__proto__` renaming (PERSISTENCE.md §7) left to the importer. | deferred to 3.6 |
| 1.6 | **Amendment**: `contracts.ts` split into `CoreIndexes` (+ `ancestorsOf`/`descendantsOf`, `HierarchyKind`) and `ReadonlyIndexes` extending it. `apply` mutates in place and invalidates the previous handle (stale-handle throws). | additive contract change |
| 1.7 | **Amendment**: `CoreIndexes.definersOf`; `RuleContext`/`Validator` take `CoreIndexes`; rich-text registry. Findings are level-tagged. | additive contract change |
| 1.8 | **Amendment**: `ValidationRule.watches`/`peers`; `validateTouched(…, previous?)`; `scopeOf`; `linkersOf`; L2 nested-container rule. | contract change |
| 1.8 | RXN-011 owns "profile ref is not a reagent"; REF-005 reports only unresolved profiles of an existing reagent. **Supersedes the step 1.7 decision.** | interpretation, supersedes |
| 1.8 | Level gating: an L2 ERROR suppresses that record's L3 rules; RXN-008/009 compare variant sets (empty = all); RXN-010 needs the same isomer group; duplicate rules with a "winner" keep the lowest ID clean (CUR-006, PRS-001/002), others flag every member. | interpretations of ambiguous rows (also in VALIDATION_RULES.md §5) |
| 1.8 | Cycle/chain rules walk ≤ 10,000 nodes, then fall back to full revalidation or an INFO finding, never silently. MEC-003 recognises atom maps only in SMILES/CXSMILES; a molfile is treated as possibly mapped. | bound / interpretation |
| 1.8 | AST-002/003 (blob missing, hash mismatch) and CHEM-001…009 are not implemented: they need storage or the chem worker (Phases 3/4). Listed in `rules/external.ts`. SPC-007 was missing from the step summary, found by the catalogue-coverage test and implemented. | scope |
| 1.9 | `restrict` refuses whenever impact is not empty; the store does not stamp `updatedAt`; `IMMUTABLE_FIELD` on kind/prefix mismatch. Records passed to commands are frozen by Immer. | decision |
| 1.10 | **Amendment (contract change)**: `MigrationRunner.run` returns `MigrationResult` (`ok` / error with code and `atVersion`); runner gains `target`. Per-step migration tests start at the first schema bump. | contract change |
| 1.11 | Generator does not build mechanisms, routes, exams, assets or presentation records; design/stress tiers tested for two shapes each. | scope |
| 1.12 | Reaction 8 uses KOH for both aq. and alc. (spec said aq. NaOH); KOH has two profiles. **Now corrected in the spec.** | accepted deviation |
| 1.12 | Spec "ethanone" read as propanone. **Spec now says ethanal; demo still propanone** (§8.1). | accepted → needs follow-up |
| 1.12 | Route ethanol → propan-2-ol goes via ethanal + CH₃MgBr only; the propene-hydration alternative is not modelled. | spec says "or via propene hydration, curated" |
| 1.12 | Ethanol + conc. H₂SO₄ has no participant coefficient (2:1 ether stoichiometry differs per variant); notes say so. The `reverse_of` synthetic pair is ethene hydration ↔ the whole ethanol + conc. H₂SO₄ record (relationships attach to reactions, not variants). | modelling limit |
| 1.12 | `check:hardcode` skips `src/core/schema/**` (see §6). | guard weakened, flagged |

### 8.3 Review-required and unverified items

- Nothing in the demo is `verified`. Curriculum records, the three mechanisms, the Beckmann reaction and the edge species are `review_required` with reasons (RVW-001 ×38).
- Human verification needed for: SMILES, stereodescriptors (e.g. the SN2 inversion pair), conditions, mechanism atom maps, exam coverage and the baseline topic tree (all `REVIEW REQUIRED` until checked against official syllabi).
- RXN-016 INFO on 16 demo reactions: mechanism-class concepts to be added when content is reviewed.
- `PROJECT_STATE.json` open item: cross-check the ADV-001…045 matrix wording against the §46 list of the original requirements prompt (not available to me).
- `validateTouched` reruns all rules per subject in `scopeOf`; hub records may exceed the 16 ms commit budget — Phase 2 benchmarks decide.
- A rejected commit rebuilds the indexes (O(records)); `scopeOf` is computed twice per commit — measure in step 2.7.
- The random-walk equivalence tests take ~20 s of the suite.

## 9. Vitest advisory (investigation only; nothing changed in the repository)

**Advisory.** GHSA-82fw-gwwq-j7x9 / CVE-2026-84373, "Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock", moderate (CVSS 5.9).

**Affected versions** (from the advisory): `vitest` and `@vitest/mocker` **>= 2.1.0, < 4.1.11**, and **>= 5.0.0-beta.1, < 5.0.0-rc.2**. First patched: **4.1.11**, and **5.0.0-rc.2** (so 5.0.0 final and later are patched). Ours: vitest 3.2.7, `@vitest/mocker` 3.2.7 (affected); `@vitest/coverage-v8` 3.2.7 is listed only because it depends on vitest.

**What it is.** The redirect-mock handler in `@vitest/mocker`'s `interceptorPlugin` resolves a client-supplied path without checking Vite's `server.fs` allowlist, so a client that can reach the dev server's WebSocket can read arbitrary local files. It is unauthenticated only through the public `mockerPlugin`/`interceptorPlugin` exports; Vitest's own browser mode registers mocks over a token-authenticated RPC. Preconditions: a running dev/test server reachable by the attacker (Vite binds to localhost by default; the default CORS origin list and `allowedHosts` block browser drive-bys and DNS rebinding). **Exposure here:** this project runs Vitest in Node (`environment: 'node'`, no browser mode, no `mockerPlugin` use, `vi.mock`/`vi.fn` only in two store tests), so the vulnerable code path is not exercised; the finding is a dev-dependency audit item, not a shipped-code issue.

**`npm audit` (current repository, unchanged):**

```
# npm audit report

@vitest/mocker  2.1.0 - 4.1.10
Severity: moderate
Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock - https://github.com/advisories/GHSA-82fw-gwwq-j7x9
fix available via `npm audit fix --force`
Will install vitest@5.0.2, which is a breaking change
node_modules/@vitest/mocker
  vitest  2.1.0-beta.1 - 4.1.10
  Depends on vulnerable versions of @vitest/mocker
  node_modules/vitest
    @vitest/coverage-v8  2.1.0-beta.1 - 4.1.10
    Depends on vulnerable versions of vitest
    node_modules/@vitest/coverage-v8

3 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force
```

**Do patched versions exist that fit our setup?** Yes, two lines. Both were installed in **throwaway clones** of the repository (`npm ci`, then `npm install -D vitest@X @vitest/coverage-v8@X`), which are outside the project and were not committed:

| | Vitest 4.1.11 | Vitest 5.0.2 |
|---|---|---|
| `@vitest/coverage-v8` counterpart | 4.1.11 (peer `vitest: 4.1.11`) | 5.0.2 |
| Node engine | `^20 \|\| ^22 \|\| >=24` (we run 24.21.0; `package.json` says `>=22`) | `^22.12 \|\| ^24 \|\| >=26` (ok for 24.21.0; **excludes Node 22.0–22.11 and 23**, our `engines` allows those) |
| Vite peer | `^6 \|\| ^7 \|\| ^8` (we have 7.3.6) | `^6.4 \|\| ^7 \|\| ^8` |
| `npm audit` after install | 0 vulnerabilities | 0 vulnerabilities |
| `npm test` | 44 files, 849 tests pass | 44 files, 849 tests pass |
| `npm run check` (run alone) | exit 0 | exit 0 |
| `npm run test:coverage` | runs; numbers **not comparable** (below) | same as 4.1.11 |

The first `npm run check` in each clone failed with 6 tests timing out at 5,000 ms. That run overlapped two other Vitest processes on the same machine; re-run alone, both clones were green. This matches the known slowness of the random-walk tests under load and is not attributed to the upgrade, but it shows the 5 s default timeout has little headroom.

**What upgrading would change or break (observed, not just documented):**
1. **Coverage numbers shift.** With v8 coverage on 4.1.11 and 5.0.2 the same command reports 1,911 lines (99.21 %), 1,463 branches (92.68 %) and 547 functions (98.9 %), against 5,239 lines (99.46 %), 1,910 branches (95.07 %) and 354 functions (99.15 %) on 3.2.7. The denominators change (probably the newer v8 provider counting lines, branches and functions differently; I did not confirm the cause), so Gate A's coverage row and every later comparison must be re-baselined on the new version. The ≥ 90 % threshold is still met. I have not investigated which option restores the old counting.
2. `package.json` ranges change (`vitest` `^3.2.0` → `^4.1.11` or `^5.0.2`; same for `@vitest/coverage-v8`), plus `package-lock.json`. No source or config edit was needed for either; `vitest.config.ts` (`include`, `exclude`, `environment: 'node'`, `benchmark.include`, `restoreMocks: true`) works unchanged, and lint, typecheck under TypeScript 6.0.3, `lint:deps` and `check:hardcode` pass.
3. **Vitest 5 raises the Node floor** above what `engines` states; `engines.node` would need `>=22.12` if 5.x is chosen. 4.1.11 needs no such change.
4. Not exercised here because the repository does not use them yet: browser mode, workspaces/projects, `vi.mock`/`vi.fn` beyond the two store tests (which passed), and the jsdom environment (Phase 5). Re-check those when they are introduced.
5. ADR-020 says major upgrades happen only at phase boundaries, as their own commit, with `npm run check` green. This is such a boundary.

**Recommendation.** Upgrade to **4.1.11** (smallest jump that closes the advisory, no engine change), as its own commit, then re-baseline the coverage figures in PROGRESS.md. Choose 5.0.2 only if the project wants the newer major now; it then also needs the `engines` bump. Not done: instructed to investigate only.

## 10. Phase 1.2a: URL control/bidi check and base64 check — confirmed in place

Amendment recorded in `docs/PROGRESS.md` (Amendments, "2026-09-26, step 1.2a"); commit `d4de60b`. Both checks are in `src/core/schema/primitives.ts` (`SafeUrlSchema`, `Base64Schema`); `npm run check` runs these tests and passes.

**URL control/bidi character check** — `src/core/schema/primitives.test.ts`:
- `SafeUrl (SECURITY.md §2) › rejects control and bidi-override characters, which the URL parser would silently normalise` (also asserts `https://example.org/a%0Ab`, percent-encoded, is accepted)
- `SafeUrl (SECURITY.md §2) › enforces the length cap`
- `SafeUrl (SECURITY.md §2) › accepts %s` / `› rejects %s` (tables of safe and unsafe URLs, including credentials and `javascript:`)
- `src/core/schema/schema.smoke.test.ts` — `SafeUrlSchema.safeParse('javascript:alert(1)')` is rejected
- Fixtures `data/fixtures/schema/v1/invalid/l1-url-with-bidi-character.json` and `l1-url-with-control-character.json` (plus `l1-unsafe-url.json`, `l1-url-with-credentials.json`), each checked to fail only at its declared path by `invalid-fixtures.test.ts`.
- General text: `primitives.test.ts` — `$name rejects every C0 control except TAB/LF/CR, DEL and bidi controls (ADV-034)`; fixtures `l1-bidi-override.json`, `l1-control-character.json`.

**Base64 check** — `src/core/schema/primitives.test.ts`:
- `Base64 (embedded assets, ADV-032) › accepts …` (valid strings, incl. `QQ==`, `QUI=`, `a+b/`, a real PNG payload)
- `Base64 (embedded assets, ADV-032) › rejects %s` — empty, too short, length not a multiple of 4, outside the alphabet, URL-safe alphabet, whitespace, line break, padding before the end, three padding characters, non-ASCII digit
- `Base64 (embedded assets, ADV-032) › enforces the cap and stays linear on a maximum-size payload` (cap 28,000,000 accepted; cap + 4 rejected; a bad character at the tail rejected)
- Fixtures `l1-base64-bad-length.json`, `l1-base64-invalid-alphabet.json`, `l1-base64-misplaced-padding.json`.
- The mutation generator skips cap padding for base64 (padding would break the alphabet); the cap is tested directly by the last test above.

---
Preparation notes: `docs/reviews/gate-a-packet.md` (moved from `review/` at Gate A close). The throwaway clones used for §9 live in the session scratchpad, not in the project.
