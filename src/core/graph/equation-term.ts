/**
 * What a term of the textbook equation looks like (equation step, part 5). The data side: `TermSubstance`, what the equation needs of the
 * record behind a term (name, structure, entered formula, charge). The decision: `termRepresentationOf`, a PURE function of that and the
 * chem facts, so the screen only lays out what it is told (no chemistry in components). The rule (reviewer, 2026-10-17):
 *   - a species that has an entered formula AND whose structure has no carbon atom (H2O, HBr, LiOH, H2SO4), or at most one carbon and at
 *     most 3 heavy atoms (CH3OH, CO2, HCN, CH3MgBr): the formula as text. Reason: a molecule the card draws must not turn into text below;
 *   - any other species with a structure (ethanol, for one): its drawing (its formula, else its name, if the drawing fails);
 *   - a species without a structure: its entered formula, else its name only;
 *   - a class: its generic structure drawn, else its generic formula as text, else its name;
 *   - a reagent: by its species if it has one (`structure` and `formula` of the species), else its name.
 * The facts are asked of the chem worker and arrive later: while they are not here a term that needs them is `pending`; if the engine
 * cannot say, a species with a formula is written as that formula (never a guess about the structure); a fact RDKit did not give for a
 * structure counts as "not small", so the structure is drawn. The carbon count is a chem fact, never parsed from a formula string.
 */
import type { StructureRep } from '../schema';

export interface TermSubstance {
  readonly kind: 'species' | 'class' | 'reagent' | 'missing';
  /** The name as written (what the term's name line says). */
  readonly name: string;
  /** A species' structure; a class' generic structure; a reagent's species' structure. */
  readonly structure?: StructureRep;
  /** An entered formula: a species' `formula`; a class' generic formula text; a reagent's species' `formula`. */
  readonly formula?: string;
  /** The species' charge when it has one; with it the typography can tell a charge from a subscript. */
  readonly charge?: number;
}

/** The facts the rule needs about a structure, as the screen has them. */
export type FactsInput =
  | { readonly state: 'pending' }
  | { readonly state: 'unavailable' }
  | { readonly state: 'ready'; readonly heavyAtomCount?: number; readonly carbonCount?: number };

export type FormulaRepresentation = { readonly kind: 'formula'; readonly text: string; readonly charge?: number };

export type TermRepresentation =
  | FormulaRepresentation
  | { readonly kind: 'drawing'; readonly structure: StructureRep; readonly fallback: FormulaRepresentation | { readonly kind: 'name' } }
  | { readonly kind: 'name' }
  /** The facts that decide between a formula and a drawing have not arrived. */
  | { readonly kind: 'pending' };

/** A structure with at most one carbon and at most this many heavy atoms is written as its formula (when it has one). */
export const MAX_FORMULA_HEAVY_ATOMS = 3;

const formulaOf = (substance: TermSubstance): FormulaRepresentation | undefined =>
  substance.formula === undefined ? undefined : { kind: 'formula', text: substance.formula, ...(substance.charge === undefined ? {} : { charge: substance.charge }) };

export function termRepresentationOf(substance: TermSubstance, facts: FactsInput): TermRepresentation {
  const formula = formulaOf(substance);
  const fallback = formula ?? ({ kind: 'name' } as const);
  const { structure } = substance;
  if (substance.kind === 'missing') return { kind: 'name' };
  if (substance.kind === 'class') {
    if (structure !== undefined) return { kind: 'drawing', structure, fallback };
    return formula ?? { kind: 'name' };
  }
  if (structure === undefined) return formula ?? { kind: 'name' };
  // a species (or the species of a reagent) with a structure
  if (formula === undefined) return { kind: 'drawing', structure, fallback };
  if (facts.state === 'pending') return { kind: 'pending' };
  if (facts.state === 'unavailable') return formula;
  const { carbonCount, heavyAtomCount } = facts;
  const text = carbonCount === 0 || (carbonCount === 1 && heavyAtomCount !== undefined && heavyAtomCount <= MAX_FORMULA_HEAVY_ATOMS);
  return text ? formula : { kind: 'drawing', structure, fallback };
}

/** Whether the rule needs the chem facts for this substance (a species with both a structure and a formula): the screen asks only then. */
export function needsFacts(substance: TermSubstance): boolean {
  return substance.kind !== 'class' && substance.kind !== 'missing' && substance.structure !== undefined && substance.formula !== undefined;
}
