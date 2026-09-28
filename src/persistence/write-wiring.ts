/**
 * Connects a WRITABLE store to the write queue. INV-28 (ADR-033), two guards: a follower has no write queue attached
 * (attaching to a read-only store is refused as a value), and a ChangeSet with `cause: 'remote'` (a follower's mirror
 * of what the writer already persisted) is never written, whatever the wiring.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
import type { AssetBlobWrite, PersistenceAdapter } from './contracts';

export interface WritableStoreLike {
  isReadOnly(): boolean;
  getState(): CanonicalState;
  subscribe(listener: (changes: ChangeSet) => void): () => void;
}

export interface WriteWiringOptions {
  /** The bytes of asset records this ChangeSet creates, if any (they ride in the same transaction). */
  readonly blobsFor?: (changes: ChangeSet) => readonly AssetBlobWrite[] | undefined;
  /** A queue refusal (a revision gap is also `SaveStatus.failed`). Default: rethrown from a microtask, so it stays visible. */
  readonly onError?: (error: unknown) => void;
}

export type WriteWiring = { readonly ok: true; readonly detach: () => void } | { readonly ok: false; readonly reason: 'read_only'; readonly message: string };

const rethrowLater = (error: unknown): void => queueMicrotask(() => {
  throw error;
});

export function attachWriteQueue(store: WritableStoreLike, adapter: Pick<PersistenceAdapter, 'writeChanges'>, options: WriteWiringOptions = {}): WriteWiring {
  if (store.isReadOnly()) {
    return { ok: false, reason: 'read_only', message: 'A follower tab has no write queue: only the writer persists (INV-28).' };
  }
  const onError = options.onError ?? rethrowLater;
  const detach = store.subscribe((changes) => {
    if (changes.cause === 'remote') return;
    try {
      adapter.writeChanges(changes, store.getState(), options.blobsFor?.(changes)).catch(onError);
    } catch (error) {
      onError(error);
    }
  });
  return { ok: true, detach };
}
