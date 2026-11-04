/**
 * The compounds the map cannot file under a family yet (step 8.2a, D5): the products of the arrows that end on the virtual Unclassified
 * hub, each with the reactions that lead to it. Read from the roll-up (no scan of the records); sorted by reactions (most first), then by
 * record id. Presentation only: it changes nothing and stores nothing.
 */
import type { ReadonlyIndexes } from '../../indexes/contracts';
import { compareStrings } from '../../indexes/table';
import type { RecordRef } from '../../schema';
import { UNCLASSIFIED_HUB_ID } from './hubs';

export interface UnclassifiedProduct {
  readonly ref: RecordRef;
  /** The distinct reactions that lead to it, sorted. */
  readonly reactionIds: readonly string[];
  readonly reactions: number;
}

export function unclassifiedProducts(indexes: ReadonlyIndexes): readonly UnclassifiedProduct[] {
  const byProduct = new Map<string, { ref: RecordRef; ids: Set<string> }>();
  for (const candidate of indexes.navigatorRollup().candidatesTo(UNCLASSIFIED_HUB_ID)) {
    const key = `${candidate.product.kind}:${candidate.product.id}`;
    const entry = byProduct.get(key) ?? { ref: candidate.product, ids: new Set<string>() };
    entry.ids.add(candidate.reactionId);
    byProduct.set(key, entry);
  }
  return [...byProduct.values()]
    .map((entry) => ({ ref: entry.ref, reactionIds: [...entry.ids].sort(compareStrings), reactions: entry.ids.size }))
    .sort((a, b) => b.reactions - a.reactions || compareStrings(a.ref.id, b.ref.id));
}
