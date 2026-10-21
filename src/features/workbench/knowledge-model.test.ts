/** The knowledge editors' recipes and words (step 6.6b part 2): kinds with no default, difficulty as a number, empty means absent. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { CONCEPT_KINDS } from '@/core/schema';
import { CARBON_CHAIN_WORDS, CONCEPT_KIND_WORDS, knowledgeViewOf, setCarbonChain, setConceptKind, setDifficulty, wordsOfKind } from './knowledge-model';

const apply = (draft: object, recipe: (d: never) => void): Record<string, unknown> => produce(draft as Record<string, unknown>, recipe as never);

describe('the words', () => {
  it('a concept kind is its enum name with spaces and a capital', () => {
    expect(wordsOfKind('reaction_type')).toBe('Reaction type');
    expect(wordsOfKind('acidity_basicity')).toBe('Acidity basicity');
    for (const kind of CONCEPT_KINDS) expect(CONCEPT_KIND_WORDS[kind]).toBe(wordsOfKind(kind));
    expect(Object.keys(CARBON_CHAIN_WORDS)).toHaveLength(7);
  });
});

describe('recipes', () => {
  it('the kind has no empty value: "" removes the field', () => {
    expect(apply({ conceptKind: 'rule' }, setConceptKind(''))).not.toHaveProperty('conceptKind');
    expect(apply({}, setConceptKind('stability'))).toEqual({ conceptKind: 'stability' });
  });
  it('difficulty is a whole number 1 to 5 or absent; nothing else is stored', () => {
    expect(apply({}, setDifficulty('3'))).toEqual({ difficulty: 3 });
    expect(apply({ difficulty: 3 }, setDifficulty(''))).not.toHaveProperty('difficulty');
    expect(apply({ difficulty: 3 }, setDifficulty('9'))).toEqual({ difficulty: 3 });
    expect(apply({ difficulty: 3 }, setDifficulty('x'))).toEqual({ difficulty: 3 });
  });
  it('the carbon chain change: "" removes it', () => {
    expect(apply({}, setCarbonChain('ring_opening'))).toEqual({ carbonChainChange: 'ring_opening' });
    expect(apply({ carbonChainChange: 'none' }, setCarbonChain(''))).not.toHaveProperty('carbonChainChange');
  });
});

describe('the view', () => {
  it('reads the fields as plain values, tolerating a draft that is not a record', () => {
    expect(knowledgeViewOf(null)).toMatchObject({ id: '', name: '', conceptKind: '', difficulty: '', carbonChain: '', parentIds: [], fromClassIds: [] });
    expect(knowledgeViewOf({ id: 'x', name: 'N', aliases: ['a'], conceptKind: 'rule', difficulty: 2, parentIds: ['p'], carbonChainChange: 'none', equationText: 'e', bondChangeSummary: 'b', reactionSmarts: 's' })).toMatchObject({ id: 'x', name: 'N', aliases: ['a'], conceptKind: 'rule', difficulty: '2', parentIds: ['p'], carbonChain: 'none', equationText: 'e', bondChangeSummary: 'b', reactionSmarts: 's' });
  });
});
