import { zlibSync, strToU8 } from 'fflate';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { CURRENT_SCHEMA_VERSION, DatasetDocumentSchema, type CanonicalState } from '@/core/schema';
import { loadFixtureState } from '@/test-support/state-fixture';
import { buildSnapshot, decodeSnapshot, type SnapshotBuildInput } from './snapshot-codec';

const state = loadFixtureState('maximal-valid');
const input = (over: Partial<SnapshotBuildInput> = {}): SnapshotBuildInput => ({
  id: 'snp_test',
  createdAt: '2026-09-28T10:00:00.000Z',
  reason: 'manual',
  state,
  revision: 7,
  generator: { app: 'test', version: '0' },
  ...over,
});

function built(over: Partial<SnapshotBuildInput> = {}) {
  const result = buildSnapshot(input(over));
  if (!result.ok) throw new Error(`build failed: ${JSON.stringify(result.issues)}`);
  return result.built;
}

describe('buildSnapshot', () => {
  it('describes what it built: ID, reason, revision, schema version, compressed size, optional note', () => {
    const { summary, bytes } = built({ reason: 'pre_import', note: 'before import' });
    expect(summary).toEqual({
      id: 'snp_test',
      createdAt: '2026-09-28T10:00:00.000Z',
      reason: 'pre_import',
      revision: 7,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byteSize: bytes.length,
      note: 'before import',
    });
    expect('note' in built().summary).toBe(false);
  });

  it('is deterministic: the same input gives the same bytes (INV-19 spirit; zlib carries no timestamp)', () => {
    expect(Array.from(built().bytes)).toEqual(Array.from(built().bytes));
  });

  it('compresses', () => {
    const doc = decodeSnapshot(built().bytes);
    expect(doc.ok && JSON.stringify(doc.doc).length).toBeGreaterThan(built().bytes.length);
  });

  it('reports a state that does not serialise instead of storing a snapshot that cannot be restored', () => {
    const [id] = Object.keys(state.records.species);
    const broken: CanonicalState = produce(state, (draft) => {
      (draft.records.species[id as string] as unknown as { id: string }).id = 'not-an-id';
    });
    const result = buildSnapshot(input({ state: broken }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.length).toBeGreaterThan(0);
  });
});

describe('decodeSnapshot', () => {
  it('round trip: the decoded document parses strictly and rebuilds the same state', () => {
    const decoded = decodeSnapshot(built().bytes);
    if (!decoded.ok) throw new Error(decoded.message);
    const parsed = DatasetDocumentSchema.parse(decoded.doc);
    expect(parsed.exportScope).toBe('full');
    expect(parsed.exportedAt).toBe('2026-09-28T10:00:00.000Z');
    const back = documentToState(parsed);
    expect(back.ok && back.state).toEqual(state);
  });

  it('bytes that are not a zlib stream are reported, not thrown', () => {
    const result = decodeSnapshot(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('not a readable snapshot') });
  });

  it('a truncated stream is reported', () => {
    const { bytes } = built();
    expect(decodeSnapshot(bytes.slice(0, Math.floor(bytes.length / 2))).ok).toBe(false);
  });

  it('a flipped byte in the middle is reported (checksum or structure)', () => {
    const bytes = built().bytes.slice();
    const at = Math.floor(bytes.length / 2);
    bytes[at] = (bytes[at] ?? 0) ^ 0xff;
    expect(decodeSnapshot(bytes).ok).toBe(false);
  });

  it('valid zlib that is not JSON is reported', () => {
    expect(decodeSnapshot(zlibSync(strToU8('this is not json'))).ok).toBe(false);
  });

  it('valid JSON that is not an ORN dataset is reported', () => {
    for (const text of ['[]', '{}', '{"format":"other","schemaVersion":1,"records":{}}', '{"format":"orn.dataset","schemaVersion":"1","records":{}}', '{"format":"orn.dataset","schemaVersion":1,"records":[]}']) {
      expect(decodeSnapshot(zlibSync(strToU8(text)))).toMatchObject({ ok: false, message: expect.stringContaining('not an ORN dataset') });
    }
  });

  it('the version only has to be a number: whether the runner accepts it is not the codec’s call', () => {
    for (const version of [0, -1, 1.5, 7]) {
      const bytes = zlibSync(strToU8(JSON.stringify({ format: 'orn.dataset', schemaVersion: version, records: {} })));
      expect(decodeSnapshot(bytes)).toMatchObject({ ok: true, doc: { schemaVersion: version } });
    }
  });

  it('inflation is bounded: a stream that expands past the cap is refused', () => {
    const bomb = zlibSync(new Uint8Array(200_000));
    expect(decodeSnapshot(bomb, 1000)).toMatchObject({ ok: false, message: expect.stringContaining('inflates to more than 1000 bytes') });
    expect(decodeSnapshot(bomb, 1_000_000).ok).toBe(false);
  });

  it('a document is returned as it is, unknown keys included: migration is the caller’s job', () => {
    const doc = { format: 'orn.dataset', schemaVersion: 1, records: {}, meta: { anything: true }, futureKey: [1, 2] };
    const decoded = decodeSnapshot(zlibSync(strToU8(JSON.stringify(doc))));
    expect(decoded).toEqual({ ok: true, doc });
  });
});
