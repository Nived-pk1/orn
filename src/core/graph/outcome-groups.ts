/**
 * Outcome groups (outcome groups step, part 2): the outcomes of one reaction grouped by their condition-variant SET, so a card draws the
 * reactants and the arrow once for outcomes that share conditions (a major and a minor product) and apart for outcomes that do not (two
 * temperatures). Presentation only: selectivity stays on the outcome (INV-08); nothing here knows a reaction or a name.
 *
 * Rule: two outcomes are in the same group exactly when their sets of condition variants are equal (order and repeats do not matter; an
 * empty set means "all variants" and is a set like another). Groups are in the order of their first outcome as stored. Inside a group the
 * outcomes are ordered by the schema's selectivity order (exclusive, major, minor, trace, mixture component, unspecified; a value this
 * rule does not know comes last), then by their stored order.
 */
import { SELECTIVITIES } from '../schema/reaction';
import { selectivityWordOf } from './selectivity-word';

export interface OutcomeLike {
  readonly conditionVariantIds: readonly string[];
  readonly selectivity: string;
}

export interface OutcomeGroup<T extends OutcomeLike> {
  /** The variant set as one string (sorted, no repeats); empty: all variants. Unique among the groups of one reaction. */
  readonly key: string;
  readonly conditionVariantIds: T['conditionVariantIds'];
  readonly outcomes: readonly T[];
}

const rankOf = (selectivity: string): number => {
  const rank = (SELECTIVITIES as readonly string[]).indexOf(selectivity);
  return rank < 0 ? SELECTIVITIES.length : rank;
};

export const variantSetKeyOf = (ids: readonly string[]): string => [...new Set(ids)].sort().join('|');

export function groupOutcomes<T extends OutcomeLike>(outcomes: readonly T[]): readonly OutcomeGroup<T>[] {
  const order: string[] = [];
  const byKey = new Map<string, { ids: T['conditionVariantIds']; members: { outcome: T; index: number }[] }>();
  outcomes.forEach((outcome, index) => {
    const key = variantSetKeyOf(outcome.conditionVariantIds);
    let group = byKey.get(key);
    if (group === undefined) {
      group = { ids: outcome.conditionVariantIds, members: [] };
      byKey.set(key, group);
      order.push(key);
    }
    group.members.push({ outcome, index });
  });
  return order.map((key) => {
    const group = byKey.get(key) as { ids: T['conditionVariantIds']; members: { outcome: T; index: number }[] };
    const members = [...group.members].sort((a, b) => rankOf(a.outcome.selectivity) - rankOf(b.outcome.selectivity) || a.index - b.index);
    return { key, conditionVariantIds: group.ids, outcomes: members.map((m) => m.outcome) };
  });
}

/**
 * The word written under a main product: the outcome's selectivity word and, when it has a regiochemistry, that text after a middle dot
 * ("major · Saytzeff"). Either part alone when the other is missing (`unspecified` has no word); null when neither.
 */
export function outcomeWordOf(selectivity: string, regiochemistry: string | undefined): string | null {
  const word = selectivityWordOf(selectivity);
  const regio = regiochemistry?.trim();
  const parts = [word, regio === undefined || regio === '' ? null : regio].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}
