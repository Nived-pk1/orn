/** Which records may carry the user's pictures, and the asset role each kind's picture gets (step 7.1a, ADR-038 addendum Q1 and Q2). */
import { describe, expect, it } from 'vitest';
import { ASSET_ROLES, RECORD_KINDS } from '../schema';
import { assetRoleOfPictureKind, isPictureKind, PICTURE_KINDS, picturesOf } from '.';

describe('PICTURE_KINDS', () => {
  it('is exactly the nine kinds the reviewer named, in one constant', () => {
    expect([...PICTURE_KINDS]).toEqual(['species', 'class', 'reagent', 'reaction', 'transformation', 'named_reaction', 'concept', 'caveat', 'mechanism']);
  });
  it('offers none of the other kinds (route is decided in 7.2)', () => {
    for (const kind of RECORD_KINDS.filter((one) => !(PICTURE_KINDS as readonly string[]).includes(one))) expect(isPictureKind(kind)).toBe(false);
    for (const kind of ['route', 'relationship', 'exam', 'exam_version', 'topic', 'topic_mapping', 'exam_relevance', 'reference', 'asset', 'navigator_anchor', 'reaction_scheme', 'view_preset', 'entity_display', 'banana']) expect(isPictureKind(kind)).toBe(false);
  });
});

describe('the asset role of a picture', () => {
  it('follows the target kind: mechanism, reaction, reagent, structure for species and class, reference for the rest', () => {
    const expected: Record<string, string> = {
      mechanism: 'mechanism_image',
      reaction: 'reaction_image',
      reagent: 'reagent_image',
      species: 'structure_image',
      class: 'structure_image',
      transformation: 'reference_image',
      named_reaction: 'reference_image',
      concept: 'reference_image',
      caveat: 'reference_image',
    };
    for (const kind of PICTURE_KINDS) expect(assetRoleOfPictureKind(kind)).toBe(expected[kind]);
  });
  it('is a role the schema knows, for every picture kind', () => {
    for (const kind of PICTURE_KINDS) expect(ASSET_ROLES).toContain(assetRoleOfPictureKind(kind));
  });
});

describe('picturesOf', () => {
  const asset = (id: string, createdAt: string, refs: readonly { kind: string; id: string }[]) => ({ id, kind: 'asset', attachedTo: refs.map((ref) => ({ ref })), provenance: { createdAt } });
  const state = { records: { asset: { ast_b: asset('ast_b', '2026-10-24T11:00:00.000Z', [{ kind: 'concept', id: 'cpt_a' }]), ast_a: asset('ast_a', '2026-10-24T09:00:00.000Z', [{ kind: 'concept', id: 'cpt_a' }]), ast_c: asset('ast_c', '2026-10-24T09:00:00.000Z', [{ kind: 'concept', id: 'cpt_a' }]), ast_x: asset('ast_x', '2026-10-24T08:00:00.000Z', [{ kind: 'concept', id: 'cpt_b' }]), ast_none: asset('ast_none', '2026-10-24T07:00:00.000Z', []) } } };
  it('lists the assets attached to the record, oldest first then by ID, and nothing detached or attached elsewhere', () => {
    expect(picturesOf(state as never, { kind: 'concept', id: 'cpt_a' } as never).map((one) => one.id)).toEqual(['ast_a', 'ast_c', 'ast_b']);
    expect(picturesOf(state as never, { kind: 'species', id: 'cpt_a' } as never)).toEqual([]);
  });
});
