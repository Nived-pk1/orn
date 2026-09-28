# Organic Reaction Navigator — Architecture

This is the master document of the Phase 0 architecture package. It is organised by the 31 requested sections; sections with a dedicated document summarise and point there. Code is the source of truth for schemas and contracts (`src/core/schema`, `**/contracts.ts`); these documents explain them.

| # | Section | Where |
|---|---|---|
| 1 | Executive decision | §1 below |
| 2 | Core principles (incl. modules, dependency direction, data flow) | §2 below |
| 3 | Technology decision and alternatives | §3 below → ARCHITECTURE_DECISIONS.md |
| 4 | Canonical domain model | DOMAIN_MODEL.md §1–§11 |
| 5 | Complete data schema | `src/core/schema/*.ts` + DOMAIN_MODEL.md |
| 6 | Graph semantics | GRAPH_SEMANTICS.md |
| 7 | Reaction outcome model | DOMAIN_MODEL.md §6.4 |
| 8 | Mechanism model | DOMAIN_MODEL.md §7 |
| 9 | JEE ontology | JEE_ONTOLOGY.md §1–§2, §4–§6 |
| 10 | Syllabus versioning | JEE_ONTOLOGY.md §3 |
| 11 | Reaction authoring workbench | UI_ARCHITECTURE.md §7 |
| 12 | Compound/structure authoring | UI_ARCHITECTURE.md §8, DOMAIN_MODEL.md §12 |
| 13 | Validation engine | VALIDATION_RULES.md |
| 14 | Persistence | PERSISTENCE.md §1–§5, §9–§11, §13 |
| 15 | Import/export | PERSISTENCE.md §6–§8 |
| 16 | Search | SEARCH.md |
| 17 | Graph layout | UI_ARCHITECTURE.md §6, PERFORMANCE_ARCHITECTURE.md §5, GRAPH_SEMANTICS.md §11 |
| 18 | UI/UX | UI_ARCHITECTURE.md §2–§5, §9, §12 |
| 19 | Interaction model | UI_ARCHITECTURE.md §10–§11 |
| 20 | Performance | PERFORMANCE_ARCHITECTURE.md |
| 21 | Security | SECURITY.md |
| 22 | Error recovery | §22 below + PERSISTENCE.md §12 |
| 23 | Undo/redo | §23 below |
| 24 | Test architecture | TEST_STRATEGY.md §1–§2, §4 |
| 25 | Adversarial test matrix | TEST_STRATEGY.md §5 |
| 26 | Data invariants | §26 below |
| 27 | Migration from v6 | MIGRATION.md §4 |
| 28 | Phase plan | IMPLEMENTATION_PLAN.md §2 |
| 29 | Definition of done | IMPLEMENTATION_PLAN.md §1, §3; TEST_STRATEGY.md §6 |
| 30 | Sonnet execution specification | SONNET_HANDOFF.md §1–§20 |
| 31 | Sonnet master implementation prompt | SONNET_HANDOFF.md §21 |

Also here: capability classification (§A), self-audit (§B), assumptions that fail at scale (§C).

---

## 1. Executive decision

Rebuild the Organic Reaction Navigator as an **offline-first TypeScript/React application with a pure, framework-free domain core**. Chemistry is stored as typed, layered, referentially checked records — reactions are first-class records with participants, stages, condition variants and outcomes; selectivity lives on outcomes; hubs, curriculum and presentation are separate layers that point at chemistry, never the reverse. Every graph the user sees is a bounded, deterministic projection computed from those records, laid out in a worker and drawn by a custom SVG renderer from a renderer-agnostic Scene. All changes go through commands with exact undo, are validated before commit, and persist atomically to IndexedDB. The v6 single-file app is a requirements reference only; its data is imported through a lossless, review-flagging migration.

## 2. Core principles

### 2.1 Principles
1. **Chemistry data is canonical.** Graphs, indexes, scopes, findings, layouts and depictions are derived and recomputable (INV-11, INV-18).
2. **Records, not edges.** A reaction is a record; edges are projections (ADR-022).
3. **Layering.** Foundation → chemistry → curriculum → attachments → presentation; references point down only (INV-05).
4. **Nothing silent.** No silent data loss, no silent fixes, no silent truncation; ambiguity becomes REVIEW REQUIRED.
5. **Bounded everything.** Every traversal, search, import and render has limits and reports when it hits them.
6. **Deterministic.** Same input → same output: IDs injected, serialisation canonical, projections and layouts reproducible.
7. **Enforced architecture.** Boundaries, purity and size rules are checked by tooling, not by memory.
8. **Anti-overengineering.** Build what is REQUIRED NOW; leave seams (interfaces, registries) for what is ARCHITECTURALLY SUPPORTED; do not build FUTURE items.

### 2.2 Modules and responsibilities

| Module | Responsibility | May import |
|---|---|---|
| `src/core/schema` | Zod schemas, IDs, reference registry, dataset container | zod |
| `src/core/text` | normaliser, mini-markup parser | core |
| `src/core/references` | generic reference engine over the registry | core |
| `src/core/dataset` | document ↔ state, serialisation, ChangeSets, ID factory | core, immer |
| `src/core/indexes` | derived indexes, incremental | core |
| `src/core/validation` | L1–L3 rules, finding store | core |
| `src/core/commands` | canonical store, commands, undo/redo, delete impact | core, immer |
| `src/core/graph` | traversal, projections, route search, derived scope | core |
| `src/core/migrations` | schema migration runner and steps | core |
| `src/chem` | RDKit adapter, sanitiser, L4 checks | core |
| `src/search` | search documents, MiniSearch service | core |
| `src/layout` | ELK adapter, fallback layout | core |
| `src/io` | import/export, packages, legacy v6 importer | core |
| `src/persistence` | Dexie adapter, write queue, snapshots, locks | core |
| `src/workers` | RPC and worker entry points composing services | core, chem, search, layout, io |
| `src/render` | Scene builder, SVG renderer, viewport, image export | core, layout, ui |
| `src/ui` | design tokens, primitives, UI stores, hooks | core |
| `src/features/*` | views and editors (navigator, workbench, inspector, …) | core, services, ui, render |
| `src/app` | composition root, boot, wiring | everything |
| `src/test-support` | generator, arbitraries, fixtures helpers (tests only) | core |

### 2.3 Dependency direction

```
app ─► features ─► ui │ render ─► layout │ chem │ search │ io │ persistence │ workers ─► core
```
Core imports only core, zod and immer. Services never import UI. chem, search and layout are independent. io and persistence never import each other (the app composes them). Features never import each other. No cycles. Enforced by `.dependency-cruiser.cjs` and ESLint (ADR-017).

### 2.4 Data flow

```
user intent → command envelope → CanonicalStore.dispatch
   → Immer patches → L1–L3 validateTouched → (ERROR ⇒ reject)
   → commit: revision+1, history entry, ChangeSet
   → fan-out: indexes.apply · finding store · search worker · compute replica · persistence queue · BroadcastChannel
   → subscribers re-select → projections (memoised) → layout worker → Scene → SVG
```
Incremental validation (`validateTouched`) covers the touched records, their referents, the peers their rules name, and those referrers whose rules read a field that changed: each L2/L3 rule may declare `referencedReads` (which fields of the records its subject refers to it reads), and a rule that declares nothing is re-run on any change (ADR-031; VALIDATION_RULES.md §5). Referrers and peers are re-run only for the rules that read what changed and merged per rule into the finding store (`Validator.validateTouchedByRule`, `FindingStore.replaceForRules`, ADR-032); the command store makes that one call per commit.
Reads never mutate; the only writers are commands, `replaceState` (import/migration/restore) and undo/redo.

### 2.5 Code conventions
Source files ≤ 400 lines (warning > 300; `npm run check:size`); one responsibility per file; colocated unit tests (`x.ts` + `x.test.ts`); named exports only; no default exports except React lazy boundaries; no `any` (use `unknown` + parsing); all public functions typed explicitly; errors as values (`{ok:false,…}`) across module boundaries, exceptions only for programmer errors.

### 2.6 No hardcoding (INV-25)
Code never branches on specific record IDs, names or formulas ("if name === 'Water'"). Special behaviour is data: `entity_display`, caveats, profiles, relationships. `npm run check:hardcode` fails when dataset names or IDs appear as literals in production code.

### 2.7 Anti-overengineering rules
No plugin systems, no generic query languages, no multi-user sync, no server, no ORM, no state-machine libraries, no custom schema DSL. Registries (reference specs, validation rules, projections) are plain arrays of plain objects.

### 2.8 Offline-first
No runtime network requests; fonts, WASM and workers are bundled; data lives on device; export/import is the backup and transfer mechanism; PWA caching in Phase 9.

## 3. Technology decision (summary)

TypeScript strict · React 19 · Vite 7 · Zod 4 (jitless) · Immer · Dexie 4/IndexedDB · Web Locks + BroadcastChannel · custom SVG renderer + d3-zoom · elkjs in a worker (+ fallback) · custom typed worker RPC · RDKit.js (lazy, chem worker) · Ketcher adapter (architecturally supported) · MiniSearch · Zustand · Radix + cmdk + TanStack Virtual · CSS Modules + tokens + bundled IBM Plex · fflate · Vitest + fast-check + fake-indexeddb + Testing Library + Playwright + axe · dependency-cruiser + ESLint · ULID-based prefixed IDs. Full rationale and rejected alternatives: ARCHITECTURE_DECISIONS.md (ADR-001…026).

## 22. Error recovery

Principles: fail visibly, keep memory authoritative, never corrupt stored data, always offer export. Mechanisms: atomic transactions; retrying write queue with visible SaveStatus; boot integrity with quarantine; mandatory snapshots before import/migration/restore; automatic rollback on migration failure; worker restart with replica reload; per-panel error boundaries; persisted editor sessions for crash recovery; degraded modes (no RDKit → names instead of structures; no ELK → fallback layout; no IndexedDB → session-only mode). Failure table: PERSISTENCE.md §12.

## 23. Undo/redo

- Linear global history in the CanonicalStore; each entry = `{label, revisionBefore, revisionAfter, patches, inversePatches, selectionHint}`; capacity 500 entries or 50 MB of patches, oldest dropped first.
- Undo applies inverse patches as a new commit (revision increases, `cause: 'undo'`), so persistence, indexes, search and replicas treat it like any change. Redo re-applies patches. New commands clear the redo stack.
- Undo is validated like any commit; because it restores a previously valid state it cannot fail L1–L3 unless the schema changed, which cannot happen within one history (history is cleared on migration, import and restore).
- Batches (merge, cascade delete, duplicate) are one entry; labels are human-readable ("Delete Ethanal and 3 dependent records").
- Editor sessions have their own local undo; committing a session creates one global entry.
- Selection hints restore focus to what changed. Undo and redo are commands, so they are disabled in read-only tabs.
- Exactness is tested by P-08 and ADV-044/045.

## 26. Data invariants

| ID | Invariant |
|---|---|
| INV-01 | IDs are globally unique across records and nested objects |
| INV-02 | An ID's prefix matches its kind |
| INV-03 | IDs never change; generated IDs are ULIDs, deterministic IDs map the same source entity to the same ID |
| INV-04 | Every reference in committed state resolves |
| INV-05 | References point only to allowed kinds in the same or a lower layer |
| INV-06 | A published reaction has ≥ 1 reactant and ≥ 1 outcome with ≥ 1 product |
| INV-07 | Local and nested references resolve within their owning or named container record |
| INV-08 | Selectivity (major/minor/exclusive…) exists only on outcomes |
| INV-09 | Declared hierarchies are acyclic (classes, concepts, named reactions, topics, reagent composition, route steps, prerequisite_of) |
| INV-10 | Schemas are strict; UI state never appears in records |
| INV-11 | Derived data (graphs, indexes, derived relations, computed chemistry, findings, scope) is never stored as canonical data |
| INV-12 | Committed state has zero L1–L3 ERROR findings |
| INV-13 | No chemistry record requires a topic, chapter or exam to exist |
| INV-14 | Removing all presentation records leaves chemistry valid and unchanged |
| INV-15 | Relationships obey their type spec (endpoint kinds, no self-links, unique symmetric pairs, reverseKind iff reverse_of) |
| INV-16 | Outcome → mechanism variant links resolve (blocking); mechanism atom-map references are checked when structures parse (advisory) |
| INV-17 | Assets are optional: no chemistry exists only as an image; deleting an asset never invalidates chemistry |
| INV-18 | Derived state is recomputable: incremental results equal full rebuilds |
| INV-19 | Serialisation is deterministic: export → import → export is byte-identical |
| INV-20 | Persistence is atomic: one transaction per commit |
| INV-21 | Imports never mutate state before confirmation and apply atomically after a snapshot |
| INV-22 | All traversals and searches are bounded and terminate on cyclic data |
| INV-23 | No silent loss: unmapped legacy/unknown data is preserved in `provenance.legacy.unmapped` and reported |
| INV-24 | Validation never modifies data; fixes are explicit commands |
| INV-25 | Code never branches on specific record IDs or names |
| INV-26 | Edges are never deduplicated by endpoints |
| INV-27 | Undo/redo restore exact states |
| INV-28 | Exactly one tab writes |
| INV-29 | Chemistry never references curriculum or presentation; exam scope is derived |
| INV-30 | No exam name, exam year or syllabus field exists in the chemistry schema |

---

## A. Capability classification

**REQUIRED NOW (Phases 1–10):** canonical layered model with nested IDs; generic reference engine; commands, exact undo/redo, delete impact, merge, duplicate; L1–L4 validation; indexes; navigator, reaction, precursor, reagent, named-reaction, mechanism and syllabus projections; route search; IndexedDB persistence, snapshots, quarantine, multi-tab lock; JSON and package import/export with preview; v6/v4 legacy import; RDKit parsing, depiction and L4 checks; MiniSearch search and command palette; SVG renderer with LOD, culling, bundling and overflow; inspector with progressive disclosure; authoring workbench with editor sessions, quick entry and review queue; text-based structure entry; syllabus versioning with derived scope and diff; SVG/PNG export; keyboard, touch and screen-reader support; CSP and caps; PWA offline cache; Diagnostics; demo dataset and generator; the full test matrix.

**ARCHITECTURALLY SUPPORTED (seams exist; not built):** structure drawing (Ketcher behind `StructureEditor`); substructure search (RDKit in chem worker); reaction SMARTS matching of transformations; atom-mapped reaction checks and arrow-pushing animation (atom maps and electron movements are in the schema); WebGL overview renderer (consumes Scene); SQLite-WASM/OPFS storage (behind `PersistenceAdapter`); concept-map view (new ProjectionDefinition); dark theme (tokens); OpenChemLib fallback toolkit; workspace export of UI state.

**FUTURE (not designed in detail):** multi-user sync and sharing; cloud backup; spaced-repetition/quiz modes built on caveats and traps; question-bank linking; AI-assisted authoring; mobile-native packaging; other exams and subjects beyond organic chemistry.

## B. Self-audit against the risk list

| Risk | Where it could appear | Mitigation in this design | Residual risk |
|---|---|---|---|
| Relapse into a single file / god objects | early phases under time pressure | 400-line limit, module rules, feature isolation, all enforced in `npm run check` | low |
| Graph treated as source of truth | projections cached "for speed" | INV-11, no graph fields in schema, projections pure and memoised | low |
| Reaction-specific hacks | special cases like water, KOH, AlCl₃ | data-driven display/caveats/profiles; hardcode check | low |
| Over-engineering | registries, workers, abstractions | only three registries; FUTURE list explicit; ADR-010 defers drawing | medium (workers add complexity; justified by budgets) |
| Under-specified chemistry semantics | outcomes, stages vs routes, reverse reactions | DOMAIN_MODEL.md §6 decision rules and examples; validation rules | medium (authoring discipline still needed) |
| Silent data loss in migration | v6 free-text fields | completeness test, legacy trace, report, review items | low |
| Performance collapse at 5k reactions | projections, validation, layout | incremental everything, bounded traversal, workers, benchmarks with budgets and CI regression checks | medium until Gate B/F measurements |
| Unusable UI at scale (hairball) | navigator with large hubs | hubs, bundling, degree caps, overflow, LOD, list view | medium (tuning in Phase 9) |
| Accessibility as an afterthought | SVG canvas | roving focus, ariaLabels in Scene contract, list view, axe gate | low–medium |
| Security via imported content | names, SVG, URLs, JSON | text-only rendering, sanitiser, CSP, caps, safe parser | low |
| Agent drift from the architecture | multi-session Sonnet execution | CLAUDE.md rules, read map, PROJECT_STATE.json, amendment procedure, gates | medium (needs gate reviews) |
| Doc/code divergence | schemas evolve | code is the source of truth; docs updated in the same commit; amendment log | medium |
| Token budget exhaustion per session | large docs | per-phase read map; step sizing; state file | low–medium |
| Chemistry content errors | demo and seed data authored by AI | citations, review status, verified-only-by-human rule, caveats; curriculum marked REVIEW REQUIRED | medium (human verification required) |
| Syllabus inaccuracy | exam coverage | provisional versions, CUR-005, derived scope, explicit disclaimers | low (explicitly unverified) |
| Dependency risk | RDKit, ELK sizes; TS 6 ecosystem | lazy loading, adapters, ADR-020 fallback | low |

## C. Assumptions that fail at scale (§71)

| Assumption that seems fine at 50 reactions | Why it fails at 5,000 | Design response |
|---|---|---|
| Names identify compounds | duplicates, synonyms, renames | opaque IDs; names are data |
| A compound is a node | classes vs species vs reagents diverge | separate kinds; hubs are presentation |
| A reaction is an edge | multi-reactant/product, variants, stages | reaction records; bipartite model |
| "Major product" is a property of a compound | conditions change it | outcome-level selectivity |
| One set of conditions per reaction | temperature-dependent products | condition variants |
| Chapters are fixed | syllabi change yearly | versioned exams, topic tree, derived scope |
| Each reaction belongs to one chapter | cross-chapter reactions | many-to-many topic mappings |
| Showing everything is fine | hairballs, 1,000-edge hubs | bounded projections, caps, overflow, LOD |
| Recompute everything on each edit | O(n) per keystroke | incremental indexes, validation, projections |
| Layout on the main thread | multi-second freezes | layout worker + cache + fallback |
| localStorage is enough | 5 MB cap, sync, no transactions | IndexedDB, atomic transactions |
| Save the whole dataset on every edit | seconds per save, torn writes | per-commit ChangeSet transactions |
| One tab | two tabs overwrite each other | Web Lock single writer |
| Imported data is well-formed | hostile/corrupt files | caps, safe parser, quarantine, preview |
| Validation can block everything | authors need drafts | lifecycle-aware severities; editor sessions |
| Warnings can auto-fix | silent corruption | read-only validation; explicit fix commands |
| Graph traversal terminates | cycles, deep chains | visited sets, limits, truncation reports |
| Undo = keep old copies | memory blow-up | patch-based history with caps |
| Search = substring match | Unicode, subscripts, aliases, typos | normaliser + MiniSearch with fuzzy rules |
| Rendering every node is fine | DOM size, FPS | culling, LOD, render budget |
| Colour conveys meaning | colour-blind users, print | line style + shape + text |
| Images can represent chemistry | not searchable or checkable | structures as data; images optional |
| Derived formula can overwrite input | loses the author's intent | show derived beside entered; explicit accept |
| Class example = class structure | Arenes ≠ anthracene | generic representation; examples separate |
| Reverse view means reversible | false chemistry | forward arrows always; reversibility explicit |
| Deduplicate parallel edges | hides alternative routes | never dedupe; bundle visually |
| Hardcode common special cases | explodes with content | data-driven display, caveats, profiles |
| Every reference can be deleted freely | dangling references | restrict/cascade/detach with impact preview |
| IDs from `Date.now()` / counters | collisions across imports | ULIDs; deterministic import IDs |
| Tests with hand-made small data suffice | scale bugs appear late | seeded generator at four tiers and six shapes |
| One schema forever | new needs every term | versioned schema + migrations + frozen fixtures |
| The agent remembers the architecture | new sessions start blank | CLAUDE.md, read map, state file, enforcement |
| Performance can be fixed later | architecture decides it | budgets defined now; benchmarks from Phase 2 |
| Exam scope can be stored per record | changes each year across thousands of records | derived scope with explicit overrides |
| Mechanisms are text | cannot be reused, checked or animated | structured steps with atom maps (text allowed as summary) |
| Assets can live inside records | huge records, slow parsing | separate blob store, hashed, referenced |
