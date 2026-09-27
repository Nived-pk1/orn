/**
 * Stable, deterministic, non-cryptographic hashing for IDs and cache keys (finding IDs, edge IDs).
 * Pure: same input, same output, on every platform.
 */

/** 32-bit FNV-1a with a caller-chosen offset basis. */
export function fnv1a(text: string, basis: number): number {
  let hash = basis >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const hex8 = (n: number): string => n.toString(16).padStart(8, '0');

/** 64 bits (16 hex characters) from two independent FNV-1a passes. */
export function hash64(text: string): string {
  return `${hex8(fnv1a(text, 0x811c9dc5))}${hex8(fnv1a(text, 0x9747b28c))}`;
}

/**
 * Hash of an ordered list of parts. Parts are joined with U+0000 and an absent part (`undefined`) is
 * distinguished from an empty string, so `['a', undefined]` and `['a', '']` never collide.
 */
export function hashParts(parts: readonly (string | undefined)[]): string {
  return hash64(parts.map((part) => (part === undefined ? '\u0001' : `\u0002${part}`)).join('\u0000'));
}
