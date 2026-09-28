import { describe, expect, it, vi } from 'vitest';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { AssetBlobWrite } from './contracts';
import { attachWriteQueue, type WritableStoreLike } from './write-wiring';

function fakeStore(readOnly = false) {
  const listeners = new Set<(changes: ChangeSet) => void>();
  const store: WritableStoreLike & { emit(changes: ChangeSet): void } = {
    isReadOnly: () => readOnly,
    getState: () => ({ marker: 'state' }) as never,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    emit: (changes) => listeners.forEach((l) => l(changes)),
  };
  return store;
}
const change = (revision: number, cause: ChangeSet['cause'] = 'command'): ChangeSet => ({ revision, label: 'x', cause, created: [], updated: [], deleted: [], patches: [], inversePatches: [] });

describe('attachWriteQueue', () => {
  it('writes every local ChangeSet with the state it produced, and stops when detached', () => {
    const store = fakeStore();
    const writeChanges = vi.fn(() => Promise.resolve());
    const wiring = attachWriteQueue(store, { writeChanges });
    expect(wiring.ok).toBe(true);
    store.emit(change(1));
    store.emit(change(2, 'undo'));
    store.emit(change(3, 'replace'));
    if (wiring.ok) wiring.detach();
    store.emit(change(4));
    expect(writeChanges.mock.calls.map((call) => (call as unknown as [ChangeSet])[0].revision)).toEqual([1, 2, 3]);
  });

  it('never writes a remote ChangeSet', () => {
    const store = fakeStore();
    const writeChanges = vi.fn(() => Promise.resolve());
    attachWriteQueue(store, { writeChanges });
    store.emit(change(1, 'remote'));
    expect(writeChanges).not.toHaveBeenCalled();
  });

  it('refuses a read-only store as a value and subscribes to nothing', () => {
    const store = fakeStore(true);
    const writeChanges = vi.fn(() => Promise.resolve());
    expect(attachWriteQueue(store, { writeChanges })).toMatchObject({ ok: false, reason: 'read_only' });
    store.emit(change(1));
    expect(writeChanges).not.toHaveBeenCalled();
  });

  it('passes the blobs the caller supplies for a ChangeSet', () => {
    const store = fakeStore();
    const blob: AssetBlobWrite = { assetId: 'ast_a', sha256: 'abc', blob: new Blob(['x']) };
    const writeChanges = vi.fn((_c: ChangeSet, _s: unknown, _b?: readonly AssetBlobWrite[]) => Promise.resolve());
    attachWriteQueue(store, { writeChanges }, { blobsFor: (changes) => (changes.revision === 2 ? [blob] : undefined) });
    store.emit(change(1));
    store.emit(change(2));
    expect(writeChanges.mock.calls.map((call) => call[2])).toEqual([undefined, [blob]]);
  });

  it('a refusal by the queue, thrown or rejected, goes to onError and never escapes the store notification', async () => {
    const store = fakeStore();
    const errors: unknown[] = [];
    const writeChanges = vi.fn((changes: ChangeSet) => {
      if (changes.revision === 1) throw new RangeError('revision gap');
      return Promise.reject(new Error('write failed'));
    });
    attachWriteQueue(store, { writeChanges }, { onError: (error) => errors.push(error) });
    store.emit(change(1));
    store.emit(change(2));
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.map((e) => (e as Error).message)).toEqual(['revision gap', 'write failed']);
  });
});
