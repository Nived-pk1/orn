/**
 * Shared setup for `tests/perf/*.bench.ts` (docs/PERFORMANCE_ARCHITECTURE.md §2, §9). Test-only: builds a
 * generator tier/shape once per file and finds its most-referenced species generically (by counting
 * `participationsOf`, never by a generated ID), so a benchmark can target "the hub" of any shape without
 * a reaction-specific hack.
 */
import { documentToState } from '@/core/dataset';
import { indexEngine } from '@/core/indexes';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
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
