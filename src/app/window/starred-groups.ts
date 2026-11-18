/** The Starred view's list (step 8.4g Part B, G2): the starred records grouped by kind, named from the canonical records; a star whose record is gone is counted, never listed. Pure. */
import { nameOfRecord } from '@/features/inspector';
import type { AnyRecord, CanonicalState, RecordRef } from '@/core/schema';

export interface StarredRow {
  readonly ref: RecordRef;
  readonly title: string;
}
export interface StarredGroup {
  readonly kind: string;
  readonly heading: string;
  readonly rows: readonly StarredRow[];
}

/** The order of the groups, and their headings (a kind not listed here follows, by its plain name). */
const ORDER: readonly (readonly [string, string])[] = [
  ['reaction', 'Reactions'],
  ['species', 'Compounds'],
  ['class', 'Classes'],
  ['reagent', 'Reagents'],
  ['named_reaction', 'Named reactions'],
  ['mechanism', 'Mechanisms'],
  ['topic', 'Topics'],
];
const headingOf = (kind: string): string => ORDER.find(([k]) => k === kind)?.[1] ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1).replaceAll('_', ' ')}s`;

export function starredGroups(state: CanonicalState, starred: readonly RecordRef[]): { readonly groups: readonly StarredGroup[]; readonly missing: number } {
  const all = state.records as unknown as Readonly<Record<string, Readonly<Record<string, AnyRecord>> | undefined>>;
  const byKind = new Map<string, StarredRow[]>();
  let missing = 0;
  for (const ref of starred) {
    const record = all[ref.kind]?.[ref.id];
    if (record === undefined) {
      missing += 1;
      continue;
    }
    byKind.set(ref.kind, [...(byKind.get(ref.kind) ?? []), { ref, title: nameOfRecord(record) }]);
  }
  const known = ORDER.map(([kind]) => kind);
  const kinds = [...known.filter((kind) => byKind.has(kind)), ...[...byKind.keys()].filter((kind) => !known.includes(kind)).sort()];
  return { groups: kinds.map((kind) => ({ kind, heading: headingOf(kind), rows: byKind.get(kind) ?? [] })), missing };
}

export const missingWords = (n: number): string | undefined => (n <= 0 ? undefined : n === 1 ? '1 starred record no longer exists' : `${n} starred records no longer exist`);
