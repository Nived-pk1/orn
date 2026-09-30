/**
 * Review reasons that only exist once ALL compounds are mapped (docs/MIGRATION.md §4.2, §4.4, §4.7): a collision in the readable part
 * of an ID (the colliding values got longer hash suffixes, so their IDs differ from what a file without the collision would give), and
 * a duplicate folded name (SPC-001 for species, CLS-002 for classes: both sides are told). Pure; Maps only.
 */
import { fold } from '@/core/text';
import type { CreatedClass } from './compound-classes';
import { excerpt } from './compound-scope';
import type { IdCollision } from './id-parts';

export const list = (items: readonly string[], max = 5): string => `${items.slice(0, max).join(', ')}${items.length > max ? `, … (${items.length} in all)` : ''}`;

export interface PlannedName {
  readonly key: string;
  readonly legacyId: string;
  readonly kind: 'species' | 'class';
}

export interface ExtraReasons {
  /** Compound index → reasons to add to its record. */
  readonly byCompound: ReadonlyMap<number, readonly string[]>;
  /** Created class ID → reasons to add to it. */
  readonly byCreatedClass: ReadonlyMap<string, readonly string[]>;
}

/** `names[i]` is the canonical name `planned[i]` gets. */
export function extraReasons(planned: readonly PlannedName[], names: readonly string[], collisions: readonly IdCollision[], created: readonly CreatedClass[]): ExtraReasons {
  const byCompound = new Map<number, string[]>();
  const byCreatedClass = new Map<string, string[]>();
  const add = <K>(map: Map<K, string[]>, key: K, text: string): void => void map.set(key, [...(map.get(key) ?? []), text]);

  const indexOfKey = new Map(planned.map((p, index) => [p.key, index] as const));
  const functionalGroupOf = new Map(created.filter((c) => c.classKind === 'functional_group').map((c) => [c.origin.slice('functionalGroup:'.length), c] as const));
  const classTextOf = new Map(created.filter((c) => c.classKind === 'compound_class').map((c) => [fold(c.name), c] as const));
  for (const collision of collisions) {
    for (const { original } of collision.resolved) {
      const others = list(collision.originals.filter((other) => other !== original).map((other) => excerpt(other, 40)));
      const text = `its ID part collided with ${others} (${collision.namespace}); the colliding values got longer hash suffixes, so this ID differs from the one a file without the collision would give`;
      if (collision.namespace === 'compound') {
        const index = indexOfKey.get(original);
        if (index !== undefined) add(byCompound, index, text);
      } else {
        const hit = collision.namespace === 'functional_group' ? functionalGroupOf.get(original) : collision.namespace === 'class_text' ? classTextOf.get(original) : undefined;
        if (hit !== undefined) add(byCreatedClass, hit.id, text);
      }
    }
  }

  const groups = new Map<string, number[]>();
  planned.forEach((p, index) => {
    const key = `${p.kind}\u0000${fold(names[index] as string)}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    for (const index of members) {
      const others = members.filter((other) => other !== index).map((other) => excerpt((planned[other] as PlannedName).legacyId, 40));
      const rule = (planned[index] as PlannedName).kind === 'species' ? 'SPC-001' : 'CLS-002';
      add(byCompound, index, `same folded name as ${list(others)} (${rule}); check whether they are duplicates`);
    }
  }
  return { byCompound, byCreatedClass };
}
