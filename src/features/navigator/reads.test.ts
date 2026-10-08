import { describe, expect, it } from 'vitest';
import { RECORD_KINDS, type RecordKind } from '@/core/schema';
import { PROJECTION_KINDS, SCENE_KINDS, touchOf } from './reads';

const change = (cause: string, kind: RecordKind) => ({ cause, created: [], updated: [{ kind }], deleted: [] });

describe('what a ChangeSet forces', () => {
  it('the scene list is the projection list plus reaction_scheme and nothing else', () => {
    expect([...SCENE_KINDS].filter((kind) => !PROJECTION_KINDS.has(kind))).toEqual(['reaction_scheme']);
  });

  it('every kind answers by its list', () => {
    for (const kind of RECORD_KINDS) {
      const expected = PROJECTION_KINDS.has(kind) ? 'projection' : SCENE_KINDS.has(kind) ? 'scene' : 'none';
      expect(touchOf(change('command', kind))).toBe(expected);
    }
  });

  it('a replace and a remote change always rebuild the projection, even with no record named', () => {
    for (const cause of ['replace', 'remote']) expect(touchOf({ cause, created: [], updated: [], deleted: [] })).toBe('projection');
  });

  it('created and deleted records count like updated ones; the strongest touch wins', () => {
    expect(touchOf({ cause: 'command', created: [{ kind: 'view_preset' }], updated: [{ kind: 'reaction_scheme' }], deleted: [] })).toBe('scene');
    expect(touchOf({ cause: 'undo', created: [], updated: [{ kind: 'reaction_scheme' }], deleted: [{ kind: 'species' }] })).toBe('projection');
  });
});
