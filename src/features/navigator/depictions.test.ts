/**
 * The navigator's structures (step 5.5a part 2, item i): keys, the bounded lookup, the answers of the service mapped to the manager's
 * statuses (BUSY or unavailable), object URLs only through the port, a timeout never retried, and what a user sees after the chem
 * engine is retried (the failure stays cached: said as it is, an openItem).
 */
import { describe, expect, it } from 'vitest';
import type { StructureRep } from '@/core/schema';
import { DEPICTION_BUSY } from '@/render/svg';
import { createDepictionBinding, MAX_DEPICTION_LOOKUP } from './depictions';
import type { NavigatorDepictionAnswer, NavigatorDepictions } from './contracts';
import { createScenePorts } from './scene-ports';
import { demoState } from '@/test-support/app-boot-kit';
import { manualTimers } from '@/test-support/navigator-kit';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value }) as StructureRep;
const structure = (n: number): StructureRep => smiles(`C${'C'.repeat(n)}`);
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

type FailureReason = Extract<NavigatorDepictionAnswer, { ok: false }>['reason'];
const failure = (reason: FailureReason): NavigatorDepictionAnswer => ({ ok: false, reason, message: reason });
const good: NavigatorDepictionAnswer = { ok: true, svg: '<svg/>' };

interface Rig {
  readonly port: NavigatorDepictions;
  readonly calls: { structure: StructureRep; size: { width: number; height: number } }[];
  readonly urls: string[];
  readonly revoked: string[];
  readonly cancelled: string[];
  answer: (structure: StructureRep) => Promise<NavigatorDepictionAnswer>;
}

function rig(): Rig {
  const calls: Rig['calls'] = [];
  const urls: string[] = [];
  const revoked: string[] = [];
  const cancelled: string[] = [];
  const state: Rig = {
    calls,
    urls,
    revoked,
    cancelled,
    answer: () => Promise.resolve(good),
    port: {
      keyOf: (s, size) => `${s.value}@${size.width}x${size.height}`,
      depict: (s, size) => (calls.push({ structure: s, size }), state.answer(s)),
      cancel: (key) => void cancelled.push(key),
      createUrl: (svg) => (urls.push(svg), `blob:test/${urls.length}`),
      revokeUrl: (url) => void revoked.push(url),
    },
  };
  return state;
}

describe('the depiction binding', () => {
  it('asks the service at the structure-area size (128 x 80) and shows a ready drawing through an object URL made by the port', async () => {
    const r = rig();
    const binding = createDepictionBinding(r.port, manualTimers());
    const key = binding.keyOf(structure(3));
    expect(key).toBe(`${structure(3).value}@128x80`);
    binding.manager.request(key);
    await settle();
    expect(r.calls).toEqual([{ structure: structure(3), size: { width: 128, height: 80 } }]);
    expect(binding.manager.snapshot(key)).toEqual({ state: 'ready', url: 'blob:test/1' });
    expect(r.urls).toEqual(['<svg/>']);
  });

  it('revokes object URLs through the port on dispose', async () => {
    const r = rig();
    const binding = createDepictionBinding(r.port, manualTimers());
    const key = binding.keyOf(structure(1));
    binding.manager.request(key);
    await settle();
    binding.manager.dispose();
    expect(r.revoked).toEqual(['blob:test/1']);
  });

  const table: readonly (readonly [FailureReason, 'idle' | 'unavailable'])[] = [
    ['queue_full', 'idle'],
    ['cancelled', 'idle'],
    ['timeout', 'unavailable'],
    ['invalid', 'unavailable'],
    ['refused', 'unavailable'],
    ['bad_options', 'unavailable'],
    ['unavailable', 'unavailable'],
  ];
  it.each(table)('the service answer %s becomes %s in the manager', async (reason, state) => {
    const r = rig();
    r.answer = () => Promise.resolve(failure(reason));
    const binding = createDepictionBinding(r.port, manualTimers());
    const key = binding.keyOf(structure(2));
    binding.manager.request(key);
    await settle();
    expect(binding.manager.snapshot(key).state).toBe(state);
    if (state === 'unavailable') expect(binding.manager.snapshot(key)).toEqual({ state: 'unavailable', reason });
  });

  it('a busy answer is the BUSY answer of the manager: not cached, asked again later, never shown', async () => {
    const r = rig();
    r.answer = () => Promise.resolve(failure('queue_full'));
    const binding = createDepictionBinding(r.port, manualTimers());
    const key = binding.keyOf(structure(2));
    binding.manager.request(key);
    await settle();
    expect(binding.manager.snapshot(key)).toEqual({ state: 'idle' });
    r.answer = () => Promise.resolve(good);
    binding.manager.request(key);
    await settle();
    expect(binding.manager.snapshot(key).state).toBe('ready');
    expect(DEPICTION_BUSY).toBe('BUSY');
  });

  it('a timeout is NOT retried: the key stays unavailable and the service is not asked again', async () => {
    const r = rig();
    r.answer = () => Promise.resolve(failure('timeout'));
    const binding = createDepictionBinding(r.port, manualTimers());
    const key = binding.keyOf(structure(2));
    for (let i = 0; i < 5; i += 1) {
      binding.manager.request(key);
      await settle();
    }
    expect(r.calls).toHaveLength(1);
    expect(binding.manager.snapshot(key)).toEqual({ state: 'unavailable', reason: 'timeout' });
  });

  it('after the chem engine is retried a failed structure stays a name until it leaves the cache (openItem: nothing asks again)', async () => {
    const r = rig();
    r.answer = () => Promise.resolve(failure('unavailable'));
    const binding = createDepictionBinding(r.port, manualTimers());
    const key = binding.keyOf(structure(2));
    binding.manager.request(key);
    await settle();
    r.answer = () => Promise.resolve(good); // the engine is back
    binding.manager.request(key);
    await settle();
    expect(r.calls).toHaveLength(1);
    expect(binding.manager.snapshot(key).state).toBe('unavailable');
  });

  it('after a successful retry of the chem engine (port.recovered) every unavailable structure is forgotten and asked again when shown; ready ones stay (step 5.5d, item i)', async () => {
    const r = rig();
    let recovered: (() => void) | undefined;
    const port: NavigatorDepictions = { ...r.port, recovered: (listener) => ((recovered = listener), () => undefined) };
    r.answer = (s) => Promise.resolve(s.value === structure(2).value ? failure('unavailable') : good);
    const binding = createDepictionBinding(port, manualTimers());
    const bad = binding.keyOf(structure(2));
    const fine = binding.keyOf(structure(3));
    for (const key of [bad, fine]) binding.manager.request(key);
    await settle();
    expect(binding.manager.snapshot(bad).state).toBe('unavailable');
    expect(binding.manager.snapshot(fine).state).toBe('ready');
    r.answer = () => Promise.resolve(good); // the engine is back
    recovered?.();
    expect(binding.manager.snapshot(bad)).toEqual({ state: 'idle' });
    expect(binding.manager.snapshot(fine).state).toBe('ready');
    binding.manager.request(bad); // it is shown again
    await settle();
    expect(binding.manager.snapshot(bad).state).toBe('ready');
    expect(r.calls.filter((c) => c.structure.value === structure(2).value)).toHaveLength(2);
  });

  it('the lookup from key to structure is bounded; a key that left it is answered BUSY and never cached', async () => {
    const r = rig();
    const binding = createDepictionBinding(r.port, manualTimers());
    const first = binding.keyOf(structure(1));
    for (let i = 0; i < MAX_DEPICTION_LOOKUP + 10; i += 1) binding.keyOf(smiles(`N${i}`));
    expect(binding.lookupSize()).toBe(MAX_DEPICTION_LOOKUP);
    binding.manager.request(first);
    await settle();
    expect(r.calls).toHaveLength(0);
    expect(binding.manager.snapshot(first)).toEqual({ state: 'idle' });
  });

  it('asking for a key again refreshes it: it is the oldest others that leave the lookup', async () => {
    const r = rig();
    const binding = createDepictionBinding(r.port, manualTimers());
    const kept = binding.keyOf(structure(1));
    for (let i = 0; i < MAX_DEPICTION_LOOKUP - 1; i += 1) binding.keyOf(smiles(`N${i}`));
    binding.keyOf(structure(1));
    binding.keyOf(smiles('extra'));
    expect(binding.lookupSize()).toBe(MAX_DEPICTION_LOOKUP);
    binding.manager.request(kept);
    await settle();
    expect(r.calls).toHaveLength(1);
  });

  it('cancel reaches the service', () => {
    const r = rig();
    r.answer = () => new Promise(() => undefined);
    const binding = createDepictionBinding(r.port, manualTimers());
    const key = binding.keyOf(structure(2));
    binding.manager.request(key);
    binding.manager.cancel?.(key);
    expect(r.cancelled).toEqual([key]);
    expect(binding.manager.snapshot(key)).toEqual({ state: 'idle' });
  });

  it('a hostile drawing reaches the page only as an object URL, never as markup', async () => {
    const r = rig();
    r.answer = () => Promise.resolve({ ok: true, svg: '<svg><script>alert(1)</script></svg>' });
    const binding = createDepictionBinding(r.port, manualTimers());
    const key = binding.keyOf(structure(2));
    binding.manager.request(key);
    await settle();
    expect(binding.manager.snapshot(key)).toEqual({ state: 'ready', url: 'blob:test/1' });
  });
});

describe('the depiction key of a Scene node (scene ports)', () => {
  it('only a species record with a structure has one; a class, a reagent and a species without a structure have none', () => {
    const state = demoState();
    const ports = createScenePorts(state, (s) => `key:${s.value}`);
    const species = Object.values(state.records.species);
    const withStructure = species.filter((s) => s.structure !== undefined);
    const without = species.filter((s) => s.structure === undefined);
    expect(withStructure.length).toBeGreaterThan(0);
    for (const s of withStructure) expect(ports.depictionKeyOf({ kind: 'species', id: s.id })).toBe(`key:${s.structure?.value}`);
    for (const s of without) expect(ports.depictionKeyOf({ kind: 'species', id: s.id }) as string | undefined).toBeUndefined();
    const aClass = Object.values(state.records.class)[0] as { id: string };
    const aReagent = Object.values(state.records.reagent)[0] as { id: string };
    expect(ports.depictionKeyOf({ kind: 'class', id: aClass.id } as never)).toBeUndefined();
    expect(ports.depictionKeyOf({ kind: 'reagent', id: aReagent.id } as never)).toBeUndefined();
    // without a binding no node has a key
    expect(createScenePorts(state).depictionKeyOf({ kind: 'species', id: (withStructure[0] as { id: string }).id } as never)).toBeUndefined();
  });
});
