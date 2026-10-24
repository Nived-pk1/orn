/**
 * The filter input is derived from ONE state (and its indexes) and costs 30-40 ms at the design tier, so a view asks for it through this
 * memo: it is built once per state and reused for every filter change on that state (step 7.1b C3, ADR-042 E10). The key is the indexes
 * revision AND the state object (a state is immutable: a new commit is a new object with a new revision). Holds one input; derived, never stored.
 */
import type { ReadonlyIndexes } from '../../indexes/contracts';
import type { CanonicalState } from '../../schema';
import { buildReactionFilterInput, type ReactionFilterInput } from './input';

export interface ReactionFilterMemo {
  inputFor(source: { readonly state: CanonicalState; readonly indexes: ReadonlyIndexes }): ReactionFilterInput;
}

export function createReactionFilterMemo(build: typeof buildReactionFilterInput = buildReactionFilterInput): ReactionFilterMemo {
  let last: { readonly revision: number; readonly state: CanonicalState; readonly input: ReactionFilterInput } | undefined;
  return {
    inputFor(source) {
      const revision = source.indexes.revision;
      if (last !== undefined && last.revision === revision && last.state === source.state) return last.input;
      const input = build(source);
      last = { revision, state: source.state, input };
      return input;
    },
  };
}
