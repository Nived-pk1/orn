/**
 * The worker's per-call `IdFactory` (step 4.2c): a function of `{ nowIso, seed }` alone, and a refusal for data that is not.
 */
import { describe, expect, it } from 'vitest';
import { idFactoryFrom, seededRandom } from './ids';

const NOW = '2026-09-30T12:00:00.000Z';

describe('idFactoryFrom', () => {
  it('the same data mints the same IDs and timestamp; another seed or instant does not', () => {
    const mint = (nowIso: string, seed: number): string[] => {
      const ids = idFactoryFrom({ nowIso, seed });
      return [ids.now(), ids.newId('imp'), ids.newId('imp'), ids.newId('spc')];
    };
    expect(mint(NOW, 5)).toEqual(mint(NOW, 5));
    expect(mint(NOW, 5)[0]).toBe(NOW);
    expect(mint(NOW, 5)[1]).not.toBe(mint(NOW, 6)[1]);
    expect(mint(NOW, 5)[1]).not.toBe(mint('2026-09-30T12:00:01.000Z', 5)[1]);
    const [, first, second] = mint(NOW, 5);
    expect((first as string) < (second as string)).toBe(true);
  });

  it.each([
    ['not a date', { nowIso: 'yesterday', seed: 1 }],
    ['a date without milliseconds', { nowIso: '2026-09-30T12:00:00Z', seed: 1 }],
    ['a local offset', { nowIso: '2026-09-30T12:00:00.000+02:00', seed: 1 }],
    ['a negative seed', { nowIso: NOW, seed: -1 }],
    ['a fractional seed', { nowIso: NOW, seed: 1.5 }],
    ['a seed over 32 bits', { nowIso: NOW, seed: 2 ** 32 }],
    ['a NaN seed', { nowIso: NOW, seed: Number.NaN }],
  ])('refuses %s as BAD_REQUEST', (_name, data) => {
    expect(() => idFactoryFrom(data)).toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
  });

  it('the generator is uniform in [0, 1) and repeats per seed', () => {
    const a = seededRandom(9);
    const b = seededRandom(9);
    const values = Array.from({ length: 1000 }, () => a.next());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(990);
  });
});
