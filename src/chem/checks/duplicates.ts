/**
 * CHEM-009 (service side): two species with the same canonical structure. The groups come from a DERIVED map (canonical SMILES to
 * species IDs) that the service keeps from the worker's answers; it is never stored canonically. RDKit's canonical SMILES keeps
 * atom-map numbers, so a mapped structure and its unmapped twin are different structures here. The message names no other species
 * (a rename must not leave a stale message); the others are in `related`, capped.
 */
import type { CheckDraft } from './contracts';

export const MAX_DUPLICATE_RELATED = 20;

/** One draft per member of a group of two or more (none for a lone species), keyed by species ID. */
export function duplicateDrafts(members: readonly string[]): ReadonlyMap<string, CheckDraft> {
  const out = new Map<string, CheckDraft>();
  if (members.length < 2) return out;
  const sorted = [...members].sort();
  for (const id of sorted) {
    const others = sorted.filter((other) => other !== id);
    out.set(id, {
      ruleId: 'CHEM-009',
      path: 'structure',
      message:
        others.length === 1
          ? 'This species has the same canonical structure as another species (see the related record).'
          : `This species has the same canonical structure as ${others.length} other species (the first ${Math.min(others.length, MAX_DUPLICATE_RELATED)} are listed as related).`,
      related: others.slice(0, MAX_DUPLICATE_RELATED).map((other) => ({ kind: 'species', id: other })),
      data: { group: sorted.length },
    });
  }
  return out;
}
