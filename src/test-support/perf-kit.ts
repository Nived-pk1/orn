/**
 * Shared setup for `tests/perf/*.bench.ts` (docs/PERFORMANCE_ARCHITECTURE.md §2, §9). Test-only: builds a
 * generator tier/shape once per file and finds its most-referenced species generically (by counting
 * `participationsOf`, never by a generated ID), so a benchmark can target "the hub" of any shape without
 * a reaction-specific hack.
 */
import { produce } from 'immer';
import { documentToState } from '@/core/dataset';
import { indexEngine } from '@/core/indexes';
import { commitFindings, createFindingStore, validator, type FindingStore } from '@/core/validation';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import { emptyRecordTables, RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordRef } from '@/core/schema';
import { anchorOn } from './graph-state';
import { generateDataset, generateTier, type GeneratorShape, type GeneratorTier } from './generator';

/** A parsed, indexed design/stress-tier state. Not frozen: callers that commit against it should copy. */
export function tierState(tier: GeneratorTier, shape: GeneratorShape, seed = 1): CanonicalState {
  const parsed = documentToState(generateTier(tier, shape, seed));
  if (!parsed.ok) throw new Error(`generator produced duplicate IDs for ${tier}/${shape}`);
  return parsed.state;
}

/**
 * ADV-012's literal case: one hub species, exactly 1,000 reactions, each with that species as its sole
 * reactant (`hub_explosion` picks `floor(species / 50)` hubs, so 60 species gives exactly one).
 */
export function oneHubState(reactions = 1000, seed = 7): CanonicalState {
  const parsed = documentToState(
    generateDataset({ species: 60, classes: 3, reagents: 5, reactions, relationshipsPerReaction: 0, topics: 2, shape: 'hub_explosion', seed }),
  );
  if (!parsed.ok) throw new Error('generator produced duplicate IDs for the one-hub scenario');
  return parsed.state;
}

/**
 * A design-tier-scale scenario (5,000 reactions, docs/PERFORMANCE_ARCHITECTURE.md §1) where one species is
 * referenced by exactly 1,000 of them — "like water": a species with real fan-out at design-tier scale,
 * distinct from `oneHubState()`'s smaller dataset (1,000 total reactions, all through the one hub).
 * `hub_explosion` splits reactions round-robin over `floor(species / 50)` hubs; 250 species gives exactly
 * 5 hubs, so 5,000 reactions split into 1,000 per hub.
 */
export function designTierHubState(reactions = 5000, seed = 11): CanonicalState {
  const parsed = documentToState(
    generateDataset({ species: 250, classes: 20, reagents: 30, reactions, relationshipsPerReaction: 1, topics: 10, shape: 'hub_explosion', seed }),
  );
  if (!parsed.ok) throw new Error('generator produced duplicate IDs for the design-tier hub scenario');
  return parsed.state;
}

/** The species referenced by the most participations — "the hub" of any shape, found structurally. */
export function mostReferencedSpecies(state: CanonicalState, indexes: ReadonlyIndexes): RecordRef {
  let best: RecordRef | undefined;
  let bestCount = -1;
  for (const id of Object.keys(state.records.species)) {
    const ref: RecordRef = { kind: 'species', id };
    const count = indexes.participationsOf(ref).length;
    if (count > bestCount) {
      best = ref;
      bestCount = count;
    }
  }
  if (best === undefined) throw new Error('state has no species');
  return best;
}

/**
 * A state one edit after `state`, with indexes for it, so a bench can call `validateTouched(next, indexes, [hub],
 * state)` the way the command store does (it always passes the previous state; ADR-031, step 2.12).
 * `rename` changes a field no rule reads of a referenced species; `draft` changes `review.lifecycle`, which
 * RVW-002 reads of every referenced record, so every referrer has to be re-validated.
 */
export function afterHubEdit(state: CanonicalState, hub: RecordRef, edit: 'rename' | 'draft'): { state: CanonicalState; indexes: ReadonlyIndexes } {
  const next = produce(state, (draft) => {
    const species = draft.records.species[hub.id] as unknown as { names: { canonical: string }; review: { lifecycle: string } };
    if (edit === 'rename') species.names.canonical = `${species.names.canonical} (renamed)`;
    else species.review.lifecycle = 'draft';
  });
  return { state: next, indexes: buildIndexes(next) };
}

/**
 * The class referenced by the most records — "the class hub" of any shape, found structurally. In
 * `hub_explosion` every species lists class 0 (docs/PERFORMANCE_ARCHITECTURE.md §10), so at the design tier
 * (1,400 species) that class has ~1,400 species referrers.
 */
export function mostReferencedClass(state: CanonicalState, indexes: ReadonlyIndexes): RecordRef {
  let best: RecordRef | undefined;
  let bestCount = -1;
  for (const id of Object.keys(state.records.class)) {
    const count = indexes.referrersOf(id).length;
    if (count > bestCount) {
      best = { kind: 'class', id };
      bestCount = count;
    }
  }
  if (best === undefined) throw new Error('state has no classes');
  return best;
}

/**
 * The state plus one fresh, parentless class, `rootId`, so a bench can move the class hub under it and back
 * (`parentIds` alternating `[]` / `[rootId]`) without closing a cycle: every generated class descends from
 * the first one, so no existing class is a legal parent for it.
 */
export function withSpareClass(state: CanonicalState, template: RecordRef, rootId: string): CanonicalState {
  return produce(state, (draft) => {
    const source = draft.records.class[template.id] as unknown as { names: { canonical: string } };
    const copy = JSON.parse(JSON.stringify(source)) as { id: string; parentIds: string[]; exampleSpeciesIds: string[]; names: { canonical: string } };
    copy.id = rootId;
    copy.parentIds = [];
    copy.exampleSpeciesIds = [];
    copy.names.canonical = 'Spare root class';
    (draft.records.class as unknown as Record<string, unknown>)[rootId] = copy;
  });
}

/** A finding store holding `validateAll`'s findings for `state`, as the command store's would after boot. */
export function knownFindings(state: CanonicalState, indexes: ReadonlyIndexes): FindingStore {
  const store = createFindingStore();
  const everyone = RECORD_KINDS.flatMap((kind) => Object.keys(state.records[kind]).map((id) => ({ kind, id }) as RecordRef));
  commitFindings(store, everyone, validator.validateAll(state, indexes));
  return store;
}

/** The species referenced by the fewest participations (possibly zero) — a contrast case for "the hub". */
export function leastReferencedSpecies(state: CanonicalState, indexes: ReadonlyIndexes): RecordRef {
  let best: RecordRef | undefined;
  let bestCount = Infinity;
  for (const id of Object.keys(state.records.species)) {
    const ref: RecordRef = { kind: 'species', id };
    const count = indexes.participationsOf(ref).length;
    if (count < bestCount) {
      best = ref;
      bestCount = count;
    }
  }
  if (best === undefined) throw new Error('state has no species');
  return best;
}

export function buildIndexes(state: CanonicalState): ReadonlyIndexes {
  return indexEngine.build(state, 0);
}

/**
 * Anchors exactly `anchorCount` classes as navigator hubs (docs/GRAPH_SEMANTICS.md §3), chosen
 * deterministically: sort every class ID, then for `k` in `[0, min(anchorCount, classCount))` anchor the
 * class at index `floor(k * classCount / anchorCount)`. That index is strictly increasing in `k` whenever
 * `classCount >= anchorCount` (true at every tier/shape this file uses), so the `anchorCount` classes it
 * picks are evenly spread across the sorted range with no repeats — a stated rule, not an accident of
 * iteration order.
 *
 * The generator itself creates no `navigator_anchor` records (docs/PERFORMANCE_ARCHITECTURE.md §10 is
 * graph/index scale only, not content), so an un-anchored generated state puts every reaction on the single
 * virtual Unclassified hub — every candidate collapsing onto one bucket, which is not what a curated dataset
 * (the demo has 15 anchored hubs) looks like, and not what the navigator roll-up's "cost proportional to
 * hubs and output, not to total reactions" target assumes (ADR-030).
 *
 * `anchorCount` defaults to 60 (PERFORMANCE_ARCHITECTURE.md §1/§10 amendment, docs/PROGRESS.md step 2.11):
 * a fixed number, not a tier-dependent ratio (step 2.9's `every`-based version gave design tier's 200
 * classes ~100 hubs and would silently give a different count at any other tier) — well above the demo's 15
 * curated hubs, still a harder case than most real content, but the same "design tier, 60 anchors" state
 * shape regardless of how the generator's class count changes later. Callers needing a different count
 * (e.g. the stress-tier 400-anchor scenario, §1's stress allowance) pass it explicitly.
 */
export function withNavigatorAnchors(state: CanonicalState, anchorCount = 60): CanonicalState {
  const records = { ...emptyRecordTables() } as unknown as Record<string, Record<string, AnyRecord>>;
  for (const kind of RECORD_KINDS) records[kind] = { ...state.records[kind] };
  const classIds = Object.keys(state.records.class).sort();
  const n = Math.min(anchorCount, classIds.length);
  for (let k = 0; k < n; k += 1) {
    const index = Math.floor((k * classIds.length) / n);
    const id = classIds[index] as string;
    const anchor = anchorOn({ kind: 'class', id }, `perf-anchor-${id.replace(/_/g, '-')}`.slice(0, 60));
    (records['navigator_anchor'] as Record<string, AnyRecord>)[anchor.id] = anchor;
  }
  return { meta: state.meta, records: records as unknown as CanonicalState['records'] };
}

/**
 * Explicit `bench()` options (docs/PERFORMANCE_ARCHITECTURE.md §9, step 2.11). `vitest bench`'s own
 * defaults (500 ms time budget, 10-iteration floor) leave the slower entries with only 10-30 samples; since
 * tinybench's p99 is the `ceil(0.99 * n) - 1`th sorted sample, it is mathematically identical to the
 * observed max whenever `n < 100` (`ceil(0.99n)` only drops below `n` once `n >= 100`) — not a stable 99th
 * percentile, no matter how many times it is re-run. `FAST_BENCH_OPTIONS` raises the sample floor to 100
 * (the minimum where p99 can exclude even a single top outlier) for every commit/projection/route-search
 * bench here — each comfortably finishes in a few seconds even at ~30-40 ms/sample. `SLOW_BENCH_OPTIONS` is
 * for `validateAll` (300-400 ms/sample, tests/perf/validate.bench.ts): reaching 100 samples there would
 * take minutes per entry for a budget it already passes with a wide margin, so it takes the "minimum time"
 * half of the same instruction instead — a fixed time window, few samples, no multi-minute bench suite.
 */
export const FAST_BENCH_OPTIONS = { time: 500, iterations: 100, warmupTime: 200, warmupIterations: 10 } as const;
export const SLOW_BENCH_OPTIONS = { time: 3000, iterations: 5, warmupTime: 500, warmupIterations: 2 } as const;
