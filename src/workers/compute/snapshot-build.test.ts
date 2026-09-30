/**
 * Snapshot bytes built in the worker (step 4.2c): byte-equal to the persistence codec's for the same inputs, so the adapter's
 * decoder reads them back; deterministic (INV-19); and the handler's rules (`REPLICA_STALE` as a value, a bad timestamp is
 * `BAD_REQUEST`, the bytes are transferred).
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { decodeSnapshot, buildSnapshot } from '@/persistence/snapshot-codec';
import { loadFixtureState } from '@/test-support/state-fixture';
import { rig } from '@/test-support/compute-rig';
import { makeStore } from '@/test-support/command-kit';
import { SNAPSHOT_GENERATOR, buildSnapshotBytes } from './snapshot-build';

const MAX = loadFixtureState('maximal-valid');
const AT = '2026-09-30T12:00:00.000Z';

describe('buildSnapshotBytes', () => {
  it('equals the persistence codec byte for byte, and decodeSnapshot reads it back to the same state', () => {
    const mine = buildSnapshotBytes(MAX, AT);
    const theirs = buildSnapshot({ id: 'snp_x', createdAt: AT, reason: 'pre_import', state: MAX, revision: 1, generator: SNAPSHOT_GENERATOR });
    if (!mine.ok || !theirs.ok) throw new Error('did not serialise');
    expect(mine.bytes).toEqual(theirs.built.bytes);
    expect(mine.schemaVersion).toBe(theirs.built.summary.schemaVersion);
    const decoded = decodeSnapshot(mine.bytes);
    if (!decoded.ok) throw new Error(decoded.message);
    const state = documentToState(decoded.doc as never);
    expect(state.ok && state.state).toEqual(MAX);
  });

  it('is deterministic: the same state and time give the same bytes', () => {
    const [a, b] = [buildSnapshotBytes(MAX, AT), buildSnapshotBytes(MAX, AT)];
    expect(a.ok && b.ok && a.bytes).toEqual(a.ok && b.ok && b.bytes);
  });
});

describe('the snapshotBuild handler', () => {
  it('answers the bytes of the replica at that revision, transferred; REPLICA_STALE as a value for another one', async () => {
    const r = rig({ store: makeStore(MAX, { revision: 4 }) });
    await r.sync.settled();
    const built = await r.sync.client.snapshotBuild({ revision: 4, reason: 'pre_import', exportedAt: AT });
    if (!built.ok || !built.value.ok) throw new Error('snapshotBuild failed');
    expect(built.value).toMatchObject({ revision: 4, reason: 'pre_import' });
    expect(built.value.bytes.byteLength).toBeGreaterThan(100);
    expect(await r.sync.client.snapshotBuild({ revision: 5, reason: 'pre_import', exportedAt: AT })).toEqual({ ok: true, value: { ok: false, code: 'REPLICA_STALE', have: 4 } });
    r.sync.stop();
  });

  it('a timestamp that is not a UTC ISO instant is BAD_REQUEST, and nothing is built', async () => {
    const r = rig();
    await r.sync.settled();
    const answer = await r.sync.client.snapshotBuild({ revision: 0, reason: 'pre_import', exportedAt: 'noon' });
    expect(answer).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    r.sync.stop();
  });

  it('before the first load it is NOT_READY', async () => {
    const r = rig({ wrap: (_, api) => ({ ...api, loadReplica: () => new Promise(() => undefined) }) });
    const answer = await r.sync.client.snapshotBuild({ revision: 0, reason: 'pre_import', exportedAt: AT });
    expect(answer).toMatchObject({ ok: false, error: { code: 'NOT_READY' } });
    r.sync.stop();
  });
});
