# Implementation Plan

Package sections **#28 Phase Plan** and **#29 Definition of Done**. Each phase is split into **steps sized for one Sonnet session**. A step ends with `npm run check` green, a commit `phase-N.S: <summary>`, and updated `docs/PROGRESS.md` + `docs/PROJECT_STATE.json`.

## 1. Global Definition of Done (every step)

1. `npm run check` passes (typecheck, lint, dependency rules, file size ≤ 400 lines, hardcode check, tests).
2. New behaviour has tests at the right level (TEST_STRATEGY.md §1); every invariant touched has a test.
3. No `TODO` without an entry in PROGRESS.md "Open items".
4. Public contracts changed only through the amendment procedure (CLAUDE.md §7).
5. Docs updated where behaviour differs from them; no silent divergence.
6. No data is stored that the schema does not define; no derived data is stored.
7. A step that adds or changes a hot path (commit, index, projection, validation, layout, search) adds or updates its benchmark in the same step.

## 2. Phases

### Phase 0 — Architecture and scaffold ✅
Docs, canonical schemas, reference registry, contracts, legacy fixtures, guard scripts, toolchain config.

### Phase 1 — Domain core → Gate A ✅ (Gate A passed 2026-09-27)
| Step | Work | Main files |
|---|---|---|
| 1.1 | `npm install`; lock versions (ADR-020); make `npm run check` pass on the scaffold; add `tsx` dev dependency; record versions in PROGRESS.md | package.json, lockfile |
| 1.2 | Maximal fixture + invalid fixtures; full schema test suite (every kind, every cap, ID patterns) | `data/fixtures/schema/v1/*`, `src/core/schema/*.test.ts` |
| 1.3 | `core/text`: normaliser (fold, tokens) and mini-markup parser | `src/core/text/` |
| 1.4 | `core/references`: path walker over REFERENCE_SPECS; extract, nestedIds, remap, detach; registry coverage test (every ID-shaped value in the maximal fixture is covered) | `src/core/references/` |
| 1.5 | `core/dataset`: document ↔ state, deterministic serialisation, ID factory (ULID with injected RNG/clock), ChangeSet assembly | `src/core/dataset/` |
| 1.6 | `core/indexes` (part 1): reverse references, folded names, class/concept/topic ancestry; incremental apply | `src/core/indexes/` |
| 1.7 | `core/validation`: L1 wrapper, L2 rules, finding IDs, finding store | `src/core/validation/` |
| 1.8 | L3 rule catalogue (VALIDATION_RULES.md §3), incremental `validateTouched`, `validateAll` | `src/core/validation/rules/` |
| 1.9 | `core/commands`: store, dispatch pipeline, deleteImpact, undo/redo, replaceState, builders (duplicate, merge, reorder) | `src/core/commands/` |
| 1.10 | `core/migrations` runner (no steps yet) | `src/core/migrations/` |
| 1.11 | `test-support`: generator (all shapes/tiers), fast-check arbitraries; property tests P-02, P-04…P-08 | `src/test-support/`, `tests/property/` |
| 1.12 | Demo dataset builder + `data/seed/demo.orn.json` (TEST_STRATEGY.md §3) + `demo-invalid`; Gate A ADV rows; Gate A review | `data/seed/`, `tests/adversarial/` |

Step 1.12 note — hardcode guard: demo data names match schema enum words (e.g. a concept named "Elimination" collides with the `elimination` step kind in `src/core/schema`). Resolved (Gate A review): `scripts/check-hardcode.mjs` keeps scanning `src/core/schema` but skips only the name comparison there; the record-ID comparison stays on everywhere. Tested in `tests/integration/check-hardcode.test.ts`. Accepted limitations: literals built by concatenation or template interpolation, names shorter than 5 characters, and IDs in JSON loaded at run time are not detected.

### Phase 2 — Graph engine and projections → Gate B ✅ (Gate B passed 2026-09-28; tag `phase-2`)
Dependencies: none new (src/core/graph stays pure; benchmarks use Vitest bench).
| Step | Work | Must cover |
|---|---|---|
| 2.1 | Remaining indexes: participations, productions, by reagent/family/named/transformation/concept/mechanism, topics, relationships, caveats, anchors, display; incremental apply | P-07 extended to every new index (INV-18); ADV-051 participations part, ADV-052 productions part, ADV-057 topics part |
| 2.2 | Stable hashing; bounded traversal primitives (TraversalLimits: depth, nodes, edges); truncation reporting | INV-22 graph part; ADV-011; ADV-050 traversal part |
| 2.3 | Projection registry; P-10 harness that runs over every registered projection; navigator projection (hub roll-up, Unclassified, Unanchored) | P-10; INV-26 check in the harness (edges = participations, never deduplicated by endpoints); ADV-001, 014, 015, 046, 047, 048, 053 |
| 2.4 | Reaction explorer projection: participants, stages, condition-variant filter, intermediates, spectators/showAsNode, arrow text | ADV-008 graph part, ADV-024 graph part, ADV-027, 051 graph part, 054 |
| 2.5 | Precursor projection (layout reversed, arrows forward); bundling; degree caps and overflow; ⇌ rule: draw ⇌ only between edges of a reverse_of pair whose endpoints mirror each other (reviewer decision; no schema change) | ADV-002 (with INV-26), 003, 004, 006, 007 (widened), 012 projection part, 052, 056 |
| 2.6 | Reagent, named-reaction, mechanism, syllabus projections; derived exam scope (scopeOf); registry completeness test (every ViewKey except search) | ADV-055, 057 graph part; demo mechanisms shown as review-required |
| 2.7 | Route search (GRAPH_SEMANTICS.md §9) | P-09; ADV-049, 050 route part; demo routes found (ethanol → propan-2-ol, aniline → phenol); ethanol → ethanoic acid returns both paths |
| 2.8 | Benchmarks at all tiers and shapes; full generator tier × shape validity sweep (closes the 1.11 sampling); measure Phase 1 performance open items (validateTouched on hubs, index rebuild after a rejected commit, scopeOf computed twice); baseline.json; Gate B packet in the Gate A packet format with the title-level ADV/INV/P scan; Gate B self-review | ADV-012 performance part, ADV-013; budgets at the design tier |
| 2.9 | Benchmark percentiles and `bench:compare`; incremental navigator roll-up index | ADV-013 re-measured; navigator build budget at the design tier |
| 2.10 | Incremental rollback on rejected commits; field-aware `validateTouched` scope investigated (found unsafe without a rule-level declaration; the 50 ms "≥ 500 referrers" backstop row added; done in 2.12); route-search clock test; re-measure; Gate B packet update | Remaining Gate B open items closed or explicitly deferred by the reviewer |
| 2.11 | Deterministic navigator anchors and stress tier; stable benchmark method (isolation, warmup, 100-sample floor, 3 fresh-process runs, median p99); navigator build fix; re-measure | Navigator `dense` at the design tier under 16 ms on median p99 |
| 2.12 | Field-aware `validateTouched` scope (`ValidationRule.referencedReads`, ADR-031); re-measure; Gate B packet update | Hub-referrer commits judged against the 16 ms Commit row; remaining misses listed with causes |
| 2.13 | Per-rule referrer re-validation; class-hub benchmarks; bench fixes; Gate B packet | Hub and class-hub commits meet their rows (16 ms ordinary edits, 50 ms backstop for edits every referrer reads), or the exception is documented for Phase 9 |

### Phase 3 — Persistence, import/export, legacy → Gate C
Dependencies: `dexie`, `fflate`, dev `fake-indexeddb`.
| Step | Work |
|---|---|
| 3.1 | Dexie schema, adapter, serial write queue, SaveStatus |
| 3.2 | Boot sequence, integrity check, quarantine, crash detection |
| 3.3 | Snapshots (create, list, restore, retention) |
| 3.4 | Writer lock and BroadcastChannel follower mode |
| 3.5 | Export: `.orn.json`, `.ornpkg`, scopes, dependency closure; P-01, P-02 on IndexedDB |
| 3.6 | Import: safe parser, envelope, quarantine, conflict analysis, preview, apply |
| 3.7 | Legacy v4 → v5 port with oracle test |
| 3.8 | Legacy v5 → ORN mapper, label parser, decisions, report, completeness test |
| 3.9 | Gate C ADV rows; Gate C review |

### Phase 4 — Workers and chemistry services
Dependencies: `@rdkit/rdkit`, `elkjs`, `minisearch`.
| Step | Work |
|---|---|
| 4.1 | RPC library (cancel, progress, timeout, restart) with tests |
| 4.2 | Compute worker: replica sync, validateAll, importPreview, buildExport, findRoutes |
| 4.3 | Chem worker: RDKit adapter, SVG sanitiser, facts cache, L4 checks CHEM-001…009 |
| 4.4 | Layout worker: ELK adapter per algorithm, fallback layout, cache keys |
| 4.5 | Search worker: document builder, MiniSearch config, incremental updates, palette grammar parser |

**Phase 4 note (step 2.13, from the Gate B performance work).** Any worker or service that re-validates after a commit must call `Validator.validateTouchedByRule` (or `validateTouched`/`scopeOf`) **with the previous state** — the compute worker's replica sync has both states (docs/PERFORMANCE_ARCHITECTURE.md §3), so it must pass them. Without `previous` nothing can be diffed (ADR-031/032), every referrer of a touched record is re-validated whole, and a hub record then costs about 39–47 ms per call on a 1,000-referrer hub (median p99 at the design tier, step 2.13) instead of 1–4 ms. `validateAll` is unaffected.

### Phase 5 — Shell, rendering, navigator, inspector → Gate E
Dependencies: `zustand`, Radix primitives, `cmdk`, `@tanstack/react-virtual`, `d3-zoom`, Fontsource Plex; dev: Testing Library, `jsdom`, `@playwright/test`, `@axe-core/playwright`.
| Step | Work |
|---|---|
| 5.1 | Composition root: boot flow, `z.config({ jitless: true })`, services wiring, status bar, error boundaries |
| 5.2 | Design tokens, fonts, primitives (buttons, menus, dialogs, tooltips, list) |
| 5.3 | Scene builder (pure) + formatted text |
| 5.4 | SVG renderer, viewport (d3-zoom), LOD, culling, depiction images |
| 5.5 | Navigator view end to end (projection → layout worker → scene → render) |
| 5.6 | Inspector L1–L5 (read-only), links, focus history |
| 5.7 | Interaction state machine, keyboard map, list view, context menu |
| 5.8 | Command palette and search UI; exam-scope selector |
| 5.9 | Playwright e2e, axe checks, FPS trace; Gate E review |

### Phase 6 — Authoring workbench → Gate D
| Step | Work |
|---|---|
| 6.1 | Editor sessions (draft store, persistence, local undo, commit, conflicts) |
| 6.2 | Species, class, reagent editors; structure panel (live parse/depiction); duplicate check |
| 6.3 | Reaction editor: identity, participants, stages |
| 6.4 | Condition variants and outcomes editors |
| 6.5 | Mechanism editor (variants, steps, species, bond changes, electron movements as structured rows) |
| 6.6 | Caveats, relationships, curriculum mappings, citations editors |
| 6.7 | Quick-entry parser and pickers with "create new" |
| 6.8 | Delete/merge flows with impact dialogs; review queue |
| 6.9 | Author every demo reaction from scratch in e2e; Gate D review |

### Phase 7 — Exploration views
Reaction explorer, precursor explorer with route-search panel, reagent explorer, named reactions, mechanisms view, syllabus view with version diff (one step each).

### Phase 8 — Export and visual polish
SVG/PNG export from Scene, print stylesheet, empty states, visual QA pass against UI_ARCHITECTURE.md §3, accessibility fixes.

### Phase 9 — Performance hardening, PWA, diagnostics
Stress-tier profiling and fixes, service worker (app-shell cache), Diagnostics pages (findings, quarantine, snapshots, storage, performance).

### Phase 10 — Full adversarial suite and v6 audit → Gate F
All ADV rows green, property suite at higher run counts, v6 end-to-end audit (MIGRATION.md §4.10), security checklist (SECURITY.md), final performance traces, documentation sweep.

## 3. Per-phase Definition of Done (#29)

| Phase | Done when |
|---|---|
| 1 | Gate A criteria (TEST_STRATEGY.md §6); core has no imports outside core/zod/immer; ≥ 90% line coverage in `src/core` |
| 2 | Gate B; every ViewKey except `search` has a registered projection; budgets met at the design tier under the general performance rule (TEST_STRATEGY.md §6): items over their target are documented Phase 9 exceptions |
| 3 | Gate C; restoring any snapshot works; v6 fixtures import with zero `notImported` |
| 4 | Workers restart after an induced crash; all worker APIs have in-process tests; L4 checks produce findings for the demo's invalid species |
| 5 | Gate E; the navigator with the demo dataset is usable by keyboard only and by touch |
| 6 | Gate D; no authoring path writes invalid data to the canonical store |
| 7 | Each view has e2e coverage and respects scope filters and truncation notices |
| 8 | Exported SVG equals the on-screen scene (snapshot test); no a11y violations at "serious" or above |
| 9 | Stress tier usable; PWA works offline after first load; Diagnostics complete |
| 10 | Gate F |

## 4. Read map (what to read per phase)

Read `CLAUDE.md` and `docs/PROJECT_STATE.json` every session. Then only:

| Phase | Read |
|---|---|
| 1 | DOMAIN_MODEL.md (all), VALIDATION_RULES.md (all), ARCHITECTURE.md §2, §23, §26, TEST_STRATEGY.md §1–§4, §5–§6 (this phase's gate rows), `src/core/**` |
| 2 | GRAPH_SEMANTICS.md, JEE_ONTOLOGY.md §4, PERFORMANCE_ARCHITECTURE.md §1–§4, §9–§10, TEST_STRATEGY.md §4 (property tests), §5–§6 (this phase's gate rows), `src/core/graph`, `src/core/indexes` |
| 3 | PERSISTENCE.md, MIGRATION.md, SECURITY.md §1–§3, TEST_STRATEGY.md §5–§6 (this phase's gate rows), `src/persistence`, `src/io`, `data/fixtures/legacy/README.md` |
| 4 | PERFORMANCE_ARCHITECTURE.md §3–§5, SEARCH.md, SECURITY.md §2, ADR-007…ADR-011, `src/workers`, `src/chem`, `src/layout`, `src/search` |
| 5 | UI_ARCHITECTURE.md §1–§6, §9–§12, PERFORMANCE_ARCHITECTURE.md §6–§7, SECURITY.md §2 and §4, TEST_STRATEGY.md §5–§6 (this phase's gate rows), `src/render`, `src/ui` |
| 6 | UI_ARCHITECTURE.md §7–§8, DOMAIN_MODEL.md §5–§8 and §12, VALIDATION_RULES.md §2, TEST_STRATEGY.md §5–§6 (this phase's gate rows) |
| 7 | GRAPH_SEMANTICS.md §7 and §9, UI_ARCHITECTURE.md §5, JEE_ONTOLOGY.md §3–§4 |
| 8 | UI_ARCHITECTURE.md §3 and §6, PERSISTENCE.md §8 |
| 9 | PERFORMANCE_ARCHITECTURE.md (all), PERSISTENCE.md §11–§12 |
| 10 | TEST_STRATEGY.md §5–§6 (this phase's gate rows), MIGRATION.md §4.8–§4.10, SECURITY.md |
