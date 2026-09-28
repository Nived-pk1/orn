/**
 * Shared rig for the multi-tab integration tests (step 3.4): a seeded shared IndexedDB, tabs over in-memory fakes or
 * over Node 24's real `navigator.locks` and `BroadcastChannel`, a bounded `settle`, and small edit helpers.
 */
import { createBroadcastChangeChannel, createWebLocksWriterLock, type LockManagerLike } from '@/persistence/web-locks';
import type { ChangeChannel } from '@/persistence/contracts';
import { envelope, recordIn, withFields } from '@/test-support/command-kit';
import { freshAdapter, freshDb, seedChangeSet } from '@/test-support/persistence-kit';
import { createMemoryChannelHub, createMemoryLockHub } from '@/test-support/tab-fakes';
import { newIndexedDb, type Tab, type TabEnv } from '@/test-support/tab-kit';
import { loadFixtureState, must } from '@/test-support/state-fixture';

export const base = loadFixtureState('maximal-valid');
export const SPECIES = Object.keys(base.records.species).sort()[0] as string;

export async function seededIndexedDb(): Promise<ReturnType<typeof newIndexedDb>> {
  const indexedDB = newIndexedDb();
  const seed = freshAdapter({}, freshDb(undefined, indexedDB));
  await seed.adapter.writeChanges(seedChangeSet(base, 1), base);
  seed.db.close();
  return indexedDB;
}

export interface Rig {
  readonly env: TabEnv;
  /** Lets in-flight messages arrive: the fakes deliver on demand, the real channel needs no help. */
  flush(): void;
}

export async function fakeRig(): Promise<Rig & { readonly channels: ReturnType<typeof createMemoryChannelHub>; readonly locks: ReturnType<typeof createMemoryLockHub> }> {
  const locks = createMemoryLockHub();
  const channels = createMemoryChannelHub();
  return { env: { indexedDB: await seededIndexedDb(), newLock: () => locks.newLock(), newChannel: () => channels.newChannel() }, flush: () => void channels.deliver(), channels, locks };
}

let counter = 0;
const opened: ChangeChannel[] = [];
/** Closes the real BroadcastChannels the rigs opened (call from afterEach). */
export function closeRealChannels(): void {
  for (const channel of opened.splice(0)) channel.close();
}
export async function realRig(): Promise<Rig> {
  counter += 1;
  const lockName = `orn-writer-test-${process.pid}-${counter}`;
  const channelName = `orn-changes-test-${process.pid}-${counter}`;
  return {
    env: {
      indexedDB: await seededIndexedDb(),
      newLock: () => createWebLocksWriterLock(navigator.locks as unknown as LockManagerLike, lockName),
      newChannel: () => {
        const channel = createBroadcastChangeChannel((name) => new BroadcastChannel(name) as never, channelName);
        opened.push(channel);
        return channel;
      },
    },
    flush: () => undefined,
  };
}

/** Waits (bounded) until `condition` holds, letting messages arrive and the follower settle in between. */
export async function settle(rig: Rig, tab: Tab, condition: () => boolean): Promise<void> {
  for (let turn = 0; turn < 500; turn += 1) {
    rig.flush();
    await tab.follower?.idle();
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('the follower did not settle');
}

export const storeOf = (tab: Tab) => must(tab.store(), 'the tab has a store');
export const edit = (tab: Tab, notes: string) => {
  const store = tab.store();
  if (store === undefined) throw new Error('no store');
  return store.dispatch(envelope(`edit ${notes}`, { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', SPECIES), { notes }) }));
};
export const notesOf = (tab: Tab): unknown => (recordIn(tab.store()?.getState() ?? base, 'species', SPECIES) as unknown as { notes?: string }).notes;

