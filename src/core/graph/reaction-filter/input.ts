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

function familiesOf(indexes: ReadonlyIndexes): { from: Map<string, Set<string>>; to: Map<string, Set<string>> } {
  const from = new Map<string, Set<string>>();
  const to = new Map<string, Set<string>>();
  for (const pair of indexes.navigatorRollup().pairs()) {
    for (const candidate of pair.candidates) {
      (from.get(candidate.reactionId) ?? from.set(candidate.reactionId, new Set()).get(candidate.reactionId))?.add(pair.from);
      (to.get(candidate.reactionId) ?? to.set(candidate.reactionId, new Set()).get(candidate.reactionId))?.add(pair.to);
    }
  }
  return { from, to };
}

function entryOf(reaction: Reaction, from: ReadonlySet<string> | undefined, to: ReadonlySet<string> | undefined): ReactionFilterEntry {
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
    fromFamilyIds: [...(from ?? [])].sort(compare),
    toFamilyIds: [...(to ?? [])].sort(compare),
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
  const { from, to } = familiesOf(source.indexes);
  const entries = (Object.values(source.state.records.reaction) as Reaction[]).map((reaction) => entryOf(reaction, from.get(reaction.id), to.get(reaction.id)));
  const keyed = entries.map((entry) => ({ entry, key: fold(entry.name) }));
  keyed.sort((a, b) => compare(a.key, b.key) || compare(a.entry.id, b.entry.id));
  return { entries: keyed.map((one) => one.entry) };
}
