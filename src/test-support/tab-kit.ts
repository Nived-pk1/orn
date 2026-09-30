/**
 * A "tab" for multi-tab tests (step 3.4): its own database handle over a shared IndexedDB, adapter, lock, channel,
 * and, like the app will, either a writable store wired to the write queue (the writer) or a read-only store
 * driven by a follower (which, once promoted, gets a write queue). Test-only.
 */
import { IDBFactory } from 'fake-indexeddb';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import type { PrecomputedFindings } from '@/core/commands';
import type { CanonicalState } from '@/core/schema';
import type { ChangeChannel, OpenResult, WriterLock } from '@/persistence/contracts';
import { createFollower, type Follower, type FollowerEvent } from '@/persistence/follower';
import { attachWriteQueue, type WriteWiring } from '@/persistence/write-wiring';
import { freshAdapter, freshDb, type TestAdapter } from './persistence-kit';
import type { DexieAdapterOptions } from '@/persistence/adapter';

export interface TabEnv {
  readonly indexedDB: IDBFactory;
  newLock(): WriterLock;
  newChannel(): ChangeChannel | undefined;
}

export interface Tab {
  readonly t: TestAdapter;
  readonly open: Exclude<OpenResult, { mode: 'unavailable' }>;
  readonly lock: WriterLock;
  readonly channel: ChangeChannel | undefined;
  readonly follower: Follower | undefined;
  /** Every follower event, in order. */
  readonly events: FollowerEvent[];
  store(): StoreHandle | undefined;
  wiring(): WriteWiring | undefined;
}

export const newIndexedDb = (): IDBFactory => new IDBFactory();

/** Step 4.2d: what the compute worker adds to a tab. Absent: the tab is what it was before (its store validates nothing at creation). */
export interface TabExtras {
  /** The follower's validation port (`FollowerOptions.validate`). */
  readonly validate?: (state: CanonicalState, revision: number) => Promise<PrecomputedFindings>;
  /** Build stores from the boot result's / the follower's `precomputed` findings (`createCanonicalStore({ precomputed })`). */
  readonly precomputed?: boolean;
}

export async function openTab(env: TabEnv, options: Partial<Omit<DexieAdapterOptions, 'db'>> = {}, extras: TabExtras = {}): Promise<Tab> {
  const lock = env.newLock();
  const channel = env.newChannel();
  const t = freshAdapter({ lock, ...(channel !== undefined ? { channel } : {}), ...options }, freshDb(undefined, env.indexedDB));
  const opened = await t.adapter.open();
  if (opened.mode === 'unavailable') throw new Error(`IndexedDB unavailable: ${opened.detail}`);
  const events: FollowerEvent[] = [];
  let store: StoreHandle | undefined;
  let wiring: WriteWiring | undefined;

  const writable = opened.mode === 'read_write';
  const follower = writable || opened.readOnlyReason !== 'other_tab_is_writer'
    ? undefined
    : createFollower({ adapter: t.adapter, ...(channel !== undefined ? { channel } : {}), lock, revision: opened.state === null ? null : opened.revision, schemaVersion: 1, ...(extras.validate === undefined ? {} : { validate: extras.validate }) });
  follower?.subscribe((event) => events.push(event));

  const buildStore = (state: CanonicalState, revision: number, precomputed?: PrecomputedFindings): StoreHandle =>
    createCanonicalStore({
      initial: state,
      revision,
      validateInitial: false,
      ...(extras.precomputed === true && precomputed !== undefined ? { precomputed } : {}),
      readOnly: follower?.isReadOnly ?? (() => !writable),
    });

  if (opened.state !== null) {
    store = buildStore(opened.state, opened.revision, opened.bootReport?.precomputed);
    follower?.attach(store);
    if (writable) wiring = attachWriteQueue(store, t.adapter);
  }
  follower?.subscribe((event) => {
    // What the app does: a state that arrives without a store gets one; a promoted tab gets a write queue.
    if ((event.type === 'loaded' || event.type === 'promoted') && event.state !== null && store === undefined) {
      store = buildStore(event.state, event.revision, event.type === 'loaded' ? event.precomputed : event.bootReport?.precomputed);
      follower.attach(store);
    }
    if (event.type === 'promoted' && store !== undefined) wiring = attachWriteQueue(store, t.adapter);
  });

  return { t, open: opened, lock, channel, follower, events, store: () => store, wiring: () => wiring };
}
