# Architecture Decisions

Package section **#3 Technology Decision & Alternatives**. Each ADR records requirements, the decision, advantages, disadvantages, performance, maintenance, migration implications, why it was chosen and why alternatives were rejected. ADRs are append-only: to change a decision, add a new ADR that supersedes the old one and update CLAUDE.md.

---

### ADR-001 — TypeScript (strict) + React 19 + Vite 7
- **Requirements**: multi-file modular codebase maintainable by AI agents; rich interactive UI; offline static delivery; strong types across a large domain model.
- **Decision**: TypeScript with `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; React 19 function components; Vite 7 for dev server, workers and builds.
- **Advantages**: types make the canonical model self-documenting and refactor-safe; React's ecosystem covers accessible primitives, virtualisation and testing; Vite handles ES-module workers and WASM with no custom config.
- **Disadvantages**: React re-render costs must be managed (selectors, imperative viewport); build tooling churn.
- **Performance**: React is used for structure; hot paths (pan/zoom, culling) bypass React; Vite produces code-split ES2022 bundles.
- **Maintenance**: mainstream stack; abundant documentation; agents know it well.
- **Migration implications**: core is framework-free (`src/core` imports only zod and immer), so a future UI rewrite does not touch the domain.
- **Why chosen**: best balance of ecosystem, agent familiarity and performance control.
- **Rejected**: Svelte/SolidJS (smaller ecosystems for accessible primitives and testing, less agent familiarity); Angular (heavy, slower iteration); plain JS (the v6 lesson: no types, one file, fragile).

### ADR-002 — Zod 4 as the canonical schema language
- **Requirements**: one executable source of truth for types and runtime validation; strict unknown-key rejection; branded IDs; discriminated unions; readable by agents.
- **Decision**: Zod 4 (`strictObject`, `discriminatedUnion`, `brand`, `lazy`), no defaults or transforms in canonical schemas; `z.config({ jitless: true })` for CSP. Phase-0 schemas use the Zod 3/4 common subset and were verified with tsc 6.0.3.
- **Advantages**: types inferred from schemas; precise error paths for findings; widely known.
- **Disadvantages**: bundle size larger than Valibot; jitless mode is slower than JIT.
- **Performance**: per-record parsing is cheap (tens of µs); full-dataset parsing happens in workers.
- **Maintenance**: schema files are small and declarative; one file per domain area.
- **Migration implications**: schema changes are versioned (MIGRATION.md §1); old schemas are preserved in migration steps as plain data transforms.
- **Why chosen**: maturity, error quality, agent familiarity.
- **Rejected**: Valibot (smaller, but less familiar and less mature error tooling); ArkType (novel syntax, harder for agents to maintain); TypeBox + Ajv (Ajv compiles with `new Function`, conflicts with CSP; JSON Schema is verbose for this model).

### ADR-003 — Immer-based command store with patches
- **Requirements**: exact undo/redo; change sets for persistence, indexes, search and worker replicas; immutable state for cheap equality.
- **Decision**: all changes are commands executed with Immer `produceWithPatches`; patches and inverse patches form ChangeSets and history entries.
- **Advantages**: one mechanism powers undo, persistence and incremental derivation; structural sharing.
- **Disadvantages**: patch paths couple to state shape (`records.<kind>.<id>`), so the state shape is part of the contract.
- **Performance**: small commits allocate only changed paths; freezing in dev only if profiling shows cost.
- **Maintenance**: command builders are plain functions; the store is small.
- **Migration implications**: history never spans schema versions (cleared on migration/import).
- **Why chosen**: simplest correct way to get exact undo and incremental everything.
- **Rejected**: Redux Toolkit (same Immer core with more ceremony); event sourcing log as primary storage (replay cost, schema-versioned events); CRDTs/Yjs (multi-user sync is FUTURE; unnecessary complexity now).

### ADR-004 — IndexedDB via Dexie 4 with a generic records table
- **Requirements**: offline, durable, transactional, large capacity (tens of MB + images), works in all modern browsers.
- **Decision**: Dexie 4 over IndexedDB; one `records` store keyed by ID with a `kind` index; separate stores for blobs, snapshots, sessions, caches, UI state, quarantine.
- **Advantages**: transactions; large quotas; Blob storage; mature library with good TypeScript types and fake-indexeddb testing.
- **Disadvantages**: IndexedDB quirks (private mode, Safari quotas); no SQL queries (not needed: indexes are in memory).
- **Performance**: bulk reads at boot; one small transaction per commit.
- **Maintenance**: schema evolution lives in Zod migrations; Dexie versions change only when stores change.
- **Migration implications**: a future SQLite-WASM/OPFS backend can implement `PersistenceAdapter` without touching the core.
- **Why chosen**: the only universally available transactional browser store; Dexie removes its sharp edges.
- **Rejected**: localStorage (5 MB, synchronous, no transactions — v6's limit); SQLite-WASM on OPFS (excellent but heavier, cross-browser OPFS sync-access maturity and COOP/COEP needs; revisit at scale); idb-keyval (no transactions over multiple keys).

### ADR-005 — Single writer via Web Locks + BroadcastChannel
- **Requirements**: no lost updates when the app is open in two tabs.
- **Decision**: Web Lock `orn-writer`; other tabs read-only and follow changes via BroadcastChannel; promotion on writer close.
- **Advantages**: simple, correct, no merge logic.
- **Disadvantages**: second tab cannot edit.
- **Performance**: negligible.
- **Maintenance**: small module.
- **Migration implications**: real multi-writer sync (CRDT) remains possible later behind the same store interface.
- **Why chosen**: correctness with minimal complexity for a single-user app.
- **Rejected**: last-write-wins across tabs (silent loss); SharedWorker-hosted store (poor Safari history, harder debugging).

### ADR-006 — Custom SVG renderer + d3-zoom viewport
- **Requirements**: chemistry typography (sub/superscripts), structure depictions, accessible nodes, SVG export identical to screen, 60 fps at 400 nodes, full styling control.
- **Decision**: Scene model → React SVG layers; d3-zoom for gestures writing a single transform imperatively; LOD and culling; a WebGL overview layer is FUTURE.
- **Advantages**: pixel-identical export; ARIA on real elements; precise typographic control; no fighting a library's model of nodes/edges.
- **Disadvantages**: more code to own (hit testing, culling, LOD).
- **Performance**: fine at the render budget; LOD and culling keep it there; very large overviews would need canvas/WebGL (FUTURE).
- **Maintenance**: renderer is isolated in `src/render`; the Scene contract decouples it from graph semantics.
- **Migration implications**: a canvas/WebGL renderer can consume the same Scene.
- **Why chosen**: export parity, accessibility and chemistry typography are requirements, not nice-to-haves.
- **Rejected**: Cytoscape.js (canvas rendering: weak accessibility and typographic control; export differs from DOM); React Flow (DOM nodes per element, heavy at scale, opinionated interaction model); Sigma.js (WebGL, excellent for huge graphs but poor text/typography and a11y).

### ADR-007 — ELK (elkjs) in a worker, with an in-house fallback
- **Requirements**: readable layered layouts of bipartite/hub graphs, deterministic, off the main thread.
- **Decision**: elkjs `layered`, `radial`, `stress` in the layout worker; deterministic inputs; 2 s timeout → fallback longest-path layered layout.
- **Advantages**: best-in-class layered layout with port and spacing control; runs in workers.
- **Disadvantages**: large bundle (lazy-loaded); layout quality tuning required.
- **Performance**: < 300 ms for ≤ 400 nodes; cached by key.
- **Maintenance**: adapter isolated behind `LayoutEngine`.
- **Migration implications**: engine replaceable per algorithm.
- **Why chosen**: quality and determinism.
- **Rejected**: dagre (unmaintained, weaker for hubs); D3-force (non-deterministic, unstable positions between expansions); Graphviz-WASM (strong but heavier and awkward in workers).

### ADR-008 — Web workers with a small typed RPC
- **Requirements**: no main-thread task > 50 ms; cancellation; progress.
- **Decision**: four workers (chem, layout, search, compute) and a ~200-line typed RPC with cancel, progress, timeouts and restart.
- **Advantages**: explicit cancellation semantics; typed APIs; no magic proxies.
- **Disadvantages**: code to maintain.
- **Performance**: structured clone costs are bounded by sending ChangeSets, not whole states.
- **Maintenance**: contracts in `src/workers/rpc/contracts.ts`.
- **Migration implications**: none.
- **Why chosen**: cancellation and progress are first-class needs.
- **Rejected**: Comlink (no built-in cancellation/progress semantics; proxies obscure costs).

### ADR-009 — RDKit.js (MinimalLib) behind `StructureToolkit`
- **Requirements**: parse SMILES/molfiles, canonicalise, formula, stereo, SMARTS, depictions — offline.
- **Decision**: RDKit.js WASM in the chem worker, lazy-loaded, behind `StructureToolkit`; SVG depictions sanitised; facts cached by (input, toolkit, version).
- **Advantages**: the reference cheminformatics toolkit; high-quality depictions; SMARTS.
- **Disadvantages**: ~6 MB WASM; needs `'wasm-unsafe-eval'` in CSP.
- **Performance**: parse/depict in milliseconds; cached.
- **Maintenance**: only the adapter imports RDKit.
- **Migration implications**: toolkit swap = new adapter; cached facts invalidate by version.
- **Why chosen**: correctness of chemistry matters more than bundle size, and it loads lazily.
- **Rejected**: OpenChemLib JS (good and smaller; kept as the fallback adapter candidate); SmilesDrawer (drawing only, no chemistry model); Kekule.js (heavier, less maintained).

### ADR-010 — Structure drawing: Ketcher adapter (architecturally supported)
- **Requirements**: optional drawing of structures without making it mandatory.
- **Decision**: text entry + live depiction now; `StructureEditor` interface in `src/features/workbench/structure-editor/` with a lazy Ketcher adapter as ARCHITECTURALLY SUPPORTED.
- **Advantages**: no heavy dependency until needed; users can author everything by text.
- **Disadvantages**: drawing is not available initially.
- **Performance / Maintenance**: zero cost until adopted; adapter isolated.
- **Migration implications**: none; structures are stored as text either way.
- **Why chosen**: anti-overengineering.
- **Rejected**: building a custom editor (enormous scope); bundling Ketcher now (size, CSP review needed).

### ADR-011 — MiniSearch + chemistry-aware normaliser
- **Requirements**: fast fuzzy/prefix search over names, aliases, formulas; incremental updates; offline; in a worker.
- **Decision**: MiniSearch with fields and boosts; normaliser in `src/core/text` shared with validation.
- **Advantages**: small, incremental add/remove, serialisable index.
- **Disadvantages**: no substructure search (RDKit handles that when needed).
- **Performance**: < 50 ms queries at 5k reactions.
- **Maintenance**: document builder is a pure function.
- **Migration implications**: index is a cache; rebuildable.
- **Why chosen**: incremental updates and size.
- **Rejected**: Fuse.js (linear scan, slow at scale); Lunr (immutable index, rebuild on every change); FlexSearch (fast but weaker typing and field-level control).

### ADR-012 — Zustand for UI state
- **Requirements**: small, sliced UI stores readable outside React (viewport code).
- **Decision**: Zustand stores for selection, viewport, panels, filters, palette; canonical data stays in the core store.
- **Rejected**: Redux (ceremony); React context for everything (re-render storms); Jotai (fine, but atoms scattered across files are harder for agents to audit).
- **Other points**: negligible size and cost; no migration impact (UI state is tolerant and resettable).

### ADR-013 — Radix primitives, cmdk, TanStack Virtual
- **Requirements**: accessible menus, dialogs, tooltips; command palette; virtualised lists.
- **Decision**: Radix UI primitives (unstyled), cmdk for the palette, TanStack Virtual for lists.
- **Rejected**: MUI/Chakra (heavy styling systems conflicting with the visual language); hand-rolled a11y widgets (error-prone).
- **Other points**: tree-shaken; styled with our tokens; replaceable per component.

### ADR-014 — CSS Modules + design tokens; bundled IBM Plex fonts
- **Requirements**: strict CSP (no inline styles injected at runtime), consistent visual language, offline fonts.
- **Decision**: CSS Modules with CSS custom-property tokens; Fontsource IBM Plex Sans/Mono.
- **Rejected**: Tailwind (utility soup obscures the design language for agents; fine technically); CSS-in-JS runtime (inline style injection conflicts with CSP); Google Fonts CDN (network at runtime).

### ADR-015 — fflate for `.ornpkg`
- **Requirements**: zip packages with assets, in workers, fast.
- **Decision**: fflate. **Rejected**: JSZip (slower, larger). Other points: tiny; replaceable.

### ADR-016 — Testing stack
- **Decision**: Vitest (unit, integration, bench), fast-check (properties), fake-indexeddb (persistence), Testing Library + jsdom (components), Playwright (e2e, three engines), axe for a11y checks.
- **Rejected**: Jest (slower with ESM/Vite); Cypress (weaker multi-tab and WebKit support).

### ADR-017 — Enforced module boundaries
- **Decision**: dependency-cruiser rules (`.dependency-cruiser.cjs`) + ESLint restrictions (no DOM/storage/network/nondeterminism in core; no HTML injection anywhere) + file-size and hardcode scripts, all in `npm run check`.
- **Why**: architecture that is not enforced erodes, especially with agents working session by session.

### ADR-018 — Opaque, prefixed IDs (ULID bodies)
- **Decision**: `<prefix>_<lowercase ULID>`; nested objects get IDs; deterministic bodies for seeds and legacy imports.
- **Rejected**: name-derived IDs (break on rename — v6 matched by name); UUIDv4 (not sortable, no kind prefix); auto-increment (collides across imports).

### ADR-019 — Offline-first static delivery; PWA in Phase 9
- **Decision**: static build served over http(s); service worker caching in Phase 9; no runtime network.
- **Disadvantage**: `file://` (how v6 was used) is unsupported; README explains `npm run preview` or any static host.

### ADR-020 — Versioning policy
- **Decision**: exact versions are locked by `package-lock.json` at the first `npm install` in Phase 1 and recorded in PROGRESS.md. If `typescript-eslint` does not yet support TypeScript 6.0, pin TypeScript `~5.9` and record the fallback (the schemas use no TS-6-only features). Major upgrades happen only at phase boundaries, as their own commit, with `npm run check` green.
- **Version record**: 2026-09-27, Vitest `3.2.7` → `4.1.11` (with `@vitest/coverage-v8` 4.1.11) as its own commit at the Phase 1 boundary, closing GHSA-82fw-gwwq-j7x9; `engines.node` unchanged. Coverage counting changed (AST-based mapping); baseline in PROGRESS.md.

### ADR-021 — Mini-markup instead of HTML or Markdown for rich text
- **Decision**: tiny grammar (DOMAIN_MODEL.md §3.4) parsed to an AST and rendered as React elements.
- **Rejected**: HTML (sanitiser complexity, injection risk — v6 stored HTML-ish text); full Markdown (large surface: raw HTML, images, links to anywhere).

### ADR-022 — Reactions are records; graphs are projections
- **Decision**: bipartite canonical model; every graph view is derived (GRAPH_SEMANTICS.md).
- **Why**: v6 treated reactions as edges between compound nodes, which cannot express multiple reactants/products, outcomes, conditions or stages without hacks.

### ADR-023 — Selectivity on outcomes under condition variants
- **Decision**: major/minor/exclusive belong to outcomes scoped by condition variants (DOMAIN_MODEL.md §6.4).
- **Why**: v6 stored `major` on participants, so "major under which conditions?" could not be expressed.

### ADR-024 — Layered records (foundation, chemistry, curriculum, attachments, presentation)
- **Decision**: references only point down-layer (INV-05).
- **Why**: syllabus changes and view customisation must never invalidate chemistry.

### ADR-025 — Hubs are presentation; classes are chemistry
- **Decision**: a navigator hub is a `navigator_anchor` on a class; classes never carry representative example structures.
- **Why**: v6 hubs were compounds with example SMILES (Arenes = anthracene), conflating a family with one member.

### ADR-026 — Validation is layered, lifecycle-aware and read-only
- **Decision**: L1–L3 block commits, L4 advises, findings are stored apart, auto-fixes are explicit commands (VALIDATION_RULES.md).
- **Why**: authors need drafts; students need trustworthy published data; nothing may change silently.

### ADR-027 — Condition-variant selection is a `ProjectionRequest` field, not a `ViewFilters` field
- **Decision**: `ProjectionRequest.conditionVariantId?: ConditionVariantId` (`src/core/graph/contracts.ts`) narrows one reaction's participants and outcomes to those holding under a chosen variant (GRAPH_SEMANTICS.md §7, reaction_explorer). It is not on `ViewFilters` (`src/core/schema/presentation.ts`).
- **Why**: `ViewFilters` is persisted (`view_preset.filters`) and names a cross-reaction restriction (topics, reagent families, scope); a condition variant names a part *within* one focused reaction, so persisting it as a saved-view default would not generalise across reactions. Keeping it on the request avoids a schema change (`CURRENT_SCHEMA_VERSION` unchanged, no migration).
- **Consequence**: `Projection.key` (the cache key) hashes it (`kit.ts`); every other projection ignores it. Step 2.5 widened its use to `precursor_explorer` too (same rationale).

### ADR-028 — Degree-cap overflow is its own `EdgeSemantic`; the ⇌ badge reuses `relationshipId`/`relationshipType`
- **Decision**: `EdgeSemantic` (`src/core/graph/contracts.ts`) gains `'overflow'` for the synthetic edge into a degree-cap overflow node (GRAPH_SEMANTICS.md §11). The ⇌ badge (§5) is *not* a new edge or field: `precursor_explorer` tags the two produces edges of a mirrored `reverse_of` pair with the existing (until now unused) `relationshipId`/`relationshipType` fields.
- **Why**: an overflow edge stands for several collapsed neighbours, never one real participation or production, so giving it `'consumes'`/`'produces'` would be misleading and would need a `reactionId` it does not have; a distinct semantic makes that explicit and lets the INV-26 check skip it honestly (it already skips any edge with no `reactionId`). The ⇌ badge is a *relationship between two already-drawn edges*, exactly what `relationshipId`/`relationshipType` were declared for — a new field would duplicate that.
- **Consequence**: no schema change (`GraphEdge`/`EdgeSemantic` live in `src/core/graph/contracts.ts`, not `src/core/schema`); `graphEdgeId` still hashes the overflow edge's identity `(view, from, to, semantic)` with the rest absent, so the harness's generic "ID is the hash of its identity" check (INV-26) needs no exception for it.

### ADR-029 — `EdgeSemantic` gains `uses_mechanism`; classification edges from a reaction omit `reactionId`
- **Decision**: `EdgeSemantic` (`src/core/graph/contracts.ts`) gains `'uses_mechanism'` for the `mechanisms` view (a reaction/outcome linking a mechanism), mirroring the already-scaffolded-but-unused `'uses_reagent'`. Separately: a `membership` edge from a reaction (to a topic, or to a named-reaction family) and a reaction-level (no `outcomeId`) `uses_mechanism` edge never set `GraphEdge.reactionId` — only an outcome-level `uses_mechanism` edge does (an outcome names at most one mechanism, so it stays unique).
- **Why**: INV-26 treats any edge with `reactionId` set as naming exactly one real participation or production, and requires it to be unique *regardless of endpoints* ("whatever their endpoints" — GRAPH_SEMANTICS.md §10). A reaction can validly carry several topic mappings, several named-reaction families, or several reaction-level mechanism links — these are classifications, not participations/productions, and setting `reactionId` on them made two legitimately distinct classifications of the same reaction collide under that check. The projection harness caught this immediately: the first run of `syllabus` over the demo's one cross-chapter reaction (docs/JEE_ONTOLOGY.md's diazonium → phenol) reported an INV-26 violation.
- **Consequence**: no schema change. The reaction is still recoverable from `edge.from` on every such edge (they are always drawn *from* the reaction). Consumes/produces/transforms_to/uses_reagent edges are unaffected — a participant or outcome/product *is* inherently unique per reaction, so `reactionId` stays exactly as documented for those.

### ADR-030 — `ReadonlyIndexes.navigatorRollup()`: the navigator's hub roll-up moves into `core/indexes`
- **Decision**: `ReadonlyIndexes` (`src/core/indexes/contracts.ts`) gains `navigatorRollup(): NavigatorRollupIndex` — every reaction's precomputed navigator hub-level contribution (source/target hubs, per-outcome main-product candidates, Unclassified/Unanchored membership), aggregated per hub (`candidatesFrom`/`candidatesTo`, `src/core/indexes/navigator-rollup.ts`), maintained incrementally by `IndexEngine.apply` the same way the other cross-record tables are. Hub resolution itself (`HubResolver`, `hubTargets`) and the "what does this reaction carry" selection (`primarySubstrateOf`/`mainProductsOf`) move from `src/core/graph/navigator/{hubs,select}.ts` into `core/indexes` with them; the graph-layer files become thin re-exports/wrappers so every existing caller (`build.ts`, `precursor/reverse-of.ts`) keeps its old signature.
- **Why**: the navigator's projection build scanned every reaction in the state on every call (GRAPH_SEMANTICS.md §3's whole-dataset hub overview, not a local seeded traversal) — measured at 21.81–27.2 ms at the design tier against the 16 ms budget (Gate B packet §5), and worse once benchmarked on p99 with realistic sample counts. Maintaining the hub-level candidates incrementally (only touched reactions recomputed on a plain edit; only the reactions referencing a species/reagent recomputed on a class-membership change; the whole roll-up rebuilt, but only *this* index, on an anchor/class-hierarchy/display change) turns `build()`'s cost from proportional to total reactions into proportional to hub count and output. Doing this inside `core/indexes` rather than `core/graph` is not a style choice: `core/graph` already imports `core/indexes`, so `core/indexes` importing anything from `core/graph` would be a cycle (`no-circular`, `.dependency-cruiser.cjs`) — the hub-resolution logic itself had to move down, not be duplicated.
- **Consequence**: additive only — `CoreIndexes` and every other `ReadonlyIndexes` member is unchanged, no schema change, no `CURRENT_SCHEMA_VERSION` bump, no migration. `src/test-support/navigator-reference.ts` keeps the pre-2.9 full-scan algorithm as a differential-test oracle. One real behaviour change, deliberate and documented in the same commit: which specific edges survive a `maxEdges` truncation is now an explicit, stable sort by `(reactionId, outcomeId, productId)` in both the index-backed build and the reference — previously an undocumented accident of scanning reactions in ID order, which stopped matching once candidates were gathered hub-by-hub instead.

### ADR-031 — `ValidationRule.referencedReads`: field-aware scope for referrers in `validateTouched`
- **Decision**: `ValidationRule` (`src/core/validation/contracts.ts`) gains an optional `referencedReads?: ReferencedReads` — for each kind of record the rule's subject refers to (or `'*'` for any kind), the top-level fields the rule's `check` reads of it; `[]` means "only whether it exists", an absent kind means "not read". `scopeOf`/`validateTouched` add a referrer of a touched record only if some L2/L3 rule of the referrer's kind reads a field that changed, or the record was created or deleted (everything about it changed). A rule that does not declare it keeps the old behaviour: it re-runs on any change to a referenced record. `previous` (already a parameter) supplies the diff; without it nothing can be diffed and every referrer is kept.
- **Why**: `scopeOf` expanded a touched record to every referrer at record-kind granularity (docs/PERFORMANCE_ARCHITECTURE.md §4, PROGRESS.md step 2.10), so renaming a species used by 1,000 reactions re-validated 1,000 reactions to learn that none of their rules read a species' name. Measured at the design tier: 65-94 ms per commit on a 1,000-referrer hub, against a 16 ms budget. `watches`/`peers` are kind- and record-level and cannot say which fields matter; the declaration is the missing field-level half.
- **Consequence**: additive; no schema change, no `CURRENT_SCHEMA_VERSION` bump, no migration. Narrows only the *referrer* expansion. The referent expansion (a touched record's own references, which RXN-018 and AST-001 depend on) and every `peers`/`watches` path are unchanged, so anything a rule reads outside its own references stays covered exactly as before. Scope stays whole records: `FindingStore.replaceForSubjects` replaces a subject's findings per level, so a subject is either fully re-validated or left alone; per-rule re-runs on a referrer would need a finding-merge contract and remain a Phase 9 candidate. A declaration is a promise about `check`, verified mechanically (`src/core/validation/reads-audit.test.ts`: a read trace of every declared rule over the maximal fixture, the demo and every generator shape, and a "referenced records vanish" differential for rules declared to read nothing) and by the incremental ≡ full property test on hub states (`tests/property/validation-scope.test.ts`). Declared only where the reads are exact: every `scope: 'record'` rule, the REF rules, RXN-013, RXN-018, REL-003/005/006, SPC-001/005, CLS-001/002, HIER-002, CUR-003…006, PRS-001/002, AST-001, RVW-002. Left undeclared (they walk hierarchies or routes through derived indexes): SPC-006, HIER-001, HIER-003, RTE-002, RTE-004.
