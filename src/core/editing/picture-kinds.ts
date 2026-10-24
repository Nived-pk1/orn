/**
 * Which records may carry the user's own pictures (step 7.1a, ADR-038 addendum Q1 and Q2): ONE constant, and the asset role a picture gets
 * from the kind it is attached to. A picture is an `asset` record whose `attachedTo[].ref` names the record (the schema already allows any
 * record); the role is only a label, never read to decide anything. Pure; no chemistry.
 */
import type { Asset, AssetRole, CanonicalState, RecordRef } from '../schema';

export const PICTURE_KINDS = ['species', 'class', 'reagent', 'reaction', 'transformation', 'named_reaction', 'concept', 'caveat', 'mechanism'] as const;
export type PictureKind = (typeof PICTURE_KINDS)[number];

export const isPictureKind = (kind: string): kind is PictureKind => (PICTURE_KINDS as readonly string[]).includes(kind);

const ROLE_OF: Readonly<Record<PictureKind, AssetRole>> = {
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

export const assetRoleOfPictureKind = (kind: PictureKind): AssetRole => ROLE_OF[kind];

/**
 * The pictures attached to a record: the asset records whose `attachedTo` names it, OLDEST FIRST (`provenance.createdAt`, then the ID; the
 * schema gives them no order). Derived from the state each time; nothing is stored. Any record, so a kind outside PICTURE_KINDS answers
 * what the data says (the callers decide which kinds to ask).
 */
export function picturesOf(state: CanonicalState, target: RecordRef): readonly Asset[] {
  const found = (Object.values(state.records.asset) as Asset[]).filter((asset) => asset.attachedTo.some((one) => one.ref.kind === target.kind && one.ref.id === target.id));
  return found.sort((a, b) => a.provenance.createdAt.localeCompare(b.provenance.createdAt) || a.id.localeCompare(b.id));
}
