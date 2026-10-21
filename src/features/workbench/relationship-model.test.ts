/** The relationship editor's recipes and words (step 6.6b part 4): no default type, the ends, Swap, the reverse kind. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { RELATIONSHIP_TYPES } from '@/core/schema';
import { allowedKinds, REVERSE_KIND_WORDS, relationshipViewOf, setEnd, setRelationshipType, setReverseKind, swapEnds, TYPE_WORDS } from './relationship-model';

const apply = (draft: object, recipe: (d: never) => void): Record<string, unknown> => produce(draft as Record<string, unknown>, recipe as never);
const A = { kind: 'concept', id: 'cpt_a' };
const B = { kind: 'concept', id: 'cpt_b' };

describe('relationship recipes', () => {
  it('the type has no empty value: "" removes it; every type has plain words', () => {
    expect(apply({ type: 'related_to' }, setRelationshipType(''))).not.toHaveProperty('type');
    expect(apply({}, setRelationshipType('follows'))).toEqual({ type: 'follows' });
    for (const type of RELATIONSHIP_TYPES) expect(TYPE_WORDS[type]).toMatch(/^[A-Z]/);
    expect(TYPE_WORDS.prerequisite_of).toBe('Prerequisite of');
  });
  it('sets and clears an end; Swap exchanges them and does nothing when one is missing', () => {
    expect(apply({}, setEnd('from', A))).toEqual({ from: A });
    expect(apply({ from: A, to: B }, setEnd('to', undefined))).toEqual({ from: A });
    expect(apply({ from: A, to: B }, swapEnds())).toEqual({ from: B, to: A });
    expect(apply({ from: A }, swapEnds())).toEqual({ from: A });
  });
  it('the reverse kind: "" removes it', () => {
    expect(apply({}, setReverseKind('synthetic'))).toEqual({ reverseKind: 'synthetic' });
    expect(apply({ reverseKind: 'synthetic' }, setReverseKind(''))).not.toHaveProperty('reverseKind');
    expect(Object.keys(REVERSE_KIND_WORDS)).toEqual(['microscopic', 'synthetic', 'conceptual']);
  });
});

describe('the view', () => {
  it('reads a draft that is not a record, and the allowed kinds of a type', () => {
    expect(relationshipViewOf(null)).toMatchObject({ type: '', from: undefined, to: undefined, reverseKind: '', note: '' });
    expect(relationshipViewOf({ type: 'follows', from: A, to: B, reverseKind: 'x', note: 'n' })).toMatchObject({ type: 'follows', from: A, to: B, reverseKind: 'x', note: 'n' });
    expect(allowedKinds('follows')).toEqual(['reaction', 'named_reaction']);
    expect(allowedKinds('')).toEqual([]);
  });
  it('the allowed kinds leave out kinds the pickers cannot search yet (route)', () => {
    expect(allowedKinds('alternative_to')).toEqual(['reaction', 'reagent']);
  });
});
