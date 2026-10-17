/** compareForConflict (ADR-040): per field path, base / theirs / mine and who changed what. */
import { describe, expect, it } from 'vitest';
import { compareForConflict, sameValue } from '.';

const base = { id: 'spc_x', names: { canonical: 'Acetone', aliases: ['a'] }, notes: 'one', tags: ['p', 'q'] };
const byPath = (list: ReturnType<typeof compareForConflict>) => Object.fromEntries(list.map((f) => [f.path, f.status]));

describe('compareForConflict', () => {
  it('nobody changed anything: every field is same', () => {
    const list = compareForConflict(base, base, base);
    expect(new Set(list.map((f) => f.status))).toEqual(new Set(['same']));
  });

  it('lists top-level fields and one level into plain objects; arrays are compared whole', () => {
    const paths = compareForConflict(base, base, base).map((f) => f.path);
    expect(paths).toEqual(['id', 'names.aliases', 'names.canonical', 'notes', 'tags']);
  });

  it('theirsOnly: only the stored record changed the field', () => {
    const theirs = { ...base, names: { ...base.names, canonical: 'Propanone' } };
    expect(byPath(compareForConflict(base, theirs, base))['names.canonical']).toBe('theirsOnly');
  });

  it('mineOnly: only the draft changed the field', () => {
    const mine = { ...base, notes: 'two' };
    expect(byPath(compareForConflict(base, base, mine)).notes).toBe('mineOnly');
  });

  it('both: each side changed it to something different', () => {
    const theirs = { ...base, notes: 'three' };
    const mine = { ...base, notes: 'two' };
    const field = compareForConflict(base, theirs, mine).find((f) => f.path === 'notes');
    expect(field).toMatchObject({ status: 'both', base: 'one', theirs: 'three', mine: 'two', segments: ['notes'] });
  });

  it('both changed it to the same value: no choice is needed (same)', () => {
    const moved = { ...base, notes: 'two' };
    expect(byPath(compareForConflict(base, moved, moved)).notes).toBe('same');
  });

  it('a field absent on one side is undefined there, and absent differs from empty', () => {
    const { notes: _gone, ...without } = base;
    const field = compareForConflict(base, without, { ...base, notes: '' }).find((f) => f.path === 'notes');
    expect(field).toMatchObject({ status: 'both', theirs: undefined, mine: '' });
    expect(sameValue(undefined, undefined)).toBe(true);
    expect(sameValue(undefined, '')).toBe(false);
  });

  it('key order does not matter (canonical text), array order does', () => {
    const reordered = { tags: ['p', 'q'], notes: 'one', names: { aliases: ['a'], canonical: 'Acetone' }, id: 'spc_x' };
    expect(new Set(compareForConflict(base, reordered, base).map((f) => f.status))).toEqual(new Set(['same']));
    expect(byPath(compareForConflict(base, { ...base, tags: ['q', 'p'] }, base)).tags).toBe('theirsOnly');
  });

  it('a new record has no base: every field the draft has is mineOnly', () => {
    const list = compareForConflict(null, null, { id: 'spc_n', notes: 'x' });
    expect(byPath(list)).toEqual({ id: 'mineOnly', notes: 'mineOnly' });
  });
});
