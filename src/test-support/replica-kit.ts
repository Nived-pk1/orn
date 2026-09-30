/**
 * Helpers for the compute replica tests (step 4.2b): what "the replica equals the store" means, and a store whose ChangeSets
 * are forwarded to an in-process replica, each one through `structuredClone` (a real worker only ever sees a clone). Test-only.
 */
import { expect } from 'vitest';
import type { StoreHandle } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset';
import { coreIndexEngine } from '@/core/indexes/engine';
import { indexEngine } from '@/core/indexes/full';
import { RECORD_KINDS, type AnyRecord, type CanonicalState } from '@/core/schema';
import { validator, type Finding } from '@/core/validation';
import { createReplica, type Replica, type ReplicaOptions } from '@/workers/compute/replica';
import { derivedSnapshot, idsOf } from './index-snapshot';

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const sortedFindings = (findings: readonly Finding[]): Finding[] => [...findings].sort(byId);

export function loadedReplica(state: CanonicalState, revision = 0, options: ReplicaOptions = {}): Replica {
  const replica = createReplica(options);
  replica.load(state, revision);
  return replica;
}

/** A replica loaded from `store` now, then fed every ChangeSet the store announces (cloned), in order. */
export function followingReplica(
  store: StoreHandle,
  options: ReplicaOptions = {},
): { readonly replica: Replica; readonly unsubscribe: () => void; readonly forwarded: ChangeSet[] } {
  const replica = loadedReplica(store.getState(), store.getRevision(), options);
  const forwarded: ChangeSet[] = [];
  const unsubscribe = store.subscribe((changes) => {
    forwarded.push(changes);
    const answer = replica.apply(structuredClone(changes));
    if (!answer.ok) throw new Error(`replica refused revision ${changes.revision}: it is at ${answer.have}`);
  });
  return { replica, unsubscribe, forwarded };
}

/** The replica's findings are what a full pass over a freshly built index gives (the finding-level INV-18). */
export function expectFindingsEqualFull(replica: Replica, label: string): void {
  const held = replica.snapshot();
  const fresh = coreIndexEngine.build(held.state, held.revision);
  expect(sortedFindings(held.findings.all()), label).toEqual(sortedFindings(validator.validateAll(held.state, fresh)));
}

/** State, revision and every index answer equal the store's; the derived (cross-record) indexes equal a fresh build. */
export function expectReplicaEqualsStore(replica: Replica, store: StoreHandle, label: string): void {
  const held = replica.snapshot();
  expect(held.revision, `${label}: revision`).toBe(store.getRevision());
  expect(held.state, `${label}: state`).toEqual(store.getState());
  expect(held.indexes.revision, `${label}: index revision`).toBe(store.getIndexes().revision);
  const live = store.getIndexes();
  for (const kind of RECORD_KINDS) {
    for (const record of Object.values(held.state.records[kind] as Readonly<Record<string, AnyRecord>>)) {
      expect(held.indexes.referrersOf(record.id), `${label}: referrersOf ${record.id}`).toEqual(live.referrersOf(record.id));
      expect(held.indexes.definersOf(record.id), `${label}: definersOf ${record.id}`).toEqual(live.definersOf(record.id));
      expect(held.indexes.linkersOf(record.id), `${label}: linkersOf ${record.id}`).toEqual(live.linkersOf(record.id));
      if (record.kind === 'class') expect(held.indexes.classAncestors(record.id), `${label}: classAncestors ${record.id}`).toEqual(live.classAncestors(record.id));
    }
  }
  const ids = idsOf(held.state);
  expect(derivedSnapshot(held.indexes, ids), `${label}: derived indexes`).toEqual(derivedSnapshot(indexEngine.build(held.state, held.revision), ids));
  expect(sortedFindings(held.findings.all()), `${label}: findings vs the store`).toEqual(sortedFindings(store.findings.all()));
  expectFindingsEqualFull(replica, label);
}
