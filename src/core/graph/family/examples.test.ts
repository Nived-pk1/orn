/**
 * Which reactions fold under which general reaction in ONE list (7.3a C1, C2, C5). Pure: the listed ids, a lookup of the generic/specific
 * links and a sort key; nothing about the view. Tests written first (seen red: the module did not exist).
 */
import { describe, expect, it } from 'vitest';
import { foldExamples, type ExampleLookup } from './examples';

interface Rec {
  readonly name: string;
  readonly scope: 'generic' | 'specific';
  readonly of?: string;
}

function lookupOf(records: Readonly<Record<string, Rec>>): ExampleLookup {
  return {
    instanceOf: (id) => records[id]?.of,
    isGeneric: (id) => records[id]?.scope === 'generic',
    sortKey: (id) => (records[id]?.name ?? id).toLowerCase(),
  };
}

const world: Readonly<Record<string, Rec>> = {
  rxn_g: { name: 'Oxidation of alcohols', scope: 'generic' },
  rxn_e1: { name: 'Ethanol to ethanal', scope: 'specific', of: 'rxn_g' },
  rxn_e2: { name: 'Butan-1-ol to butanal', scope: 'specific', of: 'rxn_g' },
  rxn_e3: { name: 'Butan-1-ol to butanal', scope: 'specific', of: 'rxn_g' },
  rxn_plain: { name: 'Hydration of ethene', scope: 'specific' },
  rxn_h: { name: 'Another generic', scope: 'generic' },
  rxn_orphan: { name: 'Orphan', scope: 'specific', of: 'rxn_gone' },
  rxn_bad: { name: 'Bad target', scope: 'specific', of: 'rxn_plain' },
};

describe('foldExamples', () => {
  it('folds the examples under the general reaction when its card is in the list, keeping the order of the rest', () => {
    const fold = foldExamples(['rxn_e1', 'rxn_plain', 'rxn_g', 'rxn_e2'], lookupOf(world));
    expect(fold.shown).toEqual(['rxn_plain', 'rxn_g']);
    expect(fold.examplesOf.get('rxn_g')).toEqual(['rxn_e2', 'rxn_e1']);
    expect(fold.exampleOf.size).toBe(0);
    expect(fold.folded).toBe(2);
  });

  it('orders the examples by folded name, then by id', () => {
    const fold = foldExamples(['rxn_g', 'rxn_e3', 'rxn_e2', 'rxn_e1'], lookupOf(world));
    expect(fold.examplesOf.get('rxn_g')).toEqual(['rxn_e2', 'rxn_e3', 'rxn_e1']);
  });

  it('C2: an example whose general reaction is not in the list is its own card and says what it is an example of', () => {
    const fold = foldExamples(['rxn_e1', 'rxn_plain'], lookupOf(world));
    expect(fold.shown).toEqual(['rxn_e1', 'rxn_plain']);
    expect(fold.examplesOf.size).toBe(0);
    expect(fold.exampleOf.get('rxn_e1')).toBe('rxn_g');
    expect(fold.folded).toBe(0);
  });

  it('a link to a missing record, or to a reaction that is not general, folds nothing and says nothing', () => {
    const fold = foldExamples(['rxn_orphan', 'rxn_bad', 'rxn_plain'], lookupOf(world));
    expect(fold.shown).toEqual(['rxn_orphan', 'rxn_bad', 'rxn_plain']);
    expect(fold.exampleOf.size).toBe(0);
  });

  it('a general reaction with no listed example has no examples entry', () => {
    const fold = foldExamples(['rxn_g', 'rxn_h'], lookupOf(world));
    expect(fold.shown).toEqual(['rxn_g', 'rxn_h']);
    expect(fold.examplesOf.size).toBe(0);
  });

  it('lists each id once, however often it is passed, and does not change the input', () => {
    const input = ['rxn_g', 'rxn_e1', 'rxn_e1', 'rxn_g'];
    const fold = foldExamples(input, lookupOf(world));
    expect(fold.shown).toEqual(['rxn_g']);
    expect(fold.examplesOf.get('rxn_g')).toEqual(['rxn_e1']);
    expect(input).toEqual(['rxn_g', 'rxn_e1', 'rxn_e1', 'rxn_g']);
  });

  it('is deterministic: the same list gives the same fold', () => {
    const a = foldExamples(['rxn_e2', 'rxn_g', 'rxn_e1'], lookupOf(world));
    const b = foldExamples(['rxn_e2', 'rxn_g', 'rxn_e1'], lookupOf(world));
    expect(b).toEqual(a);
  });
});
