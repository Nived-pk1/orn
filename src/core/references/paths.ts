/**
 * Registry path syntax and immutable path edits — the only place that interprets the paths
 * declared in src/core/schema/references.ts.
 *
 * Syntax: dot-separated fields; a `[]` suffix iterates an array (`participants[].ref`). A terminal
 * `[]` addresses the elements of an array of IDs. Walks are bounded by the path depth and the
 * (schema-capped) array sizes; nothing recurses on data.
 */

export type PathToken = string | number;
export type JsonObject = { readonly [key: string]: unknown };

export interface PathSegment {
  readonly key: string;
  readonly each: boolean;
}

export interface PathMatch {
  /** Concrete location, e.g. ['participants', 1, 'ref']. */
  readonly tokens: readonly PathToken[];
  /** The object that holds the terminal field (or the array element for a terminal `[]`'s owner). */
  readonly parent: JsonObject;
  readonly value: unknown;
  /** `ends[k]` = number of tokens that locate the element/field addressed by segments 0..k. */
  readonly ends: readonly number[];
}

const SEGMENT = /^([A-Za-z][A-Za-z0-9]*)(\[\])?$/;

/** Throws on a malformed registry path: that is a programmer error, never a data error. */
export function parsePath(path: string): readonly PathSegment[] {
  return path.split('.').map((part) => {
    const match = SEGMENT.exec(part);
    if (match === null) throw new Error(`Malformed registry path "${path}"`);
    return { key: match[1] ?? part, each: match[2] !== undefined };
  });
}

export function formatPath(tokens: readonly PathToken[]): string {
  return tokens.reduce<string>(
    (text, token) => (typeof token === 'number' ? `${text}[${token}]` : text === '' ? token : `${text}.${token}`),
    '',
  );
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own, defined field of an object; undefined for anything else. */
export function fieldOf(node: unknown, key: string): unknown {
  return isObject(node) && Object.hasOwn(node, key) ? node[key] : undefined;
}

/** All concrete locations of `segments` inside `root`. Absent or wrongly-typed parts yield no match. */
export function matchPath(root: unknown, segments: readonly PathSegment[]): PathMatch[] {
  const out: PathMatch[] = [];
  const visit = (node: unknown, index: number, tokens: readonly PathToken[], ends: readonly number[]): void => {
    const segment = segments[index];
    const child = segment === undefined ? undefined : fieldOf(node, segment.key);
    if (segment === undefined || child === undefined || !isObject(node)) return;
    const base = [...tokens, segment.key];
    const found: (readonly [unknown, readonly PathToken[]])[] = !segment.each
      ? [[child, base]]
      : Array.isArray(child)
        ? child.map((element: unknown, i) => [element, [...base, i]] as const)
        : [];
    for (const [value, at] of found) {
      const nextEnds = [...ends, at.length];
      if (index === segments.length - 1) out.push({ tokens: at, parent: node, value, ends: nextEnds });
      else visit(value, index + 1, at, nextEnds);
    }
  };
  visit(root, 0, [], []);
  return out;
}

export type Edit =
  | { readonly tokens: readonly PathToken[]; readonly remove: true }
  | { readonly tokens: readonly PathToken[]; readonly remove?: false; readonly value: unknown };

function compareTokens(a: readonly PathToken[], b: readonly PathToken[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i] as PathToken;
    const y = b[i] as PathToken;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

function editAt(node: unknown, tokens: readonly PathToken[], depth: number, edit: Edit): unknown {
  const token = tokens[depth];
  const last = depth === tokens.length - 1;
  if (Array.isArray(node) && typeof token === 'number' && token < node.length) {
    if (last) {
      return edit.remove === true
        ? node.filter((_, i) => i !== token)
        : node.map((element: unknown, i) => (i === token ? edit.value : element));
    }
    return node.map((element: unknown, i) => (i === token ? editAt(element, tokens, depth + 1, edit) : element));
  }
  if (isObject(node) && typeof token === 'string' && Object.hasOwn(node, token)) {
    if (!last) return { ...node, [token]: editAt(node[token], tokens, depth + 1, edit) };
    if (edit.remove !== true) return { ...node, [token]: edit.value };
    return Object.fromEntries(Object.entries(node).filter(([key]) => key !== token));
  }
  throw new Error(`Edit location not found: ${formatPath(tokens)}`);
}

/**
 * Applies edits without mutating `root`. Sets run first, then removals from the last location to
 * the first, so array indices recorded on the original tree stay valid. Duplicate locations apply
 * once. Returns `root` itself when there are no edits.
 */
export function applyEdits<T>(root: T, edits: readonly Edit[]): T {
  if (edits.length === 0) return root;
  const unique = new Map<string, Edit>();
  for (const edit of edits) unique.set(`${edit.remove === true ? 'r' : 's'}:${formatPath(edit.tokens)}`, edit);
  const all = [...unique.values()];
  const sets = all.filter((edit) => edit.remove !== true);
  const removals = all.filter((edit) => edit.remove === true).sort((a, b) => compareTokens(b.tokens, a.tokens));
  let result: unknown = root;
  for (const edit of [...sets, ...removals]) result = editAt(result, edit.tokens, 0, edit);
  return result as T;
}
