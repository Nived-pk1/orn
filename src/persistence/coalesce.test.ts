import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { diffStates } from '@/core/dataset';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { AnyRecord, CanonicalState, RecordKind } from '@/core/schema';
import { loadFixtureState, must } from '@/test-support/state-fixture';
import { mergeBatches, resolveWrites, startBatch } from './coalesce';

const base = loadFixtureState('maximal-valid');
const speciesIds = Object.keys(base.records.species);
const [idA, idB] = [speciesIds[0] as string, speciesIds[1] as string];

/** A ChangeSet between two states, as the store would assemble it. */
function change(before: CanonicalState, after: CanonicalState, revision: number): ChangeSet {
  return { revision, label: 'test', cause: 'command', ...diffStates(before, after), patches: [], inversePatches: [] };
}
const rename = (state: CanonicalState, id: string, name: string): CanonicalState =>
  produce(state, (draft) => {
    (draft.records.species[id] as unknown as { names: { canonical: string } }).names.canonical = name;
  });
const without = (state: CanonicalState, kind: RecordKind, id: string): CanonicalState =>
  produce(state, (draft) => {
    Reflect.deleteProperty(draft.records[kind], id);
  });

describe('coalescing queued ChangeSets', () => {
  it('a single ChangeSet writes its created and updated records and deletes its deleted ones', () => {
    const edited = rename(without(base, 'species', idB), idA, 'renamed');
    const writes = resolveWrites(startBatch(change(base, edited, 1), edited));
    expect(writes.puts.map((r) => r.id)).toEqual([idA]);
    expect(writes.deleteIds).toEqual([idB]);
  });

  it('the latest value wins when a record is updated twice', () => {
    const one = rename(base, idA, 'first');
    const two = rename(one, idA, 'second');
    const batch = mergeBatches(startBatch(change(base, one, 1), one), startBatch(change(one, two, 2), two));
    const writes = resolveWrites(batch);
    expect(writes.puts).toHaveLength(1);
    expect((writes.puts[0] as unknown as { names: { canonical: string } }).names.canonical).toBe('second');
    expect(batch.revision).toBe(2);
    expect(batch.count).toBe(2);
  });

  it('delete then create of the same record is a put (order of deletes and creates kept)', () => {
    const gone = without(base, 'species', idA);
    const back = base;
    const batch = mergeBatches(startBatch(change(base, gone, 1), gone), startBatch(change(gone, back, 2), back));
    const writes = resolveWrites(batch);
    expect(writes.puts.map((r) => r.id)).toEqual([idA]);
    expect(writes.deleteIds).toEqual([]);
  });

  it('create then delete of the same record is a delete', () => {
    const gone = without(base, 'species', idA);
    const batch = mergeBatches(startBatch(change(gone, base, 1), base), startBatch(change(base, gone, 2), gone));
    const writes = resolveWrites(batch);
    expect(writes.puts).toEqual([]);
    expect(writes.deleteIds).toEqual([idA]);
  });

  it('a record touched by several ChangeSets is written once, in first-touch order', () => {
    const one = rename(base, idB, 'b1');
    const two = rename(rename(one, idA, 'a1'), idB, 'b2');
    const batch = mergeBatches(startBatch(change(base, one, 1), one), startBatch(change(one, two, 2), two));
    expect(resolveWrites(batch).puts.map((r: AnyRecord) => r.id)).toEqual([idB, idA]);
  });
});

describe('asset blobs travel with the ChangeSet that created their record', () => {
  const asset = must(Object.values(base.records.asset)[0]);
  const without1 = without(base, 'asset', asset.id);
  const created = change(without1, base, 1);
  const blob = { assetId: asset.id, sha256: asset.sha256, blob: new Blob(['x']) };

  it('is accepted, and kept even when the record is deleted in the same batch (undo needs the bytes)', () => {
    const batch = mergeBatches(startBatch(created, base, [blob]), startBatch(change(base, without1, 2), without1));
    const writes = resolveWrites(batch);
    expect(writes.blobs).toEqual([blob]);
    expect(writes.deleteIds).toContain(asset.id);
  });

  it('is refused for an asset the ChangeSet did not create', () => {
    expect(() => startBatch(change(base, rename(base, idA, 'x'), 1), base, [blob])).toThrow(/no asset record/);
  });

  it('is refused when its hash differs from the record’s', () => {
    expect(() => startBatch(created, base, [{ ...blob, sha256: '0'.repeat(64) }])).toThrow(/sha256/);
  });
});
