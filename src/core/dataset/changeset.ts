/**
 * ChangeSet assembly (docs/ARCHITECTURE.md §2.4). The created/updated/deleted lists come from the
 * Immer patches in O(patches). Patches that replace a whole table or the whole state cannot name
 * records, so those (and any 'replace' cause) fall back to a reference-aware diff of the two states.
 */
import type { Patch } from 'immer';
import { RECORD_KINDS, type CanonicalState, type RecordKind, type RecordRef } from '../schema';
import type { ChangeSet } from './contracts';
import { compareIds } from './document';

export interface ChangeSetInput {
  readonly revision: number;
  readonly label: string;
  readonly cause: ChangeSet['cause'];
  readonly before: CanonicalState;
  readonly after: CanonicalState;
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}

interface Touch {
  readonly kind: RecordKind;
  readonly id: string;
  existedBefore: boolean;
  existsAfter: boolean;
}

type Lists = Pick<ChangeSet, 'created' | 'updated' | 'deleted'>;

const KIND_SET: ReadonlySet<string> = new Set(RECORD_KINDS);
const KIND_ORDER: ReadonlyMap<string, number> = new Map(RECORD_KINDS.map((kind, i) => [kind, i] as const));

function sortRefs(refs: RecordRef[]): RecordRef[] {
  return refs.sort((a, b) => (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0) || compareIds(a.id, b.id));
}

/**
 * Classifies records from patches. A patch at depth 3 (`records/kind/id`) adds, replaces or removes a
 * whole record; a deeper patch implies the record exists. Returns undefined when any patch is too
 * coarse to name a record.
 */
function touchesFromPatches(patches: readonly Patch[]): Touch[] | undefined {
  const touches = new Map<string, Touch>();
  for (const patch of patches) {
    const [root, kind, id] = patch.path;
    if (root === 'meta') continue;
    if (root !== 'records' || typeof kind !== 'string' || !KIND_SET.has(kind) || typeof id !== 'string') return undefined;
    const whole = patch.path.length === 3;
    const existsAfter = !(whole && patch.op === 'remove');
    const key = `${kind}/${id}`;
    const existing = touches.get(key);
    if (existing === undefined) {
      touches.set(key, { kind: kind as RecordKind, id, existedBefore: !(whole && patch.op === 'add'), existsAfter });
    } else {
      existing.existsAfter = existsAfter;
    }
  }
  return [...touches.values()];
}

function classify(touches: readonly Touch[]): Lists {
  const created: RecordRef[] = [];
  const updated: RecordRef[] = [];
  const deleted: RecordRef[] = [];
  for (const t of touches) {
    const ref = { kind: t.kind, id: t.id } as RecordRef;
    if (t.existedBefore && t.existsAfter) updated.push(ref);
    else if (t.existsAfter) created.push(ref);
    else if (t.existedBefore) deleted.push(ref);
  }
  return { created: sortRefs(created), updated: sortRefs(updated), deleted: sortRefs(deleted) };
}

/** Reference-aware state diff: unchanged tables and records are skipped by identity. */
export function diffStates(before: CanonicalState, after: CanonicalState): Lists {
  const touches: Touch[] = [];
  for (const kind of RECORD_KINDS) {
    const a = before.records[kind] as Readonly<Record<string, unknown>>;
    const b = after.records[kind] as Readonly<Record<string, unknown>>;
    if (a === b) continue;
    for (const id of Object.keys(a)) {
      if (!Object.hasOwn(b, id)) touches.push({ kind, id, existedBefore: true, existsAfter: false });
      else if (a[id] !== b[id]) touches.push({ kind, id, existedBefore: true, existsAfter: true });
    }
    for (const id of Object.keys(b)) {
      if (!Object.hasOwn(a, id)) touches.push({ kind, id, existedBefore: false, existsAfter: true });
    }
  }
  return classify(touches);
}

export function assembleChangeSet(input: ChangeSetInput): ChangeSet {
  if (!Number.isInteger(input.revision) || input.revision < 0) {
    throw new RangeError('revision must be a non-negative integer');
  }
  const touches = input.cause === 'replace' ? undefined : touchesFromPatches(input.patches);
  const lists = touches === undefined ? diffStates(input.before, input.after) : classify(touches);
  return {
    revision: input.revision,
    label: input.label,
    cause: input.cause,
    ...lists,
    patches: input.patches,
    inversePatches: input.inversePatches,
  };
}
