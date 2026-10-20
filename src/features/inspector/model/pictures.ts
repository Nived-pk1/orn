/**
 * The pictures of a mechanism for the inspector (step 6.5b part 3, ADR-038 addendum P6): the asset records attached to it, in the order the
 * schema gives nothing for, so OLDEST FIRST (`provenance.createdAt`, then the ID). Derived from the state each time; nothing is stored.
 */
import type { Asset, CanonicalState } from '@/core/schema';

export function picturesOfMechanism(state: CanonicalState, mechanismId: string): readonly Asset[] {
  const found = (Object.values(state.records.asset) as Asset[]).filter((asset) => asset.attachedTo.some((one) => one.ref.kind === 'mechanism' && one.ref.id === mechanismId));
  return found.sort((a, b) => a.provenance.createdAt.localeCompare(b.provenance.createdAt) || a.id.localeCompare(b.id));
}
