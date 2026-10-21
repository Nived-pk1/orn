/** The shared fields' recipes and words (step 6.6a, decisions C1 and C2): tags, concepts, citations, texts. Pure; no chemistry. */
import { describe, expect, it } from 'vitest';
import { addCitation, addConcept, addTag, citationLine, moveCitation, removeCitation, removeConcept, removeTag, setCitationField, setTextField, tagProblem, tagsOf } from './shared-model';

const run = (draft: Record<string, unknown>, ...recipes: ((d: Record<string, unknown>) => void)[]): Record<string, unknown> => {
  const copy = structuredClone(draft);
  for (const recipe of recipes) recipe(copy);
  return copy;
};

describe('tags', () => {
  it('addTag appends the text exactly as typed; removeTag removes by position', () => {
    expect(run({ tags: ['a'] }, addTag(' b ')).tags).toEqual(['a', ' b ']);
    expect(run({ tags: ['a', 'b', 'c'] }, removeTag(1)).tags).toEqual(['a', 'c']);
    expect(run({}, addTag('x')).tags).toEqual(['x']);
    expect(tagsOf({ tags: ['a', 5] })).toEqual(['a']);
  });
  it('refuses, in words: blank, over 64 characters, the exact same string, and a 65th tag', () => {
    expect(tagProblem(['a'], '   ').refusal).toBe('A tag cannot be empty.');
    expect(tagProblem([], 'x'.repeat(65)).refusal).toBe('A tag is at most 64 characters.');
    expect(tagProblem(['alcohols'], 'alcohols').refusal).toBe('"alcohols" is already a tag here.');
    expect(tagProblem(Array.from({ length: 64 }, (_, i) => `t${i}`), 'new').refusal).toBe('At most 64 tags can be added.');
    expect(tagProblem(['a'], 'b')).toEqual({});
  });
  it('a tag that differs only by capitals is allowed, with a note', () => {
    expect(tagProblem(['Alcohols'], 'alcohols')).toEqual({ note: 'A similar tag is already here: Alcohols' });
  });
});

describe('concepts', () => {
  it('addConcept appends an id once; removeConcept removes by position', () => {
    expect(run({ conceptIds: ['cpt_a'] }, addConcept('cpt_b')).conceptIds).toEqual(['cpt_a', 'cpt_b']);
    expect(run({ conceptIds: ['cpt_a'] }, addConcept('cpt_a')).conceptIds).toEqual(['cpt_a']);
    expect(run({ conceptIds: ['cpt_a', 'cpt_b'] }, removeConcept(0)).conceptIds).toEqual(['cpt_b']);
  });
});

describe('citations (a list at any path, so a property can cite too)', () => {
  it('adds a citation for a source with no locator or note', () => {
    expect(run({ citations: [] }, addCitation('citations', 'ref_a')).citations).toEqual([{ referenceId: 'ref_a' }]);
  });
  it('sets the locator and note as typed; empty means absent', () => {
    const base = { citations: [{ referenceId: 'ref_a' }] };
    expect(run(base, setCitationField('citations', 0, 'locator', 'p. 12')).citations).toEqual([{ referenceId: 'ref_a', locator: 'p. 12' }]);
    expect(run({ citations: [{ referenceId: 'ref_a', locator: 'p. 12', note: 'n' }] }, setCitationField('citations', 0, 'locator', ''), setCitationField('citations', 0, 'note', '')).citations).toEqual([{ referenceId: 'ref_a' }]);
  });
  it('moves and removes; works inside a property', () => {
    const list = { citations: [{ referenceId: 'ref_a' }, { referenceId: 'ref_b' }] };
    expect(run(list, moveCitation('citations', 0, 1)).citations).toEqual([{ referenceId: 'ref_b' }, { referenceId: 'ref_a' }]);
    expect(run(list, removeCitation('citations', 0)).citations).toEqual([{ referenceId: 'ref_b' }]);
    expect(run({ properties: [{ key: 'colour', value: 'red', citations: [] }] }, addCitation('properties.0.citations', 'ref_a')).properties).toEqual([{ key: 'colour', value: 'red', citations: [{ referenceId: 'ref_a' }] }]);
  });
  it('the summary line is "<title> (<year>) · <locator>", leaving out what is absent', () => {
    expect(citationLine({ title: 'Morrison & Boyd', year: 2010 }, { referenceId: 'r', locator: 'ch. 4' })).toBe('Morrison & Boyd (2010) · ch. 4');
    expect(citationLine({ title: 'Morrison & Boyd' }, { referenceId: 'r' })).toBe('Morrison & Boyd');
    expect(citationLine({ title: 'T', year: 1999 }, { referenceId: 'r' })).toBe('T (1999)');
    expect(citationLine(undefined, { referenceId: 'ref_x', locator: 'p. 1' })).toBe('ref_x (not in this dataset) · p. 1');
  });
});

describe('text fields', () => {
  it('stores the text exactly as typed and removes the field when empty', () => {
    expect(run({}, setTextField('notes', '  hello\n')).notes).toBe('  hello\n');
    expect('notes' in run({ notes: 'x' }, setTextField('notes', ''))).toBe(false);
  });
});
