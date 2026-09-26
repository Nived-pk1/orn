/**
 * Parent hierarchies (HIER-001): class, concept and named-reaction DAGs and the topic tree.
 * Walks are breadth-first, deduplicated and cycle-safe, so they terminate on invalid data too
 * (cycles are reported by validation, never looped on). Work is bounded by the records reachable.
 */
import type { HierarchyKind } from './contracts';

/** The field holding a record's parent link(s), per hierarchy kind. Checked against the registry in tests. */
export const HIERARCHY_FIELDS: Readonly<Record<HierarchyKind, string>> = {
  class: 'parentIds',
  concept: 'parentIds',
  named_reaction: 'parentIds',
  topic: 'parentId',
};

/** Direct parent IDs of a record, in declaration order (a single `parentId` or a `parentIds` list). */
export function parentIdsOf(record: unknown, kind: HierarchyKind): readonly string[] {
  if (typeof record !== 'object' || record === null) return [];
  const value = (record as Record<string, unknown>)[HIERARCHY_FIELDS[kind]];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

/** True when a concrete reference path (e.g. `parentIds[2]`) belongs to the kind's parent field. */
export function isParentPath(path: string, kind: HierarchyKind): boolean {
  const field = HIERARCHY_FIELDS[kind];
  return path === field || path.startsWith(`${field}[`);
}

/** Breadth-first closure from `start` (excluded), each ID once, nearest first. */
export function closure(start: string, next: (id: string) => readonly string[]): string[] {
  const seen = new Set<string>([start]);
  const out: string[] = [];
  for (let head = 0, queue: string[] = [start]; head < queue.length; head++) {
    const current = queue[head] as string;
    for (const id of next(current)) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      queue.push(id);
    }
  }
  return out;
}
