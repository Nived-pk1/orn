/**
 * Related reactions of one reaction (step 5.6b; GRAPH_SEMANTICS §6, derived relations). A pure function over the indexes: nothing is
 * stored (INV-11), the result is bounded and deterministic (each group sorted by reaction ID; stated before inferred).
 *
 * Groups, in this order: leads_on, comes_from (`feeds_into`: stated by exact species; through a class it is `inferred` and says
 * which class; a by-product never counts as what a reaction makes), same_transformation, same_named_family, shares_mechanism, same_reagent_family. `shares_participant` is NOT offered:
 * water, an acid or a solvent would relate almost every reaction to every other one, so the list would say nothing.
 */
import type { ClassId, Reaction, ReactionId, RecordRef, Reagent, Species } from '../../schema';
import type { ReadonlyIndexes, Participation, Production } from '../../indexes/contracts';

export const RELATED_GROUP_KEYS = ['leads_on', 'comes_from', 'same_transformation', 'same_named_family', 'shares_mechanism', 'same_reagent_family'] as const;
export type RelatedGroupKey = (typeof RELATED_GROUP_KEYS)[number];

/** Most reactions one group carries (a hub with thousands of reactions is cut here and `total` still says how many there are). */
export const MAX_GROUP_ITEMS = 5000;
/** Most classes (a species' classes and their ancestors) followed when a link goes through a class. */
export const MAX_CLASSES_FOLLOWED = 64;

export interface RelatedItem {
  readonly reactionId: ReactionId;
  /** True when the link goes through a class and not through the exact species. */
  readonly inferred: boolean;
  /** The class an inferred link goes through. */
  readonly via?: RecordRef;
}

export interface RelatedGroup {
  readonly key: RelatedGroupKey;
  readonly items: readonly RelatedItem[];
  /** The whole size of the group, also when `items` was cut at MAX_GROUP_ITEMS. */
  readonly total: number;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Collects reactions by ID once; a stated entry is never replaced by an inferred one. */
class Bag {
  private readonly map = new Map<ReactionId, RelatedItem>();
  constructor(private readonly self: ReactionId) {}
  add(reactionId: ReactionId, inferred: boolean, via?: RecordRef): void {
    if (reactionId === this.self) return;
    const had = this.map.get(reactionId);
    if (had !== undefined && (!had.inferred || inferred)) return;
    this.map.set(reactionId, via === undefined ? { reactionId, inferred } : { reactionId, inferred, via });
  }
  group(key: RelatedGroupKey): RelatedGroup {
    const all = [...this.map.values()].sort((a, b) => Number(a.inferred) - Number(b.inferred) || compare(a.reactionId, b.reactionId));
    return { key, items: all.slice(0, MAX_GROUP_ITEMS), total: all.length };
  }
}

/** The classes a substance belongs to, nearest first and bounded: a species' classes with their ancestors, a class' ancestors. */
function classesOf(indexes: ReadonlyIndexes, ref: RecordRef): ClassId[] {
  const out: ClassId[] = [];
  const seen = new Set<string>();
  const push = (id: ClassId): void => {
    if (out.length < MAX_CLASSES_FOLLOWED && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  if (ref.kind === 'species') {
    const record = indexes.get(ref.id) as Species | undefined;
    for (const id of record?.classIds ?? []) {
      push(id);
      for (const parent of indexes.classAncestors(id)) push(parent);
    }
  } else if (ref.kind === 'class') {
    for (const parent of indexes.classAncestors(ref.id as ClassId)) push(parent);
  }
  return out;
}

const isReactant = (p: Participation): boolean => p.role === 'reactant';
const isMade = (p: Production): boolean => p.productRole !== 'byproduct';
const classRef = (id: ClassId): RecordRef => ({ kind: 'class', id }) as RecordRef;

/** The products that count as what a reaction makes: a by-product (water, a salt) would link nearly every reaction to every other. */
const productRefsOf = (reaction: Reaction): RecordRef[] =>
  reaction.outcomes.flatMap((outcome) => outcome.products.filter((product) => product.role !== 'byproduct').map((product) => product.ref as RecordRef));
const reactantRefsOf = (reaction: Reaction): RecordRef[] => reaction.participants.filter((p) => p.role === 'reactant').map((p) => p.ref as RecordRef);

function leadsOn(indexes: ReadonlyIndexes, reaction: Reaction): RelatedGroup {
  const bag = new Bag(reaction.id);
  for (const ref of productRefsOf(reaction)) {
    for (const p of indexes.participationsOf(ref).filter(isReactant)) bag.add(p.reactionId, false);
    for (const classId of classesOf(indexes, ref)) {
      const via = classRef(classId);
      for (const p of indexes.participationsOf(via).filter(isReactant)) bag.add(p.reactionId, true, via);
    }
  }
  return bag.group('leads_on');
}

function comesFrom(indexes: ReadonlyIndexes, reaction: Reaction): RelatedGroup {
  const bag = new Bag(reaction.id);
  for (const ref of reactantRefsOf(reaction)) {
    for (const p of indexes.productionsOf(ref).filter(isMade)) bag.add(p.reactionId, false);
    for (const classId of classesOf(indexes, ref)) {
      const via = classRef(classId);
      for (const p of indexes.productionsOf(via).filter(isMade)) bag.add(p.reactionId, true, via);
    }
  }
  return bag.group('comes_from');
}

function sameTransformation(indexes: ReadonlyIndexes, reaction: Reaction): RelatedGroup {
  const bag = new Bag(reaction.id);
  for (const id of reaction.transformationIds) for (const other of indexes.reactionsByTransformation(id)) bag.add(other, false);
  return bag.group('same_transformation');
}

/** Reactions under the same named-reaction family: the reaction's own named reactions and every ancestor of them, with their descendants. */
function sameNamedFamily(indexes: ReadonlyIndexes, reaction: Reaction): RelatedGroup {
  const bag = new Bag(reaction.id);
  for (const id of reaction.namedReactionIds) {
    for (const family of [id, ...indexes.ancestorsOf('named_reaction', id)]) {
      for (const other of indexes.reactionsByNamedReaction(family as typeof id, { includeDescendants: true })) bag.add(other, false);
    }
  }
  return bag.group('same_named_family');
}

function sharesMechanism(indexes: ReadonlyIndexes, reaction: Reaction): RelatedGroup {
  const bag = new Bag(reaction.id);
  const mechanisms = new Set([...reaction.mechanismIds, ...reaction.outcomes.flatMap((o) => (o.mechanism === undefined ? [] : [o.mechanism.mechanismId]))]);
  for (const id of mechanisms) for (const other of indexes.reactionsByMechanism(id)) bag.add(other, false);
  return bag.group('shares_mechanism');
}

function sameReagentFamily(indexes: ReadonlyIndexes, reaction: Reaction): RelatedGroup {
  const bag = new Bag(reaction.id);
  const families = new Set<Reagent['families'][number]>();
  for (const participant of reaction.participants) {
    if (participant.ref.kind !== 'reagent') continue;
    const reagent = indexes.get(participant.ref.id) as Reagent | undefined;
    for (const family of reagent?.families ?? []) families.add(family);
  }
  for (const family of [...families].sort()) for (const other of indexes.reactionsByReagentFamily(family)) bag.add(other, false);
  return bag.group('same_reagent_family');
}

/** The six derived groups of `reaction`, in the fixed order of RELATED_GROUP_KEYS (empty groups included). */
export function relatedReactionsOf(indexes: ReadonlyIndexes, reaction: Reaction): RelatedGroup[] {
  return [
    leadsOn(indexes, reaction),
    comesFrom(indexes, reaction),
    sameTransformation(indexes, reaction),
    sameNamedFamily(indexes, reaction),
    sharesMechanism(indexes, reaction),
    sameReagentFamily(indexes, reaction),
  ];
}
