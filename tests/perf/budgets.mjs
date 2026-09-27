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
    { operation: 'validateTouched: on the ADV-012 literal hub (1,000 reactions)', tier: 'adv-012', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: '1,000 referrers ≥ 500; step 2.10 row, added since no field-aware scoping is possible without a ValidationRule contract change' },
  'commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > dispatch: update the hub species (notes)':
    { operation: 'commit: dispatch (update the design-tier "like water" hub)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 16, budgetRow: 'Commit, accepted or rejected' },
  'commit / validateTouched — design tier, one hub of 1,000 reactions (like water) > validateTouched, touching the hub':
    { operation: 'validateTouched: on the design-tier "like water" hub (1,000 of 5,000 reactions)', tier: 'design-hub-1000', shape: 'hub_explosion', budgetMs: 50, budgetRow: 'Commit on a record with ≥ 500 referrers', note: '1,000 referrers ≥ 500; markedly slower than the ADV-012 scenario despite a similar referrer count — this state has relationshipsPerReaction: 1 (oneHubState has 0), so each referring reaction also carries a REL-xxx check; not chased further this step' },

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

  'route search (design tier, dense) > searchRoutes to the hub, no startFrom (any source)':
    { operation: 'route search: searchRoutes to the hub, no startFrom', tier: 'design', shape: 'dense', budgetMs: 16, budgetRow: 'Projection build (route search has no budget row of its own; bounded the same way)' },
  'route search (design tier, chain) > searchRoutes to the hub, no startFrom (any source)':
    { operation: 'route search: searchRoutes to the hub, no startFrom', tier: 'design', shape: 'chain', budgetMs: 16, budgetRow: 'Projection build (route search has no budget row of its own; bounded the same way)' },

  'validateAll (design tier, dense) > validateAll, whole state':
    { operation: 'validateAll: whole state', tier: 'design', shape: 'dense', budgetMs: 3000, budgetRow: 'Full validation L1–L3 (design target)' },
  'validateAll (design tier, hub_explosion) > validateAll, whole state':
    { operation: 'validateAll: whole state', tier: 'design', shape: 'hub_explosion', budgetMs: 3000, budgetRow: 'Full validation L1–L3 (design target)' },
};
