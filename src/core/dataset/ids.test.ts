import { describe, expect, it } from 'vitest';
import { RECORD_ID_PREFIX, RecordRefSchema, NESTED_ID_PREFIX, OPERATIONAL_ID_PREFIX, idPattern, recordKindOfId } from '../schema';
import type { CommandContext } from '../commands/contracts';
import type { Clock, RandomSource } from './contracts';
import { createIdFactory } from './ids';

/** mulberry32: small seeded generator for tests. */
function seeded(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function clockAt(...values: number[]): Clock & { set(ms: number): void } {
  let ms = values[0] ?? 0;
  return { nowMs: () => ms, set: (next) => void (ms = next) };
}

const zeroRng: RandomSource = { next: () => 0 };

describe('createIdFactory', () => {
  it('is structurally a CommandContext', () => {
    const ctx: CommandContext = createIdFactory(clockAt(0), zeroRng);
    expect(ctx.newId('rxn')).toMatch(/^rxn_/);
  });

  it('encodes a known vector: time in the first 10 characters, randomness in the last 16', () => {
    const clock = clockAt(0);
    const factory = createIdFactory(clock, zeroRng);
    expect(factory.newId('rxn')).toBe('rxn_00000000000000000000000000');
    clock.set(1);
    expect(factory.newId('rxn')).toBe('rxn_00000000010000000000000000');
    clock.set(32);
    expect(factory.newId('rxn')).toBe('rxn_00000000100000000000000000');
    clock.set(2 ** 48 - 1);
    expect(factory.newId('rxn')).toBe('rxn_7zzzzzzzzz0000000000000000');
  });

  it('uses the RNG digit for digit', () => {
    const rng: RandomSource = { next: () => 31 / 32 };
    expect(createIdFactory(clockAt(0), rng).newId('spc')).toBe('spc_0000000000zzzzzzzzzzzzzzzz');
  });

  it('is deterministic for the same clock and seed, and differs across seeds', () => {
    const run = (seed: number): string[] => {
      const factory = createIdFactory(clockAt(1_700_000_000_000), seeded(seed));
      return Array.from({ length: 20 }, () => factory.newId('rxn'));
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('produces schema-valid IDs for every record, nested and operational prefix', () => {
    const factory = createIdFactory(clockAt(1_700_000_000_000), seeded(1));
    for (const prefix of [
      ...Object.values(RECORD_ID_PREFIX),
      ...Object.values(NESTED_ID_PREFIX),
      ...Object.values(OPERATIONAL_ID_PREFIX),
    ]) {
      const id = factory.newId(prefix);
      expect(id).toMatch(idPattern(prefix));
      expect(id).toHaveLength(prefix.length + 1 + 26);
    }
    const [kind, prefix] = ['reaction', RECORD_ID_PREFIX.reaction] as const;
    const id = factory.newId(prefix);
    expect(recordKindOfId(id)).toBe(kind);
    expect(RecordRefSchema.safeParse({ kind, id }).success).toBe(true);
  });

  it('is strictly increasing within one millisecond, across milliseconds and when the clock steps back', () => {
    const clock = clockAt(1000);
    const factory = createIdFactory(clock, seeded(3));
    const ids: string[] = [];
    for (let i = 0; i < 50; i += 1) ids.push(factory.newId('rxn'));
    clock.set(1001);
    for (let i = 0; i < 5; i += 1) ids.push(factory.newId('rxn'));
    clock.set(500); // backwards
    for (let i = 0; i < 5; i += 1) ids.push(factory.newId('rxn'));
    clock.set(2000);
    ids.push(factory.newId('rxn'));
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries the increment across base-32 digits', () => {
    const clock = clockAt(5);
    const rng: RandomSource = { next: () => 31 / 32 - 1e-9 }; // digit 30
    const factory = createIdFactory(clock, rng);
    const first = factory.newId('rxn');
    expect(first.endsWith('y'.repeat(16))).toBe(true);
    expect(factory.newId('rxn').endsWith('y'.repeat(15) + 'z')).toBe(true);
    expect(factory.newId('rxn').endsWith('y'.repeat(14) + 'z0')).toBe(true);
  });

  it('fails loudly on random-component overflow instead of repeating an ID', () => {
    const factory = createIdFactory(clockAt(9), { next: () => 31 / 32 });
    factory.newId('rxn');
    expect(() => factory.newId('rxn')).toThrow(RangeError);
  });

  it('never produces the Crockford-excluded letters i, l, o, u in the ULID body', () => {
    const factory = createIdFactory(clockAt(1_700_000_000_000), seeded(11));
    for (let i = 0; i < 200; i += 1) expect(factory.newId('rxn').slice(4)).not.toMatch(/[ilou]/);
  });

  it('rejects malformed prefixes', () => {
    const factory = createIdFactory(clockAt(0), zeroRng);
    for (const prefix of ['', 'ab', 'abcd', 'RXN', 'r-n', 'rx1']) expect(() => factory.newId(prefix)).toThrow(RangeError);
  });

  it('rejects out-of-contract clock and RNG values', () => {
    for (const ms of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 48]) {
      const factory = createIdFactory(clockAt(ms), zeroRng);
      expect(() => factory.newId('rxn')).toThrow(RangeError);
      expect(() => factory.now()).toThrow(RangeError);
    }
    for (const value of [-0.1, 1, Number.NaN]) {
      expect(() => createIdFactory(clockAt(0), { next: () => value }).newId('rxn')).toThrow(RangeError);
    }
  });

  it('now() returns a schema-shaped UTC timestamp with milliseconds', () => {
    expect(createIdFactory(clockAt(0), zeroRng).now()).toBe('1970-01-01T00:00:00.000Z');
    expect(createIdFactory(clockAt(1_700_000_000_123), zeroRng).now()).toBe('2023-11-14T22:13:20.123Z');
  });
});
