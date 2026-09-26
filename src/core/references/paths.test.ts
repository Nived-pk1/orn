import { describe, expect, it } from 'vitest';
import { applyEdits, fieldOf, formatPath, matchPath, parsePath } from './paths';

const doc = {
  a: [{ id: 'x1', list: ['p', 'q', 'r'] }, { id: 'x2', list: [] }, { id: 'x3' }],
  s: 'text',
  o: { inner: 1 },
};

describe('parsePath', () => {
  it('parses fields and array iteration', () => {
    expect(parsePath('a[].list[]')).toEqual([
      { key: 'a', each: true },
      { key: 'list', each: true },
    ]);
    expect(parsePath('o.inner')).toEqual([
      { key: 'o', each: false },
      { key: 'inner', each: false },
    ]);
  });

  it.each(['', 'a..b', 'a[', 'a[][]', '[]', 'a.b[0]', '1a', 'a b'])('rejects malformed path %j', (path) => {
    expect(() => parsePath(path)).toThrow(/Malformed registry path/);
  });
});

describe('formatPath', () => {
  it('renders fields and indices', () => {
    expect(formatPath(['participants', 1, 'ref', 'id'])).toBe('participants[1].ref.id');
    expect(formatPath(['a', 0, 2])).toBe('a[0][2]');
    expect(formatPath([])).toBe('');
  });
});

describe('matchPath', () => {
  it('finds every concrete location with its parent and segment ends', () => {
    const matches = matchPath(doc, parsePath('a[].list[]'));
    expect(matches.map((m) => [formatPath(m.tokens), m.value])).toEqual([
      ['a[0].list[0]', 'p'],
      ['a[0].list[1]', 'q'],
      ['a[0].list[2]', 'r'],
    ]);
    expect(matches[1]?.parent).toBe(doc.a[0]);
    expect(matches[1]?.ends).toEqual([2, 4]);
  });

  it('skips absent fields, empty arrays and wrongly typed parts without throwing', () => {
    expect(matchPath(doc, parsePath('a[].missing'))).toEqual([]);
    expect(matchPath(doc, parsePath('s.inner'))).toEqual([]);
    expect(matchPath(doc, parsePath('s[]'))).toEqual([]);
    expect(matchPath(doc, parsePath('o[]'))).toEqual([]);
    expect(matchPath(null, parsePath('a'))).toEqual([]);
    expect(matchPath([doc], parsePath('a'))).toEqual([]);
  });

  it('never reads inherited properties', () => {
    expect(matchPath({}, parsePath('constructor'))).toEqual([]);
    expect(fieldOf({}, 'toString')).toBeUndefined();
    expect(fieldOf(JSON.parse('{"__proto__": 1}'), '__proto__')).toBe(1);
  });
});

describe('applyEdits', () => {
  it('returns the same object when there is nothing to do', () => {
    expect(applyEdits(doc, [])).toBe(doc);
  });

  it('sets values immutably and shares untouched branches', () => {
    const next = applyEdits(doc, [{ tokens: ['a', 1, 'id'], value: 'y2' }]);
    expect(next.a[1]?.id).toBe('y2');
    expect(doc.a[1]?.id).toBe('x2');
    expect(next.a[0]).toBe(doc.a[0]);
    expect(next.o).toBe(doc.o);
  });

  it('removes several array elements using indices from the original tree', () => {
    const next = applyEdits(doc, [
      { tokens: ['a', 0, 'list', 0], remove: true },
      { tokens: ['a', 0, 'list', 2], remove: true },
      { tokens: ['a', 0], remove: true },
      { tokens: ['a', 2], remove: true },
    ]);
    expect(next.a).toEqual([{ id: 'x2', list: [] }]);
    expect(doc.a).toHaveLength(3);
  });

  it('removes object keys and applies duplicate removals once', () => {
    const next = applyEdits(doc, [
      { tokens: ['a', 0, 'list', 1], remove: true },
      { tokens: ['a', 0, 'list', 1], remove: true },
      { tokens: ['s'], remove: true },
    ]);
    expect(next.a[0]?.list).toEqual(['p', 'r']);
    expect('s' in next).toBe(false);
  });

  it('throws on an edit location that does not exist (programmer error)', () => {
    expect(() => applyEdits(doc, [{ tokens: ['a', 9, 'id'], value: 1 }])).toThrow(/not found/);
    expect(() => applyEdits(doc, [{ tokens: ['nope'], remove: true }])).toThrow(/not found/);
  });

  it('does not pollute prototypes through a hostile key', () => {
    const hostile = JSON.parse('{"__proto__": {"x": 1}, "k": 1}') as Record<string, unknown>;
    const next = applyEdits(hostile, [{ tokens: ['k'], value: 2 }]);
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
    expect(next['k']).toBe(2);
  });
});
