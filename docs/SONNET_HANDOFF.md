# Sonnet Handoff

Package sections **#30 Sonnet Execution Specification** (items 1–20) and **#31 Sonnet Master Implementation Prompt** (§21). This file is written for the implementing agent. It is complete enough to start any phase without reading every other document; the read map (IMPLEMENTATION_PLAN.md §4) says which details to open per phase.

## 1. Stack
TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), React 19, Vite 7, Zod 4 (`z.config({ jitless: true })`), Immer 10, Dexie 4 (IndexedDB), elkjs, RDKit.js MinimalLib, MiniSearch, Zustand, Radix UI + cmdk + TanStack Virtual, d3-zoom, CSS Modules + tokens, Fontsource IBM Plex, fflate, Vitest + fast-check + fake-indexeddb + Testing Library/jsdom + Playwright + axe, ESLint 9 + typescript-eslint, dependency-cruiser. Node: `.nvmrc` says `24` (the maintainer's toolchain, and every run recorded in PROGRESS.md and the gate packets, is Node 24.21.0); `package.json` `engines.node` stays `>=22`. Dependencies beyond Phase 1 are added in the phase that needs them (IMPLEMENTATION_PLAN.md §2). Version policy: ADR-020.

## 2. Repository structure
```
CLAUDE.md                 rules for every session (read first)
docs/                     architecture package; PROJECT_STATE.json + PROGRESS.md track state
data/seed/                demo dataset (Phase 1)
data/fixtures/schema/v1/  schema fixtures (minimal exists; maximal + invalid in Phase 1)
data/fixtures/legacy/     v6/v4 legacy fixtures + oracle (frozen)
scripts/                  check-file-size.mjs, check-hardcode.mjs
src/core/{schema,text,references,dataset,indexes,validation,commands,graph,migrations}
src/{chem,search,layout,io,io/legacy-v6,persistence,workers/rpc}
src/render/{scene,svg,viewport,export}
src/ui/{design,primitives,state,hooks}
src/features/{navigator,reaction-explorer,precursor-explorer,reagent-explorer,named-reactions,mechanisms,syllabus,search,workbench,inspector,diagnostics}
src/app/                  composition root
src/test-support/         generator, arbitraries (test-only)
tests/{property,integration,adversarial,perf,e2e}
```

## 3. Dependency direction
`app → features → ui | render → layout | chem | search | io | persistence | workers → core`. `src/core` imports only core, `zod`, `immer`, and uses no DOM, storage, network, `Date.now` or `Math.random`. chem/search/layout do not import each other; io and persistence do not import each other; features do not import each other; no cycles. Enforced by `npm run lint:deps` and ESLint.

## 4. Module responsibilities
See ARCHITECTURE.md §2.2 (table). In one line each: schema = truth; references = generic reference engine; dataset = serialisation + ChangeSets + IDs; indexes = derived lookups; validation = L1–L3 rules; commands = the only way to change data, with undo; graph = projections and route search; migrations = version steps; chem = RDKit adapter and L4; search = MiniSearch; layout = ELK; io = import/export/legacy; persistence = IndexedDB; workers = RPC and worker entries; render = Scene and SVG; ui = tokens, primitives, UI stores; features = views and editors; app = wiring.

## 5. Canonical schema
`src/core/schema/` (verified to type-check). 22 record kinds in five layers (DOMAIN_MODEL.md §1). Key rules: strict objects; no defaults/transforms; branded prefixed IDs; nested objects have IDs; references declared in `references.ts` (restrict/cascade/detach); reactions have participants, stages, condition variants, outcomes (selectivity lives here), intermediates; mechanisms have variants → steps with atom-mapped bond changes and electron movements; curriculum is layer 3 and never referenced by chemistry; presentation is layer 5. `DatasetDocument` is the file format; `CanonicalState` is the in-memory shape; `CURRENT_SCHEMA_VERSION = 1`.

## 6. Invariants
INV-01…INV-30 in ARCHITECTURE.md §26. Every invariant must be covered by at least one test by Gate F; those tied to Phase 1 by Gate A.

## 7. State ownership
Canonical records (incl. presentation) → `CanonicalStore`, persisted in `records`. Derived (indexes, projections, findings, search index, layouts, depictions) → services, never canonical. UI state (selection, viewport, expansion, panels, filters, active exam version) → Zustand, persisted tolerantly in `uiState`. Drafts → editor sessions in `editorSessions`. Details: UI_ARCHITECTURE.md §4.

## 8. Graph semantics
Bipartite hypergraph (substances ↔ reactions); every view is a registered, bounded, deterministic `ProjectionDefinition`; stated vs inferred edges; arrows always forward (precursor view reverses layout only); edges never deduplicated, only bundled; unanchored reactions always listed; derived relations never stored; truncation always reported. GRAPH_SEMANTICS.md.

## 9. Persistence contracts
`src/persistence/contracts.ts`: DB `orn` v1, stores `DB_STORES`, `PersistenceAdapter` (serial write queue, one transaction per write, `getStatus`, derived cache, snapshots, assets, editor sessions, uiState, quota; Dexie implementation in `src/persistence`, implemented step by step in Phase 3), `WriterLock` (`acquire` → acquired / held_elsewhere / unsupported, `whenAcquired`, `release`), `ChangeChannel` and `ChangeMessage` (multi-tab, ADR-033; the real Web Locks and BroadcastChannel are injected: `web-locks.ts`), `SaveStatus`, `OpenResult` (read-write / read-only / unavailable). Boot sequence, import pipeline, snapshots, multi-tab, failure table: PERSISTENCE.md.

## 10. Validation contracts
`src/core/validation/contracts.ts`: `Finding`, `ValidationRule` (id, level, kinds, defaultSeverity, scope, check; optional `watches`, `peers`, `referencedReads` (ADR-031), `peerReads` (ADR-032)), `Validator` (parseRecord, scopeOf, validateTouched, validateTouchedByRule, commitTouched, validateAll; incremental calls take the previous state), `FindingStore` (replaceForSubjects, replaceForRules). Severities ERROR / WARNING / INFO / REVIEW_REQUIRED; L1–L3 ERROR blocks commits; L4 never blocks; lifecycle-aware rules. Catalogue with IDs: VALIDATION_RULES.md §3.

## 11. API contracts
All in `contracts.ts` files: `core/dataset` (ChangeSet), `core/references` (ReferenceEngine, DeleteImpact), `core/indexes` (ReadonlyIndexes, IndexEngine), `core/commands` (DomainCommand, CommandEnvelope, CommitResult, CanonicalStore, CommandContext, EditorSession), `core/graph` (Projection, ProjectionRequest, ProjectionDefinition, TraversalLimits, RouteQuery), `core/migrations`, `core/text`, `io` (IMPORT_LIMITS, ImportPreview, ImportPlan, ExportOptions, LegacyImportReport), `layout`, `chem`, `search`, `render/scene`, `workers/rpc` (RpcMessage, worker APIs). Implement against these; change them only via the amendment procedure (CLAUDE.md §7).

## 12. UI architecture
Shell: top bar (palette, exam scope, undo/redo, import/export), mode rail (Navigator, Reactions, Precursors, Reagents, Named, Mechanisms, Syllabus, Workbench), canvas, inspector (L1–L5 progressive disclosure), status bar (save state, finding counts). Visual language tokens and glyphs: UI_ARCHITECTURE.md §3. Authoring through editor sessions with live validation and explicit commit (§7–§8). Interaction and keyboard map (§10). Accessibility (§11).

## 13. Rendering architecture
Projection → LayoutRequest (worker, deterministic, cached, cancellable) → Scene (pure) → layered React SVG; d3-zoom writes one transform imperatively (no React renders on pan/zoom); LOD thresholds and render budget (400 nodes / 800 edges); viewport culling via grid index; depictions as `<image>` from sanitised SVG; export uses the same Scene. UI_ARCHITECTURE.md §6.

## 14. Performance rules
Budgets: PERFORMANCE_ARCHITECTURE.md §2 (commit < 16 ms, projection < 16 ms, layout < 300 ms in worker, search < 50 ms, no main-thread task > 50 ms, cold boot < 2.5 s at 2k/5k). Incremental everything; bounded traversals; heavy work in workers; no JSON.stringify equality in hot paths; benchmarks from Phase 2 (`tests/perf`, judged on median p99 of 3 fresh-process runs, PERFORMANCE_ARCHITECTURE.md §9; gate rule in TEST_STRATEGY.md §6). `npm run bench:compare` is run manually at gates; no CI workflow runs it yet.

## 15. Testing requirements
Levels, fixtures, determinism rules, coverage targets: TEST_STRATEGY.md §1–§2. Property tests P-01…P-11 (§4). Adversarial matrix ADV-001…058 (§5) with phase and gate per row. Demo dataset spec (§3). Gates A–F (§6).

## 16. Current phase
The current phase, completed steps, gate statuses and next step are recorded in `docs/PROJECT_STATE.json` (read it every session; it is the only place they are kept). Do not restate them here. History and decisions: `docs/PROGRESS.md`.

## 17. Next phase
Named by the `nextPhase` / `nextStep` fields of `docs/PROJECT_STATE.json`; its title and scope are in IMPLEMENTATION_PLAN.md §2. Do only that step. (When this was last updated: Phase 4 plan review next; Gates A, B, C passed.)

## 18. Forbidden shortcuts
1. Storing graphs, edges, layouts, derived relations, computed chemistry, scope or findings in records.
2. Encoding reactions as edges or selectivity on species/participants.
3. Using names as identifiers or matching records by name in logic (except import matching and duplicate detection through the normaliser).
4. Branching on specific IDs/names ("water", "KOH", "AlCl3"); use data (display, caveats, profiles).
5. `innerHTML`/`dangerouslySetInnerHTML`/`eval`/`new Function`; inlining SVG from data.
6. localStorage/sessionStorage for anything.
7. Unbounded traversal or recursion; silent truncation.
8. Mutating state outside commands; writing to IndexedDB outside the persistence queue.
9. Auto-fixing data during validation, import or migration without an explicit, reported decision.
10. Dropping unknown legacy fields.
11. Putting chemistry logic in React components or UI stores.
12. Files over 400 lines; cross-feature imports; services importing UI.
13. Adding dependencies not listed for the current phase without an ADR.
14. Weakening a test or a rule to make CI pass.
15. Building FUTURE capabilities (ARCHITECTURE.md §A) or ARCHITECTURALLY SUPPORTED ones before their phase.

## 19. Exact commands
```bash
nvm use                      # Node 24 (.nvmrc; engines >=22)
npm install                  # first time: creates package-lock.json (commit it)
npm run dev                  # Vite dev server (http://localhost:5173)
npm run build                # typecheck + production build (CSP injected)
npm run preview              # serve the production build
npm run typecheck            # tsc -p tsconfig.json && tsc -p tsconfig.node.json
npm run lint                 # ESLint
npm run lint:deps            # dependency-cruiser boundary rules
npm run check:size           # ≤ 400 lines per source file
npm run check:hardcode       # no dataset IDs/names in production code
npm run check:control-chars  # no raw control characters (NUL etc.) in docs, data, source
npm run check:bench-budgets  # every bench() has a tests/perf/budgets.mjs entry and vice versa (static)
npm test                     # all Vitest tests
npm run test:property        # property tests only
npm run test:adversarial     # adversarial matrix only
npm run test:timing          # wall-clock budget assertions (tests/timing); gates only, NOT part of check or test:coverage
npm run bench                # benchmarks (tests/perf), console output only
npm run bench:baseline       # regenerate tests/perf/baseline.json (mean/p75/p99/sample count); gates only
npm run bench:compare        # fail if any entry's p99 regresses > 20% against baseline.json; gates only
npm run e2e                  # Playwright (available from Phase 5: npx playwright install first)
npm run check                # everything required before each commit
```
Single test file: `npx vitest run src/core/schema/schema.smoke.test.ts`. The app must be served over http(s); `file://` is unsupported.

## 20. Definition of done per phase
Global DoD and per-phase DoD: IMPLEMENTATION_PLAN.md §1 and §3; gate criteria: TEST_STRATEGY.md §6. At a
gate, the implementing agent writes the packet and its self-review, then stops: it never marks a gate
passed and never tags `phase-N`. The human reviewer's verdict is recorded in PROGRESS.md first; a
separate session then tags `phase-N` once the verdict is passed.

---

## 21. Master implementation prompt (#31)

Copy this at the start of each implementation session, filling in the step.

```
You are implementing the Organic Reaction Navigator (ORN), an offline-first TypeScript/React app
for JEE organic chemistry. The architecture is fixed and documented in this repository.

Session protocol:
1. Read CLAUDE.md and docs/PROJECT_STATE.json. Then read ONLY the documents listed for the current
   phase in docs/IMPLEMENTATION_PLAN.md §4 (read map). Do not read other docs unless blocked.
2. Implement exactly the next step: Phase <N>, step <N.S> — <title from IMPLEMENTATION_PLAN.md §2>.
   Do not start the following step.
3. Implement against the existing contracts (contracts.ts files) and schemas in src/core/schema.
   If a contract or schema must change, follow the amendment procedure in CLAUDE.md §7 and record it.
4. Write tests first or alongside code, at the levels TEST_STRATEGY.md requires. Cover every
   invariant and ADV row this step touches.
5. Respect every rule in CLAUDE.md, especially: chemistry data is canonical and graphs are derived;
   no reaction-specific hacks; no silent data loss or silent fixes; bounded computation; files ≤ 400
   lines; module boundaries; no HTML injection; no localStorage.
6. Run `npm run check` until it passes. Never weaken a test or rule to pass.
7. Update docs/PROGRESS.md (what was done, decisions, open items, version notes) and
   docs/PROJECT_STATE.json (currentPhase, completedSteps, nextStep, gates), then commit with
   message "phase-<N>.<S>: <summary>".
8. End the session with a short report: what changed, test counts, check status, next step, any
   REVIEW REQUIRED items or open questions for the human. At a gate step, write the packet and its
   self-review, record that the reviewer's verdict is pending in PROGRESS.md, then stop: never mark
   the gate passed and never tag `phase-N`. A separate session tags `phase-N` once a human reviewer's
   verdict is recorded as passed.

If something in the docs is contradictory or impossible, stop, explain the conflict precisely, and
propose the smallest amendment instead of improvising a workaround.
```
