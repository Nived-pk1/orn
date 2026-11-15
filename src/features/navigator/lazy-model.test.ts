/**
 * The map model behind a lazy chunk (step 8.4m, R1 and R2): nothing of the pipeline is loaded or run before `start`; until the first
 * Scene the state is the idle one ("not computed yet": no scene, no numbers); a chunk that does not load is an error VALUE, and the next
 * `start` asks again.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import { navigatorRig } from '@/test-support/navigator-kit';
import { createLazyNavigatorModel, MAP_CODE_FAILED } from './lazy-model';
import { IDLE_NAVIGATOR_STATE } from './navigator-state';

const parsed = documentToState(JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/map-layout/map-layout.orn.json'), 'utf8')));
if (!parsed.ok) throw new Error('fixture');
const rigOf = () => navigatorRig(createCanonicalStore({ initial: parsed.state, validateInitial: false }));

describe('the lazy map model', () => {
  it('before start: the idle state, zero stats, and the pipeline code is not asked for', () => {
    const load = vi.fn(() => import('./pipeline'));
    const model = createLazyNavigatorModel(rigOf().ports, load);
    expect(model.getState()).toBe(IDLE_NAVIGATOR_STATE);
    expect(model.getState().scene).toBeNull();
    expect(model.stats()).toEqual({ projections: 0, sizes: 0, requests: 0, layoutCalls: 0, scenes: 0 });
    expect(load).not.toHaveBeenCalled();
  });

  it('start loads the pipeline once, runs it and tells the subscribers; a second start does not load again', async () => {
    const load = vi.fn(() => import('./pipeline'));
    const rig = rigOf();
    const model = createLazyNavigatorModel(rig.ports, load);
    const heard = vi.fn();
    model.subscribe(heard);
    model.start();
    model.start();
    await vi.waitFor(() => expect(model.getState().scene).not.toBeNull());
    expect(load).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalled();
    expect(model.stats().scenes).toBeGreaterThan(0);
    model.stop();
    model.start();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stopped before the code arrives: the pipeline never runs', async () => {
    const rig = rigOf();
    const model = createLazyNavigatorModel(rig.ports);
    model.start();
    model.stop();
    await new Promise((done) => setTimeout(done, 50));
    expect(rig.layout.requests).toHaveLength(0);
    expect(model.getState().scene).toBeNull();
  });

  it('a chunk that does not load is an error value, and the next start asks again', async () => {
    let fail = true;
    const load = vi.fn(() => (fail ? Promise.reject(new Error('offline')) : import('./pipeline')));
    const model = createLazyNavigatorModel(rigOf().ports, load);
    model.start();
    await vi.waitFor(() => expect(model.getState().error?.code).toBe(MAP_CODE_FAILED));
    expect(model.getState().error?.message).toContain('offline');
    fail = false;
    model.stop();
    model.start();
    await vi.waitFor(() => expect(model.getState().scene).not.toBeNull());
    expect(model.getState().error).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
