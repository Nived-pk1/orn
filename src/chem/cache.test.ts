/**
 * The chem worker's cache and option checks (step 4.3a): an LRU of 500, keys from hash(format, value, options, toolkit, version),
 * a hit that also compares the whole input, and only answers that hold for the same input kept.
 */
import { describe, expect, it } from 'vitest';
import type { StructureRep } from '@/core/schema';
import { createFakeRdkit, ETHANOL_SPEC } from '@/test-support/fake-rdkit';
import { CHEM_CACHE_SIZE, withChemCache } from './cached-toolkit';
import type { DepictionOptions, StructureToolkit } from './contracts';
import { depictionDetails, MAX_DEPICTION_SIZE, MAX_HIGHLIGHT_MAPS } from './depiction-options';
import { LruCache } from './lru';
import { createRdkitToolkit } from './rdkit/adapter';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const DRAW: DepictionOptions = { width: 200, height: 150, showAtomMaps: true };

describe('LruCache', () => {
  it('evicts the least recently used entry, and a read counts as a use', () => {
    const cache = new LruCache<number>(3);
    for (const [key, value] of [['a', 1], ['b', 2], ['c', 3]] as const) cache.set(key, value);
    expect(cache.get('a')).toBe(1); // a is now the most recent; b is the oldest
    cache.set('d', 4);
    expect([cache.get('a'), cache.get('b'), cache.get('c'), cache.get('d')]).toEqual([1, undefined, 3, 4]);
    expect(cache.size).toBe(3);
  });

  it('setting an existing key replaces it without growing, and clear empties it', () => {
    const cache = new LruCache<string>(2);
    cache.set('a', 'x');
    cache.set('a', 'y');
    expect([cache.size, cache.get('a')]).toEqual([1, 'y']);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('never holds more than its capacity, over any sequence', () => {
    const cache = new LruCache<number>(500);
    for (let i = 0; i < 5_000; i += 1) {
      cache.set(String(i % 733), i);
      expect(cache.size).toBeLessThanOrEqual(500);
    }
  });

  it('needs a capacity of at least one', () => {
    expect(() => new LruCache(0)).toThrow(RangeError);
    expect(() => new LruCache(1.5)).toThrow(RangeError);
  });
});

function counted(molecules: Parameters<typeof createFakeRdkit>[0]) {
  const fake = createFakeRdkit(molecules);
  const inner = createRdkitToolkit({ load: async () => fake.module });
  return { fake, inner, toolkit: withChemCache(inner) };
}

describe('withChemCache', () => {
  it('the size is 500 for facts and 500 for depictions', () => {
    expect(CHEM_CACHE_SIZE).toBe(500);
  });

  it('a repeated parse or depict is answered from the cache, without RDKit; the answer is the same value', async () => {
    const { fake, toolkit } = counted({ CCO: ETHANOL_SPEC });
    const first = await toolkit.parse(smiles('CCO'));
    const second = await toolkit.parse(smiles('CCO'));
    expect(second).toBe(first);
    const d1 = await toolkit.depict(smiles('CCO'), DRAW);
    const d2 = await toolkit.depict(smiles('CCO'), DRAW);
    expect(d2).toBe(d1);
    expect(fake.calls.getMol).toHaveLength(2); // one parse, one depict
    expect(toolkit.stats()).toEqual({ hits: 2, misses: 2, facts: 1, depictions: 1 });
  });

  it('a different format, option, or width is a different entry; the same highlights in another order is the same', async () => {
    const { toolkit } = counted({ CCO: ETHANOL_SPEC });
    await toolkit.depict(smiles('CCO'), { ...DRAW, highlightAtomMaps: [2, 1] });
    await toolkit.depict(smiles('CCO'), { ...DRAW, highlightAtomMaps: [1, 2] });
    await toolkit.depict(smiles('CCO'), { ...DRAW, highlightAtomMaps: [1, 2, 2] });
    expect(toolkit.stats()).toMatchObject({ hits: 2, misses: 1, depictions: 1 });
    await toolkit.depict(smiles('CCO'), { ...DRAW, showAtomMaps: false });
    await toolkit.depict({ format: 'cxsmiles', value: 'CCO' }, DRAW);
    await toolkit.depict(smiles('CCO'), { ...DRAW, width: 201 });
    expect(toolkit.stats().depictions).toBe(4);
  });

  it('`invalid` and `refused` answers are cached', async () => {
    const { fake, toolkit } = counted({ CCO: { ...ETHANOL_SPEC, svg: 'not an svg' } });
    await toolkit.parse(smiles('C1CC'));
    await toolkit.parse(smiles('C1CC'));
    await toolkit.depict(smiles('CCO'), DRAW);
    await toolkit.depict(smiles('CCO'), DRAW);
    expect(toolkit.stats()).toMatchObject({ hits: 2, facts: 1, depictions: 1 });
    // the invalid structure was read once normally and once without sanitising (which says WHY it is invalid); the repeats never reached RDKit
    expect(fake.calls.getMol).toEqual(['C1CC', 'C1CC#nosan', 'CCO']);
  });

  it('`unavailable` is never cached (it says nothing about the structure): the next call asks again', async () => {
    let up = false;
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const down = withChemCache(createRdkitToolkit({ load: async () => (up ? fake.module : Promise.reject(new Error('no wasm'))) }));
    expect(await down.parse(smiles('CCO'))).toMatchObject({ ok: false, reason: 'unavailable' });
    up = true;
    expect((await down.parse(smiles('CCO'))).ok).toBe(true);
    expect(down.stats().facts).toBe(1);
  });

  it.each(['unavailable', 'timeout'] as const)('a `%s` answer from a loaded toolkit is not cached either: the next call asks again and gets the real answer', async (reason) => {
    let calls = 0;
    const inner: StructureToolkit = {
      name: 'stub',
      version: '1',
      ready: async () => undefined,
      parse: async () => (calls++ === 0 ? { ok: false, reason, error: 'not this time' } : { ok: true, facts: { atomMaps: [], warnings: [] } }),
      depict: async () => (calls++ === 0 ? { ok: false, reason, error: 'not this time' } : { ok: false, reason: 'refused', error: 'x' }),
      matchesSmarts: async () => ({ ok: true, matches: true }),
    };
    const toolkit = withChemCache(inner);
    expect(await toolkit.parse(smiles('CCO'))).toMatchObject({ ok: false, reason });
    expect(await toolkit.parse(smiles('CCO'))).toMatchObject({ ok: true });
    expect(toolkit.stats()).toMatchObject({ hits: 0, misses: 2, facts: 1 });
  });

  it('an entry that was made for another input is never returned (a key collision cannot answer for another structure)', async () => {
    const { toolkit } = counted({ CCO: ETHANOL_SPEC, CCN: { ...ETHANOL_SPEC, smiles: 'CCN' } });
    const a = await toolkit.parse(smiles('CCO'));
    const b = await toolkit.parse(smiles('CCN'));
    expect(a.ok && a.facts.canonicalSmiles).toBe('CCO');
    expect(b.ok && b.facts.canonicalSmiles).toBe('CCN');
  });

  it('holds at most 500 facts: the 501st structure evicts the oldest, which is then computed again', async () => {
    const molecules = Object.fromEntries(Array.from({ length: CHEM_CACHE_SIZE + 1 }, (_, i) => [`C${'C'.repeat(i)}`, ETHANOL_SPEC]));
    const { fake, toolkit } = counted(molecules);
    for (const value of Object.keys(molecules)) await toolkit.parse(smiles(value));
    expect(toolkit.stats().facts).toBe(CHEM_CACHE_SIZE);
    await toolkit.parse(smiles('C')); // the oldest was evicted
    expect(fake.calls.getMol.filter((input) => input === 'C')).toHaveLength(2);
    await toolkit.parse(smiles(`C${'C'.repeat(CHEM_CACHE_SIZE)}`)); // the newest is still there
    expect(fake.calls.getMol).toHaveLength(CHEM_CACHE_SIZE + 2);
  });

  it('is a StructureToolkit that passes name, version, ready and matchesSmarts through, uncached', async () => {
    const fake = createFakeRdkit({ CCO: { ...ETHANOL_SPEC, matches: { '[OX2H]': '{"atoms":[1]}' } } }, { '[OX2H]': { ok: true } });
    const toolkit: StructureToolkit = withChemCache(createRdkitToolkit({ load: async () => fake.module }));
    expect(toolkit.name).toBe('rdkit-minimallib');
    await toolkit.ready();
    expect(toolkit.version).toBe('fake-2026.03');
    await toolkit.matchesSmarts(smiles('CCO'), '[OX2H]');
    await toolkit.matchesSmarts(smiles('CCO'), '[OX2H]');
    expect(fake.calls.getQmol).toHaveLength(2);
  });
});

describe('depictionDetails', () => {
  it('normalises the highlights (sorted, unique) and keeps the option order fixed', () => {
    expect(depictionDetails({ ...DRAW, highlightAtomMaps: [3, 1, 3] })).toEqual({ width: 200, height: 150, showAtomMaps: true, highlightAtomMaps: [1, 3] });
    expect(Object.keys(depictionDetails(DRAW))).toEqual(['width', 'height', 'showAtomMaps', 'highlightAtomMaps']);
  });

  it.each([
    [{ ...DRAW, width: 15 }],
    [{ ...DRAW, height: MAX_DEPICTION_SIZE + 1 }],
    [{ ...DRAW, width: 200.5 }],
    [{ ...DRAW, width: '200' }],
    [{ ...DRAW, showAtomMaps: 'yes' }],
    [{ ...DRAW, highlightAtomMaps: [1.5] }],
    [{ ...DRAW, highlightAtomMaps: [-1] }],
    [{ ...DRAW, highlightAtomMaps: 'all' }],
    [{ ...DRAW, highlightAtomMaps: Array.from({ length: MAX_HIGHLIGHT_MAPS + 1 }, (_, i) => i) }],
  ])('%j is a programmer error', (options) => {
    expect(() => depictionDetails(options as unknown as DepictionOptions)).toThrow(RangeError);
  });
});
