const MAX_JSON_NODES = 100_000;
const MAX_JSON_DEPTH = 64;

/** Plain JSON only (what `JsonValue` promises), bounded in size and depth; iterative, so no recursion limit. */
export function isJsonValue(value: unknown): boolean {
  const stack: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value: v, depth } = stack.pop() as { value: unknown; depth: number };
    nodes += 1;
    if (nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return false;
    if (v === null || typeof v === 'string' || typeof v === 'boolean') continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return false;
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ value: item, depth: depth + 1 });
      continue;
    }
    if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      for (const item of Object.values(v as object)) stack.push({ value: item, depth: depth + 1 });
      continue;
    }
    return false;
  }
  return true;
}
