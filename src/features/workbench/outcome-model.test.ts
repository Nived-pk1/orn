/**
 * The outcome recipes and views (step 6.4b): a new outcome is "unspecified" under all conditions with no product, a new product has NO
 * role, "Holds under" keeps the variants in the reaction's order, an empty optional input removes the field, stereochemistry starts with
 * an empty descriptor list, the permutation moves keep the same members, and the summary line leaves out what is not stated.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { DraftRecipe } from '@/core/editing';
import {
  addDescriptor,
  addOutcome,
  addProduct,
  holdUnderAll,
  holdUnderVariant,
  moveOutcome,
  moveProduct,
  removeDescriptor,
  removeOutcome,
  removeProduct,
  removeStereo,
  setIsomerGroup,
  setProductCoefficient,
  setProductRole,
  setProductText,
  setRationale,
  setRegiochemistry,
  setSelectivity,
  setStereoNote,
  setStereoOutcome,
} from './outcome-model';
import { holdsUnderWords, isomerGroupsOf, outcomeSummary, outcomesViewOf } from './outcome-view';

type Draft = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const base = (): Draft => ({
  conditionVariants: [
    { id: 'cvr_a', label: '413 K' },
    { id: 'cvr_b', label: '443 K' },
  ],
  outcomes: [],
});
const run = (draft: Draft, ...recipes: DraftRecipe[]): Draft => produce(draft, (d) => recipes.forEach((recipe) => void recipe(d as never)));
const name = (_kind: string, id: string): string => ({ spc_a: 'Propanal', spc_b: 'Water' })[id] ?? id;

describe('a new outcome and a new product', () => {
  it('an outcome starts unspecified, under all conditions, with no product', () => {
    const next = run(base(), addOutcome('out_1'));
    expect(next.outcomes[0]).toEqual({
      id: 'out_1',
      conditionVariantIds: [],
      selectivity: 'unspecified',
      products: [],
      conceptIds: [],
    });
  });
  it('a product starts with a species or class and NO role (never guessed)', () => {
    const next = run(base(), addOutcome('out_1'), addProduct(0, 'pdt_1', { kind: 'species', id: 'spc_a' }));
    expect(next.outcomes[0].products).toEqual([{ id: 'pdt_1', ref: { kind: 'species', id: 'spc_a' } }]);
    expect(outcomesViewOf(next)[0]?.products[0]?.role).toBeUndefined();
    expect(outcomesViewOf(run(next, setProductRole(0, 0, 'main')))[0]?.products[0]?.role).toBe('main');
  });
});

describe('Holds under', () => {
  it('naming variants keeps the reaction order; releasing the last one means all conditions again', () => {
    const named = run(base(), addOutcome('out_1'), holdUnderVariant(0, 'cvr_b', true), holdUnderVariant(0, 'cvr_a', true));
    expect(named.outcomes[0].conditionVariantIds).toEqual(['cvr_a', 'cvr_b']);
    const released = run(named, holdUnderVariant(0, 'cvr_a', false), holdUnderVariant(0, 'cvr_b', false));
    expect(released.outcomes[0].conditionVariantIds).toEqual([]);
    expect(holdsUnderWords(released, [])).toBe('all conditions');
    expect(holdsUnderWords(named, ['cvr_a', 'cvr_b'])).toBe('413 K, 443 K');
    expect(run(named, holdUnderAll(0)).outcomes[0].conditionVariantIds).toEqual([]);
  });
  it('a variant that is gone is named by its ID, and kept (the schema finds it)', () => {
    const next = run(base(), addOutcome('out_1'), holdUnderVariant(0, 'cvr_gone', true));
    expect(next.outcomes[0].conditionVariantIds).toEqual(['cvr_gone']);
    expect(holdsUnderWords(next, ['cvr_gone'])).toBe('cvr_gone');
  });
});

describe('the text fields', () => {
  it('an empty input removes the field; text is stored as typed', () => {
    const typed = run(base(), addOutcome('out_1'), setRegiochemistry(0, ' Markovnikov '), setIsomerGroup(0, 'HBr addition'), setRationale(0, 'more stable cation'));
    expect(typed.outcomes[0]).toMatchObject({
      regiochemistry: ' Markovnikov ',
      isomerGroup: 'HBr addition',
      rationale: 'more stable cation',
    });
    const cleared = run(typed, setRegiochemistry(0, ''), setIsomerGroup(0, ''), setRationale(0, ''));
    expect(Object.hasOwn(cleared.outcomes[0], 'regiochemistry')).toBe(false);
    expect(Object.hasOwn(cleared.outcomes[0], 'isomerGroup')).toBe(false);
    expect(Object.hasOwn(cleared.outcomes[0], 'rationale')).toBe(false);
  });
  it('the isomer groups used in the reaction are listed once each, in first-use order', () => {
    const next = run(base(), addOutcome('out_1'), addOutcome('out_2'), addOutcome('out_3'), setIsomerGroup(0, 'B'), setIsomerGroup(1, 'A'), setIsomerGroup(2, 'B'));
    expect(isomerGroupsOf(next)).toEqual(['B', 'A']);
  });
});

describe('stereochemistry', () => {
  it('starts with an outcome value and an empty descriptor list; descriptors add and remove; Remove takes the whole field out', () => {
    const started = run(base(), addOutcome('out_1'), setStereoOutcome(0, 'syn_addition'), addDescriptor(0, 'Z'), addDescriptor(0, 'E'), setStereoNote(0, 'both H on one face'));
    expect(started.outcomes[0].stereochemistry).toEqual({
      outcome: 'syn_addition',
      descriptors: ['Z', 'E'],
      note: 'both H on one face',
    });
    expect(run(started, removeDescriptor(0, 0)).outcomes[0].stereochemistry.descriptors).toEqual(['E']);
    expect(run(started, setStereoOutcome(0, 'unspecified')).outcomes[0].stereochemistry.descriptors).toEqual(['Z', 'E']);
    expect(Object.hasOwn(run(started, removeStereo(0)).outcomes[0], 'stereochemistry')).toBe(false);
    expect(Object.hasOwn(run(started, setStereoNote(0, '')).outcomes[0].stereochemistry, 'note')).toBe(false);
  });
});

describe('moves and removals', () => {
  it('outcomes and products swap with a neighbour and stay the same members; the ends do not move', () => {
    const three = run(base(), addOutcome('out_1'), addOutcome('out_2'), addOutcome('out_3'));
    expect(run(three, moveOutcome(0, 1)).outcomes.map((o: Draft) => o.id)).toEqual(['out_2', 'out_1', 'out_3']);
    expect(run(three, moveOutcome(0, -1)).outcomes.map((o: Draft) => o.id)).toEqual(['out_1', 'out_2', 'out_3']);
    expect(run(three, removeOutcome(1)).outcomes.map((o: Draft) => o.id)).toEqual(['out_1', 'out_3']);
    const two = run(base(), addOutcome('out_1'), addProduct(0, 'pdt_1', { kind: 'species', id: 'spc_a' }), addProduct(0, 'pdt_2', { kind: 'species', id: 'spc_b' }));
    expect(run(two, moveProduct(0, 1, -1)).outcomes[0].products.map((p: Draft) => p.id)).toEqual(['pdt_2', 'pdt_1']);
    expect(run(two, removeProduct(0, 0)).outcomes[0].products.map((p: Draft) => p.id)).toEqual(['pdt_2']);
  });
});

describe('product fields', () => {
  it('coefficient and text fields are stored as given; empty removes them', () => {
    const set = run(
      base(),
      addOutcome('out_1'),
      addProduct(0, 'pdt_1', { kind: 'species', id: 'spc_a' }),
      setProductCoefficient(0, 0, 2),
      setProductText(0, 0, 'originalText', 'CH3CH2CHO'),
      setProductText(0, 0, 'note', 'n'),
    );
    expect(set.outcomes[0].products[0]).toMatchObject({
      coefficient: 2,
      originalText: 'CH3CH2CHO',
      note: 'n',
    });
    const cleared = run(set, setProductCoefficient(0, 0, undefined), setProductText(0, 0, 'originalText', ''), setProductText(0, 0, 'note', ''));
    expect(Object.keys(cleared.outcomes[0].products[0]).sort()).toEqual(['id', 'ref']);
  });
});

describe('the summary line', () => {
  it('"<n>. <selectivity> · <main products> · <regiochemistry> · under <conditions>", unstated parts left out', () => {
    const d = run(base(), addOutcome('out_1'), addProduct(0, 'pdt_1', { kind: 'species', id: 'spc_a' }), setProductRole(0, 0, 'main'));
    expect(outcomeSummary(d, 0, name)).toBe('1. Propanal · under all conditions'); // unspecified has no word
    const full = run(
      d,
      setSelectivity(0, 'major'),
      setRegiochemistry(0, 'Markovnikov'),
      holdUnderVariant(0, 'cvr_b', true),
      addProduct(0, 'pdt_2', { kind: 'species', id: 'spc_b' }),
      setProductRole(0, 1, 'coproduct'),
    );
    expect(outcomeSummary(full, 0, name)).toBe('1. major · Propanal · Markovnikov · under 443 K');
    const two = run(full, addProduct(0, 'pdt_3', { kind: 'species', id: 'spc_b' }), setProductRole(0, 2, 'main'));
    expect(outcomeSummary(two, 0, name)).toBe('1. major · Propanal + Water · Markovnikov · under 443 K');
  });
  it('a product with no role is not named (it is not a main product yet)', () => {
    const d = run(base(), addOutcome('out_1'), addProduct(0, 'pdt_1', { kind: 'species', id: 'spc_a' }));
    expect(outcomeSummary(d, 0, name)).toBe('1. under all conditions');
  });
});
