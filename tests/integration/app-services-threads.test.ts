/**
 * Step 5.1a over a REAL `worker_threads` compute thread (the real-threads project): a database holding the demo boots with its
 * findings from the thread (boot validation in the worker, the replica loaded once), and one commit reaches IndexedDB (fake) and
 * the thread's replica. The in-memory twins are app-services*.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createBooter, demoState, editNote } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { freshDb } from '@/test-support/persistence-kit';
import { sortedFindings } from '@/test-support/replica-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';

const THREAD_TEST_TIMEOUT_MS = 60_000;
const booter = createBooter();
afterEach(() => booter.disposeAll());

describe('the app services over a real compute thread', () => {
  it('boots the demo with the findings of the thread, then one commit reaches IndexedDB and the replica', async () => {
    const world = await worldHolding(demoState(), 2);
    const t = testEnv({ world });
    let threads = 0;
    const services = await booter.bootEnv(t, {
      ...t.env,
      workers: {
        compute: () => {
          threads += 1;
          return spawnComputeWorker();
        },
      },
    });
    const status = services.status.get();
    expect(status).toMatchObject({ mode: 'writer', validation: { where: 'worker' }, replica: { state: 'in_sync' } });
    expect(services.bootReport?.validation.where).toBe('worker');
    expect(services.store.findings.all().length).toBeGreaterThan(0); // the demo's planted warning
    expect(threads).toBe(1); // the sync adopted the boot client: one thread, one load

    editNote(services, 'through a real thread');
    await services.persistence?.flush();
    const tdb = freshDb(undefined, world.indexedDB);
    try {
      expect((await tdb.db.meta.get('revision'))?.value).toBe(3);
    } finally {
      tdb.db.close();
    }
    const sync = services.replicaSync();
    expect((await sync?.settled())?.replicaRevision).toBe(3);
    const answer = await sync?.client.validateAll({ revision: 3 });
    expect(answer?.ok).toBe(true);
    if (answer?.ok !== true || !answer.value.ok) throw new Error('the replica did not answer');
    expect(sortedFindings(answer.value.findings)).toEqual(sortedFindings(services.store.findings.all()));
    expect(threads).toBe(1);
  }, THREAD_TEST_TIMEOUT_MS);
});
