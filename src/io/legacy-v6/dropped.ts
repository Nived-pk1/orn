/**
 * No-loss accounting for the v4 → v5 port (INV-23, needed by step 3.11). `findDroppedLeaves(input, output)` walks every SCALAR
 * leaf of the legacy input and reports each one whose exact value is not represented in the v5 output. A leaf is represented when
 * its exact value is at its destination:
 *   - compounds and reactions: the same path in the output record (a leaf of an array of scalars: anywhere in the output array,
 *     since `list()` drops empties and shifts indexes); everything else at the top level: the same path;
 *   - v4 reaction keys, which v6 moves: `start` → the substrate participant's `ref`; `end` and `coProducts[k]` → a product
 *     participant's `ref`; `extra`, `reagent`, `condition` → the same key in `_v4` (verbatim audit trail); `family` →
 *     `reagentFamily`; `mech` → `mechanism.summary` (all three whole, nested leaves included); `collapse` →
 *     `collapseIntermediates`; `pattern` → exactly reconstructable from `transformation` (`from → to`, or `from` alone when
 *     `to` is empty).
 * Empty arrays and objects hold no leaf. Trimmed, split, coerced or canonicalised values are NOT represented verbatim, so they are
 * reported (`changed`); a leaf whose destination does not exist is `not_in_output`. The list is what v6 lost, said out loud.
 */
import { LEGACY_REACTION_KEYS } from './migrate';
import { isObj, type LegacyObject } from './text';

export type LegacyScalar = string | number | boolean | null;

export interface DroppedLeaf {
  /** Path in the legacy input, e.g. `reactions[3].pattern` or `compounds[0].tags[1]`. */
  readonly path: string;
  readonly value: LegacyScalar;
  /** `changed`: a destination exists but holds another value; `not_in_output`: nothing in the output represents it. */
  readonly reason: 'changed' | 'not_in_output';
}

export type Segment = string | number;

const isScalar = (value: unknown): value is LegacyScalar => value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** `a.b[0]["odd key"]`. */
export function formatPath(path: readonly Segment[]): string {
  return path.reduce<string>((text, segment) => {
    if (typeof segment === 'number') return `${text}[${segment}]`;
    return /^[A-Za-z_$][\w$]*$/.test(segment) ? `${text}${text ? '.' : ''}${segment}` : `${text}[${JSON.stringify(segment)}]`;
  }, '');
}

function getAt(root: unknown, path: readonly Segment[]): unknown {
  let node = root;
  for (const segment of path) {
    if (!isObj(node) || !Object.hasOwn(node, segment)) return undefined;
    node = node[segment];
  }
  return node;
}

/** Every scalar leaf of `value`, depth-first, in key order. Iterative: legacy input depth is capped upstream, but nothing here recurses. */
export function* leavesOf(value: unknown, base: readonly Segment[] = []): Generator<{ path: readonly Segment[]; value: LegacyScalar }> {
  const stack: { path: readonly Segment[]; value: unknown }[] = [{ path: base, value }];
  while (stack.length > 0) {
    const item = stack.pop() as { path: readonly Segment[]; value: unknown };
    if (isScalar(item.value)) {
      yield { path: item.path, value: item.value };
    } else if (Array.isArray(item.value)) {
      for (let i = item.value.length - 1; i >= 0; i -= 1) stack.push({ path: [...item.path, i], value: (item.value as unknown[])[i] });
    } else if (isObj(item.value)) {
      const keys = Object.keys(item.value);
      for (let i = keys.length - 1; i >= 0; i -= 1) stack.push({ path: [...item.path, keys[i] as string], value: (item.value as LegacyObject)[keys[i] as string] });
    }
  }
}

type Verdict = 'kept' | 'changed' | 'not_in_output';

/** The same path in the output (scalars inside an array: anywhere in the output array). */
function keptAtSamePath(path: readonly Segment[], value: LegacyScalar, output: unknown, inputParent: unknown): Verdict {
  const last = path[path.length - 1];
  if (typeof last === 'number' && Array.isArray(inputParent)) {
    const outArray = getAt(output, path.slice(0, -1));
    if (!Array.isArray(outArray)) return 'not_in_output';
    return outArray.includes(value) ? 'kept' : 'changed';
  }
  const found = getAt(output, path);
  if (found === undefined) return 'not_in_output';
  return found === value ? 'kept' : 'changed';
}

const participantsOf = (out: LegacyObject): LegacyObject[] => (Array.isArray(out.participants) ? (out.participants as unknown[]).filter(isObj) : []);

/** A v4 reaction key: where v6 put its value (see the header). `depth` is the path length under the record that the rule covers. */
function legacyReactionVerdict(key: string, sub: readonly Segment[], value: LegacyScalar, input: LegacyObject, out: LegacyObject): Verdict {
  const v4 = !Array.isArray(input.participants);
  const produced = (role: string): boolean => participantsOf(out).some((p) => p.role === role && p.ref === value);
  const same = (found: unknown): Verdict => (found === undefined ? 'not_in_output' : found === value ? 'kept' : 'changed');
  const shallow = sub.length === 1;
  switch (key) {
    case 'start':
      return v4 && shallow ? (produced('substrate') ? 'kept' : 'changed') : 'not_in_output';
    case 'end':
      return v4 && shallow ? (produced('product') ? 'kept' : 'changed') : 'not_in_output';
    case 'coProducts':
      return v4 && sub.length === 2 ? (produced('product') ? 'kept' : 'changed') : 'not_in_output';
    // These are copied whole, so a leaf nested under them (a list or object in a v4 field) has the same nested path at the destination.
    case 'extra':
    case 'reagent':
    case 'condition':
      return v4 ? same(getAt(out, ['_v4', key, ...sub.slice(1)])) : 'not_in_output';
    case 'family':
      return same(getAt(out, ['reagentFamily', ...sub.slice(1)]));
    case 'mech':
      return same(getAt(out, ['mechanism', 'summary', ...sub.slice(1)]));
    case 'collapse':
      return shallow ? same(out.collapseIntermediates) : 'not_in_output';
    case 'pattern': {
      if (!shallow) return 'not_in_output';
      const from = getAt(out, ['transformation', 'from']);
      const to = getAt(out, ['transformation', 'to']);
      if (typeof from !== 'string' || typeof to !== 'string') return 'not_in_output';
      return (to === '' ? from : `${from} → ${to}`) === value ? 'kept' : 'changed';
    }
    default:
      return 'not_in_output';
  }
}

function recordVerdict(kind: 'compounds' | 'reactions', sub: readonly Segment[], value: LegacyScalar, input: LegacyObject, out: LegacyObject): Verdict {
  const key = sub[0];
  if (kind === 'reactions' && typeof key === 'string' && LEGACY_REACTION_KEYS.includes(key)) return legacyReactionVerdict(key, sub, value, input, out);
  return keptAtSamePath(sub, value, out, getAt(input, sub.slice(0, -1)));
}

/** Every scalar leaf of `input` that the v5 `output` does not hold verbatim. Deterministic: input order. */
export function findDroppedLeaves(input: LegacyObject, output: LegacyObject): DroppedLeaf[] {
  const dropped: DroppedLeaf[] = [];
  for (const { path, value } of leavesOf(input)) {
    const [top, index, ...sub] = path;
    let verdict: Verdict;
    const outRecords = top === 'compounds' || top === 'reactions' ? output[top] : undefined;
    if ((top === 'compounds' || top === 'reactions') && typeof index === 'number' && Array.isArray(outRecords) && Array.isArray(input[top]) && sub.length > 0) {
      const outRecord = outRecords[index];
      verdict = isObj(outRecord) ? recordVerdict(top, sub, value, (input[top] as LegacyObject[])[index] as LegacyObject, outRecord) : 'not_in_output';
    } else {
      verdict = keptAtSamePath(path, value, output, getAt(input, path.slice(0, -1)));
    }
    if (verdict !== 'kept') dropped.push({ path: formatPath(path), value, reason: verdict });
  }
  return dropped;
}
