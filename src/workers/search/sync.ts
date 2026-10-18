/**
 * The main-side search sync (step 4.5, ports only, like the replica sync): keeps the search worker's index equal to the documents
 * of the canonical store. It reads the state and the indexes through ports, decides which documents to rebuild
 * (`fanout.ts`: the changed records AND every document whose derived data moved because another record changed), builds them
 * with the pure builder, and sends the difference (`upsert` / `remove`, `fromRevision`) to the worker through the search service.
 *
 *   - A document is sent only when it differs from the one last sent (a hash of the document is remembered per record), so
 *     a candidate that did not really change costs a build and no message.
 *   - The change's own records are always rebuilt. Records that merely depend on what changed (a mapping's target, a reagent's
 *     reactions, every concept, everything after an exam-version or topic-tree edit) are queued AT MOST `REFRESH_CAP` at a
 *     time; the rest wait in a backlog, in order, and are queued as the queue empties. Nothing is dropped; until a backlog
 *     record is refreshed, its document is the last one sent (`status().backlog` says how many wait).
 *   - `replace` changes, a follower's `reload` (`reloaded`), a `REVISION_MISMATCH` (a restarted worker, a missed change) and any failure of the worker
 *     lead to ONE full load of the current state. The previous index keeps answering searches until the load lands.
 *   - `refresh(ids)` (step 5.1b, Q9): the formulas the L4 service derived for these species changed; their documents are rebuilt
 *     (and sent only if they differ), like any other derived-data change.
 *   - `adopt(revision)` (step 5.1b): the worker's index was loaded from the warm-boot cache (`loadSerialized`) instead of by a
 *     full load. Allowed only while the store is still at that revision (else answers false and the caller loads); the sync then
 *     does not know which documents the cache held, so from then on every rebuilt document is sent and every removal is sent.
 *   - Changes are never analysed against a state that moved on: documents are built from the state as it is when the pass runs,
 *     labelled with the store's revision at that moment, and every change since the last send is in the queue by then.
 * No search, no chemistry, no persistence: the engine is in the worker, the document in `src/search`.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import { hash64 } from '@/core/hash';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { buildDocument, documentPortsOf, type DocumentPorts } from '@/search/document';
import type { SearchDocument } from '@/search/contracts';
import { affectedBy, allRefs, keyOf } from './fanout';
import type { SearchService } from './service';

/** Dependent documents queued at once; the rest of a change's fan-out waits behind them. */
export const REFRESH_CAP = 250;

export interface SearchSyncPorts {
  readonly state: () => CanonicalState;
  /** The store's indexes as of the change being announced. Read only, never kept past the call. */
  readonly indexes: () => ReadonlyIndexes;
  /** The store's revision, as of `state()`. */
  readonly revision: () => number;
  readonly service: Pick<SearchService, 'load' | 'apply'>;
  /** The formula the chem worker derived for a record's structure (the L4 service's memory); absent: no derived formulas. */
  readonly derivedFormulaOf?: (ref: RecordRef) => string | undefined;
  /** Called whenever `status()` may have changed (work queued, a pass done, a load adopted); optional. */
  readonly onStatus?: () => void;
  /** The debounce: called when work is waiting, with the function that does it; called at most once until it has run. */
  readonly schedule: (run: () => void) => void;
}

export type SearchSyncState = 'idle' | 'pending' | 'down';

export interface SearchSyncStatus {
  readonly state: SearchSyncState;
  /** The revision the worker's index is known to be at; null before the first load. */
  readonly indexRevision: number | null;
  /** Documents waiting to be rebuilt now / behind the cap. */
  readonly queued: number;
  readonly backlog: number;
  /** A full load is waiting (first load, a replace, a mismatch, a failure). */
  readonly loadPending: boolean;
  /** Why the sync is `down` (the last worker failure), else ''. */
  readonly reason: string;
}

export interface SearchSyncStats {
  readonly loads: number;
  /** Times a warm-boot cache was adopted instead of a full load. */
  readonly adopts: number;
  readonly updates: number;
  readonly upserts: number;
  readonly removals: number;
  /** Removals the worker did not know (should stay 0). */
  readonly removalsUnknown: number;
  readonly mismatches: number;
  readonly failures: number;
  /** Documents queued only because something they read changed, ever; and the most one change queued at once (<= REFRESH_CAP). */
  readonly dependentQueued: number;
  readonly maxQueuedAtOnce: number;
  /** Documents built and not sent because they equalled the last one sent. */
  readonly unchanged: number;
}

export interface SearchSync {
  /** Feed every ChangeSet the store announces. */
  onChange(changes: ChangeSet): void;
  /** Load the whole current state into the worker's index (boot, a restarted worker, "rebuild"). */
  reload(): void;
  /** The L4 service derived (or dropped) the formula of these species: rebuild their documents. Ignored while a full load is pending. */
  refresh(ids: readonly string[]): void;
  /**
   * The worker's index holds the documents of `revision` (loaded from the warm-boot cache). True when adopted (nothing is loaded
   * again); false, and nothing changes, when the store is no longer at `revision` or the sync was disposed.
   */
  adopt(revision: number): boolean;
  /** Runs what is queued now and resolves when it and anything queued meanwhile is done (or the worker failed). */
  flush(): Promise<void>;
  status(): SearchSyncStatus;
  stats(): SearchSyncStats;
  dispose(): void;
}

const sign = (doc: SearchDocument): string => hash64(JSON.stringify(doc));

export function createSearchSync(ports: SearchSyncPorts): SearchSync {
  /** The signature of the document last SENT, per record id. */
  let sent = new Map<string, string>();
  const dirty = new Map<string, RecordRef>();
  const backlog = new Map<string, RecordRef>();
  let needsLoad = true;
  /** True after `adopt`: the signatures of what the worker holds are unknown, so nothing is skipped as unchanged. */
  let sentUnknown = false;
  let indexRevision: number | null = null;
  let reason = '';
  let failed = false;
  let scheduled = false;
  let disposed = false;
  let running: Promise<void> | undefined;
  const stat = { loads: 0, adopts: 0, updates: 0, upserts: 0, removals: 0, removalsUnknown: 0, mismatches: 0, failures: 0, dependentQueued: 0, maxQueuedAtOnce: 0, unchanged: 0 };

  /** Also: the store moved on without a document changing; the index revision follows it (the warm-boot cache is keyed by it). */
  const hasWork = (): boolean => needsLoad || dirty.size > 0 || backlog.size > 0 || (indexRevision !== null && indexRevision !== ports.revision());
  const tell = (): void => ports.onStatus?.();
  const queue = (): void => {
    if (scheduled || disposed) return;
    scheduled = true;
    ports.schedule(() => void flush());
    tell();
  };
  const promote = (): void => {
    for (const [key, ref] of [...backlog].slice(0, REFRESH_CAP)) {
      backlog.delete(key);
      dirty.set(key, ref);
    }
  };
  const forget = (): void => {
    dirty.clear();
    backlog.clear();
  };

  function build(refs: readonly RecordRef[]): { readonly docs: Map<string, SearchDocument>; readonly gone: string[] } {
    const state = ports.state();
    const documentPorts: DocumentPorts = documentPortsOf(state, ports.indexes(), ports.derivedFormulaOf);
    const docs = new Map<string, SearchDocument>();
    const gone: string[] = [];
    for (const ref of refs) {
      const table = state.records[ref.kind] as Readonly<Record<string, Parameters<typeof buildDocument>[0]>>;
      const record = Object.hasOwn(table, ref.id) ? table[ref.id] : undefined;
      const doc = record === undefined ? undefined : buildDocument(record, documentPorts);
      if (doc !== undefined) docs.set(doc.id, doc);
      else gone.push(ref.id);
    }
    return { docs, gone };
  }

  async function load(): Promise<void> {
    forget();
    needsLoad = false;
    const revision = ports.revision();
    const refs = allRefs(ports.state());
    const { docs } = build(refs);
    const outcome = await ports.service.load([...docs.values()], revision);
    if (!outcome.ok) {
      needsLoad = true;
      failed = true;
      stat.failures += 1;
      reason = `load failed: ${outcome.code}: ${outcome.message}`;
      return;
    }
    sent = new Map([...docs].map(([id, doc]) => [id, sign(doc)] as const));
    sentUnknown = false;
    indexRevision = revision;
    reason = '';
    stat.loads += 1;
  }

  async function update(): Promise<void> {
    if (dirty.size === 0) promote();
    const refs = [...dirty.values()];
    dirty.clear();
    const revision = ports.revision();
    const { docs, gone } = build(refs);
    const upsert: SearchDocument[] = [];
    const signatures = new Map<string, string>();
    for (const [id, doc] of docs) {
      const signature = sign(doc);
      if (!sentUnknown && sent.get(id) === signature) stat.unchanged += 1;
      else {
        upsert.push(doc);
        signatures.set(id, signature);
      }
    }
    const remove = sentUnknown ? gone : gone.filter((id) => sent.has(id));
    if (upsert.length === 0 && remove.length === 0 && indexRevision === revision) return;
    const outcome = await ports.service.apply({ fromRevision: indexRevision as number, revision, upsert, remove });
    if (!outcome.ok) {
      needsLoad = true;
      failed = true;
      stat.failures += 1;
      reason = `update failed: ${outcome.code}: ${outcome.message}`;
      return;
    }
    if (!outcome.value.ok) {
      stat.mismatches += 1;
      needsLoad = true;
      return;
    }
    for (const [id, signature] of signatures) sent.set(id, signature);
    for (const id of remove) sent.delete(id);
    indexRevision = revision;
    reason = '';
    stat.updates += 1;
    stat.upserts += upsert.length;
    stat.removals += outcome.value.removed;
    stat.removalsUnknown += remove.length - outcome.value.removed;
  }

  async function pass(): Promise<void> {
    if (needsLoad) return load();
    return update();
  }

  async function flush(): Promise<void> {
    scheduled = false;
    failed = false;
    for (;;) {
      if (running !== undefined) {
        await running;
        continue;
      }
      if (!hasWork() || disposed || failed) return tell();
      running = pass().finally(() => void (running = undefined));
      tell();
      await running;
      tell();
    }
  }

  return {
    onChange(changes) {
      if (disposed) return;
      if (needsLoad) {
        queue();
        return;
      }
      const affected = affectedBy(changes, ports.state(), ports.indexes());
      if (affected.reload) {
        needsLoad = true;
        forget();
        queue();
        return;
      }
      for (const ref of affected.direct) {
        backlog.delete(keyOf(ref));
        dirty.set(keyOf(ref), ref);
      }
      const fresh = affected.behind.filter((ref) => !dirty.has(keyOf(ref)) && !backlog.has(keyOf(ref)));
      const now = fresh.slice(0, REFRESH_CAP);
      for (const ref of now) dirty.set(keyOf(ref), ref);
      for (const ref of fresh.slice(REFRESH_CAP)) backlog.set(keyOf(ref), ref);
      stat.dependentQueued += fresh.length;
      stat.maxQueuedAtOnce = Math.max(stat.maxQueuedAtOnce, now.length);
      if (hasWork()) queue();
    },
    reload() {
      needsLoad = true;
      forget();
      queue();
    },
    refresh(ids) {
      if (disposed || needsLoad) return;
      const table = ports.state().records.species;
      for (const id of ids) {
        if (!Object.hasOwn(table, id)) continue;
        const ref: RecordRef = { kind: 'species', id };
        backlog.delete(keyOf(ref));
        dirty.set(keyOf(ref), ref);
      }
      if (hasWork()) queue();
    },
    adopt(revision) {
      if (disposed || revision !== ports.revision()) return false;
      forget();
      needsLoad = false;
      sentUnknown = true;
      sent = new Map();
      indexRevision = revision;
      reason = '';
      failed = false;
      stat.adopts += 1;
      tell();
      return true;
    },
    flush,
    status: () => ({
      state: disposed || failed ? 'down' : hasWork() || running !== undefined ? 'pending' : 'idle',
      indexRevision,
      queued: dirty.size,
      backlog: backlog.size,
      loadPending: needsLoad,
      reason,
    }),
    stats: () => ({ ...stat }),
    dispose() {
      disposed = true;
      forget();
    },
  };
}
