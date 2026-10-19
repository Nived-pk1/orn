/**
 * Small typed constructors for the demo dataset (docs/TEST_STRATEGY.md §3). Test-only, deterministic:
 * every ID is a readable body chosen by the author, every timestamp is the fixed STAMP. The builders add
 * nothing the schema would not accept; `serializeDocument` still parses the result strictly.
 */
import type {
  ChemicalClass,
  Concept,
  ConceptId,
  ConditionParameters,
  ClassId,
  Names,
  PropertyEntry,
  Reagent,
  ReagentId,
  RecordRef,
  Review,
  Species,
  SpeciesId,
  SpeciesOrClassRef,
  StereoInfo,
  StructureRep,
  SubstanceRef,
  Temperature,
} from './types';
import type { CLASS_KINDS, SPECIES_KINDS } from './types';

export const STAMP = '2026-09-26T00:00:00.000Z';
export const DATASET_ID = 'orn-demo';
export const provenance = { origin: 'seed', createdAt: STAMP, updatedAt: STAMP } as const;
export const presentationMeta = { provenance } as const;

const BODY = /^[0-9a-z][0-9a-z-]{1,62}$/;

/** `prefix_body`; throws for a body the ID schema would reject (a programmer error in the builder). */
export function ident<T extends string>(prefix: string, body: string): T {
  if (!BODY.test(body)) throw new Error(`Invalid ID body for ${prefix}: "${body}"`);
  return `${prefix}_${body}` as T;
}

export const spcId = (body: string) => ident<SpeciesId>('spc', body);
export const clsId = (body: string) => ident<ClassId>('cls', body);
export const rgtId = (body: string) => ident<ReagentId>('rgt', body);
export const cptId = (body: string) => ident<ConceptId>('cpt', body);

export const sp = (body: string): SubstanceRef & SpeciesOrClassRef => ({ kind: 'species', id: spcId(body) });
export const cl = (body: string): SubstanceRef & SpeciesOrClassRef => ({ kind: 'class', id: clsId(body) });
export const rg = (body: string): SubstanceRef => ({ kind: 'reagent', id: rgtId(body) });
/** A polymorphic reference: the kind selects the ID prefix. */
export function rec(kind: RecordRef['kind'], body: string, prefix: string): RecordRef {
  return { kind, id: ident<string>(prefix, body) };
}

export interface CurationOptions {
  readonly status?: Review['status'];
  readonly reasons?: readonly string[];
  readonly lifecycle?: Review['lifecycle'];
  readonly tags?: readonly string[];
}

/**
 * Curation metadata. Nothing in the demo is `verified`: chemistry is entered by an author and must be
 * checked by a human before any record is marked verified (docs/PROJECT_STATE.json openItems).
 */
export function meta(options: CurationOptions = {}) {
  const status = options.status ?? 'unreviewed';
  if (status === 'review_required' && (options.reasons ?? []).length === 0) {
    throw new Error('review_required records must say why');
  }
  return {
    tags: [...(options.tags ?? [])],
    citations: [],
    provenance,
    review: { lifecycle: options.lifecycle ?? 'published', status, reasons: [...(options.reasons ?? [])] },
  };
}

export interface NameOptions {
  readonly display?: string;
  readonly iupac?: string;
  readonly common?: readonly string[];
  readonly aliases?: readonly string[];
  readonly qualifier?: string;
}

export function names(canonical: string, o: NameOptions = {}): Names {
  return {
    canonical,
    ...(o.display === undefined ? {} : { display: o.display }),
    ...(o.iupac === undefined ? {} : { iupac: o.iupac }),
    common: [...(o.common ?? [])],
    aliases: [...(o.aliases ?? [])],
    ...(o.qualifier === undefined ? {} : { qualifier: o.qualifier }),
  };
}

export const smiles = (value: string): StructureRep => ({ format: 'smiles', value });

export function conditions(partial: Partial<ConditionParameters> = {}): ConditionParameters {
  return { solventCharacter: [], activation: [], other: [], parsedFields: [], ...partial };
}
export const kelvin = (value: number): Temperature => ({ kind: 'value', value, unit: 'K' });
export const celsius = (value: number): Temperature => ({ kind: 'value', value, unit: 'C' });
export const celsiusRange = (min: number, max: number): Temperature => ({ kind: 'range', min, max, unit: 'C' });

export interface SpeciesOptions extends NameOptions, CurationOptions {
  readonly kind?: (typeof SPECIES_KINDS)[number];
  readonly smiles?: string;
  readonly formula?: string;
  readonly charge?: number;
  /** Class bodies: list the most specific classes only (SPC-006). */
  readonly classes?: readonly string[];
  readonly stereo?: StereoInfo;
  readonly aromaticity?: NonNullable<Species['aromaticity']>;
  readonly properties?: readonly PropertyEntry[];
  readonly studyNotes?: string;
  readonly notes?: string;
}

export function species(body: string, canonical: string, o: SpeciesOptions = {}): Species {
  return {
    id: spcId(body),
    kind: 'species',
    names: names(canonical, o),
    speciesKind: o.kind ?? 'molecule',
    ...(o.smiles === undefined ? {} : { structure: smiles(o.smiles) }),
    ...(o.formula === undefined ? {} : { formula: o.formula }),
    ...(o.charge === undefined ? {} : { charge: o.charge }),
    classIds: (o.classes ?? []).map(clsId),
    ...(o.stereo === undefined ? {} : { stereo: o.stereo }),
    ...(o.aromaticity === undefined ? {} : { aromaticity: o.aromaticity }),
    properties: [...(o.properties ?? [])],
    ...(o.studyNotes === undefined ? {} : { studyNotes: o.studyNotes }),
    ...(o.notes === undefined ? {} : { notes: o.notes }),
    ...meta(o),
  };
}

export interface ClassOptions extends NameOptions, CurationOptions {
  readonly parents?: readonly string[];
  readonly formulaText?: string;
  readonly generalFormula?: string;
  /** A membership query for the derived CHEM-007 suggestions (never assigns a class). */
  readonly smarts?: string;
  readonly examples?: readonly string[];
  readonly description?: string;
  readonly studyNotes?: string;
}

/** A generic family: formula text only, never a representative structure (docs/DOMAIN_MODEL.md §5.2). */
export function chemClass(
  body: string,
  canonical: string,
  classKind: (typeof CLASS_KINDS)[number],
  o: ClassOptions = {},
): ChemicalClass {
  const hasGeneric = o.formulaText !== undefined || o.generalFormula !== undefined || o.smarts !== undefined;
  return {
    id: clsId(body),
    kind: 'class',
    names: names(canonical, o),
    classKind,
    parentIds: (o.parents ?? []).map(clsId),
    ...(hasGeneric
      ? {
          generic: {
            ...(o.formulaText === undefined ? {} : { formulaText: o.formulaText }),
            ...(o.generalFormula === undefined ? {} : { generalFormula: o.generalFormula }),
            ...(o.smarts === undefined ? {} : { smarts: o.smarts }),
          },
        }
      : {}),
    exampleSpeciesIds: (o.examples ?? []).map(spcId),
    ...(o.description === undefined ? {} : { description: o.description }),
    ...(o.studyNotes === undefined ? {} : { studyNotes: o.studyNotes }),
    ...meta(o),
  };
}

export interface ReagentOptions extends NameOptions, CurationOptions {
  readonly species?: string;
  readonly components?: readonly { readonly ref: SubstanceRef; readonly role: Reagent['components'][number]['role']; readonly amountText?: string }[];
  readonly formulaText?: string;
  readonly families: Reagent['families'];
  readonly classes?: readonly string[];
  readonly profiles?: Reagent['profiles'];
  readonly description?: string;
  readonly studyNotes?: string;
}

export function reagent(body: string, canonical: string, o: ReagentOptions): Reagent {
  return {
    id: rgtId(body),
    kind: 'reagent',
    names: names(canonical, o),
    ...(o.species === undefined ? {} : { speciesId: spcId(o.species) }),
    components: (o.components ?? []).map((c) => ({ ...c })),
    ...(o.formulaText === undefined ? {} : { formulaText: o.formulaText }),
    families: [...o.families],
    classIds: (o.classes ?? []).map(clsId),
    profiles: [...(o.profiles ?? [])],
    ...(o.description === undefined ? {} : { description: o.description }),
    ...(o.studyNotes === undefined ? {} : { studyNotes: o.studyNotes }),
    ...meta(o),
  };
}

export interface ConceptOptions extends CurationOptions {
  readonly aliases?: readonly string[];
  readonly parents?: readonly string[];
  readonly summary?: string;
  readonly difficulty?: number;
  readonly studyNotes?: string;
}

export function concept(body: string, name: string, conceptKind: Concept['conceptKind'], o: ConceptOptions = {}): Concept {
  return {
    id: cptId(body),
    kind: 'concept',
    name,
    aliases: [...(o.aliases ?? [])],
    conceptKind,
    parentIds: (o.parents ?? []).map(cptId),
    ...(o.summary === undefined ? {} : { summary: o.summary }),
    ...(o.difficulty === undefined ? {} : { difficulty: o.difficulty }),
    ...(o.studyNotes === undefined ? {} : { studyNotes: o.studyNotes }),
    ...meta(o),
  };
}
