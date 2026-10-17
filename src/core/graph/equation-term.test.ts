/**
 * Which representation a term of the textbook equation gets (equation step, part 5): a PURE function of the data and the chem facts. The
 * rule (reviewer, 2026-10-17, changed): a species with an entered formula is written as that formula when its structure has no carbon
 * atom, or at most one carbon and at most 3 heavy atoms; any other species with a structure is drawn; a species without a structure is
 * its formula, else its name; a class is drawn if it has a generic structure, else its generic formula, else its name; a reagent is by
 * its species if it has one, else its name.
 */
import { describe, expect, it } from 'vitest';
import type { StructureRep } from '../schema';
import { termRepresentationOf, type FactsInput, type TermSubstance } from './equation-term';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const ready = (heavyAtomCount: number | undefined, carbonCount: number | undefined): FactsInput => ({
  state: 'ready',
  ...(heavyAtomCount === undefined ? {} : { heavyAtomCount }),
  ...(carbonCount === undefined ? {} : { carbonCount }),
});
const species = (over: Partial<TermSubstance> = {}): TermSubstance => ({ kind: 'species', name: 'Water', ...over });

describe('a species with a structure and an entered formula', () => {
  it('no carbon atom: the formula as text (H2O, HBr, Br2, LiOH, HCl, H2SO4, H2)', () => {
    expect(termRepresentationOf(species({ structure: smiles('O'), formula: 'H2O' }), ready(1, 0))).toEqual({ kind: 'formula', text: 'H2O' });
    expect(termRepresentationOf(species({ structure: smiles('[H][H]'), formula: 'H2' }), ready(0, 0))).toEqual({ kind: 'formula', text: 'H2' });
    expect(termRepresentationOf(species({ structure: smiles('OS(=O)(=O)O'), formula: 'H2SO4' }), ready(7, 0))).toEqual({ kind: 'formula', text: 'H2SO4' });
  });

  it('the edge: 0 carbons with 5 heavy atoms is still text (the carbon test decides, not the size)', () => {
    expect(termRepresentationOf(species({ structure: smiles('OP(=O)(O)O'), formula: 'H3PO4' }), ready(5, 0)).kind).toBe('formula');
  });

  it('the edge: 1 carbon with 3 heavy atoms is text (CH3OH-like, CO2, HCN, CH3MgBr)', () => {
    expect(termRepresentationOf(species({ structure: smiles('CO'), formula: 'CH3OH' }), ready(2, 1)).kind).toBe('formula');
    expect(termRepresentationOf(species({ structure: smiles('O=C=O'), formula: 'CO2' }), ready(3, 1))).toEqual({ kind: 'formula', text: 'CO2' });
    expect(termRepresentationOf(species({ structure: smiles('C[Mg]Br'), formula: 'CH3MgBr' }), ready(3, 1)).kind).toBe('formula');
  });

  it('the edge: 1 carbon with 4 heavy atoms is a drawing, with the formula as its fallback', () => {
    const out = termRepresentationOf(species({ structure: smiles('CC(=O)O'), formula: 'CH3COOH' }), ready(4, 2));
    expect(out.kind).toBe('drawing');
    const four = termRepresentationOf(species({ structure: smiles('CS(=O)(=O)O'), formula: 'CH3SO3H' }), ready(5, 1));
    expect(four).toEqual({ kind: 'drawing', structure: smiles('CS(=O)(=O)O'), fallback: { kind: 'formula', text: 'CH3SO3H' } });
    expect(termRepresentationOf(species({ structure: smiles('COC(=O)'), formula: 'HCO2CH3' }), ready(4, 1)).kind).toBe('drawing');
  });

  it('the edge: 2 carbons with 3 heavy atoms is a drawing (ethanol: drawn, so the card and the equation agree)', () => {
    expect(termRepresentationOf(species({ structure: smiles('CCO'), formula: 'C2H5OH' }), ready(3, 2))).toEqual({
      kind: 'drawing',
      structure: smiles('CCO'),
      fallback: { kind: 'formula', text: 'C2H5OH' },
    });
  });

  it('no entered formula: drawn, whatever the carbons', () => {
    expect(termRepresentationOf(species({ structure: smiles('O') }), ready(1, 0))).toEqual({ kind: 'drawing', structure: smiles('O'), fallback: { kind: 'name' } });
  });

  it('the charge of the species goes with the formula, so a trailing charge is set in superscript', () => {
    expect(termRepresentationOf(species({ structure: smiles('[NH4+]'), formula: 'NH4+', charge: 1 }), ready(1, 0))).toEqual({ kind: 'formula', text: 'NH4+', charge: 1 });
  });

  it('while the facts are not here yet it is `pending` (never a guess); if the engine cannot say, the formula; if it did not give the carbons, a drawing', () => {
    const withFormula = species({ structure: smiles('O'), formula: 'H2O' });
    expect(termRepresentationOf(withFormula, { state: 'pending' })).toEqual({ kind: 'pending' });
    expect(termRepresentationOf(withFormula, { state: 'unavailable' })).toEqual({ kind: 'formula', text: 'H2O' });
    expect(termRepresentationOf(withFormula, ready(1, undefined)).kind).toBe('drawing');
    const methanol = species({ structure: smiles('CO'), formula: 'CH3OH' });
    expect(termRepresentationOf(methanol, ready(undefined, 1)).kind).toBe('drawing');
  });
});

describe('any other species', () => {
  it('a structure and NO formula: drawn at once, whatever the facts (it needs none), the name as the fallback', () => {
    const out = termRepresentationOf(species({ name: 'Ethene', structure: smiles('C=C') }), { state: 'pending' });
    expect(out).toEqual({ kind: 'drawing', structure: smiles('C=C'), fallback: { kind: 'name' } });
  });

  it('no structure: the entered formula as text, else the name only', () => {
    expect(termRepresentationOf(species({ formula: 'NaCl' }), { state: 'pending' })).toEqual({ kind: 'formula', text: 'NaCl' });
    expect(termRepresentationOf(species({ formula: 'NaCl', charge: 0 }), { state: 'ready' })).toEqual({ kind: 'formula', text: 'NaCl', charge: 0 });
    expect(termRepresentationOf(species(), { state: 'pending' })).toEqual({ kind: 'name' });
  });

  it('a record that is gone is its name only', () => {
    expect(termRepresentationOf({ kind: 'missing', name: 'spc_gone' }, { state: 'pending' })).toEqual({ kind: 'name' });
  });
});

describe('a class (a generic reaction)', () => {
  it('its generic structure is drawn, with the generic formula as the fallback, else the name', () => {
    expect(termRepresentationOf({ kind: 'class', name: 'Alcohols', structure: smiles('[*]CO'), formula: 'R-OH' }, { state: 'pending' })).toEqual({
      kind: 'drawing',
      structure: smiles('[*]CO'),
      fallback: { kind: 'formula', text: 'R-OH' },
    });
    expect(termRepresentationOf({ kind: 'class', name: 'Alcohols', structure: smiles('[*]CO') }, { state: 'pending' })).toEqual({ kind: 'drawing', structure: smiles('[*]CO'), fallback: { kind: 'name' } });
  });

  it('no generic structure: the generic formula as text (R-OH), else the name', () => {
    expect(termRepresentationOf({ kind: 'class', name: 'Alcohols', formula: 'R–OH' }, { state: 'pending' })).toEqual({ kind: 'formula', text: 'R–OH' });
    expect(termRepresentationOf({ kind: 'class', name: 'Alcohols' }, { state: 'pending' })).toEqual({ kind: 'name' });
  });

  it('a class never uses the carbon rule: a small generic structure is still drawn', () => {
    expect(termRepresentationOf({ kind: 'class', name: 'Halides', structure: smiles('[*]Br'), formula: 'R-Br' }, ready(2, 0)).kind).toBe('drawing');
  });
});

describe('a reagent term', () => {
  it('is by its species when it has one (the same rule), else its name', () => {
    expect(termRepresentationOf({ kind: 'reagent', name: 'Hydrogen', structure: smiles('[H][H]'), formula: 'H2' }, ready(0, 0))).toEqual({ kind: 'formula', text: 'H2' });
    expect(termRepresentationOf({ kind: 'reagent', name: 'PCC', structure: smiles('CCCCCCCC'), formula: 'C5H6ClCrNO3' }, ready(8, 5)).kind).toBe('drawing');
    expect(termRepresentationOf({ kind: 'reagent', name: 'Lindlar catalyst' }, { state: 'pending' })).toEqual({ kind: 'name' });
  });
});
