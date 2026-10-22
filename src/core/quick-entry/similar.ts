/**
 * A similar existing reaction (step 6.7b, Q4): the reactions whose participants are the same records and whose products (over all outcomes) are
 * the same records as the line's, compared as sets. Derived over the state each time; bounded (3, in id order). No chemistry.
 */
import type { CanonicalState, Reaction } from '../schema';
import type { TermRef } from './seed';

const MAX_SIMILAR = 3;
const keyOf = (ref: TermRef): string => `${ref.kind}:${ref.id}`;
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((key) => b.has(key));

export function similarReactions(state: CanonicalState, left: readonly TermRef[], products: readonly TermRef[]): readonly Reaction[] {
  if (left.length === 0 || products.length === 0) return [];
  const wantLeft = new Set(left.map(keyOf));
  const wantProducts = new Set(products.map(keyOf));
  return (Object.values(state.records.reaction) as Reaction[])
    .filter((reaction) => sameSet(new Set(reaction.participants.map((p) => keyOf(p.ref))), wantLeft) && sameSet(new Set(reaction.outcomes.flatMap((o) => o.products.map((p) => keyOf(p.ref)))), wantProducts))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, MAX_SIMILAR);
}
