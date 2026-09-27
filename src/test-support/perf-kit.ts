/**
 * Shared setup for `tests/perf/*.bench.ts` (docs/PERFORMANCE_ARCHITECTURE.md §2, §9). Test-only: builds a
 * generator tier/shape once per file and finds its most-referenced species generically (by counting
 * `participationsOf`, never by a generated ID), so a benchmark can target "the hub" of any shape without
 * a reaction-specific hack.
 */
import { documentToState } from '@/core/dataset';
import { indexEngine } from '@/core/indexes';
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
 * Anchors every `every`th class as a navigator hub (docs/GRAPH_SEMANTICS.md §3). The generator itself
 * creates no `navigator_anchor` records (docs/PERFORMANCE_ARCHITECTURE.md §10 is graph/index scale only,
 * not content), so an un-anchored generated state puts every reaction on the single virtual Unclassified
 * hub — every candidate collapsing onto one bucket, which is not what a curated dataset (the demo has 15
 * anchored hubs) looks like, and not what step 2.9's "cost proportional to hubs and output, not to total
 * reactions" target assumes. `every = 2` gives design tier (200 classes) ~100 hubs, well above a real
 * curriculum's few dozen, so this is not tuned to make the benchmark look good — if anything it is a
 * harder case (more hubs to enumerate) than most real content.
 */
export function withNavigatorAnchors(state: CanonicalState, every = 2): CanonicalState {
  const records = { ...emptyRecordTables() } as unknown as Record<string, Record<string, AnyRecord>>;
  for (const kind of RECORD_KINDS) records[kind] = { ...state.records[kind] };
  Object.keys(state.records.class)
    .sort()
    .forEach((id, i) => {
      if (i % every !== 0) return;
      const anchor = anchorOn({ kind: 'class', id }, `perf-anchor-${id.replace(/_/g, '-')}`.slice(0, 60));
      (records['navigator_anchor'] as Record<string, AnyRecord>)[anchor.id] = anchor;
    });
  return { meta: state.meta, records: records as unknown as CanonicalState['records'] };
}
