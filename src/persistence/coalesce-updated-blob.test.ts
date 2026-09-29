/** Step 3.7 amendment: a blob may also ride with an asset record the ChangeSet UPDATED (an import replaced it with different bytes). */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { diffStates } from '@/core/dataset';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
import { loadFixtureState } from '@/test-support/state-fixture';
import { startBatch } from './coalesce';

const base = loadFixtureState('maximal-valid');
const asset = Object.values(base.records.asset)[0];
if (asset === undefined) throw new Error('fixture has no asset');
const NEW_SHA = 'b'.repeat(64);

const change = (before: CanonicalState, after: CanonicalState): ChangeSet => ({ revision: 1, label: 'test', cause: 'replace', ...diffStates(before, after), patches: [], inversePatches: [] });
const withNewBytes = produce(base, (draft) => {
  (draft.records.asset[asset.id] as unknown as { sha256: string }).sha256 = NEW_SHA;
});

describe('blobs for updated asset records', () => {
  it('accepts the bytes of an asset record the ChangeSet updated, with the record\'s new hash', () => {
    const blob = { assetId: asset.id, sha256: NEW_SHA, blob: new Blob(['new bytes']) };
    const batch = startBatch(change(base, withNewBytes), withNewBytes, [blob]);
    expect([...batch.blobs.values()]).toEqual([blob]);
  });

  it('still refuses a blob whose hash is not the updated record\'s hash', () => {
    const blob = { assetId: asset.id, sha256: asset.sha256, blob: new Blob(['old bytes']) };
    expect(() => startBatch(change(base, withNewBytes), withNewBytes, [blob])).toThrow(/sha256/);
  });

  it('still refuses a blob for an asset record the ChangeSet did not touch', () => {
    const blob = { assetId: asset.id, sha256: asset.sha256, blob: new Blob(['x']) };
    expect(() => startBatch(change(base, base), base, [blob])).toThrow(/created or updated/);
  });
});
