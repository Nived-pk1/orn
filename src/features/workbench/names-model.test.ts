/** The Names editor's edits (ADR-040): stored as typed, an empty optional input means absent, lists add / remove / move. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { DraftRecipe } from '@/core/editing';
import { addListItem, moveListItem, namesViewOf, removeListItem, setCanonical, setListItem, setOptional } from './names-model';

const base = { id: 'spc_x', names: { canonical: 'Ethanol', common: [], aliases: ['a', 'b', 'c'] } };
const run = (recipe: DraftRecipe, draft: Record<string, unknown> = base): Record<string, unknown> => produce(draft, recipe as never) as Record<string, unknown>;
const names = (draft: Record<string, unknown>) => draft.names as Record<string, unknown>;

describe('the names edits', () => {
  it('canonical is stored exactly as typed: no trimming, no case change, an empty value stays empty (the schema says it is wrong)', () => {
    expect(names(run(setCanonical('  Ethanol  '))).canonical).toBe('  Ethanol  ');
    expect(names(run(setCanonical(''))).canonical).toBe('');
  });

  it('an empty optional input means the field is absent; a value is stored as typed', () => {
    const withDisplay = run(setOptional('display', ' Ethyl alcohol '));
    expect(names(withDisplay).display).toBe(' Ethyl alcohol ');
    const cleared = run(setOptional('display', ''), withDisplay);
    expect(Object.hasOwn(names(cleared), 'display')).toBe(false);
    expect(run(setOptional('iupac', '')).names).toEqual(base.names); // absent stays absent: no key is created
  });

  it('list items: set, add (an empty item, never invented text), remove, move up and down; the ends do nothing', () => {
    expect(names(run(setListItem('aliases', 1, 'B2'))).aliases).toEqual(['a', 'B2', 'c']);
    expect(names(run(addListItem('common'))).common).toEqual(['']);
    expect(names(run(removeListItem('aliases', 0))).aliases).toEqual(['b', 'c']);
    expect(names(run(moveListItem('aliases', 2, -1))).aliases).toEqual(['a', 'c', 'b']);
    expect(names(run(moveListItem('aliases', 0, 1))).aliases).toEqual(['b', 'a', 'c']);
    expect(run(moveListItem('aliases', 0, -1))).toBe(base); // nothing changed: same object
    expect(run(moveListItem('aliases', 2, 1))).toBe(base);
    expect(run(setListItem('aliases', 9, 'x'))).toBe(base);
    expect(run(removeListItem('aliases', 9))).toBe(base);
  });

  it('other fields of names (unknown ones too) are never touched or dropped', () => {
    const odd = { names: { canonical: 'A', common: [], aliases: [], mystery: 1 } };
    expect(names(run(setCanonical('B'), odd)).mystery).toBe(1);
  });

  it('namesViewOf reads absent as empty and never throws on a broken draft', () => {
    expect(namesViewOf(base)).toEqual({ canonical: 'Ethanol', display: '', iupac: '', qualifier: '', common: [], aliases: ['a', 'b', 'c'] });
    expect(namesViewOf({})).toMatchObject({ canonical: '', aliases: [] });
    expect(namesViewOf(null)).toMatchObject({ canonical: '' });
    expect(namesViewOf({ names: { canonical: 5, aliases: [1, 'x'] } })).toMatchObject({ canonical: '', aliases: ['', 'x'] });
  });
});
