import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicallyEqual } from './canonical-json';

describe('canonical JSON (identical_skip)', () => {
  it('key order does not matter, array order does, absent optional fields are ignored', () => {
    expect(canonicallyEqual({ a: 1, b: { c: [1, 2], d: 'x' } }, { b: { d: 'x', c: [1, 2] }, a: 1 })).toBe(true);
    expect(canonicallyEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(canonicallyEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(canonicallyEqual({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(canonicallyEqual({ a: '1' }, { a: 1 })).toBe(false);
  });

  it('is deterministic text with sorted keys', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'q"'] })).toBe('{"a":[true,null,"q\\""],"b":1}');
  });

  it('a value nested beyond the bound, or not finite JSON, has no canonical text and is never "identical"', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 80; i += 1) deep = { d: deep };
    expect(canonicalJson(deep)).toBeUndefined();
    expect(canonicallyEqual(deep, deep)).toBe(false);
    expect(canonicalJson({ n: Number.NaN })).toBeUndefined();
    expect(canonicallyEqual({ n: Infinity }, { n: Infinity })).toBe(false);
  });
});
