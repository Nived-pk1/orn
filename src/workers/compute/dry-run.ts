/**
 * The dry run of a draft (step 6.2a, part 2): L1-L3 of one record as if it were committed, WITHOUT touching the replica. The state is an
 * overlay (the replica's state with ONE table copied and the draft in it) and the indexes are a read-only view that delegates to the
 * replica's, except for the two answers the draft changes: `get` of its own ID and `byFoldedName` (its own names, not the stored ones).
 * Nothing of the replica is copied, mutated or consumed. What the dry run answers is the DRAFT's findings; findings it would cause on
 * other records are the store's gate's at Save (the panel says so). Pure and synchronous.
 */
import { foldedNamesOf } from '@/core/indexes/names';
import type { CoreIndexes } from '@/core/indexes/contracts';
import type { AnyRecord, CanonicalState, RecordKind, RecordRef } from '@/core/schema';
import { RECORD_KINDS } from '@/core/schema';
import { checkRecord } from '@/core/validation';
import type { Finding } from '@/core/validation';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The indexes with the draft standing in for the stored record of its ID. */
function indexView(base: CoreIndexes, kind: RecordKind, id: string, draft: AnyRecord, names: ReadonlySet<string>): CoreIndexes {
  return {
    get revision() {
      return base.revision;
    },
    get: (wanted) => (wanted === id ? draft : base.get(wanted)),
    referrersOf: (target) => base.referrersOf(target),
    definersOf: (target) => base.definersOf(target),
    linkersOf: (target) => base.linkersOf(target),
    byFoldedName(of, folded) {
      const stored = base.byFoldedName(of, folded).filter((ref) => !(of === kind && ref.id === id));
      if (of !== kind || !names.has(folded)) return stored;
      const own: RecordRef = { kind, id } as RecordRef;
      return [...stored, own].sort((a, b) => compare(a.id, b.id));
    },
    ancestorsOf: (hierarchy, target) => base.ancestorsOf(hierarchy, target),
    descendantsOf: (hierarchy, target) => base.descendantsOf(hierarchy, target),
    classAncestors: (target) => base.classAncestors(target),
  };
}

export type DryRunResult = { readonly ok: true; readonly findings: readonly Finding[] } | { readonly ok: false; readonly code: 'NOT_A_RECORD'; readonly message: string };

/** L1-L3 of `draft` as a record of `kind`, against the replica's `state` and `indexes` (neither is changed). */
export function dryRun(state: CanonicalState, indexes: CoreIndexes, kind: RecordKind, draft: unknown): DryRunResult {
  if (!(RECORD_KINDS as readonly string[]).includes(kind)) return { ok: false, code: 'NOT_A_RECORD', message: `"${kind}" is not a record kind` };
  const id = (draft as { id?: unknown } | null)?.id;
  const value = draft as AnyRecord;
  // A draft that is not even an object with an ID cannot stand in a table: L1 alone answers (it names every problem).
  if (typeof id !== 'string' || id === '' || typeof draft !== 'object') return { ok: true, findings: checkRecord(kind, draft, { state, indexes }) };
  const table = state.records[kind] as Readonly<Record<string, AnyRecord>>;
  const overlay: CanonicalState = { ...state, records: { ...state.records, [kind]: { ...table, [id]: value } } } as CanonicalState;
  const view = indexView(indexes, kind, id, value, new Set(foldedNamesOf(value)));
  return { ok: true, findings: checkRecord(kind, draft, { state: overlay, indexes: view }) };
}
