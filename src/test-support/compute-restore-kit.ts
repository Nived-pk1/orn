/**
 * Helpers for the tests of snapshot restore in the compute worker (step 4.2d). `restoreRig` is the whole worker-side rig in
 * memory (real handlers behind an in-memory port pair, a real store on the real adapter over fake IndexedDB, the real replica
 * sync, the real restore flow over ports with hooks to break each step); `twinRestore` is the Phase 3 in-process
 * `restoreSnapshot` over a twin store. Test-only.
 */
import { produce } from 'immer';
import { strToU8, zlibSync } from 'fflate';
import type { StoreHandle } from '@/core/commands';
import type { MigrationRunner } from '@/core/migrations/contracts';
import { documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { CURRENT_SCHEMA_VERSION, DatasetDocumentSchema } from '@/core/schema';
import type { RestoreSnapshotResult, SnapshotSummary } from '@/persistence/contracts';
import { restoreSnapshot } from '@/persistence/restore';
import { createComputeRestore, type ComputeRestore, type RestoreSnapshotsPort } from '@/workers/compute/restore-flow';
import { envelope, recordIn, withFields } from './command-kit';
import { persistedStore } from './compute-import-kit';
import { rig, TEST_GENERATOR, type Rig, type RigOptions } from './compute-rig';
import type { TestAdapter } from './persistence-kit';

export const NOW_ISO = '2026-09-30T12:00:00.000Z';
export const IDENTITY: MigrationRunner = { target: 1, run: (doc) => ({ ok: true, doc, steps: [] }) };

export interface RestoreHooks {
  /** Makes the flow's store port read-only (a tab that is not the writer). */
  readOnly?: boolean;
  /** Replaces the adapter's `storeSnapshotBytes` for one test. */
  storeBytes?: RestoreSnapshotsPort['storeSnapshotBytes'];
  /** Replaces the adapter's `readSnapshotBytes` for one test. */
  readBytes?: RestoreSnapshotsPort['readSnapshotBytes'];
  /** Replaces `store.replaceState` for one test (a refusal, an exception, a commit racing the restore). */
  replaceState?: StoreHandle['replaceState'];
}

export interface RestoreRig {
  readonly store: StoreHandle;
  readonly t: TestAdapter;
  readonly r: Rig;
  readonly flow: ComputeRestore;
  readonly hooks: RestoreHooks;
  /** Everything the ports were asked, in order: 'readBytes', 'storeBytes', 'deleteSnapshot', 'replaceState'. */
  readonly calls: string[];
  /** One ordinary edit of the first species (a revision more). */
  edit(): void;
}

/** An editor of `speciesId` on `store`: each call is one ordinary edit with a new note (numbered per editor, so twins stay equal). */
export function speciesEditor(store: StoreHandle, speciesId: string): () => void {
  let edits = 0;
  return () => {
    edits += 1;
    const record = recordIn(store.getState(), 'species', speciesId);
    const result = store.dispatch(envelope(`edit ${edits}`, { type: 'record.update', record: withFields(record, { notes: `edit ${edits}` }) }));
    if (!result.ok) throw new Error(result.error.message);
  };
}

export const firstSpeciesId = (state: CanonicalState): string => Object.keys(state.records.species).sort()[0] as string;

export async function restoreRig(state: CanonicalState, options: { readonly rig?: Omit<RigOptions, 'store'> } = {}): Promise<RestoreRig> {
  const { store, t } = await persistedStore(state);
  const r = rig({ store, ...options.rig });
  await r.sync.settled();
  const hooks: RestoreHooks = {};
  const calls: string[] = [];
  const snapshots: RestoreSnapshotsPort = {
    readSnapshotBytes: (id) => {
      calls.push('readBytes');
      return hooks.readBytes !== undefined ? hooks.readBytes(id) : t.adapter.readSnapshotBytes(id);
    },
    storeSnapshotBytes: (input) => {
      calls.push('storeBytes');
      return hooks.storeBytes !== undefined ? hooks.storeBytes(input) : t.adapter.storeSnapshotBytes(input);
    },
    deleteSnapshot: (id) => {
      calls.push('deleteSnapshot');
      return t.adapter.deleteSnapshot(id);
    },
  };
  const flow = createComputeRestore({
    sync: r.sync,
    store: {
      getRevision: () => store.getRevision(),
      isReadOnly: () => hooks.readOnly ?? store.isReadOnly(),
      replaceState: (next, reason, precomputed) => {
        calls.push('replaceState');
        return hooks.replaceState !== undefined ? hooks.replaceState(next, reason, precomputed) : store.replaceState(next, reason, precomputed);
      },
    },
    snapshots,
    ids: { now: () => NOW_ISO },
    generator: TEST_GENERATOR,
  });
  const speciesId = firstSpeciesId(state);
  return { store, t, r, flow, hooks, calls, edit: speciesEditor(store, speciesId) };
}

/** The Phase 3 restore over a twin store and adapter (the same seed, so the same snapshot IDs). */
export async function twinRestore(state: CanonicalState, runner: MigrationRunner = IDENTITY): Promise<{ readonly store: StoreHandle; readonly t: TestAdapter; readonly edit: () => void; readonly restore: (id: string) => Promise<RestoreSnapshotResult> }> {
  const { store, t } = await persistedStore(state);
  const speciesId = firstSpeciesId(state);
  return { store, t, edit: speciesEditor(store, speciesId), restore: (id) => restoreSnapshot({ id, snapshots: t.adapter, runner, store }) };
}

/** Stores hand-made bytes as a snapshot row, the way an older or damaged one would sit in IndexedDB. */
export async function putRow(t: TestAdapter, id: string, bytes: Uint8Array, schemaVersion = CURRENT_SCHEMA_VERSION): Promise<void> {
  await t.db.snapshots.put({ id, createdAt: '2026-09-28T09:00:00.000Z', reason: 'manual', revision: 1, schemaVersion, byteSize: bytes.length, blob: new Blob([bytes as Uint8Array<ArrayBuffer>]) });
}
export const putDoc = (t: TestAdapter, id: string, doc: unknown, schemaVersion = CURRENT_SCHEMA_VERSION): Promise<void> => putRow(t, id, zlibSync(strToU8(JSON.stringify(doc))), schemaVersion);

/** A stored snapshot's document as a plain object a test can damage. */
export async function docOf(t: TestAdapter, summary: SnapshotSummary): Promise<{ schemaVersion: number; meta: Record<string, unknown>; records: Record<string, unknown[]> } & Record<string, unknown>> {
  const read = await t.adapter.readSnapshot(summary.id);
  if (!read.ok) throw new Error(read.message);
  return structuredClone(read.doc) as never;
}

/** What a stored snapshot holds as a state (its summary fields that do not depend on the clock, and the state). */
export async function snapshotFacts(t: TestAdapter): Promise<readonly unknown[]> {
  const out: unknown[] = [];
  for (const summary of await t.adapter.listSnapshots()) {
    const read = await t.adapter.readSnapshot(summary.id);
    if (!read.ok) throw new Error(read.message);
    const state = documentToState(DatasetDocumentSchema.parse(read.doc));
    out.push({ id: summary.id, reason: summary.reason, revision: summary.revision, schemaVersion: summary.schemaVersion, note: summary.note, state: state.ok ? state.state : null });
  }
  return out;
}

/** `state` with a dangling class reference on its first species: L2 refuses it. */
export const withDanglingClass = (state: CanonicalState): CanonicalState =>
  produce(state, (draft) => {
    (draft.records.species[firstSpeciesId(state)] as unknown as { classIds: string[] }).classIds = ['cls_does-not-exist'];
  });
