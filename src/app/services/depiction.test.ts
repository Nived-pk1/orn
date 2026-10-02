/**
 * The depiction service (step 5.1b) over a scripted chem service: at most 4 calls in flight, FIFO, identical requests share one
 * call, `cancel` drops a queued request and ignores a running one's answer, the memory LRU bound, failures are values and are not
 * cached, and the key is a stable hash of (format, value, options).
 */
import { describe, expect, it } from 'vitest';
import type { DepictOutcome, DepictionOptions } from '@/chem';
import type { StructureRep } from '@/core/schema';
import { createDepictionService, DEPICTION_CACHE_SIZE, depictionKeyOf, MAX_DEPICTION_QUEUE, MAX_DEPICTIONS_IN_FLIGHT } from './depiction';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const options: DepictionOptions = { width: 200, height: 150, showAtomMaps: false };

interface Held {
  readonly value: string;
  readonly resolve: (outcome: DepictOutcome) => void;
}
function scripted() {
  const held: Held[] = [];
  const calls: string[] = [];
  let live = 0;
  let peak = 0;
  const chem = {
    depict(structure: StructureRep): Promise<DepictOutcome> {
      calls.push(structure.value);
      live += 1;
      peak = Math.max(peak, live);
      return new Promise((resolve) =>
        held.push({
          value: structure.value,
          resolve: (outcome) => {
            live -= 1;
            resolve(outcome);
          },
        }),
      );
    },
  };
  const drawing = (value: string): DepictOutcome => ({ ok: true, depiction: { key: `k-${value}`, svg: `<svg>${value}</svg>`, width: 200, height: 150 } });
  /** Answers the oldest held call. */
  const answer = (outcome?: DepictOutcome): string => {
    const next = held.shift() as Held;
    next.resolve(outcome ?? drawing(next.value));
    return next.value;
  };
  return { chem, held, calls, answer, drawing, peak: () => peak };
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the key', () => {
  it('is a stable hash of format, value and options; every part matters; the order of highlights does not', () => {
    const key = depictionKeyOf(smiles('CCO'), options);
    expect(key).toBe(depictionKeyOf(smiles('CCO'), { ...options }));
    expect(new Set([key, depictionKeyOf(smiles('CCC'), options), depictionKeyOf({ format: 'molfile', value: 'CCO' }, options), depictionKeyOf(smiles('CCO'), { ...options, width: 201 }), depictionKeyOf(smiles('CCO'), { ...options, showAtomMaps: true })]).size).toBe(5);
    expect(depictionKeyOf(smiles('CCO'), { ...options, highlightAtomMaps: [3, 1, 2, 1] })).toBe(depictionKeyOf(smiles('CCO'), { ...options, highlightAtomMaps: [1, 2, 3] }));
    expect(() => depictionKeyOf(smiles('CCO'), { ...options, width: 3 })).toThrow(RangeError);
  });
});

describe('at most 4 calls in flight', () => {
  it('40 requests: 4 go out, 36 wait in order; each answer lets the next go; the peak never passes 4', async () => {
    expect(MAX_DEPICTIONS_IN_FLIGHT).toBe(4);
    const s = scripted();
    const service = createDepictionService(s.chem);
    const results = Array.from({ length: 40 }, (_, i) => service.depict(smiles(`C${'C'.repeat(i)}`), options));
    expect(service.stats()).toMatchObject({ inFlight: 4, queued: 36, maxInFlight: 4 });
    expect(s.calls).toHaveLength(4);
    for (let i = 0; i < 40; i += 1) {
      s.answer();
      await tick();
      expect(service.stats().inFlight).toBeLessThanOrEqual(4);
    }
    const all = await Promise.all(results);
    expect(all.every((r) => r.ok)).toBe(true);
    expect(s.calls).toEqual(Array.from({ length: 40 }, (_, i) => `C${'C'.repeat(i)}`)); // FIFO
    expect(s.peak()).toBe(4);
    expect(service.stats()).toMatchObject({ inFlight: 0, queued: 0, calls: 40 });
  });

  it('identical requests share ONE call; a repeat after the answer is a memory hit', async () => {
    const s = scripted();
    const service = createDepictionService(s.chem);
    const [a, b, c] = [service.depict(smiles('CCO'), options), service.depict(smiles('CCO'), { ...options }), service.depict(smiles('CCO'), options)];
    expect(s.calls).toEqual(['CCO']);
    s.answer();
    expect((await Promise.all([a, b, c])).map((r) => r.ok)).toEqual([true, true, true]);
    expect(await service.depict(smiles('CCO'), options)).toMatchObject({ ok: true, cached: true, svg: '<svg>CCO</svg>' });
    expect(s.calls).toHaveLength(1);
    expect(service.stats().cacheHits).toBe(1);
  });
});

describe('cancel', () => {
  it('drops a queued request (it never reaches the worker) and answers it cancelled', async () => {
    const s = scripted();
    const service = createDepictionService(s.chem);
    const results = Array.from({ length: 6 }, (_, i) => service.depict(smiles(`N${i}`), options));
    const queued = depictionKeyOf(smiles('N5'), options);
    service.cancel(queued);
    expect(await results[5]).toMatchObject({ ok: false, reason: 'cancelled', key: queued });
    expect(service.stats()).toMatchObject({ inFlight: 4, queued: 1 });
    for (let i = 0; i < 5; i += 1) {
      s.answer();
      await tick();
    }
    expect(s.calls).toEqual(['N0', 'N1', 'N2', 'N3', 'N4']);
    expect((await Promise.all(results.slice(0, 5))).every((r) => r.ok)).toBe(true);
  });

  it('ignores the answer of a running request: the callers are answered cancelled at once, nothing is cached, a new request calls again', async () => {
    const s = scripted();
    const service = createDepictionService(s.chem);
    const first = service.depict(smiles('CCO'), options);
    service.cancel(depictionKeyOf(smiles('CCO'), options));
    expect(await first).toMatchObject({ ok: false, reason: 'cancelled' });
    s.answer(); // the worker finishes anyway
    await tick();
    expect(service.stats()).toMatchObject({ inFlight: 0, cacheSize: 0 });
    const again = service.depict(smiles('CCO'), options);
    expect(s.calls).toEqual(['CCO', 'CCO']);
    s.answer();
    expect(await again).toMatchObject({ ok: true, cached: false });
  });

  it('cancelling a key nobody asked for does nothing; dispose answers everything waiting cancelled', async () => {
    const s = scripted();
    const service = createDepictionService(s.chem);
    service.cancel('nothing');
    const waiting = Array.from({ length: 6 }, (_, i) => service.depict(smiles(`D${i}`), options));
    service.dispose();
    expect((await Promise.all(waiting)).map((r) => (r.ok ? 'ok' : r.reason))).toEqual(Array(6).fill('cancelled'));
    expect(await service.depict(smiles('CCO'), options)).toMatchObject({ ok: false, reason: 'cancelled' });
    s.answer();
    await tick();
    expect(s.calls).toHaveLength(4);
  });
});

describe('failures are values', () => {
  it('unavailable, timeout, invalid and refused come back as values and are not cached; a call that throws is unavailable', async () => {
    const s = scripted();
    const service = createDepictionService(s.chem);
    const reasons = ['unavailable', 'timeout', 'invalid', 'refused'] as const;
    const out = reasons.map((_, i) => service.depict(smiles(`F${i}`), options));
    reasons.forEach((reason) => s.answer({ ok: false, reason, error: `because ${reason}` }));
    expect(await Promise.all(out)).toEqual(reasons.map((reason, i) => ({ ok: false, key: depictionKeyOf(smiles(`F${i}`), options), reason, message: `because ${reason}` })));
    expect(service.stats().cacheSize).toBe(0);
    const throwing = createDepictionService({ depict: () => Promise.reject(new Error('port closed')) });
    expect(await throwing.depict(smiles('CCO'), options)).toMatchObject({ ok: false, reason: 'unavailable', message: 'port closed' });
  });

  it('bad options are a value, not an exception; a queue past its bound answers queue_full', async () => {
    const s = scripted();
    const service = createDepictionService(s.chem);
    expect(await service.depict(smiles('CCO'), { ...options, width: 1 })).toMatchObject({ ok: false, reason: 'bad_options', message: expect.stringContaining('width') });
    expect(s.calls).toEqual([]);
    const results = Array.from({ length: MAX_DEPICTIONS_IN_FLIGHT + MAX_DEPICTION_QUEUE }, (_, i) => service.depict(smiles(`Q${i}`), options));
    expect(await service.depict(smiles('one too many'), options)).toMatchObject({ ok: false, reason: 'queue_full' });
    service.dispose();
    await Promise.all(results);
  });
});

describe('the memory LRU', () => {
  it('keeps DEPICTION_CACHE_SIZE drawings, least recently used first out', async () => {
    expect(DEPICTION_CACHE_SIZE).toBe(256);
    const s = scripted();
    const service = createDepictionService(s.chem);
    const total = DEPICTION_CACHE_SIZE + 10;
    const results = Array.from({ length: total }, (_, i) => service.depict(smiles(`L${i}`), options));
    for (let i = 0; i < total; i += 1) {
      while (s.held.length === 0) await tick();
      s.answer();
    }
    await Promise.all(results);
    expect(service.stats().cacheSize).toBe(DEPICTION_CACHE_SIZE);
    expect(await service.depict(smiles(`L${total - 1}`), options)).toMatchObject({ cached: true }); // newest kept
    const callsBefore = s.calls.length;
    const oldest = service.depict(smiles('L0'), options); // the oldest was evicted: asks the worker again
    expect(s.calls.length).toBe(callsBefore + 1);
    s.answer();
    expect(await oldest).toMatchObject({ ok: true, cached: false });
  });
});
