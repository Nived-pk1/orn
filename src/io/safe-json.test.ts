import { describe, expect, it } from 'vitest';
import { parseJsonSafely, sanitizeUnsafeKeys } from './safe-json';

const LIMITS = { maxDepth: 64, maxStringLength: 1_000_000 };

describe('sanitizeUnsafeKeys (ADV-035)', () => {
  it('renames __proto__, constructor and prototype at any depth, and reports path + original key', () => {
    // Built via JSON.parse, not an object literal: `{ __proto__: x }` as JS SOURCE syntax sets the prototype
    // instead of creating an own property (a different, ES2015-special case) — JSON.parse never does that.
    const input = JSON.parse('{"top":{"__proto__":{"polluted":true},"nested":[{"constructor":1},{"prototype":2}]}}') as unknown;
    const { value, unsafeKeysRenamed } = sanitizeUnsafeKeys(input as never);
    const out = value as { top: Record<string, unknown> };
    expect(Object.keys(out.top)).not.toContain('__proto__');
    expect(out.top['__unsafe_key____proto__']).toEqual({ polluted: true });
    expect(unsafeKeysRenamed).toEqual(
      expect.arrayContaining([
        { path: 'top', originalKey: '__proto__' },
        { path: 'top.nested[0]', originalKey: 'constructor' },
        { path: 'top.nested[1]', originalKey: 'prototype' },
      ]),
    );
    expect(unsafeKeysRenamed).toHaveLength(3);
  });

  it('Object.prototype is never mutated, even when the rebuilt object is later spread or merged', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true}}') as unknown;
    const { value } = sanitizeUnsafeKeys(input as never);
    const spread = { ...(value as Record<string, unknown>) };
    const merged = Object.assign({}, value as Record<string, unknown>);
    expect((Object.prototype as unknown as { polluted?: boolean }).polluted).toBeUndefined();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect((spread as { polluted?: boolean }).polluted).toBeUndefined();
    expect((merged as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('leaves ordinary keys, arrays and scalars untouched', () => {
    const input = { a: 1, b: [1, 'x', null, true], c: { d: 'ok' } };
    const { value, unsafeKeysRenamed } = sanitizeUnsafeKeys(input as never);
    expect(value).toEqual(input);
    expect(unsafeKeysRenamed).toEqual([]);
  });

  it('disambiguates two keys that would otherwise collide, first-come-first-served, never overwriting either', () => {
    const input = JSON.parse('{"__proto__":1,"__unsafe_key____proto__":"already here"}') as unknown;
    const { value, unsafeKeysRenamed } = sanitizeUnsafeKeys(input as never);
    const out = value as Record<string, unknown>;
    // __proto__ is renamed first (it appears first in the JSON text) and claims the clean slot; the
    // pre-existing benign key of the same name, arriving second, is bumped rather than silently dropped.
    expect(out['__unsafe_key____proto__']).toBe(1);
    expect(out['__unsafe_key____proto___2']).toBe('already here');
    expect(unsafeKeysRenamed).toHaveLength(1);
  });
});

describe('parseJsonSafely', () => {
  it('parses ordinary JSON and reports no renames', () => {
    const result = parseJsonSafely('{"a":[1,2,3]}', LIMITS);
    expect(result).toEqual({ ok: true, value: { a: [1, 2, 3] }, unsafeKeysRenamed: [] });
  });

  it('rejects text over the depth cap before ever calling JSON.parse (TOO_DEEP)', () => {
    const result = parseJsonSafely('[[[1]]]', { maxDepth: 2, maxStringLength: 1_000_000 });
    expect(result).toMatchObject({ ok: false, code: 'TOO_DEEP' });
  });

  it('rejects text over the string-length cap (STRING_TOO_LONG)', () => {
    const result = parseJsonSafely('{"a":"aaaaaaaaaa"}', { maxDepth: 64, maxStringLength: 5 });
    expect(result).toMatchObject({ ok: false, code: 'STRING_TOO_LONG' });
  });

  it('a syntactically invalid JSON text that passes the pre-scan is INVALID_JSON', () => {
    const result = parseJsonSafely('{"a":}', LIMITS);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_JSON' });
  });

  it('renames unsafe keys found in real JSON text (not just a hand-built object)', () => {
    const result = parseJsonSafely('{"__proto__":{"polluted":true}}', LIMITS);
    if (!result.ok) throw new Error('expected ok');
    expect(result.unsafeKeysRenamed).toEqual([{ path: '', originalKey: '__proto__' }]);
    expect((Object.prototype as unknown as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
