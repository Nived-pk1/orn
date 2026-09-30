/**
 * Builders of the ORN records a legacy compound becomes (docs/MIGRATION.md §4.4): species, class, created class, navigator anchor,
 * entity display and asset. Pure and schema-shaped; nothing here reads legacy data or decides anything. Every record carries
 * `provenance.origin: 'legacy_import'`, both timestamps from the injected clock, and `provenance.legacy` (system, legacy ID when it
 * can be stored, the unmapped values). Imported compounds are `published` (they were live in v6); `review.status` is
 * `review_required` exactly when reasons exist. Created classes and assets: see their builders.
 */
import type { Asset, ChemicalClass, EntityDisplay, JsonValue, NavigatorAnchor, Provenance, RecordRef, Review, Species } from '@/core/schema';
import type { CreatedClass } from './compound-classes';
import type { ConvertedFields } from './compound-convert';
import { fitReasons } from './compound-scope';
import { LEGACY_SYSTEM } from './report';

export interface Stamp {
  readonly at: string;
}

export function provenanceOf(stamp: Stamp, legacyId: string | undefined, unmapped?: { [key: string]: JsonValue }): Provenance {
  return {
    origin: 'legacy_import',
    createdAt: stamp.at,
    updatedAt: stamp.at,
    legacy: { system: LEGACY_SYSTEM, ...(legacyId === undefined ? {} : { legacyId }), ...(unmapped === undefined ? {} : { unmapped }) },
  };
}

export function reviewOf(reasons: readonly string[], lifecycle: 'draft' | 'published' = 'published'): Review {
  return { lifecycle, status: reasons.length > 0 ? 'review_required' : 'unreviewed', reasons: fitReasons(reasons) };
}

const namesOf = (canonical: string): Species['names'] => ({ canonical, common: [], aliases: [] });

export interface RecordParts {
  readonly id: string;
  readonly fields: ConvertedFields;
  readonly provenance: Provenance;
  readonly review: Review;
}

export function speciesRecord(parts: RecordParts, classIds: readonly string[]): Species {
  const { fields } = parts;
  return {
    id: parts.id as Species['id'],
    kind: 'species',
    names: namesOf(fields.canonicalName),
    speciesKind: 'unspecified',
    ...(fields.structure === undefined ? {} : { structure: fields.structure }),
    ...(fields.formula === undefined ? {} : { formula: fields.formula }),
    classIds: classIds as Species['classIds'],
    ...(fields.stereo === undefined ? {} : { stereo: fields.stereo }),
    ...(fields.aromaticity === undefined ? {} : { aromaticity: fields.aromaticity }),
    properties: [],
    ...(fields.acidBaseNotes === undefined ? {} : { acidBaseNotes: fields.acidBaseNotes }),
    ...(fields.studyNotes === undefined ? {} : { studyNotes: fields.studyNotes }),
    ...(fields.notes === undefined ? {} : { notes: fields.notes }),
    tags: fields.tags,
    citations: [],
    provenance: parts.provenance,
    review: parts.review,
  };
}

/** A hub decided as class: `compound_class`, never a structure (the legacy example SMILES stays in `unmapped`). */
export function classRecord(parts: RecordParts): ChemicalClass {
  const { fields } = parts;
  return {
    id: parts.id as ChemicalClass['id'],
    kind: 'class',
    names: namesOf(fields.canonicalName),
    classKind: 'compound_class',
    parentIds: [],
    ...(fields.formulaText === undefined ? {} : { generic: { formulaText: fields.formulaText } }),
    exampleSpeciesIds: [],
    ...(fields.description === undefined ? {} : { description: fields.description }),
    ...(fields.studyNotes === undefined ? {} : { studyNotes: fields.studyNotes }),
    tags: fields.tags,
    citations: [],
    provenance: parts.provenance,
    review: parts.review,
  };
}

/** A class the importer made (functional group, `compoundClass` text): a draft, always review-required. */
export function createdClassRecord(created: CreatedClass, stamp: Stamp, legacyId: string | undefined, reasons: readonly string[]): ChemicalClass {
  return {
    id: created.id as ChemicalClass['id'],
    kind: 'class',
    names: namesOf(created.name),
    classKind: created.classKind,
    parentIds: [],
    exampleSpeciesIds: [],
    tags: [],
    citations: [],
    provenance: provenanceOf(stamp, legacyId),
    review: { lifecycle: 'draft', status: 'review_required', reasons: fitReasons([created.reason, ...reasons]) },
  };
}

export function anchorRecord(id: string, target: RecordRef, order: number, stamp: Stamp, legacyId: string | undefined): NavigatorAnchor {
  return { id: id as NavigatorAnchor['id'], kind: 'navigator_anchor', target, order, provenance: provenanceOf(stamp, legacyId) };
}

/** Legacy `node: false` (drawn on arrows as text, never as a node). */
export function neverNodeRecord(id: string, target: RecordRef, stamp: Stamp, legacyId: string | undefined): EntityDisplay {
  return { id: id as EntityDisplay['id'], kind: 'entity_display', target, showAsNode: 'never', provenance: provenanceOf(stamp, legacyId) };
}

export function assetRecord(id: string, decoded: { mediaType: Asset['mediaType']; byteSize: number; sha256: string }, target: RecordRef, stamp: Stamp, legacyId: string | undefined): Asset {
  return {
    id: id as Asset['id'],
    kind: 'asset',
    mediaType: decoded.mediaType,
    byteSize: decoded.byteSize,
    sha256: decoded.sha256,
    assetRole: 'legacy_image',
    attachedTo: [{ ref: target }],
    tags: [],
    citations: [],
    provenance: provenanceOf(stamp, legacyId),
    review: reviewOf([]),
  };
}
