// Budget metadata for tests/perf/*.bench.ts entries (docs/PERFORMANCE_ARCHITECTURE.md §2), keyed by the
// benchmark's full name (`${describe title} > ${bench name}`, exactly as Vitest reports it). Read by
// scripts/bench-report.mjs, which joins this with the measured stats (mean/p75/p99/sampleCount) from a
// `vitest bench` run. Kept as plain data, alongside the bench files it describes, so a renamed describe or
// bench title is caught immediately (bench-report.mjs throws on an unmatched benchmark — nothing silent,
// CLAUDE.md §1.5) rather than silently dropped from baseline.json.
//
// `budgetMs` is the docs/PERFORMANCE_ARCHITECTURE.md §2 row that applies, or `null` when no row exists.
// `informalBudgetMs` records a budget compared against only informally (noted in prose, no §2 row) so
// bench-report.mjs can still compute a pass/fail without inventing a §2 row that does not exist.
// Verdicts are computed on p99 (a conservative stand-in for the §2 budgets' p95 — vitest bench does not
// report p95; see baseline.json's own note) as of step 2.9; the Gate B packet's original verdicts were
// computed on single-run means, which this replaces.

export const BUDGETS = {
  'commit (design tier, dense) > dispatch: update one species (notes)':
    { operation: 'commit: dispatch (update one species)', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Commit, accepted or rejected' },
  'commit (design tier, hub_explosion) > dispatch: update one species (notes)':
    { operation: 'commit: dispatch (update one species)', tier: 'design', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected' },
  'commit (design tier, dense) > undo, then redo':
    { operation: 'commit: undo + redo (one pair)', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Undo / redo', note: 'combined; each half well under 16 ms alone' },
  'commit (design tier, hub_explosion) > undo, then redo':
    { operation: 'commit: undo + redo (one pair)', tier: 'design', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Undo / redo', note: 'combined; each half well under 16 ms alone' },
  'commit (design tier, dense) > rejected commit: strips a published reaction to zero participants (incremental rollback)':
    { operation: 'commit: rejected (incremental rollback)', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Commit, accepted or rejected' },
  'commit (design tier, hub_explosion) > rejected commit: strips a published reaction to zero participants (incremental rollback)':
    { operation: 'commit: rejected (incremental rollback)', tier: 'design', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected' },
  'scopeOf (design tier, dense) > scopeOf once, touching the hub':
    { operation: 'scopeOf: once, on the design-tier hub', tier: 'design', shape: 'dense', budgetMs: null },
  'scopeOf (design tier, hub_explosion) > scopeOf once, touching the hub':
    { operation: 'scopeOf: once, on the design-tier hub', tier: 'design', shape: 'hub_explosion', budgetMs: null },
  "scopeOf (design tier, dense) > scopeOf twice, touching the hub (today's store.commit() plus validateTouched)":
    { operation: "scopeOf: twice (today's store.commit() pattern), design-tier hub", tier: 'design', shape: 'dense', budgetMs: null, openItem: 'scopeOf computed twice per commit' },
  "scopeOf (design tier, hub_explosion) > scopeOf twice, touching the hub (today's store.commit() plus validateTouched)":
    { operation: "scopeOf: twice (today's store.commit() pattern), design-tier hub", tier: 'design', shape: 'hub_explosion', budgetMs: null, openItem: 'scopeOf computed twice per commit' },
  'scopeOf (design tier, dense) > validateTouched, touching the hub (one scopeOf call plus rule execution)':
    { operation: 'validateTouched: on the design-tier hub', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Commit (validateTouched is inside it)' },
  'scopeOf (design tier, hub_explosion) > validateTouched, touching the hub (one scopeOf call plus rule execution)':
    { operation: 'validateTouched: on the design-tier hub', tier: 'design', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit (validateTouched is inside it)' },
  'scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions > scopeOf once, touching the hub':
    { operation: 'scopeOf: once, on the ADV-012 literal hub (1,000 reactions)', tier: 'adv-012', shape: 'hub_explosion', budgetMs: null },
  'scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions > scopeOf twice, touching the hub':
    { operation: 'scopeOf: twice (today\'s store.commit() pattern), ADV-012 literal hub', tier: 'adv-012', shape: 'hub_explosion', budgetMs: null, openItem: 'scopeOf computed twice per commit' },
  'scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions > validateTouched, touching the hub':
    { operation: 'validateTouched: ADV-012 literal hub, no previous state given (every referrer re-validated: the safe fallback)', tier: 'adv-012', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: '1,000 referrers ≥ 500. Without a previous state nothing can be diffed (ADR-031); the store always passes one, so this is the fallback, not the commit path' },
  'scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions > validateTouched, renaming the hub (previous state given, as the store does)':
    { operation: 'validateTouched: ADV-012 literal hub, renamed (previous state given)', tier: 'adv-012', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected', note: 'the whole-subject API (validateTouched); the store has called validateTouchedByRule since step 2.13. Field-aware scope (ADR-031): a rename is a field no referrer rule reads' },
  "scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions > validateTouched, changing the hub's review lifecycle (a field RVW-002 reads: every referrer re-validated)":
    { operation: "validateTouched: ADV-012 literal hub, review lifecycle changed (a field referrer rules read)", tier: 'adv-012', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: '1,000 referrers ≥ 500; RVW-002 reads `review` of every referenced record, so all referrers are re-validated (whole records: FindingStore replaces per subject)' },
  'scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions > validateTouchedByRule, renaming the hub (previous state given, as the store does)':
    { operation: 'validateTouchedByRule: ADV-012 literal hub, renamed (the store\'s call, previous state given)', tier: 'adv-012', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected', note: 'step 2.13, ADR-032: what the command store calls; a rename is a field no referrer rule reads' },
  "scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions > validateTouchedByRule, changing the hub's review lifecycle (per rule: RVW-002 only on each referrer)":
    { operation: 'validateTouchedByRule: ADV-012 literal hub, review lifecycle changed (per rule)', tier: 'adv-012', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: 'step 2.13, ADR-032: a structural edit (Phase 9 exception if over 16 ms); only RVW-002 re-runs on each of the ~1,000 referrers' },
  'commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > dispatch: update the hub species (notes)':
    { operation: 'commit: dispatch (update the design-tier "like water" hub)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected' },
  'commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > validateTouched, touching the hub':
    { operation: 'validateTouched: "like water" hub, no previous state given (every referrer re-validated: the safe fallback)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: '1,000 referrers ≥ 500. Without a previous state nothing can be diffed (ADR-031); the store always passes one, so this is the fallback, not the commit path' },
  'commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > validateTouched, renaming the hub (previous state given, as the store does)':
    { operation: 'validateTouched: "like water" hub, renamed (previous state given)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected', note: 'the whole-subject API (validateTouched); the store has called validateTouchedByRule since step 2.13. Field-aware scope (ADR-031): a rename is a field no referrer rule reads' },
  "commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > validateTouched, changing the hub's review lifecycle (a field RVW-002 reads: every referrer re-validated)":
    { operation: 'validateTouched: "like water" hub, review lifecycle changed (a field referrer rules read)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: '1,000 referrers ≥ 500; RVW-002 reads `review` of every referenced record, so all referrers are re-validated' },
  'commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > validateTouchedByRule, renaming the hub (previous state given, as the store does)':
    { operation: 'validateTouchedByRule: "like water" hub, renamed (the store\'s call, previous state given)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected', note: 'step 2.13, ADR-032: what the command store calls' },
  "commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > validateTouchedByRule, changing the hub's review lifecycle (per rule: RVW-002 only on each referrer)":
    { operation: 'validateTouchedByRule: "like water" hub, review lifecycle changed (per rule)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: 'step 2.13, ADR-032: a structural edit' },
  "commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > dispatch: change the hub's review lifecycle (every referrer re-validated)":
    { operation: 'commit: dispatch (like-water hub, review lifecycle changed)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: 'a whole commit that changes a field referrer rules read; alternates draft/published' },

  'commit — class hub (design tier, hub_explosion: every species lists it) > dispatch: rename the class hub':
    { operation: 'commit: dispatch (rename the class hub, ~1,400 species referrers)', tier: 'design-class-hub', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected', note: 'step 2.13: the class hub every hub_explosion species lists; an ordinary edit' },
  'commit — class hub (design tier, hub_explosion: every species lists it) > dispatch: edit the class hub notes':
    { operation: 'commit: dispatch (edit the class hub notes, ~1,400 species referrers)', tier: 'design-class-hub', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected', note: 'step 2.13: an ordinary edit' },
  'commit — class hub (design tier, hub_explosion: every species lists it) > dispatch: move the class hub under another parent (and back)':
    { operation: 'commit: dispatch (move the class hub to another parent, ~1,400 species referrers)', tier: 'design-class-hub', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: 'step 2.13: parentIds is read by every species referrer (SPC-006 reads the class ancestry), so this is a backstop-row case' },

  'projection build (design tier, dense) > navigator, focused on the hub':
    { operation: 'projection: navigator, focused on the hub', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Projection build' },
  'projection build (design tier, hub_explosion) > navigator, focused on the hub':
    { operation: 'projection: navigator, focused on the hub', tier: 'design', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Projection build' },
  'projection build — ADV-012 literal case: one hub, 1,000 reactions > navigator, focused on the hub':
    { operation: 'projection: navigator, focused on the hub', tier: 'adv-012', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Projection build', note: 'only 1,000 total reactions in this scenario; navigator\'s cost tracks total reactions in state, not the focused hub\'s degree' },
  'projection build (design tier, dense) > reaction_explorer, focused on the hub':
    { operation: 'projection: reaction_explorer, focused on the hub', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Projection build' },
  'projection build (design tier, hub_explosion) > reaction_explorer, focused on the hub':
    { operation: 'projection: reaction_explorer, focused on the hub', tier: 'design', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Projection build' },
  'projection build (design tier, dense) > precursor_explorer, focused on the hub':
    { operation: 'projection: precursor_explorer, focused on the hub', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Projection build' },
  'projection build (design tier, hub_explosion) > precursor_explorer, focused on the hub':
    { operation: 'projection: precursor_explorer, focused on the hub', tier: 'design', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Projection build' },
  'projection build — ADV-012 literal case: one hub, 1,000 reactions > precursor_explorer, focused on the hub':
    { operation: 'projection: precursor_explorer, focused on the hub', tier: 'adv-012', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Projection build', note: 'the ADV-012 hub is a pure reactant here (never a product), so there is nothing to walk backward from it; not a meaningful stress case for this view' },
  'projection build — stress tier, dense, 400 anchored hubs > navigator, focused on the hub':
    { operation: 'projection: navigator, focused on the hub, stress tier (400 anchors)', tier: 'stress', shape: 'dense', budgetMs: null, informalBudgetMs: 32, note: 'PERFORMANCE_ARCHITECTURE.md §1: stress tier budgets may degrade <= 2x the design-tier 16 ms row, so 32 ms here is an informal allowance, not a §2 row of its own (docs/PROGRESS.md step 2.11)' },

  'route search (design tier, dense) > searchRoutes to the hub, no startFrom (any source)':
    { operation: 'route search: searchRoutes to the hub, no startFrom', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Projection build (route search has no budget row of its own; bounded the same way)' },
  'route search (design tier, chain) > searchRoutes to the hub, no startFrom (any source)':
    { operation: 'route search: searchRoutes to the hub, no startFrom', tier: 'design', shape: 'chain', budgetMs: 16, budgetRow: 'Projection build (route search has no budget row of its own; bounded the same way)' },

  'validateAll (design tier, dense) > validateAll, whole state':
    { operation: 'validateAll: whole state', tier: 'design', shape: 'dense', budgetMs: 3000, budgetRow: 'Full validation L1–L3 (design target)' },
  'validateAll (design tier, hub_explosion) > validateAll, whole state':
    { operation: 'validateAll: whole state', tier: 'design', shape: 'hub_explosion', budgetMs: 3000, budgetRow: 'Full validation L1–L3 (design target)' },
  'persist (design tier, hub_explosion) > enqueue + coalesce, ordinary edit (1 record)':
    { operation: 'persist: enqueue + coalesce, ordinary edit (synchronous part of writeChanges)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.1: no PERFORMANCE_ARCHITECTURE.md §2 row; informal, part of the main-thread commit cost' },
  'persist (design tier, hub_explosion) > enqueue + coalesce, hub edit (1,000+ records in one ChangeSet)':
    { operation: 'persist: enqueue + coalesce, hub edit (replaceReferences on the 1,000-reaction hub)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.1: no §2 row; informal' },
  'persist (design tier, hub_explosion, prepare rows) > prepare transaction rows, ordinary edit (no IndexedDB)':
    { operation: 'persist: prepare transaction rows, ordinary edit (our code only)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.1 review: no §2 row; informal' },
  'persist (design tier, hub_explosion, prepare rows) > prepare transaction rows, hub edit (no IndexedDB)':
    { operation: 'persist: prepare transaction rows, hub edit (~1,000 records, our code only)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.1 review: no §2 row; informal' },
  'persist (design tier, hub_explosion, flush on fake-indexeddb) > flush on fake-indexeddb, ordinary edit (smoke; dominated by fake-indexeddb, not real IndexedDB)':
    { operation: 'persist: one flush on fake-indexeddb, ordinary edit (smoke)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'smoke measurement; dominated by fake-indexeddb (a bare Dexie put costs the same); real timing is traced at Gates E/F. The hub-edit flush entry was removed in the step 3.1 review' },
  'snapshot (design tier, dense) > build: serialise + compress':
    { operation: 'snapshot: build (serialise with L1 + compress)', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 3.2: no PERFORMANCE_ARCHITECTURE.md §2 row; informal (hosted by the compute worker from Phase 4); SLOW_BENCH_OPTIONS, few samples' },
  'snapshot (design tier, dense) > restore without the store: decode + migrate + L1 parse + state':
    { operation: 'snapshot: restore without the store (decode + migrate + L1 parse + state)', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 3.2: informal; SLOW_BENCH_OPTIONS, few samples' },
  'snapshot restore (design tier, dense, whole) > restoreSnapshot: decode, L1, pre_restore build, replaceState (L1-L3)':
    { operation: 'snapshot: restoreSnapshot whole (decode, L1, pre_restore build, replaceState L1-L3)', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 3.2: informal; in-memory port, no IndexedDB; replaceState re-validates the whole state (compare the 3 s full-validation row)' },
  'boot load (design tier, dense) > bulk read from fake-indexeddb (readCommitted; not our code)':
    { operation: 'boot: bulk read on fake-indexeddb (not our code)', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 3.3: no §2 row for the parts (cold boot < 2.5 s is judged at Gate E in a real browser); informal; fake-indexeddb costs far more than real IndexedDB' },
  'boot load (design tier, dense) > per-record L1 + state (assembleState over the rows)':
    { operation: 'boot: per-record L1 + state assembly (our code)', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 3.3: informal; SLOW_BENCH_OPTIONS, few samples' },
  'boot load (design tier, dense) > index build (coreIndexEngine.build)':
    { operation: 'boot: index build (core)', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 3.3: informal; SLOW_BENCH_OPTIONS, few samples' },
  'boot load (design tier, dense) > validateAll (L1-L3, findings returned to the app)':
    { operation: 'boot: validateAll', tier: 'design', shape: 'dense', budgetMs: 3000, budgetRow: 'Full validation L1–L3 (design target)', note: 'the same operation as validate.bench.ts, here on the state boot assembled' },
  'boot load (design tier, dense) > whole open(): read + L1 + state + indexes + validateAll + checks + markers (includes the fake-indexeddb read)':
    { operation: 'boot: whole open() (includes the fake-indexeddb read)', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 3.3: informal; cold boot < 2.5 s is judged at Gate E in a real browser' },
  'follower apply (design tier, hub_explosion): read the changed rows on fake-indexeddb > read the changed rows, ordinary edit (1 row; fake-indexeddb, not our code)':
    { operation: 'follower: read the changed rows, ordinary edit (fake-indexeddb, not our code)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.4: no §2 row; informal; fake-indexeddb costs far more than real IndexedDB, real timing is traced at Gates E/F' },
  'follower apply (design tier, hub_explosion): read the changed rows on fake-indexeddb > read the changed rows, hub edit (~1,000 rows; fake-indexeddb, not our code)':
    { operation: 'follower: read the changed rows, hub edit (~1,000 rows; fake-indexeddb, not our code)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.4: informal; SLOW_BENCH_OPTIONS, few samples' },
  'follower apply (design tier, hub_explosion): L1 parse of the rows read > L1 parse, ordinary edit (1 row)':
    { operation: 'follower: L1 parse of the rows read, ordinary edit (our code)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.4: informal' },
  'follower apply (design tier, hub_explosion): L1 parse of the rows read > L1 parse, hub edit (~1,000 rows)':
    { operation: 'follower: L1 parse of the rows read, hub edit (our code)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.4: informal' },
  'follower apply (design tier, hub_explosion): applyRemote > applyRemote, ordinary edit (our code: patches, incremental indexes, validateTouchedByRule)':
    { operation: 'follower: applyRemote, ordinary edit (our code)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.4: no §2 row; informal; the same work as a writer commit, main thread until Phase 4' },
  'follower apply (design tier, hub_explosion): applyRemote > applyRemote, hub edit (~1,000 records; our code: patches, incremental indexes, validateTouchedByRule)':
    { operation: 'follower: applyRemote, hub edit (~1,000 records; our code)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.4: informal; SLOW_BENCH_OPTIONS; about a writer commit of that edit (dispatch + undo of it measured ~957 ms once, 2 commits); a Phase 4/9 candidate' },
  'commit — writer side (design tier, hub_explosion): replaceReferences on the 1,000-reaction hub > commit: replaceReferences on the 1,000-reaction hub (~1,000 referrers rewritten)':
    { operation: 'commit: replaceReferences on the 1,000-reaction hub (writer side)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 3.4 review, Part A(d): informal, no §2 row; SLOW_BENCH_OPTIONS; a structural edit (Commit on a record with ≥ 500 referrers backstop, 50 ms, is also blown through here); recorded as a Phase 9 exception candidate (PROJECT_STATE.json openItems) pending confirmation with numbers in the Gate C packet; compare against the applyRemote hub-edit entry above' },
  'export full dataset (design tier, dense) > .orn.json':
    { operation: 'export: .orn.json, full dataset', tier: 'design', shape: 'dense', budgetMs: 2000, budgetRow: 'Export full dataset', note: 'step 3.5; assets: none (the generator makes no asset records); SLOW_BENCH_OPTIONS' },
  'export full dataset (design tier, dense) > .ornpkg':
    { operation: 'export: .ornpkg, full dataset', tier: 'design', shape: 'dense', budgetMs: 2000, budgetRow: 'Export full dataset', note: 'step 3.5; assets: none; SLOW_BENCH_OPTIONS' },
  'export full dataset (design tier, hub_explosion) > .orn.json':
    { operation: 'export: .orn.json, full dataset', tier: 'design', shape: 'hub_explosion', budgetMs: 2000, budgetRow: 'Export full dataset', note: 'step 3.5; assets: none; SLOW_BENCH_OPTIONS' },
  'export full dataset (design tier, hub_explosion) > .ornpkg':
    { operation: 'export: .ornpkg, full dataset', tier: 'design', shape: 'hub_explosion', budgetMs: 2000, budgetRow: 'Export full dataset', note: 'step 3.5; assets: none; SLOW_BENCH_OPTIONS' },
  'import parse -> envelope -> L1 (design tier, dense) > .orn.json':
    { operation: 'import: parse -> envelope -> L1, .orn.json', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.6: informal, reported against the 5 s row (which also includes 3.7\'s conflict analysis and preview, not built yet); SLOW_BENCH_OPTIONS; assets: none' },
  'import parse -> envelope -> L1 (design tier, dense) > .ornpkg':
    { operation: 'import: parse -> envelope -> L1, .ornpkg', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.6: informal, reported against the 5 s row; SLOW_BENCH_OPTIONS; assets: none' },
  'import parse -> envelope -> L1 (design tier, hub_explosion) > .orn.json':
    { operation: 'import: parse -> envelope -> L1, .orn.json', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.6: informal, reported against the 5 s row; SLOW_BENCH_OPTIONS; assets: none' },
  'import parse -> envelope -> L1 (design tier, hub_explosion) > .ornpkg':
    { operation: 'import: parse -> envelope -> L1, .ornpkg', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.6: informal, reported against the 5 s row; SLOW_BENCH_OPTIONS; assets: none' },
  'import preview (design tier, dense, into an empty store) > parse (caps, safe parse, envelope, L1)':
    { operation: 'import preview: parse (empty)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (empty); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, dense, into an empty store) > conflict analysis':
    { operation: 'import preview: conflict analysis (empty)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (empty); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, dense, into an empty store) > merged replica (build)':
    { operation: 'import preview: merged replica build (empty)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (empty); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, dense, into an empty store) > merged-replica validation (index build + validateAll)':
    { operation: 'import preview: merged-replica validation (empty)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (empty); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, dense, into an empty store) > parse -> preview (total)':
    { operation: 'import preview: parse -> preview (total) (empty)', tier: 'design', shape: 'dense', budgetMs: 5000, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: the whole parse -> preview path (empty); judged against the 5 s row; SLOW_BENCH_OPTIONS; assets: none; in-process, fake ports (no IndexedDB)' },
  'import preview (design tier, dense, into a design-tier store, every ID conflicting) > parse (caps, safe parse, envelope, L1)':
    { operation: 'import preview: parse (conflicts)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (conflicts); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, dense, into a design-tier store, every ID conflicting) > conflict analysis':
    { operation: 'import preview: conflict analysis (conflicts)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (conflicts); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, dense, into a design-tier store, every ID conflicting) > merged replica (build)':
    { operation: 'import preview: merged replica build (conflicts)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (conflicts); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, dense, into a design-tier store, every ID conflicting) > merged-replica validation (index build + validateAll)':
    { operation: 'import preview: merged-replica validation (conflicts)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (conflicts); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, dense, into a design-tier store, every ID conflicting) > parse -> preview (total)':
    { operation: 'import preview: parse -> preview (total) (conflicts)', tier: 'design', shape: 'dense', budgetMs: 5000, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: the whole parse -> preview path (conflicts); judged against the 5 s row; SLOW_BENCH_OPTIONS; assets: none; in-process, fake ports (no IndexedDB)' },
  'import preview (design tier, hub_explosion, into an empty store) > parse (caps, safe parse, envelope, L1)':
    { operation: 'import preview: parse (empty)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (empty); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, hub_explosion, into an empty store) > conflict analysis':
    { operation: 'import preview: conflict analysis (empty)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (empty); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, hub_explosion, into an empty store) > merged replica (build)':
    { operation: 'import preview: merged replica build (empty)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (empty); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, hub_explosion, into an empty store) > merged-replica validation (index build + validateAll)':
    { operation: 'import preview: merged-replica validation (empty)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (empty); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, hub_explosion, into an empty store) > parse -> preview (total)':
    { operation: 'import preview: parse -> preview (total) (empty)', tier: 'design', shape: 'hub_explosion', budgetMs: 5000, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: the whole parse -> preview path (empty); judged against the 5 s row; SLOW_BENCH_OPTIONS; assets: none; in-process, fake ports (no IndexedDB)' },
  'import preview (design tier, hub_explosion, into a design-tier store, every ID conflicting) > parse (caps, safe parse, envelope, L1)':
    { operation: 'import preview: parse (conflicts)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (conflicts); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, hub_explosion, into a design-tier store, every ID conflicting) > conflict analysis':
    { operation: 'import preview: conflict analysis (conflicts)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (conflicts); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, hub_explosion, into a design-tier store, every ID conflicting) > merged replica (build)':
    { operation: 'import preview: merged replica build (conflicts)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (conflicts); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, hub_explosion, into a design-tier store, every ID conflicting) > merged-replica validation (index build + validateAll)':
    { operation: 'import preview: merged-replica validation (conflicts)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: informal stage of the 5 s row (conflicts); SLOW_BENCH_OPTIONS; assets: none; in-process (Phase 3 note 4)' },
  'import preview (design tier, hub_explosion, into a design-tier store, every ID conflicting) > parse -> preview (total)':
    { operation: 'import preview: parse -> preview (total) (conflicts)', tier: 'design', shape: 'hub_explosion', budgetMs: 5000, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7: the whole parse -> preview path (conflicts); judged against the 5 s row; SLOW_BENCH_OPTIONS; assets: none; in-process, fake ports (no IndexedDB)' },
  'import preview (design tier, dense, into an empty store) > stage functions back to back (parse, analysis, merge, validation)':
    { operation: 'import preview: stage functions back to back (empty)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7 review item c: the comparison row for the total (same work, run next to it); informal; SLOW_BENCH_OPTIONS; in-process, fake ports' },
  'import preview (design tier, dense, into a design-tier store, every ID conflicting) > stage functions back to back (parse, analysis, merge, validation)':
    { operation: 'import preview: stage functions back to back (conflicts)', tier: 'design', shape: 'dense', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7 review item c: the comparison row for the total (same work, run next to it); informal; SLOW_BENCH_OPTIONS; in-process, fake ports' },
  'import preview (design tier, hub_explosion, into an empty store) > stage functions back to back (parse, analysis, merge, validation)':
    { operation: 'import preview: stage functions back to back (empty)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7 review item c: the comparison row for the total (same work, run next to it); informal; SLOW_BENCH_OPTIONS; in-process, fake ports' },
  'import preview (design tier, hub_explosion, into a design-tier store, every ID conflicting) > stage functions back to back (parse, analysis, merge, validation)':
    { operation: 'import preview: stage functions back to back (conflicts)', tier: 'design', shape: 'hub_explosion', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.7 review item c: the comparison row for the total (same work, run next to it); informal; SLOW_BENCH_OPTIONS; in-process, fake ports' },
  'legacy parse -> preview (v6-demo-export.json (22 reactions), into an empty store) > parse -> preview (total)':
    { operation: 'legacy import: parse -> preview (total), v6-demo-export.json (22 reactions)', tier: 'design', shape: 'legacy-demo-22', budgetMs: null, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.11c: informal (22 reactions is not the 5k row); conversion + import pipeline; in-process, fake ports' },
  'legacy parse -> preview (synthetic legacy file, 5,000 reactions, into an empty store) > parse -> preview (total)':
    { operation: 'legacy import: parse -> preview (total), synthetic legacy file, 5,000 reactions', tier: 'design', shape: 'legacy-synthetic-5k', budgetMs: 5000, budgetRow: 'Import 5k reactions (parse -> preview)', note: 'step 3.11c / 3.12: the legacy synthetic 5k file judged against the 5 s row; conversion + import pipeline; few samples, so p99 is the maximum; in-process, fake ports' },
  'rpc round trip (worker_threads) > small payload (add)':
    { operation: 'rpc: round trip, small payload', tier: 'rpc', shape: 'small', budgetMs: null, note: 'step 4.1: no PERFORMANCE_ARCHITECTURE.md §2 row; informal. Real worker_threads, fixture worker echoing its param' },
  'rpc round trip (worker_threads) > ChangeSet-sized payload (about 8 KB echoed)':
    { operation: 'rpc: round trip, ChangeSet-sized payload', tier: 'rpc', shape: 'changeset', budgetMs: null, note: 'step 4.1: informal; what the replica sync sends per commit' },
  'rpc round trip (worker_threads) > about 1 MB payload echoed':
    { operation: 'rpc: round trip, about 1 MB payload', tier: 'rpc', shape: '1mb', budgetMs: null, note: 'step 4.1: informal; structured clone both ways, 10,000 small records' },
  'replaceState (design tier, dense) > in-process: validateAll + index build + commit':
    { operation: 'replaceState: in-process', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 4.2a: no PERFORMANCE_ARCHITECTURE.md §2 row; informal; SLOW_BENCH_OPTIONS, few samples; validateAll + index build + commit, the path before step 4.2a' },
  'replaceState (design tier, dense) > precomputed findings: check + index build + commit':
    { operation: 'replaceState: precomputed', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 4.2a: no PERFORMANCE_ARCHITECTURE.md §2 row; informal; SLOW_BENCH_OPTIONS, few samples; precomputed findings checked and committed; index build stays on main (D2)' },
  'reload (design tier, dense) > in-process: validateAll + index build + commit':
    { operation: 'reload: in-process', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 4.2a: no PERFORMANCE_ARCHITECTURE.md §2 row; informal; SLOW_BENCH_OPTIONS, few samples; validateAll + index build + commit, the path before step 4.2a' },
  'reload (design tier, dense) > precomputed findings: check + index build + commit':
    { operation: 'reload: precomputed', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 4.2a: no PERFORMANCE_ARCHITECTURE.md §2 row; informal; SLOW_BENCH_OPTIONS, few samples; precomputed findings checked and committed; index build stays on main (D2)' },
  'replica applyChanges in the worker code (design tier, hub_explosion) > ordinary edit (one species)':
    { operation: 'replica applyChanges: ordinary edit', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 4.2b: no PERFORMANCE_ARCHITECTURE.md §2 row; informal; worker code, no thread; patches + index apply + validateTouchedByRule with previous' },
  'replica applyChanges in the worker code (design tier, hub_explosion) > hub record edit (rename of the ~1,000-referrer hub species, one record)':
    { operation: 'replica applyChanges: hub record edit', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 4.2b: informal; worker code, no thread; ONE record touched, ~1,000 referrers re-validated by rule, WITH previous (Phase 9 exception 5 scenario)' },
  'replica applyChanges in the worker code (design tier, hub_explosion) > hub edit (replaceReferences on the ~1,000-reaction hub)':
    { operation: 'replica applyChanges: hub edit', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 4.2b: informal; SLOW_BENCH_OPTIONS; worker code, no thread; ~1,000 records touched' },
  'replica validateAll in the worker code (design tier) > dense: validateAll over the replica':
    { operation: 'replica validateAll: whole state', tier: 'design', shape: 'dense', budgetMs: 3000, budgetRow: 'Full validation L1–L3 (design target)' },
  'replica validateAll in the worker code (design tier) > hub_explosion: validateAll over the replica':
    { operation: 'replica validateAll: whole state', tier: 'design', shape: 'hub_explosion', budgetMs: 3000, budgetRow: 'Full validation L1–L3 (design target)' },
  'replica load in the worker code (design tier, dense) > load: freeze + index build + validateAll + finding store':
    { operation: 'replica load', tier: 'design', shape: 'dense', budgetMs: null, note: 'step 4.2b: informal; SLOW_BENCH_OPTIONS; the worker part of loadReplica without the clone' },
  'compute worker in a real thread (design tier, hub_explosion) > applyChanges round trip, ordinary edit':
    { operation: 'compute worker: applyChanges round trip, ordinary edit', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 4.2b: informal; real worker_threads thread running the real compute entry' },
  'compute worker in a real thread (design tier, hub_explosion) > loadReplica round trip, the whole design-tier state (clone out, index build, validateAll, findings back)':
    { operation: 'compute worker: loadReplica round trip, whole state', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 4.2b: informal; SLOW_BENCH_OPTIONS; the clone cost of D3 plus the worker part' },
  'compute worker in a real thread (design tier, hub_explosion) > sender side of that clone: v8.serialize of the design-tier state (blocks the caller)':
    { operation: 'compute worker: sender side of the state clone (v8.serialize)', tier: 'design', shape: 'hub_explosion', budgetMs: null, note: 'step 4.2b: informal; SLOW_BENCH_OPTIONS; a proxy for the main-thread blocking part of postMessage' },
  "import in the worker code (design tier, dense, into an empty store) > importPrepareApply: the merged state's replica (freeze + index build + validateAll)":
    { operation: "import in the worker: prepareApply (empty)", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2c: informal; SLOW_BENCH_OPTIONS; assets: none; the worker part of the apply payload (index build + validateAll of the merged state)" },
  "import in the worker code (design tier, dense, into an empty store) > importPreview: parse -> preview (total)":
    { operation: "import in the worker: parse -> preview (total) (empty)", tier: 'design', shape: 'dense', budgetMs: 5000, budgetRow: 'Import 5k reactions (parse -> preview)', note: "step 4.2c: the whole parse -> preview path in the worker code (Blob in); judged against the 5 s row; SLOW_BENCH_OPTIONS; assets: none; no thread, no IndexedDB" },
  "import in the worker code (design tier, hub_explosion, into a design-tier store, every ID conflicting) > importPrepareApply: the merged state's replica (freeze + index build + validateAll)":
    { operation: "import in the worker: prepareApply (conflicting)", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 4.2c: informal; SLOW_BENCH_OPTIONS; assets: none; the worker part of the apply payload (index build + validateAll of the merged state)" },
  "import in the worker code (design tier, hub_explosion, into a design-tier store, every ID conflicting) > importPreview: parse -> preview (total)":
    { operation: "import in the worker: parse -> preview (total) (conflicting)", tier: 'design', shape: 'hub_explosion', budgetMs: 5000, budgetRow: 'Import 5k reactions (parse -> preview)', note: "step 4.2c: the whole parse -> preview path in the worker code (Blob in); judged against the 5 s row; SLOW_BENCH_OPTIONS; assets: none; no thread, no IndexedDB" },
  "snapshotBuild in the worker code (design tier, dense) > snapshotBuild: serialise + compress the replica":
    { operation: "snapshotBuild in the worker", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2c: no PERFORMANCE_ARCHITECTURE.md §2 row; informal; SLOW_BENCH_OPTIONS; the snapshot bytes without the transfer (same work as the main-thread build of step 3.2)" },
  "import through a real thread (design tier, dense, into an empty store) > importPrepareApply round trip (merged state and findings back)":
    { operation: "compute worker: importPrepareApply round trip", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2c: informal; real worker_threads thread; the merged state and its findings come back (D3)" },
  "import through a real thread (design tier, dense, into an empty store) > receiving side of the merged state: v8.deserialize (blocks the caller)":
    { operation: "compute worker: receiving side of the merged state (v8.deserialize)", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2c: informal; SLOW_BENCH_OPTIONS; a proxy for the main-thread blocking part of receiving a postMessage (D3)" },
  "import through a real thread (design tier, dense, into an empty store) > importPreview round trip (Blob in, plan out)":
    { operation: "compute worker: importPreview round trip", tier: 'design', shape: 'dense', budgetMs: 5000, budgetRow: 'Import 5k reactions (parse -> preview)', note: "step 4.2c: informal beside the 5 s row; real worker_threads thread; the file is a Blob" },
  "restore (design tier, dense): the Phase 3 in-process restore, everything on the main thread > restoreSnapshot in process (read + decode + migrate + strict L1 + pre_restore build + replaceState with validateAll)":
    { operation: "step 4.2d: restoreSnapshot in process", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "restore through a real thread (design tier, dense): end to end, wall clock > restore end to end: read bytes, decode + migrate + L1 + indexes + validateAll in the thread, pre_restore built in the thread, replaceState with precomputed, adoption":
    { operation: "step 4.2d: restore end to end: read bytes, decode + migrate + L1 + indexes + validateAll in the threa", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "restore: what blocks the main thread (design tier, dense) > send: serialise the decode request (the snapshot bytes)":
    { operation: "step 4.2d: send: serialise the decode request", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "restore: what blocks the main thread (design tier, dense) > receive: deserialise the decode answer (state + findings; blocks the caller)":
    { operation: "step 4.2d: receive: deserialise the decode answer", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "restore: what blocks the main thread (design tier, dense) > replaceState with the thread's findings (check + index build on main + commit)":
    { operation: "step 4.2d: replaceState with the thread's findings", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot, the parts on the main thread (design tier, dense) > bulk read from fake-indexeddb (readCommitted; not our code)":
    { operation: "step 4.2d: bulk read from fake-indexeddb", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot, the parts on the main thread (design tier, dense) > per-record L1 + state on main (assembleState over the rows)":
    { operation: "step 4.2d: per-record L1 + state on main", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot, the parts on the main thread (design tier, dense) > send to the worker: serialise the assembled state":
    { operation: "step 4.2d: send to the worker: serialise the assembled state", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot, the parts on the main thread (design tier, dense) > send to the worker, alternative (observation 3): serialise the RAW rows and meta":
    { operation: "step 4.2d: send to the worker, alternative", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot, the parts on the main thread (design tier, dense) > receive from the worker: deserialise the findings (blocks the caller)":
    { operation: "step 4.2d: receive from the worker: deserialise the findings", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot, the parts on the main thread (design tier, dense) > in process: index build + validateAll (what open() ran on main before)":
    { operation: "step 4.2d: in process: index build + validateAll", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot, the parts on the main thread (design tier, dense) > the store from the boot result WITH precomputed findings (index build + commit)":
    { operation: "step 4.2d: the store from the boot result WITH precomputed findings", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot, the parts on the main thread (design tier, dense) > the store from the boot result WITHOUT them (validateInitial default: index build + validateAll)":
    { operation: "step 4.2d: the store from the boot result WITHOUT them", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot: whole open() (includes the fake-indexeddb read and the marker writes) > open() in process":
    { operation: "step 4.2d: open() in process", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "boot: whole open() (includes the fake-indexeddb read and the marker writes) > open() through a real thread (validation in the thread; wall clock)":
    { operation: "step 4.2d: open() through a real thread", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "follower reload (design tier, dense): reload with and without the worker's findings > reload in process: validateAll + index build + commit":
    { operation: "step 4.2d: reload in process: validateAll + index build + commit", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "follower reload (design tier, dense): reload with and without the worker's findings > reload with the worker's findings: check + index build + commit":
    { operation: "step 4.2d: reload with the worker's findings: check + index build + commit", tier: 'design', shape: 'dense', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "follower applyRemote, hub edit (design tier, like-water hub, ~1,000 records): with and without the worker's validation > applyRemote, hub edit, validation in process (patches + indexes + validateTouchedByRule + commit)":
    { operation: "step 4.2d: applyRemote, hub edit, validation in process", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "follower applyRemote, hub edit (design tier, like-water hub, ~1,000 records): with and without the worker's validation > applyRemote, hub edit, the validation replayed as data (patches + indexes + finding commit; NO validation)":
    { operation: "step 4.2d: applyRemote, hub edit, the validation replayed as data", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
  "follower applyRemote, hub edit (design tier, like-water hub, ~1,000 records): with and without the worker's validation > receive the validation result of the hub edit from the worker: deserialise (blocks the caller)":
    { operation: "step 4.2d: receive the validation result of the hub edit from the worker: deserialise", tier: 'design', shape: 'hub_explosion', budgetMs: null, note: "step 4.2d: informal; SLOW_BENCH_OPTIONS; run once alone; the parts of the main thread are reported separately (the awaits of an end-to-end run overlap the thread)" },
};
