/**
 * Starred and recent records (step 8.4g Part B, G2 and G3): the rules, pure. A record is named by its kind and id. What is stored is read
 * tolerantly (anything that is not a plain {kind, id} is dropped, duplicates keep their first place, the cap holds); nothing here is
 * chemistry and nothing is canonical.
 */
import type { RecordRef } from '@/core/schema';

export const STAR_LIMIT = 500;
export const RECENT_LIMIT = 20;
const KIND = /^[a-z][a-z_]{0,40}$/;
const MAX_ID = 200;

export const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

export function parseRefs(value: unknown, limit: number): RecordRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: RecordRef[] = [];
  for (const entry of value) {
    if (out.length >= limit) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { kind, id } = entry as { kind?: unknown; id?: unknown };
    if (typeof kind !== 'string' || typeof id !== 'string' || !KIND.test(kind) || id === '' || id.length > MAX_ID) continue;
    const ref = { kind, id } as RecordRef;
    if (seen.has(keyOf(ref))) continue;
    seen.add(keyOf(ref));
    out.push(ref);
  }
  return out;
}

export type StarResult = { readonly result: 'added' | 'removed' | 'full'; readonly list: readonly RecordRef[] };

/** Adds the star, or removes it when there is one; at the cap a new star is refused and the list is the same list. */
export function toggleStar(list: readonly RecordRef[], ref: RecordRef): StarResult {
  const at = list.findIndex((one) => one.kind === ref.kind && one.id === ref.id);
  if (at >= 0) return { result: 'removed', list: list.filter((_, index) => index !== at) };
  if (list.length >= STAR_LIMIT) return { result: 'full', list };
  return { result: 'added', list: [...list, ref] };
}

/** The record becomes the newest of the recent ones. */
export function touchRecent(list: readonly RecordRef[], ref: RecordRef): RecordRef[] {
  return [ref, ...list.filter((one) => !(one.kind === ref.kind && one.id === ref.id))].slice(0, RECENT_LIMIT);
}
