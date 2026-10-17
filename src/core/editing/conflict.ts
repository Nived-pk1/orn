/**
 * Conflict comparison (ADR-040). Three versions of a record: `base` (when the session started), `theirs` (the stored record now) and
 * `mine` (the draft). Compared per field path by canonical text (`canonicalJson`, the helper import conflict analysis uses): top-level
 * fields, and one level into plain objects ("names.canonical"); arrays and anything deeper are compared whole. The store's revision moving
 * is NOT a conflict by itself; only a changed field is. Pure: reads its arguments.
 */
import { canonicalJson } from '../text/canonical-json';
import type { FieldComparison, FieldStatus } from './contracts';

type Fields = Readonly<Record<string, unknown>>;

const isPlain = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Equal by canonical text; an absent value equals only an absent value; a value with no canonical text equals nothing. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  const left = canonicalJson(a);
  return left !== undefined && left === canonicalJson(b);
}

const fieldsOf = (value: unknown): Fields => (isPlain(value) ? value : {});

function statusOf(base: unknown, theirs: unknown, mine: unknown): FieldStatus {
  const theirsChanged = !sameValue(base, theirs);
  const mineChanged = !sameValue(base, mine);
  if (!theirsChanged && !mineChanged) return 'same';
  if (theirsChanged && !mineChanged) return 'theirsOnly';
  if (!theirsChanged && mineChanged) return 'mineOnly';
  // both changed: the same new value on both sides needs no choice
  return sameValue(theirs, mine) ? 'same' : 'both';
}

const sorted = (keys: Iterable<string>): string[] => [...new Set(keys)].sort();

/** Every field path of the three versions, sorted by path, each with its status (the UI lists the ones that are not `same`). */
export function compareForConflict(base: unknown, current: unknown, draft: unknown): readonly FieldComparison[] {
  const [b, t, m] = [fieldsOf(base), fieldsOf(current), fieldsOf(draft)];
  const out: FieldComparison[] = [];
  const add = (segments: string[], bv: unknown, tv: unknown, mv: unknown): void => {
    out.push({ path: segments.join('.'), segments, base: bv, theirs: tv, mine: mv, status: statusOf(bv, tv, mv) });
  };
  for (const key of sorted([...Object.keys(b), ...Object.keys(t), ...Object.keys(m)])) {
    const values = [b[key], t[key], m[key]] as const;
    if (values.some(isPlain) && values.every((v) => v === undefined || isPlain(v))) {
      const [bs, ts, ms] = [fieldsOf(values[0]), fieldsOf(values[1]), fieldsOf(values[2])];
      for (const sub of sorted([...Object.keys(bs), ...Object.keys(ts), ...Object.keys(ms)])) add([key, sub], bs[sub], ts[sub], ms[sub]);
    } else add([key], values[0], values[1], values[2]);
  }
  return out;
}
