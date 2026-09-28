import { describe, expect, it } from 'vitest';
import { changeMessageFor, MAX_CHANGED_IDS, parseChangeMessage } from './change-message';

describe('parseChangeMessage: another tab is not trusted', () => {
  it('accepts a well-formed message and drops repeated IDs', () => {
    expect(parseChangeMessage({ fromRevision: 3, revision: 5, changedIds: ['a', 'b', 'a'] })).toEqual({ fromRevision: 3, revision: 5, changedIds: ['a', 'b'] });
    expect(parseChangeMessage({ fromRevision: 0, revision: 1, changedIds: [] })).toEqual({ fromRevision: 0, revision: 1, changedIds: [] });
  });

  it("accepts 'all' (a wholesale replacement), also at the same revision", () => {
    expect(parseChangeMessage({ fromRevision: 4, revision: 9, changedIds: 'all' })).toEqual({ fromRevision: 4, revision: 9, changedIds: 'all' });
    expect(parseChangeMessage({ fromRevision: 4, revision: 4, changedIds: 'all' })).toEqual({ fromRevision: 4, revision: 4, changedIds: 'all' });
  });

  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'reload'],
    ['an array', []],
    ['an empty object', {}],
    ['a negative revision', { fromRevision: -1, revision: 2, changedIds: [] }],
    ['a fractional revision', { fromRevision: 1.5, revision: 2, changedIds: [] }],
    ['an unsafe integer', { fromRevision: 1, revision: Number.MAX_SAFE_INTEGER + 2, changedIds: [] }],
    ['a revision that does not move forward', { fromRevision: 2, revision: 2, changedIds: ['a'] }],
    ['a revision that goes backwards', { fromRevision: 3, revision: 2, changedIds: 'all' }],
    ['changedIds that is not an array', { fromRevision: 1, revision: 2, changedIds: 'some' }],
    ['a non-string ID', { fromRevision: 1, revision: 2, changedIds: [3] }],
    ['an empty ID', { fromRevision: 1, revision: 2, changedIds: [''] }],
    ['an over-long ID', { fromRevision: 1, revision: 2, changedIds: ['x'.repeat(513)] }],
    ['too many IDs', { fromRevision: 1, revision: 2, changedIds: Array.from({ length: MAX_CHANGED_IDS + 1 }, (_, i) => `spc_${i}`) }],
  ])('rejects %s', (_name, value) => {
    expect(parseChangeMessage(value)).toBeUndefined();
  });

  it('accepts exactly the maximum number of IDs', () => {
    const ids = Array.from({ length: MAX_CHANGED_IDS }, (_, i) => `spc_${i}`);
    expect(parseChangeMessage({ fromRevision: 1, revision: 2, changedIds: ids })?.changedIds).toHaveLength(MAX_CHANGED_IDS);
  });
});

describe('changeMessageFor', () => {
  it('lists the distinct touched IDs', () => {
    expect(changeMessageFor(1, 4, ['a', 'b', 'a'])).toEqual({ fromRevision: 1, revision: 4, changedIds: ['a', 'b'] });
    expect(changeMessageFor(1, 2, new Map([['x', 1]]).keys())).toEqual({ fromRevision: 1, revision: 2, changedIds: ['x'] });
  });

  it("says 'all' beyond the bound, and what it builds always parses", () => {
    const many = Array.from({ length: MAX_CHANGED_IDS + 1 }, (_, i) => `spc_${i}`);
    const message = changeMessageFor(1, 2, many);
    expect(message.changedIds).toBe('all');
    expect(parseChangeMessage(message)).toEqual(message);
    const exact = changeMessageFor(1, 2, many.slice(0, MAX_CHANGED_IDS));
    expect(parseChangeMessage(exact)).toEqual(exact);
  });
});
