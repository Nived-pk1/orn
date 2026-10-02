/**
 * Step 5.1b, the depiction service over the real chem host and RPC client (in-memory, fake RDKit): with the worker held, 40 requests
 * put exactly 4 calls on the worker; none is ever answered BUSY (the client allows 16); cancelling a queued request keeps it from the
 * worker; the drawings come back as sanitised SVG text, never as an object URL.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBooter, demoState } from '@/test-support/app-boot-kit';
import { engineKit, fakeMoleculesFor } from '@/test-support/app-engines-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { depictionKeyOf } from '@/app/services';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const state = demoState();
const options = { width: 200, height: 150, showAtomMaps: false } as const;

describe('depictions through the services', () => {
  it('40 requests with the worker held: 4 calls reach it, the rest wait, all are answered with SVG text and none is BUSY', async () => {
    const kit = engineKit({ molecules: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`C${'C'.repeat(i)}O`, { smiles: `C${'C'.repeat(i)}O`, svg: `<svg xmlns='http://www.w3.org/2000/svg' width='200px' height='150px' viewBox='0 0 200 150'><rect width='200' height='150'/></svg>`, json: '{}', stereo: '{"CIP_atoms":[],"CIP_bonds":[]}', heavy: 3, order: '[0,1,2]' }])) });
    const t = testEnv({ world: await worldHolding(state, 2), workers: kit.factories });
    const services = await booter.bootEnv(t);
    let release: () => void = () => undefined;
    kit.chem.gate = new Promise<void>((resolve) => (release = resolve));
    const structures = Array.from({ length: 40 }, (_, i) => ({ format: 'smiles' as const, value: `C${'C'.repeat(i)}O` }));
    const results = structures.map((s) => services.depictions.depict(s, options));
    await vi.waitFor(() => expect(kit.chem.calls.filter((c) => c.endsWith(':depict'))).toHaveLength(4));
    expect(services.depictions.stats()).toMatchObject({ inFlight: 4, queued: 36 });
    // cancel one that is still queued: it never reaches the worker
    const cancelled = depictionKeyOf(structures[39] as never, options);
    services.depictions.cancel(cancelled);
    expect(await results[39]).toMatchObject({ ok: false, reason: 'cancelled' });
    release();
    const all = await Promise.all(results.slice(0, 39));
    expect(all.every((r) => r.ok && r.svg.startsWith('<svg') && !r.svg.includes('blob:'))).toBe(true);
    expect(all.some((r) => !r.ok)).toBe(false); // nothing was BUSY
    expect(kit.chem.calls.filter((c) => c.endsWith(':depict'))).toHaveLength(39);
    expect(services.depictions.stats().maxInFlight).toBe(4);
    expect(services.log.get().some((e) => e.source === 'worker' && e.event.type === 'busy')).toBe(false);
  });

  it('an engine that cannot load answers every depiction unavailable, as a value', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(state) });
    kit.chem.loadFailure = new Error('blocked');
    const t = testEnv({ world: await worldHolding(state, 2), workers: kit.factories });
    const services = await booter.bootEnv(t);
    const out = await Promise.all([services.depictions.depict({ format: 'smiles', value: 'CCO' }, options), services.depictions.depict({ format: 'smiles', value: 'CCC' }, options)]);
    expect(out.map((r) => (r.ok ? 'ok' : r.reason))).toEqual(['unavailable', 'unavailable']);
    expect(services.status.get().engines.chem.state).toBe('unavailable');
  });
});
