# Implementation Plan

Package sections **#28 Phase Plan** and **#29 Definition of Done**. Each phase is split into **steps sized for one Sonnet session**. A step ends with `npm run check` green, a commit `phase-N.S: <summary>`, and updated `docs/PROGRESS.md` + `docs/PROJECT_STATE.json`.

## 1. Global Definition of Done (every step)

1. `npm run check` passes (typecheck, lint, dependency rules, file size ≤ 400 lines, hardcode check, tests).
2. New behaviour has tests at the right level (TEST_STRATEGY.md §1); every invariant touched has a test.
3. No `TODO` without an entry in PROGRESS.md "Open items".
4. Public contracts changed only through the amendment procedure (CLAUDE.md §7).
5. Docs updated where behaviour differs from them; no silent divergence.
6. No data is stored that the schema does not define; no derived data is stored.
7. A step that adds or changes a hot path (commit, index, projection, validation, layout, search, persistence, boot, import, export) adds or updates its benchmark in the same step.

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
Dependencies: `dexie`, `fflate`, dev `fake-indexeddb` (each added in the step that first uses it; versions recorded; `npm audit`).
| Step | Work | Must cover |
|---|---|---|
| 3.1 | Add `dexie`, dev `fake-indexeddb`. Dexie schema from `DB_STORES` (DB `orn` v1); adapter with injected `indexedDB`/`IDBKeyRange` (no globals); serial write queue: one transaction per ChangeSet over `records` + `meta.revision`, coalescing per record (delete/create order kept); retry 250 ms / 1 s / 4 s (fake timers) → `failed`; `SaveStatus`; pending-writes query (for `beforeunload`, wired in Phase 5); quota error → evict `derivedCache` (LRU) → retry → `failed`, memory kept; coverage threshold 80% lines for `src/persistence` | INV-20; P-01 IndexedDB variant (save → load deep-equal: fixtures, generator shapes, random command sequences); ADV-038 integration part (transaction aborted mid-ChangeSet → reopen shows the last committed revision, no partial record); ADV-040 write-path part; DB upgrade test scaffold; bench `persist.bench.ts`: synchronous enqueue+coalesce of one ChangeSet (ordinary edit, hub edit) and one flush on fake-indexeddb (labelled "our overhead, not real IndexedDB"); one transaction covers records + meta + asset blobs (`writeChanges(changeSet, blobs?)`) |
| 3.2 | Add `fflate`. Snapshots: pure builder (state → compressed DatasetDocument + summary), create/list/restore/delete; retention (mandatory reasons kept, last 5 periodic, manual until deleted); periodic policy (30 min of activity or 200 revisions, injected clock); restore = validate (migrate if older, injected runner) → `pre_restore` snapshot → `replaceState` → history cleared; quota sequence stage 2 (report deletable periodic snapshots as a status event, no UI) | Snapshot round trip deep-equal (fixtures, generator shapes); restoring a corrupt or invalid snapshot changes nothing and is reported; ADV-045 snapshot-restore part; ADV-040 snapshot stage; retention tests; bench: snapshot build and restore at the design tier (informal; hosted off the main thread from Phase 4) |
| 3.3 | Boot sequence (PERSISTENCE §4) with an injected lock port (always-granted stub until 3.4) and an injected `MigrationRunner`: open/upgrade; IndexedDB unavailable → session-only; newer `schemaVersion` → read-only with message; older → `pre_migration` snapshot → migrate → L1–L3 → `replaceAll`, failure → restore snapshot + read-only; bulk read → per-record L1 → invalid rows to `quarantine` with issues and raw value (≤ 64 KB), nothing deleted; indexes; `validateAll`; uiState tolerant restore; clean-shutdown marker and crash check (drafts offered); asset records without blob reported (AST-002); `lastIntegrityCheckAt` | ADV-041 disk part; ADV-045 migration part; migrations framework evidence and P-03 framework form (Phase 3 notes); INV-23 for quarantine; history empty after migration; bench: boot load (bulk read → state → indexes) at the design tier, informal (cold-boot budget judged at Gate E) |
| 3.4 | Writer lock (`orn-writer`) and change channel (`orn-changes`) behind injected ports (in-memory fakes in tests); writer posts `ChangeMessage = { fromRevision, revision, changedIds }` after each persisted transaction; a follower re-reads the rows and applies the message only when `fromRevision` equals its current revision, otherwise it reloads fully; promotion on writer close → full reload → writable; no Web Locks → single-tab warning status | INV-28; ADV-039 integration part (two in-process instances: second read-only, follows changes, promotes on close); bench: follower apply of one ChangeSet (ordinary edit, hub edit); ADR-033 (`applyRemote`/`reload`, refused on a writable store) |
| 3.5 | Export: `.orn.json` (deterministic serialisation) and `.ornpkg` (fflate zip: manifest with SHA-256 per file, `dataset.json`, `assets/<sha256>.<ext>`) with an injected asset-bytes provider; scopes full/chemistry/curriculum/presentation/subset; dependency closure with `includeDependencies`; coverage threshold 80% lines for `src/io` | INV-19; save → load → export equals export of the original (P-02 persistence part); every scope's output passes L1 and has no dangling reference with closure on (subset without closure reports what is missing); ADV-040 "export works after a failed save"; bench: export full dataset at the design tier < 2 s (both formats) |
| 3.6 | Import part 1: caps before parse (byte size first, then depth/string/record caps; SECURITY §3); safe JSON parser (iterative, no recursion; `__proto__`/`constructor`/`prototype` renamed `__unsafe_key__…` and reported); format detection (`orn.dataset`, `orn.package`, legacy v6/v4 → a "legacy" result handled from 3.8); `.ornpkg` unpack (manifest hashes, 200 MB cap, asset caps, magic bytes vs media type); migration hook (injected runner; newer version refused with explanation); tolerant envelope; per-record L1 → quarantine list | ADV-031; ADV-032 io part (60 MB, depth 100, 5 MB string: rejected, no stack overflow); ADV-035; ADV-041 file part; bench: parse → envelope → L1 for a 5k-reaction design-tier file |
| 3.7 | Import part 2: ID conflict analysis (`identical_skip` by canonical deep-equal, `keep_current`, `replace`, `import_as_copy` via `remap` + rich-text link rewrite, Phase 3 notes), non-destructive defaults, modes `replace_all`/`merge`, L2/L3 on the merged replica only, `ImportPreview`, confirm blocked while the merged result has L1–L3 ERRORs; apply via injected snapshot port = `pre_import` snapshot → one `replaceState` or merge commit → history cleared → batch report in `importBatches`; cancel changes nothing | INV-21; ADV-030; ADV-042 (all four resolutions); ADV-045 import part; P-02 full (export → import → export byte-identical through the real importer: fixtures + generator shapes); bench: import 5k reactions parse → preview < 5 s, into an empty store and into a design-tier store with conflicts; apply refused on stale revision or unknown batch |
| 3.8 | Legacy v4 → v5 port (`migrateLegacy`, `splitLegacyReagent`, `normalizeData`, quirks included) in `src/io/legacy-v6` | Output deep-equals `v4-sample.normalized-by-v6.json`; v5 input passes through as v6 would; the legacy HTML is read only by line range within script lines 1–294 |
| 3.9 | Legacy deterministic IDs (MIGRATION §4.2), label parser (§4.6), condition-text parser (structured fields when unambiguous, else `other[]`; regex flags → `parsedFields`) | Table-driven tests for every row of §4.2 and §4.6; `originalText` always kept; ambiguity → review, never guessed; determinism |
| 3.10 | v5 → ORN compound mapping (§4.4) with the consumed-path trace and the `LegacyImportReport` skeleton; hub → class + anchor (decision "class / species"); hub SMILES kept in `legacy.unmapped` + review | Completeness test over `compounds[]` (every leaf consumed or in `provenance.legacy.unmapped`, INV-23); the §4.7 triggers that apply to compounds; mapped records pass L1 |
| 3.11a | v5 → ORN reaction mapping, part 1 (§4.5): participants, stages, outcomes/products, intermediates, missing-compound placeholders, conditions, participant notes/images, reaction image, scope, lifecycle; reaction-side completeness for those fields (fields of 3.11b are returned as `deferred` paths, never skipped silently) | §4.5 rows listed; §4.9 quirks r12, r14, r18, "443 K"; mapped records pass strict L1; both fixtures merged with the 3.10 compound records have no L1–L3 ERROR |
| 3.11b | v5 → ORN reaction mapping, part 2 (§4.5): classification and curriculum: transformation (from/to, fgFrom/fgTo, bondChanges), mechanism type/summary, reactionType, reactionFamily, reagentFamily (unmapped + distinct values listed), namedReaction, chapter → topic, jee.relevance/difficulty/traps/prerequisites/concepts, relatedReactions, collapseIntermediates/_v4; top-level and reaction `dropped` leaves (§4.8) | those §4.5 rows; §4.9 quirk r22; completeness test over the WHOLE legacy JSON |
| 3.11c | Preview decisions (hub class/species, `reagentFamily` values); full `LegacyImportReport`; dry run of both fixtures through the real import pipeline (3.6–3.7) with committed expected outputs (fixed clock) in `data/fixtures/legacy-expected/`; re-import → all `identical_skip` | ADV-043; zero `notImported` for both fixtures; preview equals the committed expected output; every §4.9 quirk has a test (collected) |
| 3.12 | Gate C: title-level matrix scan extended to the Gate C rows; `npm run bench:baseline` with the Phase 3 entries; `bench:compare` shows no Phase 2 regression; Gate C packet in the Gate B format; self-review; stop (no verdict, no tag) | All Gate C rows named in test titles; run `npm run test:timing` (the wall-clock assertions, TEST_STRATEGY §1) next to `bench:baseline`; budgets judged by TEST_STRATEGY §6 |

**Gate C rows.** ADV-030, 031, 032 (io part), 035, 038 (integration part), 039 (integration part), 040, 041, 042, 043, 045; INV-19, 20, 21, 23 (quarantine and legacy), 28; P-01 (IndexedDB), P-02 (full pipeline), P-03 (framework form).

**Phase 3 notes (reviewer decisions, 2026-09-28).**
1. *P-03 and the migrations framework.* No schema bump and no production migration step in Phase 3. Gate C evidence: (a) the runner (step 1.10); (b) boot (3.3), snapshot restore (3.2) and import (3.6) call an injected `MigrationRunner`, tested with a test-only registry of synthetic steps: pre-migration snapshot, full L1–L3 after, `replaceAll`, history cleared, failure → snapshot restored + read-only; (c) P-03 framework form: synthetic steps over frozen synthetic fixtures in `tests/fixtures/migrations/` produce output byte-equal to committed expected files, deterministic across runs and input key orders, nothing dropped (`legacy.unmapped`). P-03's real form (frozen v1 fixtures → v2 expected) starts with the first real bump.
2. *Rich-text links on `import_as_copy`.* `[[id]]` links pointing at records inside the copied set are rewritten to the new IDs; links to records outside it are left unchanged; the preview reports the rewritten count. Additive amendment in 3.7 (CLAUDE.md §7), a pure core function with tests.
3. *io ↔ persistence.* They never import each other. Flows needing both receive the other side as injected functions/ports; `src/app` wires them in Phase 5; integration tests wire them directly.
4. *Where heavy work runs.* Import, export, snapshot building, migration and boot L1/`validateAll` are plain functions returning structured-clone-safe data, run in-process in Phase 3 and hosted by the compute worker in Phase 4. The "no main-thread task > 50 ms" row is judged at Gate E. The write queue and follower apply stay on the main thread and are benchmarked. fake-indexeddb benches measure our overhead only; real IndexedDB timing is traced at Gates E/F.
5. *Browser-only parts.* ADV-038/039 are integration-tested at Gate C with fakes; their real-browser e2e halves belong to Gate E (Playwright arrives in Phase 5).
6. *Contract amendments.* Contract amendments from the plan review are approved per docs/PROGRESS.md "Phase 3 contract decisions"; each lands in the step named there through CLAUDE.md §7 (contracts, docs and Amendments list in that step's commit).

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

**Phase 4 note (step 3.2 review).** `replaceState` runs `validateAll` on the main thread: about 2 s of a 3.5 s restore at the design tier (index build about 0.5 s, `validateAll` about 1.3 s, the rest about 0.15 s; docs/PROGRESS.md, step 3.2 review). From Phase 4 the compute worker validates the replica, and `replaceState` (and ADR-033's `reload`) must accept precomputed findings, so the main thread only swaps the state and rebuilds indexes.

**Phase 4 note (step 3.3 review).** The same entry points must also accept **prebuilt indexes** (the compute worker builds them while it validates), so boot does not build the indexes twice: today `open()` builds them for `validateAll` and the store builds them again (about 0.45 s at the design tier, PROGRESS.md step 3.3).

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
| 3 | PERSISTENCE.md, MIGRATION.md, SECURITY.md §1–§3, TEST_STRATEGY.md §4 (P-01…P-03), §5–§6 (this phase's gate rows), PERFORMANCE_ARCHITECTURE.md §2, §9, `src/persistence`, `src/io`, `data/fixtures/legacy/README.md` |
| 4 | PERFORMANCE_ARCHITECTURE.md §3–§5, SEARCH.md, SECURITY.md §2, ADR-007…ADR-011, `src/workers`, `src/chem`, `src/layout`, `src/search` |
| 5 | UI_ARCHITECTURE.md §1–§6, §9–§12, PERFORMANCE_ARCHITECTURE.md §6–§7, SECURITY.md §2 and §4, TEST_STRATEGY.md §5–§6 (this phase's gate rows), `src/render`, `src/ui` |
| 6 | UI_ARCHITECTURE.md §7–§8, DOMAIN_MODEL.md §5–§8 and §12, VALIDATION_RULES.md §2, TEST_STRATEGY.md §5–§6 (this phase's gate rows) |
| 7 | GRAPH_SEMANTICS.md §7 and §9, UI_ARCHITECTURE.md §5, JEE_ONTOLOGY.md §3–§4 |
| 8 | UI_ARCHITECTURE.md §3 and §6, PERSISTENCE.md §8 |
| 9 | PERFORMANCE_ARCHITECTURE.md (all), PERSISTENCE.md §11–§12 |
| 10 | TEST_STRATEGY.md §5–§6 (this phase's gate rows), MIGRATION.md §4.8–§4.10, SECURITY.md |
