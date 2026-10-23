/**
 * Resolving one quick-entry term (step 6.7b, Q3): through the port, never guessed. Exact name or alias match -> resolved; several -> "Which
 * one?"; none -> suggestions and Create new. A term with no spaces that the chem worker reads as a structure is matched by structure, else
 * offered as a new species with that structure.
 */
import { describe, expect, it, vi } from 'vitest';
import type { QuickEntryPort, StructureAnswer } from './quick-entry-contracts';
import type { RecordChoice } from './record-picker-contracts';
import { resolveTerm } from './quick-resolve';

const choice = (kind: RecordChoice['kind'], id: string, name: string): RecordChoice => ({ kind, id, name, kindWords: kind, scope: '' });
const ethanol = choice('species', 'spc_ethanol', 'Ethanol');
const pcc = choice('reagent', 'rgt_pcc', 'PCC');
const alcohols = choice('class', 'cls_alcohols', 'Alcohols');

const portOf = (exact: RecordChoice[], suggestions: RecordChoice[] = [], structure: StructureAnswer = { state: 'not_structure' }): Pick<QuickEntryPort, 'find' | 'structure'> => ({
  find: vi.fn(async () => ({ exact, suggestions })),
  structure: vi.fn(async () => structure),
});

describe('resolveTerm', () => {
  it('one exact match is resolved, with the kind of the record', async () => {
    expect(await resolveTerm('ethanol', portOf([ethanol]))).toEqual({ state: 'resolved', ref: { kind: 'species', id: 'spc_ethanol' }, name: 'Ethanol', kindWords: 'species', how: 'name' });
    expect(await resolveTerm('PCC', portOf([pcc]))).toMatchObject({ state: 'resolved', ref: { kind: 'reagent', id: 'rgt_pcc' } });
    expect(await resolveTerm('alcohols', portOf([alcohols]))).toMatchObject({ state: 'resolved', ref: { kind: 'class', id: 'cls_alcohols' } });
  });
  it('several exact matches ask "Which one?" with the candidates, and do not ask the chem worker', async () => {
    const port = portOf([ethanol, pcc]);
    expect(await resolveTerm('x', port)).toEqual({ state: 'which', candidates: [ethanol, pcc], how: 'name' });
    expect(port.structure).not.toHaveBeenCalled();
  });
  it('U3: a reagent and the species it is made of (the same substance) resolve to the REAGENT, naming the species as the other choice', async () => {
    const dcm = choice('species', 'spc_dcm', 'Dichloromethane');
    const dcmReagent = choice('reagent', 'rgt_dcm', 'DCM');
    const port = { ...portOf([dcm, dcmReagent]), find: vi.fn(async () => ({ exact: [dcm, dcmReagent], suggestions: [], sameSubstance: [{ reagent: dcmReagent, species: dcm }] })) };
    expect(await resolveTerm('DCM', port)).toMatchObject({ state: 'resolved', ref: { kind: 'reagent', id: 'rgt_dcm' }, instead: dcm });
  });
  it('U3: any other set of several matches still asks "Which one?"', async () => {
    const dcm = choice('species', 'spc_dcm', 'Dichloromethane');
    const dcmReagent = choice('reagent', 'rgt_dcm', 'DCM');
    const other = choice('species', 'spc_other', 'Other');
    const port = { ...portOf([dcm, dcmReagent, other]), find: vi.fn(async () => ({ exact: [dcm, dcmReagent, other], suggestions: [], sameSubstance: [{ reagent: dcmReagent, species: dcm }] })) };
    expect(await resolveTerm('DCM', port)).toMatchObject({ state: 'which' });
  });
  it('no match: up to five suggestions, the structure question is asked only of a term with no spaces', async () => {
    const five = Array.from({ length: 7 }, (_, i) => choice('species', `spc_${i}`, `S${i}`));
    const port = portOf([], five);
    const state = await resolveTerm('zzz', port);
    expect(state).toMatchObject({ state: 'missing', structure: 'none' });
    expect((state as unknown as { suggestions: unknown[] }).suggestions).toHaveLength(5);
    expect(port.structure).toHaveBeenCalledWith('zzz');
    const spaced = portOf([], []);
    expect(await resolveTerm('some thing', spaced)).toMatchObject({ state: 'missing', structure: 'none' });
    expect(spaced.structure).not.toHaveBeenCalled();
  });
  it('a structure that matches one species is resolved by structure, several ask which', async () => {
    expect(await resolveTerm('CCO', portOf([], [], { state: 'matched', matches: [ethanol] }))).toMatchObject({ state: 'resolved', how: 'structure', ref: { kind: 'species', id: 'spc_ethanol' } });
    expect(await resolveTerm('CCO', portOf([], [], { state: 'matched', matches: [ethanol, choice('species', 'spc_b', 'B')] }))).toMatchObject({ state: 'which', how: 'structure' });
  });
  it('a structure with no species is offered as a new species; an unanswered engine is said, not read as "not a structure"', async () => {
    expect(await resolveTerm('C1CCCCC1', portOf([], [], { state: 'new' }))).toMatchObject({ state: 'missing', structure: 'new' });
    expect(await resolveTerm('CCO', portOf([], [], { state: 'unanswered', message: 'the engine is not ready' }))).toMatchObject({ state: 'missing', structure: 'unanswered', message: 'the engine is not ready' });
  });
  it('an exact name wins over a structure reading', async () => {
    const port = portOf([ethanol], [], { state: 'new' });
    expect(await resolveTerm('CO', port)).toMatchObject({ state: 'resolved', how: 'name' });
    expect(port.structure).not.toHaveBeenCalled();
  });
  it('a port that fails is said in words, never thrown', async () => {
    const broken: Pick<QuickEntryPort, 'find' | 'structure'> = { find: async () => Promise.reject(new Error('boom')), structure: async () => ({ state: 'not_structure' }) };
    expect(await resolveTerm('x', broken)).toMatchObject({ state: 'missing', structure: 'unanswered' });
  });
});
