/**
 * What the inspector shows for the map's ONE selection (step 8.2b-fix, S1 to S3; ADR-044 addendum). A pure function of the selection, the
 * canonical snapshot and the edition: nothing else feeds it (no "last record", no memory of an earlier pick). The selection is one of:
 * none, a record (a family or anything opened from a list), the bucket (the map's "Not in a family yet" box, a derived node that is not
 * a record) or an arrow (from node, to node). Derived, never stored.
 */
import { createReagentWords, UNCLASSIFIED_HUB_ID, type ArrowTextPart, type ReagentWords } from '@/core/graph';
import type { NavigatorCandidate, ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { nameOf, refOfId } from './describe';

export const NOT_IN_A_FAMILY = 'Not in a family yet';

/** The selection the inspector follows. A record entry may carry the place inside it (`at`). */
export type MapSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'bucket' }
  | { readonly kind: 'arrow'; readonly from: string; readonly to: string }
  | (RecordRef & { readonly at?: string });

export interface MapSnapshot {
  readonly state: CanonicalState;
  readonly indexes: ReadonlyIndexes;
}

export interface ArrowEnd {
  /** The map node id (a family's record id, or the bucket's derived id). */
  readonly id: string;
  readonly name: string;
  readonly bucket: boolean;
}
export interface ArrowRow {
  readonly id: string;
  readonly name: string;
  readonly words: string;
  /** The same words as parts (a name or a formula), to set in the card's typography. */
  readonly parts: readonly ArrowTextPart[];
}
export interface ChipCount {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}
export interface BucketRow {
  readonly ref: RecordRef;
  readonly name: string;
  readonly reactions: number;
  readonly madeFrom: readonly ChipCount[];
  readonly goesOn: readonly ChipCount[];
}

export type MapInspectorView =
  | { readonly kind: 'empty' }
  | { readonly kind: 'record'; readonly ref: RecordRef }
  | { readonly kind: 'arrow'; readonly chip: 'Arrow'; readonly title: string; readonly from: ArrowEnd; readonly to: ArrowEnd; readonly reactions: readonly ArrowRow[] }
  | { readonly kind: 'bucket'; readonly chip: string; readonly title: string; readonly lead: string; readonly rows: readonly BucketRow[]; readonly authorsLine?: string };

const refKey = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

function endOf(id: string, state: CanonicalState): ArrowEnd | undefined {
  if (id === UNCLASSIFIED_HUB_ID) return { id, name: NOT_IN_A_FAMILY, bucket: true };
  const ref = refOfId(id);
  return ref === undefined ? undefined : { id, name: nameOf(state, ref), bucket: false };
}

const reagent = (found: ReagentWords): { readonly words: string; readonly parts: readonly ArrowTextPart[] } => ({ words: found.text, parts: found.parts });

function arrowView(from: string, to: string, snapshot: MapSnapshot): MapInspectorView {
  const a = endOf(from, snapshot.state);
  const b = endOf(to, snapshot.state);
  if (a === undefined || b === undefined) return { kind: 'empty' };
  const carried = new Map<string, NavigatorCandidate>();
  for (const candidate of snapshot.indexes.navigatorRollup().candidatesFrom(from)) if (candidate.toHub === to && !carried.has(candidate.reactionId)) carried.set(candidate.reactionId, candidate);
  if (carried.size === 0) return { kind: 'empty' };
  const words = createReagentWords(snapshot.state, snapshot.indexes);
  const reactions = [...carried.values()].map((candidate): ArrowRow => ({
    id: candidate.reactionId,
    name: nameOf(snapshot.state, { kind: 'reaction', id: candidate.reactionId } as RecordRef),
    ...reagent(words(candidate.reactionId, candidate)),
  }));
  return { kind: 'arrow', chip: 'Arrow', title: `${a.name} → ${b.name}`, from: a, to: b, reactions };
}

function chipsOf(groups: ReadonlyMap<string, Set<string>>, state: CanonicalState): readonly ChipCount[] {
  const out: ChipCount[] = [];
  for (const [id, reactions] of groups) {
    const end = endOf(id, state);
    if (end !== undefined) out.push({ id, name: end.name, count: reactions.size });
  }
  return out.sort((x, y) => y.count - x.count || x.name.localeCompare(y.name) || (x.id < y.id ? -1 : 1));
}

function bucketView(snapshot: MapSnapshot, edition: 'study' | 'studio'): MapInspectorView {
  const { state, indexes } = snapshot;
  const rollup = indexes.navigatorRollup();
  interface Acc { ref: RecordRef; reactions: Set<string>; madeFrom: Map<string, Set<string>>; goesOn: Map<string, Set<string>> }
  const byCompound = new Map<string, Acc>();
  const accOf = (ref: RecordRef): Acc => {
    const key = refKey(ref);
    const found = byCompound.get(key);
    if (found !== undefined) return found;
    const made: Acc = { ref, reactions: new Set(), madeFrom: new Map(), goesOn: new Map() };
    byCompound.set(key, made);
    return made;
  };
  const add = (map: Map<string, Set<string>>, hub: string, reactionId: string): void => {
    if (hub === UNCLASSIFIED_HUB_ID) return;
    const set = map.get(hub) ?? new Set<string>();
    set.add(reactionId);
    map.set(hub, set);
  };
  for (const candidate of rollup.candidatesTo(UNCLASSIFIED_HUB_ID)) {
    const acc = accOf(candidate.product);
    acc.reactions.add(candidate.reactionId);
    add(acc.madeFrom, candidate.fromHub, candidate.reactionId);
  }
  for (const candidate of rollup.candidatesFrom(UNCLASSIFIED_HUB_ID)) {
    const acc = accOf(candidate.substrate);
    acc.reactions.add(candidate.reactionId);
    add(acc.goesOn, candidate.toHub, candidate.reactionId);
  }
  const rows = [...byCompound.values()]
    .map((acc): BucketRow => ({ ref: acc.ref, name: nameOf(state, acc.ref), reactions: acc.reactions.size, madeFrom: chipsOf(acc.madeFrom, state), goesOn: chipsOf(acc.goesOn, state) }))
    .sort((x, y) => y.reactions - x.reactions || x.name.localeCompare(y.name) || (refKey(x.ref) < refKey(y.ref) ? -1 : 1));
  return {
    kind: 'bucket',
    chip: 'Compounds',
    title: NOT_IN_A_FAMILY,
    lead: 'These compounds appear in reactions, but no family covers them yet.',
    rows,
    ...(edition === 'studio' ? { authorsLine: 'Give these compounds a family in the content data' } : {}),
  };
}

export function mapInspectorView(selection: MapSelection, snapshot: MapSnapshot, edition: 'study' | 'studio'): MapInspectorView {
  switch (selection.kind) {
    case 'none':
      return { kind: 'empty' };
    case 'bucket':
      return bucketView(snapshot, edition);
    case 'arrow':
      return arrowView(selection.from, selection.to, snapshot);
    default:
      return { kind: 'record', ref: { kind: selection.kind, id: selection.id } as RecordRef };
  }
}
