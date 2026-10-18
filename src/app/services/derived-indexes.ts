/**
 * DerivedIndexes (step 5.1a, Phase 5 decision Q1, option B). The store keeps only the part-1 indexes (`getIndexes()`); the
 * navigator, the search sync and the palette need the FULL engine (`ReadonlyIndexes`). This service builds that engine on the
 * main thread without putting it on the commit path:
 *
 *  - the first build is lazy (the first `current()`);
 *  - `store.subscribe` queues each ChangeSet with the state after it; a read applies the queue in order;
 *  - ONE build instead (never an apply) when the cause is `replace` or a follower's `reload` (`reloaded`), when a revision does not follow
 *    the last one (a gap), or when the queue passes the replica sync's bounds (100 ChangeSets or 2,000 touched records). The `remote`
 *    ChangeSet of `applyRemote` (one mirrored writer transaction, which may span several revisions) is applied like a commit (step 6.1b);
 *  - rejected commits are never announced by the store, so they cause no build and no apply (no rollback exists on this path).
 *
 * `current()` returns the handle of the store's revision. CALLERS NEVER KEEP A HANDLE: `IndexEngine.apply` updates one lineage
 * in place, so a handle from before an apply is stale and throws on use ("Stale index handle", existing behaviour, unchanged
 * here). Ask again for every read. Cost: a hub edit (about 1,020 records) costs 300-450 ms of apply, paid at the first read
 * after it, off the commit path (docs/PROGRESS.md, step 5.1a bench).
 *
 * Every answer equals `indexEngine.build` of the store's state (INV-18); tests/property/derived-indexes.test.ts proves it.
 */
import type { CanonicalStore } from '@/core/commands';
import type { ChangeSet, Clock } from '@/core/dataset/contracts';
import { indexEngine } from '@/core/indexes';
import type { IndexEngine, ReadonlyIndexes } from '@/core/indexes';
import type { CanonicalState } from '@/core/schema';
import { DEFAULT_MAX_BACKLOG, DEFAULT_MAX_BACKLOG_RECORDS } from '@/workers/compute/sync';

export type BuildReason = 'first' | 'replace' | 'remote' | 'gap' | 'backlog' | 'mismatch';

export interface DerivedIndexStats {
  /** Whole builds so far. */
  readonly builds: number;
  /** ChangeSets applied one by one so far. */
  readonly applies: number;
  /** Why the last build happened; null before the first. */
  readonly lastBuildReason: BuildReason | null;
  /** Injected-clock milliseconds of the last build and of the last drain of the queue (0 before the first). */
  readonly lastBuildMs: number;
  readonly lastApplyMs: number;
  /** ChangeSets waiting for the next read, and the records they touch. */
  readonly queued: number;
  readonly queuedRecords: number;
}

export interface DerivedIndexes {
  /** The full indexes at the store's current revision. Never keep the result past the call. */
  current(): ReadonlyIndexes;
  stats(): DerivedIndexStats;
  /** Stops listening to the store. */
  dispose(): void;
}

export interface DerivedIndexesOptions {
  readonly store: Pick<CanonicalStore, 'getState' | 'getRevision' | 'subscribe'>;
  readonly clock: Clock;
  /** Default: the full engine. */
  readonly engine?: IndexEngine;
  readonly maxBacklog?: number;
  readonly maxBacklogRecords?: number;
}

interface Queued {
  readonly changes: ChangeSet;
  /** The store's state right after this ChangeSet (the apply needs the state of ITS revision, not the newest). */
  readonly next: CanonicalState;
}

const weightOf = (changes: ChangeSet): number => Math.max(1, changes.created.length + changes.updated.length + changes.deleted.length);

export function createDerivedIndexes(options: DerivedIndexesOptions): DerivedIndexes {
  const { store, clock } = options;
  const engine = options.engine ?? indexEngine;
  const maxBacklog = options.maxBacklog ?? DEFAULT_MAX_BACKLOG;
  const maxBacklogRecords = options.maxBacklogRecords ?? DEFAULT_MAX_BACKLOG_RECORDS;

  let handle: ReadonlyIndexes | undefined;
  let queue: Queued[] = [];
  let queuedRecords = 0;
  /** Set when an apply cannot be trusted: the next read builds. */
  let mustBuild: BuildReason | undefined;
  let builds = 0;
  let applies = 0;
  let lastBuildReason: BuildReason | null = null;
  let lastBuildMs = 0;
  let lastApplyMs = 0;

  const drop = (reason: BuildReason): void => {
    mustBuild = mustBuild ?? reason;
    queue = [];
    queuedRecords = 0;
  };
  /** The revision the handle will be at once the queue is applied. */
  const knownRevision = (): number => (queue.length > 0 ? (queue[queue.length - 1] as Queued).changes.revision : (handle as ReadonlyIndexes).revision);

  const unsubscribe = store.subscribe((changes) => {
    // Nothing is built yet: the first read builds from the state of the moment; nothing to queue.
    if (handle === undefined || mustBuild !== undefined) return;
    if (changes.cause === 'replace' || changes.reloaded === true) return drop(changes.cause === 'replace' ? 'replace' : 'remote');
    if (changes.revision <= knownRevision()) return; // already inside what a read built from a newer state
    if (changes.cause !== 'remote' && changes.revision !== knownRevision() + 1) return drop('gap'); // only a mirrored transaction may skip revisions
    queue.push({ changes, next: store.getState() });
    queuedRecords += weightOf(changes);
    if (queue.length > maxBacklog || queuedRecords > maxBacklogRecords) drop('backlog');
  });

  const build = (reason: BuildReason): ReadonlyIndexes => {
    const started = clock.nowMs();
    const built = engine.build(store.getState(), store.getRevision());
    lastBuildMs = clock.nowMs() - started;
    builds += 1;
    lastBuildReason = reason;
    handle = built;
    mustBuild = undefined;
    queue = [];
    queuedRecords = 0;
    return built;
  };

  return {
    current() {
      if (handle === undefined) return build('first');
      if (mustBuild !== undefined) return build(mustBuild);
      if (queue.length > 0) {
        const started = clock.nowMs();
        const pending = queue;
        queue = [];
        queuedRecords = 0;
        for (const item of pending) {
          handle = engine.apply(handle, item.changes, item.next);
          applies += 1;
        }
        lastApplyMs = clock.nowMs() - started;
      }
      // A listener that read before this service's own listener ran can see a store ahead of the queue: build, never guess.
      if (handle.revision !== store.getRevision()) return build('mismatch');
      return handle;
    },
    stats: () => ({ builds, applies, lastBuildReason, lastBuildMs, lastApplyMs, queued: queue.length, queuedRecords }),
    dispose() {
      unsubscribe();
      handle = undefined;
      queue = [];
      queuedRecords = 0;
    },
  };
}
