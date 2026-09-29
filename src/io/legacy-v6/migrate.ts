/**
 * Legacy `migrateLegacy`: one v4 reaction (`start`, `end`, `coProducts`, `extra`, `reagent`, `condition`) becomes a v5 participant
 * list and a condition text. Ported with its quirks: the first product is the "major" one (`end`); reagents are matched to a
 * compound by trimmed, lower-cased name, else kept as free-text labels; a name already seen (as a compound or a label) is
 * skipped; the participants carry no `image` field (only `normPart` adds one, and it does not run on this path).
 */
import { splitLegacyReagent } from './conditions';
import { arr, field, list, LegacyRefusal, or, type LegacyObject } from './text';

/** Compounds by trimmed, lower-cased name: the FIRST compound with a name wins (legacy `find`). Built once per document. */
export interface CompoundNameLookup {
  /** The first compound ID (as stored) for a folded name; a hit whose stored ID is falsy is still a hit with `''`. */
  byName(name: string): { readonly id: unknown } | undefined;
}

/**
 * `compounds.find(c => c.name.trim().toLowerCase() === key)` throws in v6 when it reaches a compound whose `name` is not a
 * string before it finds a match. The port refuses there instead (`INVALID_COMPOUND_NAME`): no silent guess.
 */
export function createCompoundNameLookup(compounds: readonly LegacyObject[]): CompoundNameLookup {
  const firstIndexByKey = new Map<string, number>();
  let firstBadName: number | undefined;
  compounds.forEach((compound, index) => {
    const name = compound.name;
    if (typeof name !== 'string') {
      firstBadName ??= index;
      return;
    }
    const key = name.trim().toLowerCase();
    if (!firstIndexByKey.has(key)) firstIndexByKey.set(key, index);
  });
  return {
    byName(name) {
      const hit = firstIndexByKey.get(name.trim().toLowerCase());
      if (firstBadName !== undefined && (hit === undefined || firstBadName < hit)) {
        throw new LegacyRefusal('INVALID_COMPOUND_NAME', `compounds[${firstBadName}] has no text name, so a reagent name cannot be matched against the compounds (v6 would throw a TypeError here); fix or remove that compound`, `compounds[${firstBadName}].name`);
      }
      return hit === undefined ? undefined : { id: (compounds[hit] as LegacyObject).id };
    },
  };
}

export interface MigratedReaction {
  readonly participants: LegacyObject[];
  readonly conditionText: string;
}

export function migrateLegacy(r: LegacyObject, lookup: CompoundNameLookup): MigratedReaction {
  const participants: LegacyObject[] = [];
  const seen = new Set<string>();
  const addRef = (id: unknown, role: string, major?: boolean): void => {
    if (!id) return;
    seen.add(`#${String(id)}`);
    participants.push({ ref: id, label: '', role, major: Boolean(major), note: '' });
  };
  const addName = (value: unknown, role: string): void => {
    const name = String(value).trim();
    if (!name) return;
    const compound = lookup.byName(name);
    const key = compound ? `#${String(compound.id)}` : name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    participants.push(compound ? { ref: compound.id, label: '', role, major: false, note: '' } : { ref: '', label: name, role, major: false, note: '' });
  };
  addRef(r.start, 'substrate');
  addRef(r.end, 'product', true);
  arr(r.coProducts).forEach((id) => addRef(id, 'product', false));
  const split = splitLegacyReagent(r.reagent);
  split.reagents.forEach((name) => addName(name, 'reagent'));
  split.workup.forEach((name) => addName(name, 'workup'));
  list(r.extra).forEach((name) => addName(name, 'reactant'));
  const conditionText = [...new Set([r.condition, ...split.conditions].filter(Boolean))].join(', ');
  return { participants, conditionText };
}

/** Legacy `migrateLegacy(r, compounds)` as v6 calls it. */
export function migrateLegacyReaction(r: LegacyObject, compounds: readonly LegacyObject[]): MigratedReaction {
  return migrateLegacy(r, createCompoundNameLookup(compounds));
}

/** The v4 keys `normReaction` removes from a reaction (`LEGACY_R_KEYS`). */
export const LEGACY_REACTION_KEYS: readonly string[] = ['start', 'end', 'coProducts', 'extra', 'reagent', 'family', 'condition', 'pattern', 'mech', 'collapse'];

/** `r.conditions.text` for a reaction that already has participants (v5). */
export const conditionTextOf = (r: LegacyObject): unknown => or(field(r.conditions, 'text'), '');
