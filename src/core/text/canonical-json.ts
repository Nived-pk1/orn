/**
 * Deterministic serialisation for `identical_skip` (docs/PERSISTENCE.md §6: "same content, deep-equal after canonical
 * ordering"): object keys sorted by code unit, array order kept (it is content: participant order, step order), no
 * whitespace. Two records are identical when their canonical texts are equal — never decided by name or ID. Depth is bounded
 * (records are schema-capped far below it); a value nested deeper has no canonical text, so it is never called identical.
 */
const MAX_DEPTH = 64;

function write(value: unknown, depth: number): string | undefined {
  if (value === null || typeof value !== 'object') {
    // JSON.stringify(undefined) is undefined: an absent value and a present one must never look equal.
    return typeof value === 'number' && !Number.isFinite(value) ? undefined : JSON.stringify(value);
  }
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const text = write(item, depth + 1);
      if (text === undefined) return undefined;
      parts.push(text);
    }
    return `[${parts.join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item === undefined) continue; // an optional field left absent
    const text = write(item, depth + 1);
    if (text === undefined) return undefined;
    parts.push(`${JSON.stringify(key)}:${text}`);
  }
  return `{${parts.join(',')}}`;
}

/** Canonical text of a JSON-like value, or undefined when it has none (too deep, or not finite JSON). */
export function canonicalJson(value: unknown): string | undefined {
  return write(value, 0);
}

/** True only when both have a canonical text and the texts are equal. */
export function canonicallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return canonicalJson(a) !== undefined;
  const left = canonicalJson(a);
  return left !== undefined && left === canonicalJson(b);
}
