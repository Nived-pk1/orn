/**
 * Step 4.2c review, follow-up b: the compute worker repeats the few lines of `buildSnapshot` (a worker never imports
 * persistence, ADR-034 D1), so a guard proves the two sides cannot drift. This file may import both sides. The worker's
 * bytes equal the codec's byte for byte over the schema fixtures, the demo and every generator shape, and the decoder reads
 * them back to the same state. The constants both sides use (generator name and version, compression level, schema version)
 * are asserted equal, so a changed default on one side fails here instead of silently writing a different stream.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { CURRENT_SCHEMA_VERSION, DatasetDocumentSchema, type CanonicalState } from '@/core/schema';
import { DEFAULT_GENERATOR } from '@/persistence/adapter';
import { COMPRESSION_LEVEL, buildSnapshot, decodeSnapshot } from '@/persistence/snapshot-codec';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { loadFixtureState } from '@/test-support/state-fixture';
import { SNAPSHOT_COMPRESSION_LEVEL, SNAPSHOT_GENERATOR, buildSnapshotBytes } from '@/workers/compute/snapshot-build';

const AT = '2026-09-30T12:00:00.000Z';

function expectEqualBytes(state: CanonicalState): void {
  const mine = buildSnapshotBytes(state, AT);
  const theirs = buildSnapshot({ id: 'snp_x', createdAt: AT, reason: 'pre_import', state, revision: 1, generator: DEFAULT_GENERATOR });
  if (!mine.ok || !theirs.ok) throw new Error('did not serialise');
  expect(mine.bytes).toEqual(theirs.built.bytes);
  expect(mine.schemaVersion).toBe(theirs.built.summary.schemaVersion);
  const decoded = decodeSnapshot(mine.bytes);
  if (!decoded.ok) throw new Error(decoded.message);
  const back = documentToState(DatasetDocumentSchema.parse(decoded.doc));
  expect(back.ok && back.state).toEqual(state);
}

describe('the worker snapshot builder equals the persistence codec', () => {
  it('uses the same generator, compression level and schema version', () => {
    expect(SNAPSHOT_GENERATOR).toEqual(DEFAULT_GENERATOR);
    expect(SNAPSHOT_COMPRESSION_LEVEL).toBe(COMPRESSION_LEVEL);
    const built = buildSnapshotBytes(loadFixtureState('minimal-valid'), AT);
    expect(built.ok && built.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(['minimal-valid', 'maximal-valid'] as const)('byte for byte on fixture %s', (name) => expectEqualBytes(loadFixtureState(name)));

  it('byte for byte on the demo', () => {
    const demo = documentToState(buildDemoDocument());
    if (!demo.ok) throw new Error('duplicate IDs');
    expectEqualBytes(demo.state);
  });

  it.each(GENERATOR_SHAPES)('byte for byte on the tiny tier, shape %s', (shape) => {
    const parsed = documentToState(generateTier('tiny', shape, 42));
    if (!parsed.ok) throw new Error('duplicate IDs');
    expectEqualBytes(parsed.state);
  });
});
