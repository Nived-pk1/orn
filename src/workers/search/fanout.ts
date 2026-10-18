/**
 * Which documents a ChangeSet makes it necessary to rebuild (step 4.5). A document is built from its own record plus derived
 * data (src/search/document/builder.ts), so a change reaches other documents only through that derived data:
 *
 *   DIRECT   the records the change created, updated or deleted, when they have a document (SEARCH §1 kinds).
 *   TARGET   a topic mapping or an exam relevance (created, updated, deleted): the record it points at, before AND after the change
 *            (scope rank, scope facet, topic facet). The old target is read from the inverse patches.
 *   CONCEPTS every concept, when the change can move a concept's derived scope: a mapping or relevance (a prerequisite's own scope
 *            may have moved), a relationship, a reaction or named reaction created, deleted or with new `prerequisiteConceptIds`.
 *   REAGENT  a reagent created, deleted or with new `families`: the reactions that use it (their `reagentFamilies` facet).
 *   ALL      every document, when the exam versions or the topic tree changed: an exam version created or deleted or with new
 *            `units` / `examId`, a topic deleted or with a new `parentId` (a new topic
 *            reaches nothing: whatever points at it is a change of its own). (An exam record itself is never read by
 *            `scopeOf`, only its id, so a change to it moves nothing; a mutation test showed that rule was dead.)
 * A `replace` (replaceState) or a follower's `reload` (`reloaded`) change is not analysed: the caller loads the whole index again.
 * Whatever is over-approximated here is harmless: the sync rebuilds a candidate and sends it only when its document differs from
 * the last one sent. Whatever is MISSED would be a stale document, which is why the property test compares the incremental index
 * with a full rebuild after random command sequences.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState, RecordKind, RecordRef } from '@/core/schema';
import type { CoreIndexes } from '@/core/indexes/contracts';
import { isSearchKind, SEARCH_KINDS } from '@/search/document';

export interface Affected {
  /** Rebuild now, whatever else is waiting: the change's own records. */
  readonly direct: readonly RecordRef[];
  /** Rebuild because something they read changed; the sync queues them 500 at a time. Sorted, no duplicates, none also in `direct`. */
  readonly behind: readonly RecordRef[];
  /** The whole index must be loaded again (`replace`, a follower's `reload`). */
  readonly reload: boolean;
}

type Ids = Pick<CoreIndexes, 'referrersOf'>;
type Patch = ChangeSet['patches'][number];

export const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;
const byKey = (a: RecordRef, b: RecordRef): number => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0);

/** Patches that start inside one record: `[records, kind, id, ...rest]`. */
function insideRecord(patches: readonly Patch[], ref: RecordRef): Patch[] {
  return patches.filter((patch) => patch.path[0] === 'records' && patch.path[1] === ref.kind && patch.path[2] === ref.id);
}

/**
 * True when one of `fields` of the record has a different value after the change. The store's patches may replace the whole
 * record (path length 3), so the old record is read from the inverse patch and compared field by field; a patch inside a field
 * counts as a change of it.
 */
function changedField(changes: ChangeSet, state: CanonicalState, ref: RecordRef, fields: readonly string[]): boolean {
  const table = state.records[ref.kind] as unknown as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  const now = Object.hasOwn(table, ref.id) ? table[ref.id] : undefined;
  for (const patch of insideRecord(changes.inversePatches, ref)) {
    if (patch.path.length === 3) {
      const old = (patch as { value?: unknown }).value as Readonly<Record<string, unknown>> | undefined;
      if (old === undefined || now === undefined) return true;
      if (fields.some((field) => JSON.stringify(old[field]) !== JSON.stringify(now[field]))) return true;
    } else if (fields.includes(String(patch.path[3]))) return true;
  }
  return false;
}

const isRef = (value: unknown): value is RecordRef =>
  typeof value === 'object' && value !== null && typeof (value as RecordRef).kind === 'string' && typeof (value as RecordRef).id === 'string';

/** The `target` a mapping or relevance had before the change: from its inverse patches, else unchanged. */
function previousTarget(changes: ChangeSet, ref: RecordRef, current: RecordRef | undefined): RecordRef | undefined {
  let target: RecordRef | undefined = current;
  for (const patch of insideRecord(changes.inversePatches, ref)) {
    const value: unknown = (patch as { value?: unknown }).value;
    if (patch.path.length === 3) {
      if (patch.op === 'remove') target = undefined;
      else if (typeof value === 'object' && value !== null && isRef((value as { target?: unknown }).target)) target = (value as { target: RecordRef }).target;
    } else if (patch.path[3] === 'target') {
      if (patch.path.length === 4 && isRef(value)) target = value;
      else if (patch.path.length === 5 && target !== undefined && typeof value === 'string') target = { ...target, [String(patch.path[4])]: value } as RecordRef;
    }
  }
  return target;
}

const targetOf = (state: CanonicalState, ref: RecordRef): RecordRef | undefined => {
  const table = state.records[ref.kind as 'topic_mapping' | 'exam_relevance'] as Readonly<Record<string, { readonly target: RecordRef }>>;
  return Object.hasOwn(table, ref.id) ? table[ref.id]?.target : undefined;
};

/** Every record that has a document, sorted by (kind, id). */
export function allRefs(state: CanonicalState, kinds: readonly RecordKind[] = SEARCH_KINDS): RecordRef[] {
  const out: RecordRef[] = [];
  for (const kind of kinds) for (const id of Object.keys(state.records[kind])) out.push({ kind, id } as RecordRef);
  return out.sort(byKey);
}

export function affectedBy(changes: ChangeSet, state: CanonicalState, indexes: Ids): Affected {
  // a `remote` ChangeSet of `applyRemote` (one mirrored writer transaction) is analysed like a commit; a `reload` is a whole state
  if (changes.cause === 'replace' || changes.reloaded === true) return { direct: [], behind: [], reload: true };
  const all = [...changes.created, ...changes.updated, ...changes.deleted];
  const direct = new Map<string, RecordRef>();
  const behind = new Map<string, RecordRef>();
  let everything = false;
  let concepts = false;
  const target = (ref: RecordRef | undefined): void => {
    if (ref !== undefined && isSearchKind(ref.kind)) behind.set(keyOf(ref), { kind: ref.kind, id: ref.id } as RecordRef);
  };
  const deleted = (ref: RecordRef): boolean => changes.deleted.some((d) => keyOf(d) === keyOf(ref));
  const made = (ref: RecordRef): boolean => changes.created.some((c) => keyOf(c) === keyOf(ref)) || changes.deleted.some((d) => keyOf(d) === keyOf(ref));

  for (const ref of all) {
    if (isSearchKind(ref.kind)) direct.set(keyOf(ref), ref);
    switch (ref.kind) {
      case 'topic_mapping':
      case 'exam_relevance':
        target(targetOf(state, ref));
        target(previousTarget(changes, ref, targetOf(state, ref)));
        concepts = true;
        break;
      case 'relationship':
        concepts = true;
        break;
      case 'reaction':
      case 'named_reaction':
        if (made(ref) || changedField(changes, state, ref, ['prerequisiteConceptIds'])) concepts = true;
        break;
      case 'reagent':
        if (made(ref) || changedField(changes, state, ref, ['families'])) {
          for (const referrer of indexes.referrersOf(ref.id)) if (referrer.owner.kind === 'reaction') target(referrer.owner);
        }
        break;
      case 'exam_version':
        if (made(ref) || changedField(changes, state, ref, ['units', 'examId'])) everything = true;
        break;
      case 'topic':
        if (deleted(ref) || changedField(changes, state, ref, ['parentId'])) everything = true;
        break;
      default:
        break;
    }
  }
  if (everything) for (const ref of allRefs(state)) behind.set(keyOf(ref), ref);
  else if (concepts) for (const ref of allRefs(state, ['concept'])) behind.set(keyOf(ref), ref);
  for (const key of direct.keys()) behind.delete(key);
  return { direct: [...direct.values()].sort(byKey), behind: [...behind.values()].sort(byKey), reload: false };
}
