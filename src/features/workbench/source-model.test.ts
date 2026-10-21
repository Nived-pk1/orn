/** The source editor's recipes and words (step 6.6a, decision C2): the fields as the schema types them. */
import { describe, expect, it } from 'vitest';
import { REFERENCE_KINDS } from '@/core/schema';
import { addAuthor, moveAuthor, removeAuthor, setAuthor, setRefKind, setSourceText, setYear, sourceViewOf, REF_KIND_WORDS } from './source-model';

const run = (draft: Record<string, unknown>, ...recipes: ((d: Record<string, unknown>) => void)[]) => {
  const copy = structuredClone(draft);
  for (const recipe of recipes) recipe(copy);
  return copy;
};

describe('source model', () => {
  it('has words for every kind of source the schema lists', () => {
    expect(Object.keys(REF_KIND_WORDS).sort()).toEqual([...REFERENCE_KINDS].sort());
  });
  it('title, edition, publisher, url and identifier are stored as typed; empty optional text is absent', () => {
    expect(run({}, setSourceText('title', ' A ')).title).toBe(' A ');
    expect(run({ edition: '2nd' }, setSourceText('edition', '')).edition).toBeUndefined();
    expect('edition' in run({ edition: '2nd' }, setSourceText('edition', ''))).toBe(false);
    expect(run({}, setSourceText('url', 'https://x.org')).url).toBe('https://x.org');
  });
  it('the year is a whole number; empty removes it; anything else changes nothing', () => {
    expect(run({}, setYear('2010')).year).toBe(2010);
    expect('year' in run({ year: 5 }, setYear(''))).toBe(false);
    expect(run({ year: 2010 }, setYear('20x')).year).toBe(2010);
  });
  it('the kind has no default: absent until chosen', () => {
    expect(sourceViewOf({}).refKind).toBe('');
    expect(run({}, setRefKind('ncert')).refKind).toBe('ncert');
  });
  it('authors are a list: add (empty), set, move, remove', () => {
    const d = run({ authors: [] }, addAuthor(), setAuthor(0, 'Morrison'), addAuthor(), setAuthor(1, 'Boyd'), moveAuthor(1, -1));
    expect(d.authors).toEqual(['Boyd', 'Morrison']);
    expect(run(d, removeAuthor(0)).authors).toEqual(['Morrison']);
  });
  it('the view reads what is there', () => {
    expect(sourceViewOf({ title: 'T', year: 2001, authors: ['a'], refKind: 'article', url: 'https://u' })).toMatchObject({ title: 'T', year: '2001', authors: ['a'], refKind: 'article', url: 'https://u', edition: '' });
  });
});
