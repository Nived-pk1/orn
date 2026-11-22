/**
 * Which side of "before -> after" each species of a mechanism step is drawn on (step 8.5, ADR-038 decision D2). Pure chemistry-layer
 * rule over the roles and the atom-map numbers of the species; the drawing only follows it.
 *   reactant, reagent, catalyst           before
 *   product, leaving_group                after
 *   intermediate, transition_state        before when it holds an atom of an electron movement AND some atom of it is not already shown
 *                                         by a species on the before side (an intermediate made only of atoms the before side already
 *                                         has is what the step makes), else after. Decided smallest first, ties in written order, so
 *                                         the answer does not depend on the order the species are written in.
 * The last clause extends D2's wording ("when it holds an atom of any movement"), which put the enolate a step MAKES on the before
 * side of the demo's first aldol step; the extension is recorded in ADR-038 "As built 8.5".
 */
import type { STEP_SPECIES_ROLES } from '../schema';

type StepSpeciesRole = (typeof STEP_SPECIES_ROLES)[number];

export interface SideSpecies {
  readonly role: StepSpeciesRole;
  /** The atom-map numbers of the species' structure (none when it has no structure or no maps). */
  readonly maps: readonly number[];
}

export interface Sides {
  /** Indexes into the species list, in the written order. */
  readonly before: readonly number[];
  readonly after: readonly number[];
}

type Site = { readonly kind: 'atom' | 'lone_pair' | 'radical'; readonly atom: number } | { readonly kind: 'bond'; readonly atoms: readonly [number, number] };
export interface MovementLike {
  readonly from: Site;
  readonly to: Site;
  readonly electrons?: 1 | 2;
}

const BEFORE_ROLES: ReadonlySet<StepSpeciesRole> = new Set(['reactant', 'reagent', 'catalyst']);
const AFTER_ROLES: ReadonlySet<StepSpeciesRole> = new Set(['product', 'leaving_group']);

/** Every atom-map number a movement names, at either end. */
export function movementAtoms(movements: readonly MovementLike[]): ReadonlySet<number> {
  const atoms = new Set<number>();
  for (const movement of movements) {
    for (const site of [movement.from, movement.to]) {
      if (site.kind === 'bond') {
        atoms.add(site.atoms[0]);
        atoms.add(site.atoms[1]);
      } else atoms.add(site.atom);
    }
  }
  return atoms;
}

export function stepSides(species: readonly SideSpecies[], movement: ReadonlySet<number>): Sides {
  const before = new Set<number>();
  const shown = new Set<number>();
  species.forEach((one, index) => {
    if (BEFORE_ROLES.has(one.role)) {
      before.add(index);
      one.maps.forEach((map) => shown.add(map));
    }
  });
  const open = species.flatMap((one, index) => (BEFORE_ROLES.has(one.role) || AFTER_ROLES.has(one.role) ? [] : [index]));
  open.sort((a, b) => (species[a] as SideSpecies).maps.length - (species[b] as SideSpecies).maps.length || a - b);
  for (const index of open) {
    const maps = (species[index] as SideSpecies).maps;
    if (maps.some((map) => movement.has(map)) && maps.some((map) => !shown.has(map))) {
      before.add(index);
      maps.forEach((map) => shown.add(map));
    }
  }
  const all = species.map((_, index) => index);
  return { before: all.filter((index) => before.has(index)), after: all.filter((index) => !before.has(index)) };
}
