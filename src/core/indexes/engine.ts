/**
 * Part-1 index engine (steps 1.6, 1.7): reverse references, nested-ID definers, folded names and hierarchy ancestry.
 * Each record contributes only from its own content, so a ChangeSet is applied by retracting the
 * old contribution of every touched record and adding the new one: O(changed × references).
 * Results equal a rebuild (INV-18) and are deterministic (buckets are sorted).
 */
import type { AnyRecord, CanonicalState, ClassId, RecordKind, RecordRef } from '../schema';
import { RECORD_KINDS, recordKindOfId } from '../schema';
import type { ChangeSet } from '../dataset/contracts';
import { referenceEngine } from '../references';
import type { Referrer } from '../references/contracts';
import type { CoreIndexEngine, CoreIndexes, HierarchyKind } from './contracts';
import { closure, isParentPath, parentIdsOf } from './hierarchy';
import { foldedNamesOf } from './names';

/** Buckets are replaced, never mutated, so an array handed out earlier stays a valid snapshot. */
interface IndexData {
  /** Target ID → referrers, sorted by owner ID then path. */
  readonly referrers: Map<string, readonly Referrer[]>;
  /** Owner ID → the references it contributes (needed to retract them). */
  readonly outgoing: Map<string, readonly Referrer[]>;
  /** `kind|folded` → records carrying that name, sorted by ID. */
  readonly names: Map<string, readonly RecordRef[]>;
  /** Owner ID → the name keys it contributes. */
  readonly namesOf: Map<string, readonly string[]>;
  /** Nested ID → records defining it, sorted by ID. */
  readonly definers: Map<string, readonly RecordRef[]>;
  /** Owner ID → the distinct nested IDs it defines. */
  readonly definedBy: Map<string, readonly string[]>;
  /** Incremented by every in-place apply; older handles then refuse to answer. */
  generation: number;
}

/** Buckets touched since the last sort. */
interface Dirty {
  readonly referrers: Set<string>;
  readonly names: Set<string>;
  readonly definers: Set<string>;
}

const EMPTY: readonly never[] = [];
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byOwnerThenPath = (a: Referrer, b: Referrer): number =>
  compare(a.owner.id, b.owner.id) || compare(a.path, b.path);
const byId = (a: RecordRef, b: RecordRef): number => compare(a.id, b.id);
const nameKey = (kind: RecordKind, folded: string): string => `${kind}|${folded}`;

/** Copies a bucket the first time it is touched, then pushes in place (it is private until sorted). */
function append<T>(map: Map<string, readonly T[]>, touched: Set<string>, key: string, item: T): void {
  const own = touched.has(key) ? (map.get(key) as T[] | undefined) : undefined;
  if (own !== undefined) own.push(item);
  else map.set(key, [...(map.get(key) ?? EMPTY), item]);
  touched.add(key);
}

function retract<T>(map: Map<string, readonly T[]>, key: string, keep: (item: T) => boolean): void {
  const rest = (map.get(key) ?? EMPTY).filter(keep);
  if (rest.length === 0) map.delete(key);
  else map.set(key, rest);
}

function addRecord(data: IndexData, record: AnyRecord, dirty: Dirty): void {
  const owner: RecordRef = { kind: record.kind, id: record.id };
  const refs: Referrer[] = referenceEngine.extract(record).map((ref) => ({
    owner,
    path: ref.path,
    targetId: ref.targetId,
    onDelete: ref.spec.onDelete,
  }));
  if (refs.length > 0) data.outgoing.set(record.id, refs);
  for (const ref of refs) {
    append(data.referrers, dirty.referrers, ref.targetId, ref);
  }
  const keys = foldedNamesOf(record).map((folded) => nameKey(record.kind, folded));
  if (keys.length > 0) data.namesOf.set(record.id, keys);
  for (const key of keys) {
    append(data.names, dirty.names, key, owner);
  }
  const defined = [...new Set(referenceEngine.nestedIds(record).map((nested) => nested.id))];
  if (defined.length > 0) data.definedBy.set(record.id, defined);
  for (const nestedId of defined) {
    append(data.definers, dirty.definers, nestedId, owner);
  }
}

function removeRecord(data: IndexData, id: string): void {
  for (const target of new Set((data.outgoing.get(id) ?? EMPTY).map((ref) => ref.targetId))) {
    retract(data.referrers, target, (ref) => ref.owner.id !== id);
  }
  data.outgoing.delete(id);
  for (const key of data.namesOf.get(id) ?? EMPTY) retract(data.names, key, (ref) => ref.id !== id);
  data.namesOf.delete(id);
  for (const nestedId of data.definedBy.get(id) ?? EMPTY) retract(data.definers, nestedId, (ref) => ref.id !== id);
  data.definedBy.delete(id);
}

function sortDirty(data: IndexData, dirty: Dirty): void {
  for (const key of dirty.referrers) {
    (data.referrers.get(key) as Referrer[] | undefined)?.sort(byOwnerThenPath);
  }
  for (const key of dirty.names) {
    (data.names.get(key) as RecordRef[] | undefined)?.sort(byId);
  }
  for (const key of dirty.definers) {
    (data.definers.get(key) as RecordRef[] | undefined)?.sort(byId);
  }
}

function recordIn(state: CanonicalState, kind: RecordKind, id: string): AnyRecord | undefined {
  return (state.records[kind] as Readonly<Record<string, AnyRecord>>)[id];
}

const STALE = 'Stale index handle: use the value returned by the latest apply()';

class IndexHandle implements CoreIndexes {
  private readonly generation: number;

  constructor(
    readonly revision: number,
    private readonly state: CanonicalState,
    private readonly data: IndexData,
  ) {
    this.generation = data.generation;
  }

  /** The shared data, for `apply`; refuses once a later apply has taken over. */
  takeData(): IndexData {
    return this.live();
  }

  private live(): IndexData {
    if (this.data.generation !== this.generation) throw new Error(STALE);
    return this.data;
  }

  get(id: string): AnyRecord | undefined {
    this.live();
    const kind = recordKindOfId(id);
    return kind === undefined ? undefined : recordIn(this.state, kind, id);
  }

  referrersOf(id: string): readonly Referrer[] {
    return this.live().referrers.get(id) ?? EMPTY;
  }

  definersOf(id: string): readonly RecordRef[] {
    return this.live().definers.get(id) ?? EMPTY;
  }

  byFoldedName(kind: RecordKind, folded: string): readonly RecordRef[] {
    return this.live().names.get(nameKey(kind, folded)) ?? EMPTY;
  }

  ancestorsOf(kind: HierarchyKind, id: string): readonly string[] {
    this.live();
    const table = this.state.records[kind] as Readonly<Record<string, AnyRecord>>;
    if (table[id] === undefined) return EMPTY;
    // Dangling parents are validation findings (L2); with no record there is nothing to walk through.
    return closure(id, (current) =>
      parentIdsOf(table[current], kind).filter((parent) => table[parent] !== undefined),
    );
  }

  descendantsOf(kind: HierarchyKind, id: string): readonly string[] {
    this.live();
    return closure(id, (current) =>
      this.referrersOf(current)
        .filter((ref) => ref.owner.kind === kind && isParentPath(ref.path, kind))
        .map((ref) => ref.owner.id),
    );
  }

  classAncestors(id: ClassId): readonly ClassId[] {
    return this.ancestorsOf('class', id) as readonly ClassId[];
  }
}

function build(state: CanonicalState, revision = 0): CoreIndexes {
  const data: IndexData = {
    referrers: new Map(),
    outgoing: new Map(),
    names: new Map(),
    namesOf: new Map(),
    definers: new Map(),
    definedBy: new Map(),
    generation: 0,
  };
  const dirty: Dirty = { referrers: new Set(), names: new Set(), definers: new Set() };
  for (const kind of RECORD_KINDS) {
    for (const record of Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>)) {
      addRecord(data, record, dirty);
    }
  }
  sortDirty(data, dirty);
  return new IndexHandle(revision, state, data);
}

function apply(previous: CoreIndexes, changes: ChangeSet, next: CanonicalState): CoreIndexes {
  if (!(previous instanceof IndexHandle)) throw new TypeError('apply() needs indexes built by this engine');
  // A replace, or a gap in the revision chain, cannot be applied incrementally: rebuild instead.
  if (changes.cause === 'replace' || changes.revision !== previous.revision + 1) {
    return build(next, changes.revision);
  }
  const data = previous.takeData();
  const dirty: Dirty = { referrers: new Set(), names: new Set(), definers: new Set() };
  for (const ref of changes.deleted) removeRecord(data, ref.id);
  for (const ref of [...changes.created, ...changes.updated]) {
    const record = recordIn(next, ref.kind, ref.id);
    if (record === undefined) throw new Error(`ChangeSet names ${ref.id} but the next state has no such record`);
    removeRecord(data, ref.id);
    addRecord(data, record, dirty);
  }
  sortDirty(data, dirty);
  data.generation += 1;
  return new IndexHandle(changes.revision, next, data);
}

export const coreIndexEngine: CoreIndexEngine = { build, apply };
