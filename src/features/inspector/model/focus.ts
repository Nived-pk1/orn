/**
 * The reactions an overview arrow carries (the roll-up's candidates from its source family to its target), once each, in the roll-up's
 * order. (Step 8.2b-fix: the arrow's own view, `map-inspector-view.ts`, replaced "an arrow focuses the family it leaves".)
 */
import type { ReadonlyIndexes } from '@/core/indexes/contracts';

export function arrowReactionIds(ends: { readonly from: string; readonly to: string }, indexes: ReadonlyIndexes): readonly string[] {
  const found = new Set<string>();
  for (const candidate of indexes.navigatorRollup().candidatesFrom(ends.from)) if (candidate.toHub === ends.to) found.add(candidate.reactionId);
  return [...found];
}
