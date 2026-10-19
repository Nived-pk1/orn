/**
 * "Would this link make a cycle?" asked BEFORE saving (step 6.2b, decisions D1 and D3). The store's gate refuses a cycle at Save (HIER-001
 * for class parents, HIER-003 for reagent components); a picker asks the same question earlier, so it can refuse the choice with the reason
 * instead of letting a person save into an ERROR. Both answers come from the derived indexes, never from a copy of the rule's text, and
 * both walks are bounded. Pure; reads only.
 */
import type { CoreIndexes } from '../indexes/contracts';
import { closure } from '../indexes/hierarchy';

/** Most records a reagent composition walk visits (the same bound as HIER-003's own walk). */
export const MAX_COMPOSITION_WALK = 10_000;

export type CycleRefusal = 'self' | 'below' | 'unchecked';

/**
 * Why `candidate` cannot be a parent of class `owner`: it is the class itself ('self') or is already below it ('below'), so the link
 * would close a cycle. A class with no stored descendants (a new one) refuses only itself. `undefined`: allowed.
 */
export function classParentGuard(indexes: Pick<CoreIndexes, 'descendantsOf'>, owner: string): (candidate: string) => CycleRefusal | undefined {
  const below = new Set(indexes.descendantsOf('class', owner));
  return (candidate) => (candidate === owner ? 'self' : below.has(candidate) ? 'below' : undefined);
}

/**
 * Why reagent `candidate` cannot be a COMPONENT of reagent `owner`: it is the reagent itself, or it is already built (directly or
 * through other reagents) from `owner`. Species and class components cannot close a cycle and need no guard. When the walk reaches its
 * bound the answer is 'unchecked' for every reagent: refused, said, never guessed.
 */
export function reagentComponentGuard(indexes: Pick<CoreIndexes, 'referrersOf'>, owner: string): (candidate: string) => CycleRefusal | undefined {
  let truncated = false;
  let visited = 0;
  const upstream = new Set(
    closure(owner, (id) => {
      visited += 1;
      if (visited > MAX_COMPOSITION_WALK) {
        truncated = true;
        return [];
      }
      return indexes
        .referrersOf(id)
        .filter((r) => r.owner.kind === 'reagent' && r.path.startsWith('components'))
        .map((r) => r.owner.id);
    }),
  );
  return (candidate) => (candidate === owner ? 'self' : truncated ? 'unchecked' : upstream.has(candidate) ? 'below' : undefined);
}
