/** Small state helpers shared by the command modules. Read-only; no chemistry, no kind-specific code. */
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind, type RecordRef } from '../schema';
import { compareIds } from '../dataset/document';

const KIND_ORDER: ReadonlyMap<string, number> = new Map(RECORD_KINDS.map((kind, i) => [kind, i] as const));
const MAX_EQUAL_DEPTH = 64;

export const isRecordKind = (value: unknown): value is RecordKind =>
  typeof value === 'string' && KIND_ORDER.has(value);

export function recordAt(state: CanonicalState, ref: RecordRef): AnyRecord | undefined {
  const table = state.records[ref.kind] as Readonly<Record<string, AnyRecord>>;
  return Object.hasOwn(table, ref.id) ? table[ref.id] : undefined;
}

/** Kind order (registry order), then ID: the order of every list this module returns. */
export function byRef(a: RecordRef, b: RecordRef): number {
  return (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0) || compareIds(a.id, b.id);
}

export const refKey = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

export function allRefs(state: CanonicalState): RecordRef[] {
  return RECORD_KINDS.flatMap((kind) =>
    Object.keys(state.records[kind]).map((id) => ({ kind, id }) as RecordRef),
  ).sort(byRef);
}

/**
 * Structural equality of two JSON values (key order ignored). Values nested deeper than the schema
 * allows compare unequal, so the answer is never a false "equal" and the recursion is bounded.
 */
export function jsonEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (depth > MAX_EQUAL_DEPTH || typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => jsonEqual(item, b[i], depth + 1));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && jsonEqual(left[key], right[key], depth + 1));
}
