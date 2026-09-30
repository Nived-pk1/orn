/**
 * The derived map behind CHEM-009: canonical SMILES to the species that have it (and the reverse). Built from the worker's answers,
 * held in memory on main, never stored canonically. `set` and `remove` say which canonical structures changed, so the caller
 * refreshes exactly the old and the new group of the species it touched, and no other.
 */
export interface Groups {
  /** Puts `id` under `canonical` (or under none: `undefined`). Returns the canonical structures whose membership changed. */
  set(id: string, canonical: string | undefined): readonly string[];
  remove(id: string): readonly string[];
  membersOf(canonical: string): readonly string[];
  canonicalOf(id: string): string | undefined;
}

export function createGroups(): Groups {
  const byCanonical = new Map<string, Set<string>>();
  const ofId = new Map<string, string>();
  const drop = (id: string): string | undefined => {
    const old = ofId.get(id);
    if (old === undefined) return undefined;
    ofId.delete(id);
    const members = byCanonical.get(old);
    members?.delete(id);
    if (members?.size === 0) byCanonical.delete(old);
    return old;
  };
  return {
    set(id, canonical) {
      const old = ofId.get(id);
      if (old === canonical) return [];
      drop(id);
      if (canonical !== undefined) {
        ofId.set(id, canonical);
        byCanonical.set(canonical, (byCanonical.get(canonical) ?? new Set()).add(id));
      }
      return [old, canonical].filter((value): value is string => value !== undefined);
    },
    remove(id) {
      const old = drop(id);
      return old === undefined ? [] : [old];
    },
    membersOf: (canonical) => [...(byCanonical.get(canonical) ?? [])].sort(),
    canonicalOf: (id) => ofId.get(id),
  };
}
