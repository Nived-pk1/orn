/**
 * The headline outcome of a reaction (step 8.4s, S8; audit RU-01): the one outcome a one-line summary names. The reaction's FIRST outcome
 * group is the one that opens the line (groups are in stored order, `outcome-groups.ts`); inside it the outcomes are in the schema's
 * selectivity order, so an exclusive one comes before a major one, a major before a minor, and equal ones keep their stored order. The
 * groups that follow with a headline of the SAME selectivity are alternatives "by conditions": outcomes that tie across condition variants.
 * Pure; it knows no reaction, name or ID. Selectivity stays on the outcome (INV-08).
 */
import { groupOutcomes, type OutcomeLike } from './outcome-groups';

/** How many alternatives a line may name: a line is one line. */
export const MAX_HEADLINE_ALTERNATIVES = 2;

export interface HeadlineOutcome<T extends OutcomeLike> {
  /** The outcome the line names; undefined when the reaction has no outcome. */
  readonly headline: T | undefined;
  /** The headlines of the other groups that tie with it, in stored order, at most `MAX_HEADLINE_ALTERNATIVES`. */
  readonly alternatives: readonly T[];
}

export function headlineOutcomeOf<T extends OutcomeLike>(outcomes: readonly T[]): HeadlineOutcome<T> {
  const groups = groupOutcomes(outcomes);
  const first = groups[0]?.outcomes[0];
  if (first === undefined) return { headline: undefined, alternatives: [] };
  const alternatives: T[] = [];
  for (const group of groups.slice(1)) {
    const head = group.outcomes[0];
    if (head !== undefined && head.selectivity === first.selectivity && alternatives.length < MAX_HEADLINE_ALTERNATIVES) alternatives.push(head);
  }
  return { headline: first, alternatives };
}
