import { describe, expect, it } from 'vitest';
import type { ChapterContents, KindCounts } from '@/core/chapters';
import { countsWords, filterContents, PAGE_SIZE } from './model';

const ref = (kind: string, id: string) => ({ kind, id }) as never;
const contents: ChapterContents = {
  chapterId: 'top_a',
  groups: [
    { key: 'concepts', title: 'Concepts', count: 2, parts: [{ part: 'core', title: undefined, refs: [ref('concept', 'cpt_1'), ref('concept', 'cpt_2')] }] },
    {
      key: 'reactions',
      title: 'Reactions',
      count: 2,
      parts: [
        { part: 'core', title: undefined, refs: [ref('reaction', 'rxn_1')] },
        { part: 'supporting', title: 'Also used here', refs: [ref('reaction', 'rxn_2')] },
      ],
    },
  ],
};
const names: Record<string, string> = { cpt_1: 'Inductive effect', cpt_2: 'Resonance', rxn_1: 'Amine acylation', rxn_2: 'Hinsberg test' };
const nameOf = (r: { id: string }): string => names[r.id] ?? r.id;

describe('countsWords', () => {
  const counts = (over: Partial<Record<string, { core: number; other: number }>>): KindCounts => {
    const zero = { core: 0, other: 0 };
    return { concepts: zero, reactions: zero, named: zero, mechanisms: zero, caveats: zero, compounds: zero, reagents: zero, routes: zero, transformations: zero, ...over } as KindCounts;
  };
  it('words per kind in the page order, core and the others together, singular for one, nothing for zero', () => {
    expect(countsWords(counts({ concepts: { core: 6, other: 2 }, reactions: { core: 20, other: 4 }, caveats: { core: 1, other: 0 } }))).toBe('8 concepts · 24 reactions · 1 caveat');
  });
  it('an empty chapter says so', () => {
    expect(countsWords(counts({}))).toBe('Nothing mapped yet');
  });
});

describe('filterContents', () => {
  const none = { kinds: [], text: '', onlyInScope: false } as const;
  it('no filter keeps everything', () => {
    expect(filterContents(contents, none, nameOf, undefined).groups.map((g) => g.count)).toEqual([2, 2]);
  });
  it('a kind chip keeps that kind only', () => {
    expect(filterContents(contents, { ...none, kinds: ['reactions'] }, nameOf, undefined).groups.map((g) => g.key)).toEqual(['reactions']);
  });
  it('the name box matches folded names and drops empty parts and groups', () => {
    const out = filterContents(contents, { ...none, text: 'HINSBERG' }, nameOf, undefined);
    expect(out.groups.map((g) => g.key)).toEqual(['reactions']);
    expect(out.groups[0]?.parts.map((p) => p.part)).toEqual(['supporting']);
    expect(out.groups[0]?.count).toBe(1);
  });
  it('"only <exam version>" drops the records outside the scope; otherwise they stay', () => {
    const outside = (r: { id: string }): boolean => r.id === 'cpt_2' || r.id === 'rxn_2';
    expect(filterContents(contents, { ...none, onlyInScope: true }, nameOf, outside as never).groups.map((g) => g.count)).toEqual([1, 1]);
    expect(filterContents(contents, none, nameOf, outside as never).groups.map((g) => g.count)).toEqual([2, 2]);
  });
  it('reports how many records were left out by the filter', () => {
    expect(filterContents(contents, { ...none, text: 'reson' }, nameOf, undefined).hidden).toBe(3);
  });
});

it('a group is drawn 30 at a time', () => {
  expect(PAGE_SIZE).toBe(30);
});
