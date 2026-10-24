/**
 * The reaction filter's input (step 7.1a, ADR-042 E2): one entry per reaction, derived from the records and the navigator roll-up for ONE
 * state and rebuilt when it changes (never stored). Direct references only: the substances a reaction names as they are written, with no
 * class-membership or reagent-to-species expansion. Families are the family page's own: the hubs of the roll-up's candidates.
 */
import type { ReadonlyIndexes } from '../../indexes/contracts';
import type { CanonicalState, Reaction } from '../../schema';
import { fold } from '../../text/normalizer';

const ON_THE_ARROW: ReadonlySet<string> = new Set(['reagent', 'catalyst', 'solvent', 'initiator', 'promoter', 'additive', 'workup_reagent']);

export interface ReactionFilterEntry {
  readonly id: string;
  readonly name: string;
  readonly folded: string;
  readonly fromFamilyIds: readonly string[];
  readonly toFamilyIds: readonly string[];
  /** The (from, to) family of each of the reaction's candidates, distinct, sorted: From and To together match ONE of them (7.1b C2). */
  readonly pairs: readonly (readonly [string, string])[];
  readonly typeIds: readonly string[];
  readonly namedReactionIds: readonly string[];
  readonly status: string;
  readonly reactants: ReadonlySet<string>;
  readonly arrow: ReadonlySet<string>;
  readonly products: ReadonlySet<string>;
  readonly any: ReadonlySet<string>;
}

export interface ReactionFilterInput {
  /** In folded-name then ID order. */
  readonly entries: readonly ReactionFilterEntry[];
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Per reaction, the distinct (from, to) pairs of its candidates. */
function pairsOf(indexes: ReadonlyIndexes): Map<string, Map<string, readonly [string, string]>> {
  const out = new Map<string, Map<string, readonly [string, string]>>();
  for (const pair of indexes.navigatorRollup().pairs()) {
    for (const candidate of pair.candidates) {
      let mine = out.get(candidate.reactionId);
      if (mine === undefined) out.set(candidate.reactionId, (mine = new Map()));
      mine.set(`${pair.from}\u0000${pair.to}`, [pair.from, pair.to]);
    }
  }
  return out;
}

function entryOf(reaction: Reaction, found: ReadonlyMap<string, readonly [string, string]> | undefined): ReactionFilterEntry {
  const pairs = [...(found?.values() ?? [])].sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]));
  const reactants = new Set<string>();
  const arrow = new Set<string>();
  const products = new Set<string>();
  for (const participant of reaction.participants) {
    if (participant.role === 'reactant') reactants.add(participant.ref.id);
    else if (ON_THE_ARROW.has(participant.role)) arrow.add(participant.ref.id);
  }
  for (const outcome of reaction.outcomes) for (const product of outcome.products) products.add(product.ref.id);
  return {
    id: reaction.id,
    name: reaction.name,
    folded: [reaction.name, ...reaction.aliases].map(fold).join('\n'),
    fromFamilyIds: [...new Set(pairs.map((pair) => pair[0]))],
    toFamilyIds: [...new Set(pairs.map((pair) => pair[1]))].sort(compare),
    pairs,
    typeIds: [...new Set(reaction.reactionTypes.map((type) => type.conceptId as string))].sort(compare),
    namedReactionIds: [...new Set(reaction.namedReactionIds as readonly string[])].sort(compare),
    status: reaction.review.status,
    reactants,
    arrow,
    products,
    any: new Set([...reactants, ...arrow, ...products]),
  };
}

export function buildReactionFilterInput(source: { readonly state: CanonicalState; readonly indexes: ReadonlyIndexes }): ReactionFilterInput {
  const pairs = pairsOf(source.indexes);
  const entries = (Object.values(source.state.records.reaction) as Reaction[]).map((reaction) => entryOf(reaction, pairs.get(reaction.id)));
  const keyed = entries.map((entry) => ({ entry, key: fold(entry.name) }));
  keyed.sort((a, b) => compare(a.key, b.key) || compare(a.entry.id, b.entry.id));
  return { entries: keyed.map((one) => one.entry) };
}
