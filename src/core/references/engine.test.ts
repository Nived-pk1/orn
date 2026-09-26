import { describe, expect, it } from 'vitest';
import type { AnyRecord, NestedIdSpec, ReferenceSpec } from '../schema';
import { createReferenceEngine } from './engine';

const rec = (value: object): AnyRecord => value as unknown as AnyRecord;

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Small registry exercising every target type, container and delete policy. */
const SPECS: readonly ReferenceSpec[] = [
  { owner: 'reaction', path: 'instanceOfId', target: { type: 'id', kind: 'reaction' }, onDelete: 'detach' },
  { owner: 'reaction', path: 'conceptIds[]', target: { type: 'id', kind: 'concept' }, onDelete: 'detach' },
  {
    owner: 'reaction',
    path: 'types[].conceptId',
    target: { type: 'id', kind: 'concept' },
    onDelete: 'detach',
    container: 'types[]',
  },
  {
    owner: 'reaction',
    path: 'participants[].ref',
    target: { type: 'ref', kinds: ['species', 'class', 'reagent'] },
    onDelete: 'restrict',
  },
  {
    owner: 'reaction',
    path: 'participants[].profileId',
    target: { type: 'nested', via: { scope: 'sibling', field: 'ref' }, kind: 'reagent', collection: 'profiles' },
    onDelete: 'detach',
  },
  {
    owner: 'reaction',
    path: 'stages[].participantIds[]',
    target: { type: 'local', collection: 'participants' },
    onDelete: 'detach',
  },
  {
    owner: 'reaction',
    path: 'mechanism.variantId',
    target: { type: 'nested', via: { scope: 'root', field: 'mechanismId' }, kind: 'mechanism', collection: 'variants' },
    onDelete: 'detach',
  },
  {
    owner: 'reaction',
    path: 'mechanism.mechanismId',
    target: { type: 'id', kind: 'mechanism' },
    onDelete: 'detach',
    container: 'mechanism',
  },
];
const NESTED: readonly NestedIdSpec[] = [
  { owner: 'reaction', path: 'participants[].id', prefix: 'prt' },
  { owner: 'reaction', path: 'stages[].id', prefix: 'stg' },
];
const engine = createReferenceEngine(SPECS, NESTED);

const reaction = () =>
  deepFreeze(
    rec({
      id: 'rxn_a',
      kind: 'reaction',
      instanceOfId: 'rxn_b',
      conceptIds: ['cpt_1', 'cpt_2', 'cpt_3'],
      types: [{ conceptId: 'cpt_1', certainty: 'definite' }, { conceptId: 'cpt_9' }],
      participants: [
        { id: 'prt_1', ref: { kind: 'reagent', id: 'rgt_1' }, profileId: 'rpf_1' },
        { id: 'prt_2', ref: { kind: 'species', id: 'spc_1' } },
      ],
      stages: [{ id: 'stg_1', participantIds: ['prt_1', 'prt_2'] }],
      mechanismId: 'mec_1',
      mechanism: { mechanismId: 'mec_1', variantId: 'mvr_1' },
    }),
  );

describe('extract', () => {
  it('lists every reference with concrete path, target and kind', () => {
    const refs = engine.extract(reaction());
    expect(refs.map((r) => [r.path, r.targetId, r.targetKind])).toEqual([
      ['instanceOfId', 'rxn_b', 'reaction'],
      ['conceptIds[0]', 'cpt_1', 'concept'],
      ['conceptIds[1]', 'cpt_2', 'concept'],
      ['conceptIds[2]', 'cpt_3', 'concept'],
      ['types[0].conceptId', 'cpt_1', 'concept'],
      ['types[1].conceptId', 'cpt_9', 'concept'],
      ['participants[0].ref', 'rgt_1', 'reagent'],
      ['participants[1].ref', 'spc_1', 'species'],
      ['participants[0].profileId', 'rpf_1', undefined],
      ['stages[0].participantIds[0]', 'prt_1', undefined],
      ['stages[0].participantIds[1]', 'prt_2', undefined],
      ['mechanism.variantId', 'mvr_1', undefined],
      ['mechanism.mechanismId', 'mec_1', 'mechanism'],
    ]);
  });

  it('names the record that must contain a nested target', () => {
    const nested = engine.extract(reaction()).filter((r) => r.spec.target.type === 'nested');
    expect(nested.map((r) => [r.path, r.containerRecordId])).toEqual([
      ['participants[0].profileId', 'rgt_1'],
      ['mechanism.variantId', 'mec_1'],
    ]);
  });

  it('leaves the container unset when the sibling is not of the expected kind or is missing', () => {
    const refs = engine.extract(
      rec({
        kind: 'reaction',
        participants: [{ ref: { kind: 'species', id: 'spc_1' }, profileId: 'rpf_1' }, { profileId: 'rpf_2' }],
        mechanism: { variantId: 'mvr_1' },
      }),
    );
    expect(refs.map((r) => r.containerRecordId)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('ignores absent, null and wrongly typed values without throwing', () => {
    const refs = engine.extract(
      rec({
        kind: 'reaction',
        instanceOfId: 5,
        conceptIds: 'cpt_1',
        types: [null, 'x', { conceptId: { id: 'cpt_1' } }],
        participants: [{ ref: 'spc_1' }, { ref: { kind: 'species' } }, { ref: { kind: 'bogus', id: 'spc_2' } }],
        stages: { participantIds: ['prt_1'] },
        mechanism: null,
      }),
    );
    expect(refs.map((r) => [r.path, r.targetKind])).toEqual([['participants[2].ref', undefined]]);
  });

  it('returns nothing for kinds with no registered references', () => {
    expect(engine.extract(rec({ kind: 'species', id: 'spc_1', classIds: ['cls_1'] }))).toEqual([]);
  });
});

describe('nestedIds', () => {
  it('lists the nested IDs a record defines', () => {
    expect(engine.nestedIds(reaction())).toEqual([
      { path: 'participants[0].id', id: 'prt_1' },
      { path: 'participants[1].id', id: 'prt_2' },
      { path: 'stages[0].id', id: 'stg_1' },
    ]);
    expect(engine.nestedIds(rec({ kind: 'species' }))).toEqual([]);
  });
});

describe('remap', () => {
  it('rewrites the record ID, nested IDs and every reference, and only those', () => {
    const map = new Map([
      ['rxn_a', 'rxn_A'],
      ['rxn_b', 'rxn_B'],
      ['cpt_1', 'cpt_X'],
      ['rgt_1', 'rgt_X'],
      ['prt_1', 'prt_X'],
      ['rpf_1', 'rpf_X'],
      ['mvr_1', 'mvr_X'],
    ]);
    const before = reaction();
    const after = engine.remap(before, map) as unknown as Record<string, unknown>;
    expect(after).toEqual({
      id: 'rxn_A',
      kind: 'reaction',
      instanceOfId: 'rxn_B',
      conceptIds: ['cpt_X', 'cpt_2', 'cpt_3'],
      types: [{ conceptId: 'cpt_X', certainty: 'definite' }, { conceptId: 'cpt_9' }],
      participants: [
        { id: 'prt_X', ref: { kind: 'reagent', id: 'rgt_X' }, profileId: 'rpf_X' },
        { id: 'prt_2', ref: { kind: 'species', id: 'spc_1' } },
      ],
      stages: [{ id: 'stg_1', participantIds: ['prt_X', 'prt_2'] }],
      mechanismId: 'mec_1',
      mechanism: { mechanismId: 'mec_1', variantId: 'mvr_X' },
    });
    expect(before.id).toBe('rxn_a');
  });

  it('returns the same object when no ID is mapped, or when a mapping is the identity', () => {
    const before = reaction();
    expect(engine.remap(before, new Map())).toBe(before);
    expect(engine.remap(before, new Map([['rxn_a', 'rxn_a']]))).toBe(before);
    expect(engine.remap(before, new Map([['zzz_unrelated', 'zzz_other']]))).toBe(before);
  });
});

describe('detach', () => {
  it('removes array elements, containers and optional fields for deleted targets', () => {
    const after = engine.detach(reaction(), new Set(['rxn_b', 'cpt_1', 'cpt_3', 'mec_1', 'rpf_1', 'prt_2']));
    expect(after).toEqual({
      id: 'rxn_a',
      kind: 'reaction',
      conceptIds: ['cpt_2'],
      types: [{ conceptId: 'cpt_9' }],
      participants: [
        { id: 'prt_1', ref: { kind: 'reagent', id: 'rgt_1' } },
        { id: 'prt_2', ref: { kind: 'species', id: 'spc_1' } },
      ],
      stages: [{ id: 'stg_1', participantIds: ['prt_1'] }],
      mechanismId: 'mec_1',
    });
  });

  it('detaches a nested target on its own without touching the container link', () => {
    const after = engine.detach(reaction(), new Set(['mvr_1'])) as unknown as { mechanism: unknown };
    expect(after.mechanism).toEqual({ mechanismId: 'mec_1' });
  });

  it('leaves restrict references alone and returns the same object when unaffected', () => {
    const before = reaction();
    expect(engine.detach(before, new Set(['rgt_1', 'spc_1']))).toBe(before);
    expect(engine.detach(before, new Set())).toBe(before);
    expect(engine.detach(before, new Set(['cpt_404']))).toBe(before);
  });

  it('applies removals once when one target is referenced several times', () => {
    const after = engine.detach(reaction(), new Set(['cpt_1'])) as unknown as { conceptIds: string[]; types: unknown[] };
    expect(after.conceptIds).toEqual(['cpt_2', 'cpt_3']);
    expect(after.types).toEqual([{ conceptId: 'cpt_9' }]);
  });
});

describe('registry validation', () => {
  it('rejects a container that is not a leading part of the path (programmer error)', () => {
    const bad: ReferenceSpec = {
      owner: 'reaction',
      path: 'types[].conceptId',
      target: { type: 'id', kind: 'concept' },
      onDelete: 'detach',
      container: 'other[]',
    };
    expect(() => createReferenceEngine([bad], [])).toThrow(/not a prefix/);
  });

  it('rejects a malformed path', () => {
    const bad: ReferenceSpec = { owner: 'reaction', path: 'a..b', target: { type: 'id', kind: 'reaction' }, onDelete: 'detach' };
    expect(() => createReferenceEngine([bad], [])).toThrow(/Malformed/);
  });
});
