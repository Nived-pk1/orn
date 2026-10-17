/** parseStoredSession (ADR-040): a stored row is untrusted; the tolerant parse of the EditorSession shape. */
import { describe, expect, it } from 'vitest';
import { MAX_DRAFT_STEPS, parseStoredSession } from '.';

const row = {
  id: 'eds_abc123',
  kind: 'species',
  target: { kind: 'species', id: 'spc_x' },
  baseRevision: 3,
  baseRecord: { id: 'spc_x', kind: 'species' },
  draft: { id: 'spc_x', kind: 'species', names: { canonical: 'A' } },
  past: [[{ op: 'replace', path: ['names', 'canonical'], value: 'B' }]],
  future: [],
  updatedAt: '2026-10-17T12:00:00.000Z',
};

describe('parseStoredSession', () => {
  it('accepts a well-formed row, a new-record row and rows whose draft is not a valid record', () => {
    expect(parseStoredSession(row)).toEqual({ ok: true, session: row });
    expect(parseStoredSession({ ...row, target: null, baseRecord: null }).ok).toBe(true);
    expect(parseStoredSession({ ...row, draft: { half: 'done' } }).ok).toBe(true); // L1 decides at commit, not here
  });

  it.each([
    ['not an object', 5],
    ['null', null],
    ['an array', []],
    ['an ID that is not eds_', { ...row, id: 'ses_one' }],
    ['an unknown kind', { ...row, kind: 'banana' }],
    ['a target of another kind', { ...row, target: { kind: 'reaction', id: 'rxn_x' } }],
    ['a revision that is not an integer', { ...row, baseRevision: 1.5 }],
    ['a draft that is not an object', { ...row, draft: 'text' }],
    ['past that is not a list of steps', { ...row, past: [{ op: 'replace' }] }],
    ['a patch with an unknown op', { ...row, past: [[{ op: 'move', path: [] }]] }],
    ['a patch path with an object in it', { ...row, past: [[{ op: 'add', path: [{}] }]] }],
    ['no updatedAt', { ...row, updatedAt: undefined }],
  ])('refuses %s with a reason in words', (_name, value) => {
    const result = parseStoredSession(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it('bounds the history: more than 200 steps is refused, 200 is fine', () => {
    const step = [{ op: 'replace', path: ['a'], value: 1 }];
    expect(parseStoredSession({ ...row, past: Array.from({ length: MAX_DRAFT_STEPS }, () => step) }).ok).toBe(true);
    expect(parseStoredSession({ ...row, past: Array.from({ length: MAX_DRAFT_STEPS + 1 }, () => step) }).ok).toBe(false);
  });
});
