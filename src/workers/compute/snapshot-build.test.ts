/**
 * Snapshot bytes built in the worker (step 4.2c): deterministic (INV-19), and the handler's rules (`REPLICA_STALE` as a value,
 * a bad timestamp is `BAD_REQUEST`, the bytes are transferred). Byte equality with the persistence codec is proved in
 * tests/integration/snapshot-builder-equality.test.ts, which may import both sides.
 */
import { describe, expect, it } from 'vitest';
import { DatasetDocumentSchema } from '@/core/schema';
import { decodeSnapshot } from '@/persistence/snapshot-codec';
import { loadFixtureState } from '@/test-support/state-fixture';
import { rig, TEST_GENERATOR } from '@/test-support/compute-rig';
import { makeStore } from '@/test-support/command-kit';
import { buildSnapshotBytes } from './snapshot-build';

const MAX = loadFixtureState('maximal-valid');
const AT = '2026-09-30T12:00:00.000Z';

describe('buildSnapshotBytes', () => {
  it('is deterministic: the same state and time give the same bytes', () => {
    const [a, b] = [buildSnapshotBytes(MAX, AT, TEST_GENERATOR), buildSnapshotBytes(MAX, AT, TEST_GENERATOR)];
    expect(a.ok && b.ok && a.bytes).toEqual(a.ok && b.ok && b.bytes);
  });
});

describe('the snapshotBuild handler', () => {
  it('answers the bytes of the replica at that revision, transferred; REPLICA_STALE as a value for another one', async () => {
    const r = rig({ store: makeStore(MAX, { revision: 4 }) });
    await r.sync.settled();
    const built = await r.sync.client.snapshotBuild({ revision: 4, reason: 'pre_import', exportedAt: AT, generator: TEST_GENERATOR });
    if (!built.ok || !built.value.ok) throw new Error('snapshotBuild failed');
    expect(built.value).toMatchObject({ revision: 4, reason: 'pre_import' });
    expect(built.value.bytes.byteLength).toBeGreaterThan(100);
    // The document carries the generator main gave: the worker keeps none of its own.
    const decoded = decodeSnapshot(built.value.bytes);
    if (!decoded.ok) throw new Error(decoded.message);
    expect(DatasetDocumentSchema.parse(decoded.doc).generator).toEqual(TEST_GENERATOR);
    expect(await r.sync.client.snapshotBuild({ revision: 5, reason: 'pre_import', exportedAt: AT, generator: TEST_GENERATOR })).toEqual({ ok: true, value: { ok: false, code: 'REPLICA_STALE', have: 4 } });
    r.sync.stop();
  });

  it('a timestamp that is not a UTC ISO instant is BAD_REQUEST, and nothing is built', async () => {
    const r = rig();
    await r.sync.settled();
    const answer = await r.sync.client.snapshotBuild({ revision: 0, reason: 'pre_import', exportedAt: 'noon', generator: TEST_GENERATOR });
    expect(answer).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    r.sync.stop();
  });

  it('before the first load it is NOT_READY', async () => {
    const r = rig({ wrap: (_, api) => ({ ...api, loadReplica: () => new Promise(() => undefined) }) });
    const answer = await r.sync.client.snapshotBuild({ revision: 0, reason: 'pre_import', exportedAt: AT, generator: TEST_GENERATOR });
    expect(answer).toMatchObject({ ok: false, error: { code: 'NOT_READY' } });
    r.sync.stop();
  });
});
