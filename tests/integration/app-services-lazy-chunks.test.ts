/**
 * Step 5.7, lazy loading: the in-process import and export code are chunks loaded on first use. A chunk that fails to load is a
 * refusal in words that changes nothing (the page is not left half-way), and the next call loads it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBooter, smallState } from '@/test-support/app-boot-kit';
import { worldHolding } from '@/test-support/app-env-kit';
import { demoFile, footprint } from '@/test-support/app-flow-kit';

const booter = createBooter();
afterEach(async () => {
  await booter.disposeAll();
  vi.doUnmock('@/app/services/import-inprocess');
  vi.doUnmock('@/app/services/export-inprocess');
});
const noWorker = { computeFactory: () => { throw new Error('no worker threads here'); } };
const FULL = { scope: 'full', includeDependencies: false, assets: 'none' } as const;

describe('the in-process chunks', () => {
  it('import: a chunk that fails to load is a refusal in words, nothing changes, and the next preview loads it', async () => {
    let fails = true;
    vi.doMock('@/app/services/import-inprocess', () => {
      if (fails) throw new Error('Failed to fetch dynamically imported module');
      return vi.importActual('@/app/services/import-inprocess');
    });
    const world = await worldHolding(smallState(), 1);
    const { services } = await booter.boot({ ...noWorker, world });
    const before = await footprint(services, world);
    const refused = await services.flows.preview(await demoFile(), 'demo.orn.json', undefined, { inProcess: true });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/import code for this thread could not be loaded/);
    expect(await footprint(services, world)).toEqual(before);
    expect(services.status.get().operation).toBeNull();
    fails = false;
    const again = await services.flows.preview(await demoFile(), 'demo.orn.json', undefined, { inProcess: true });
    expect(again.ok).toBe(true);
  });

  it('export: a chunk that fails to load is a refusal in words and the next export loads it', async () => {
    let fails = true;
    vi.doMock('@/app/services/export-inprocess', () => {
      if (fails) throw new Error('Failed to fetch dynamically imported module');
      return vi.importActual('@/app/services/export-inprocess');
    });
    const world = await worldHolding(smallState(), 1);
    const { services } = await booter.boot({ ...noWorker, world });
    const refused = await services.flows.export(FULL, 'orn.json', { inProcess: true });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/export code for this thread could not be loaded/);
    expect(services.status.get().operation).toBeNull();
    fails = false;
    expect((await services.flows.export(FULL, 'orn.json', { inProcess: true })).ok).toBe(true);
  });
});
