/**
 * Step 5.1c over a REAL `worker_threads` compute thread (the real-threads project): the demo file is imported into an empty store
 * (resolves only after it is saved), exported, and the pre_import snapshot is restored (Undo import), all through the services.
 * The in-memory twins are app-services-flows*.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createBooter, demoState } from '@/test-support/app-boot-kit';
import { newWorld, testEnv } from '@/test-support/app-env-kit';
import { demoFile, importFile } from '@/test-support/app-flow-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';

const THREAD_TEST_TIMEOUT_MS = 120_000;
const booter = createBooter();
afterEach(() => booter.disposeAll());

describe('the flows over a real compute thread', () => {
  it('import (saved), export and Undo import through one thread', async () => {
    const t = testEnv({ world: newWorld() });
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
    const empty = services.store.getState();
    const applied = await importFile(services, await demoFile());
    expect(applied).toMatchObject({ saved: true, inProcess: false, revision: 1 });
    expect(services.store.getState().records).toEqual(demoState().records);

    const exported = await services.flows.export({ scope: 'full', includeDependencies: false, assets: 'none' }, 'orn.json');
    expect(exported).toMatchObject({ ok: true, inProcess: false });

    const undone = await services.flows.undo();
    expect(undone).toMatchObject({ ok: true, saved: true });
    expect(services.store.getState()).toEqual(empty);
    expect(threads).toBe(1);
  }, THREAD_TEST_TIMEOUT_MS);
});
