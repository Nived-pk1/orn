/**
 * Shared helpers of the app-services tests (step 5.1a): a booter that remembers what it started so `afterEach` can dispose it,
 * the demo and a small fixture as states, a one-line edit and tampering with a stored database. Test-only.
 */
import { produce } from 'immer';
import { createAppServices, type AppEnv, type AppServices } from '@/app/services';
import { documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { envelope, mustCommit, recordIn, withFields } from './command-kit';
import { buildDemoDocument } from './demo';
import { freshDb, type TestDb } from './persistence-kit';
import { testEnv, type TestEnv, type TestEnvOptions, type World } from './app-env-kit';
import { loadFixtureState } from './state-fixture';

export const demoState = (): CanonicalState => {
  const parsed = documentToState(buildDemoDocument());
  if (!parsed.ok) throw new Error('demo dataset has duplicate IDs');
  return parsed.state;
};
/**
 * The demo without its arrangement (the anchors lose cell, group and tone): the overview of a file with no cells, which takes the
 * layered (ELK) path. The arranged demo (`demoState`) takes the grid path (step 5.5c).
 */
export const unarrangedDemoState = (): CanonicalState =>
  produce(demoState(), (draft) => {
    for (const anchor of Object.values(draft.records.navigator_anchor)) {
      delete anchor.cell;
      delete anchor.group;
      delete anchor.tone;
    }
  });
export const smallState = (): CanonicalState => loadFixtureState('minimal-valid');

export interface Booter {
  boot(options?: TestEnvOptions, override?: (t: TestEnv) => AppEnv): Promise<{ readonly services: AppServices; readonly t: TestEnv }>;
  /** Boots over an env the caller built (to share a world or a fake across tabs). */
  bootEnv(t: TestEnv, env?: AppEnv): Promise<AppServices>;
  disposeAll(): Promise<void>;
}

export function createBooter(): Booter {
  const running: AppServices[] = [];
  const bootEnv = async (t: TestEnv, env: AppEnv = t.env): Promise<AppServices> => {
    const services = await createAppServices(env);
    running.push(services);
    return services;
  };
  return {
    bootEnv,
    async boot(options = {}, override) {
      const t = testEnv(options);
      return { services: await bootEnv(t, override === undefined ? t.env : override(t)), t };
    },
    async disposeAll() {
      await Promise.allSettled(running.splice(0).map((services) => services.dispose()));
    },
  };
}

/** A harmless commit: the first species' notes. */
export function editNote(services: AppServices, notes: string): void {
  const id = Object.keys(services.store.getState().records.species).sort()[0] ?? '';
  mustCommit(services.store.dispatch(envelope(`Note ${notes}`, { type: 'record.update', record: withFields(recordIn(services.store.getState(), 'species', id), { notes }) })));
}

/** A commit that works on any dataset, even an empty one: the dataset title. */
export function renameDataset(services: AppServices, title: string): void {
  mustCommit(services.store.dispatch(envelope('Rename', { type: 'meta.update', meta: { ...services.store.getState().meta, title } })));
}

/** Changes the stored database behind the app's back (a newer version wrote it, a row was damaged). */
export async function tamper(world: World, change: (db: TestDb['db']) => Promise<unknown>): Promise<void> {
  const tdb = freshDb(undefined, world.indexedDB);
  try {
    await change(tdb.db);
  } finally {
    tdb.db.close();
  }
}

export async function storedMeta(world: World): Promise<string> {
  const tdb = freshDb(undefined, world.indexedDB);
  try {
    return JSON.stringify(await tdb.db.meta.toArray());
  } finally {
    tdb.db.close();
  }
}
