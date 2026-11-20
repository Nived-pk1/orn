/** The history entry of "Continue from here" (step C6): ONE entry; Back returns to the previous search. Not part of the address text (ADR-047 format unchanged). */
import { describe, expect, it } from 'vitest';
import { PRECURSOR_HISTORY, pushTargetEntry, targetOfState } from './continue-from';

const fakeHistory = (state: unknown = null) => {
  const calls: string[] = [];
  const h = {
    state,
    replaceState: (s: unknown) => (calls.push(`replace ${JSON.stringify(s)}`), (h.state = s)),
    pushState: (s: unknown) => (calls.push(`push ${JSON.stringify(s)}`), (h.state = s)),
  };
  return { h, calls };
};
const A = { kind: 'species', id: 'spc_a' } as const;
const B = { kind: 'species', id: 'spc_b' } as const;

describe('pushTargetEntry', () => {
  it('writes the previous target on the current entry and ONE new entry for the new target', () => {
    const { h, calls } = fakeHistory();
    expect(pushTargetEntry(A, B, h)).toBe(true);
    expect(calls).toEqual([`replace {"orn":"${PRECURSOR_HISTORY}","target":{"kind":"species","id":"spc_a"}}`, `push {"orn":"${PRECURSOR_HISTORY}","target":{"kind":"species","id":"spc_b"}}`]);
  });
  it('leaves the full map\'s own entry alone', () => {
    const { h, calls } = fakeHistory({ orn: 'full-map' });
    expect(pushTargetEntry(A, B, h)).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('targetOfState', () => {
  it('reads a valid entry and nothing else', () => {
    expect(targetOfState({ orn: PRECURSOR_HISTORY, target: A })).toEqual(A);
    expect(targetOfState({ orn: PRECURSOR_HISTORY, target: { kind: 'reaction', id: 'x' } })).toBeUndefined();
    expect(targetOfState({ orn: 'full-map' })).toBeUndefined();
    expect(targetOfState(null)).toBeUndefined();
  });
});
