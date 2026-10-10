/**
 * What a click on the canvas focuses in the inspector (step 5.6a). A card or a Unanchored row is a reaction; a family (hub) on the
 * overview is its record; an arrow of the overview joins two families and carries a bundle of reactions: ONE reaction is that
 * reaction, several are not one record, so the arrow focuses the family it leaves and says so (the family page lists the reactions).
 * Pure: the answer is a reference and, for an arrow of several, the sentence for the status line.
 */
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { Selected } from '@/ui/state';
import { nameOf, refOfId } from './describe';

export interface Focus {
  readonly ref: RecordRef;
  /** For the status line: what was focused instead of what was clicked. */
  readonly note?: string;
}

const isVirtual = (id: string): boolean => id.startsWith('virtual:');

export function focusOfSelection(
  selected: Selected,
  ends: (edgeId: string) => { readonly from: string; readonly to: string } | undefined,
  state: CanonicalState,
  indexes: ReadonlyIndexes,
): Focus | undefined {
  if (selected.kind === 'node') {
    if (isVirtual(selected.id)) return undefined;
    const ref = refOfId(selected.id);
    return ref === undefined ? undefined : { ref };
  }
  const joined = ends(selected.id);
  if (joined === undefined) return undefined;
  const reactions = new Set<string>();
  for (const candidate of indexes.navigatorRollup().candidatesFrom(joined.from)) if (candidate.toHub === joined.to) reactions.add(candidate.reactionId);
  if (reactions.size === 1) return { ref: { kind: 'reaction', id: [...reactions][0] as string } as RecordRef };
  const source = isVirtual(joined.from) ? undefined : refOfId(joined.from);
  if (source === undefined) return undefined;
  const to = isVirtual(joined.to) ? 'Unclassified' : nameOf(state, refOfId(joined.to) ?? source);
  const count = reactions.size;
  return {
    ref: source,
    note: `This arrow, ${nameOf(state, source)} to ${to}, carries ${count} reactions, so it is not one record: showing ${nameOf(state, source)}. Open its family page to see each reaction.`,
  };
}
