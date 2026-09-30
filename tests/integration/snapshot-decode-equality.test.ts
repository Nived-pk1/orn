/**
 * Step 4.2c review (same rule as follow-up b), applied to step 4.2d: the compute worker repeats the persistence codec's
 * `decodeSnapshot` and the store-free steps of `readSnapshot` + `restoreSnapshot` (a worker never imports persistence). This
 * file may import both sides and proves they cannot drift: the same bytes give the same value, message and issue list over
 * valid, older, damaged, oversized and invalid input, and the size cap is the codec's.
 */
import { strToU8, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { MigrationRunner } from '@/core/migrations/contracts';
import { createMigrationRunner } from '@/core/migrations';
import { documentToState } from '@/core/dataset';
import { DatasetDocumentSchema } from '@/core/schema';
import { restoreSnapshot } from '@/persistence/restore';
import { SNAPSHOT_MAX_JSON_BYTES, buildSnapshot, decodeSnapshot } from '@/persistence/snapshot-codec';
import { buildDemoDocument } from '@/test-support/demo';
import { docOf, IDENTITY, putRow, twinRestore } from '@/test-support/compute-restore-kit';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { loadFixtureState } from '@/test-support/state-fixture';
import { WORKER_SNAPSHOT_MAX_JSON_BYTES, decodeSnapshotBytes, restoreDocument } from '@/workers/compute/snapshot-decode';

const base = loadFixtureState('maximal-valid');
const bytesOf = (state = base): Uint8Array => {
  const built = buildSnapshot({ id: 'snp_x', createdAt: '2026-09-30T12:00:00.000Z', reason: 'manual', state, revision: 1, generator: { app: 't', version: '0' } });
  if (!built.ok) throw new Error('setup');
  return built.built.bytes;
};
const json = (value: unknown): Uint8Array => zlibSync(strToU8(JSON.stringify(value)));

describe('decodeSnapshotBytes equals decodeSnapshot', () => {
  it('uses the codec size cap', () => {
    expect(WORKER_SNAPSHOT_MAX_JSON_BYTES).toBe(SNAPSHOT_MAX_JSON_BYTES);
  });

  const inputs: readonly (readonly [string, Uint8Array])[] = [
    ['a valid snapshot', bytesOf()],
    ['the demo', (() => { const demo = documentToState(buildDemoDocument()); if (!demo.ok) throw new Error('setup'); return bytesOf(demo.state); })()],
    ['empty bytes', new Uint8Array(0)],
    ['garbage', new Uint8Array(200).fill(7)],
    ['a truncated stream', bytesOf().slice(0, 100)],
    ['valid zlib, not JSON', zlibSync(strToU8('not json'))],
    ['JSON that is not an object', json([1, 2, 3])],
    ['the wrong format', json({ format: 'other', schemaVersion: 1, records: {} })],
    ['no records', json({ format: 'orn.dataset', schemaVersion: 1 })],
    ['a string schema version', json({ format: 'orn.dataset', schemaVersion: '1', records: {} })],
    ['records that are not lists', json({ format: 'orn.dataset', schemaVersion: 1, records: { species: {} } })],
    ['a newer schema version (tolerated by the envelope)', json({ format: 'orn.dataset', schemaVersion: 9, records: {} })],
  ];
  it.each(inputs)('%s: the same value and message', (_label, bytes) => {
    expect(decodeSnapshotBytes(bytes)).toEqual(decodeSnapshot(bytes));
  });

  it('a stream that inflates past the cap is refused the same way (a small cap makes it cheap to prove)', () => {
    const bytes = bytesOf();
    for (const cap of [10, 1_000, 100_000]) expect(decodeSnapshotBytes(bytes, cap)).toEqual(decodeSnapshot(bytes, cap));
    expect(decodeSnapshotBytes(bytes, 10)).toMatchObject({ ok: false, message: expect.stringContaining('inflates to more than 10 bytes') });
  });

  it('every generator shape decodes to the same document', () => {
    for (const shape of GENERATOR_SHAPES) {
      const parsed = documentToState(generateTier('tiny', shape, 42));
      if (!parsed.ok) throw new Error('setup');
      const bytes = bytesOf(parsed.state);
      expect(decodeSnapshotBytes(bytes)).toEqual(decodeSnapshot(bytes));
    }
  });
});

describe('restoreDocument equals readSnapshot + restoreSnapshot on the store-free steps', () => {
  /** The in-process restore of `bytes` stored as `snp_t`, refused before the store is touched: the refusal, or "accepted" with the state. */
  async function inProcess(bytes: Uint8Array, schemaVersion: number, runner: MigrationRunner): Promise<unknown> {
    const twin = await twinRestore(base, runner);
    await putRow(twin.t, 'snp_t', bytes, schemaVersion);
    const result = await restoreSnapshot({ id: 'snp_t', snapshots: twin.t.adapter, runner, store: twin.store });
    return result.ok ? { ok: true, state: twin.store.getState(), steps: result.migrationSteps } : result;
  }
  async function inWorker(bytes: Uint8Array, schemaVersion: number, runner: MigrationRunner): Promise<unknown> {
    const restored = restoreDocument({ bytes, id: 'snp_t', schemaVersion }, runner);
    return restored.ok ? { ok: true, state: restored.state, steps: restored.steps } : restored.answer;
  }
  const same = async (bytes: Uint8Array, schemaVersion: number, runner: MigrationRunner = IDENTITY): Promise<void> => {
    const worker = (await inWorker(bytes, schemaVersion, runner)) as { ok: boolean; state?: unknown };
    const local = (await inProcess(bytes, schemaVersion, runner)) as { ok: boolean; state?: unknown };
    if (worker.ok) {
      expect(local.ok).toBe(true);
      expect(worker).toEqual(local);
    } else {
      // The refusals have the same code, message and detail; `REJECTED` (the store's refusal) is not a store-free step.
      expect(worker).toEqual(local);
    }
  };

  it('a valid snapshot restores to the same state and steps; a summary version that differs from the document is CORRUPT in both', async () => {
    await same(bytesOf(), 1);
    await same(bytesOf(), 2);
  });

  it('damaged input: the same CORRUPT message', async () => {
    await same(new Uint8Array(64).fill(3), 1);
    await same(zlibSync(strToU8('nope')), 1);
    await same(json({ format: 'other' }), 1);
  });

  it('older data through an injected runner, a failing runner, and the real runner on a newer version', async () => {
    const steps = [{ from: 0, to: 1, description: 'noop', changedRecordIds: [], notes: [] }];
    await same(bytesOf(), 1, { target: 1, run: (doc) => ({ ok: true, doc, steps }) });
    await same(bytesOf(), 1, { target: 1, run: () => ({ ok: false, code: 'STEP_FAILED', message: 'exploded', atVersion: 0 }) });
    await same(json({ format: 'orn.dataset', schemaVersion: 2, records: {} }), 2, createMigrationRunner());
  });

  it('invalid documents: L1 issues (capped at 20, the same 20) and duplicate IDs', async () => {
    const twin = await twinRestore(base);
    const source = await twin.t.adapter.createSnapshot('manual', base, 1);
    const l1 = await docOf(twin.t, source);
    for (const row of l1.records['species'] as { id: string }[]) row.id = 'not-an-id';
    await same(json(l1), 1);
    const dup = await docOf(twin.t, source);
    (dup.records['species'] as unknown[]).push(structuredClone((dup.records['species'] as unknown[])[0]));
    await same(json(dup), 1);
    const strict = DatasetDocumentSchema.safeParse(l1);
    expect(strict.success).toBe(false);
  });
});
