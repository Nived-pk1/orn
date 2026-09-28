/**
 * Follower support (ADR-033): the state a follower reaches by mirroring one persisted transaction of the writer,
 * as Immer patches so the ChangeSet looks like any other. Pure: no validation, no storage.
 */
import { enablePatches, produceWithPatches, type Patch } from 'immer';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind } from '../schema';
import type { RemoteChange } from './contracts';

enablePatches();

export interface RemotePlan {
  readonly next: CanonicalState;
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}

/** Deleted IDs are removed wherever they are; an upsert replaces the record under its own kind (and only there). */
export function planRemote(state: CanonicalState, change: RemoteChange): RemotePlan {
  const [next, patches, inversePatches] = produceWithPatches(state, (draft) => {
    const tables = draft.records as unknown as Record<RecordKind, Record<string, AnyRecord>>;
    const removeFrom = (id: string, except?: RecordKind): void => {
      for (const kind of RECORD_KINDS) {
        if (kind !== except && Object.hasOwn(tables[kind], id)) Reflect.deleteProperty(tables[kind], id);
      }
    };
    for (const id of change.deletedIds) removeFrom(id);
    for (const record of change.upserts) {
      removeFrom(record.id, record.kind);
      tables[record.kind][record.id] = record;
    }
    if (change.meta !== undefined) draft.meta = change.meta;
  });
  return { next, patches, inversePatches };
}
