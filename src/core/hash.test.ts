import { describe, expect, it } from 'vitest';
import { hash64, hashParts } from './hash';

describe('stable hashing', () => {
  it('is deterministic and 16 hex characters', () => {
    expect(hash64('abc')).toBe(hash64('abc'));
    expect(hash64('abc')).toMatch(/^[0-9a-f]{16}$/);
    expect(hash64('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('matches pinned values (IDs must never change between releases)', () => {
    expect(hash64('')).toBe('811c9dc59747b28c');
    // FNV-1a 32-bit of "a" with the standard basis is 0xe40c292c.
    expect(hash64('a').slice(0, 8)).toBe('e40c292c');
  });

  it('separates parts, and undefined from empty string', () => {
    expect(hashParts(['ab', 'c'])).not.toBe(hashParts(['a', 'bc']));
    expect(hashParts(['a', undefined])).not.toBe(hashParts(['a', '']));
    expect(hashParts(['a', undefined])).not.toBe(hashParts(['a']));
  });
});
