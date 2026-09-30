/**
 * The field-by-field mapping of ONE legacy compound (docs/MIGRATION.md §4.4), as data: what goes into the record's fields, what is
 * kept in `provenance.legacy.unmapped`, which reasons the record collects. Rules that hold for every field: an empty legacy value
 * (`""`, absent) is consumed and stores nothing; a value that passes the target field's schema is stored verbatim (no trimming, no
 * repair); a value that does not (too long, control characters, wrong type), or that the target has no field for, is kept whole in
 * `unmapped` - and where a person must decide, a review reason says so. Nothing is guessed.
 */
import {
  LabelTextSchema,
  NameTextSchema,
  RichTextSchema,
  StructureRepSchema,
  TagSchema,
  LIMITS,
  type Species,
  type StructureRep,
} from '@/core/schema';
import { excerpt, type CompoundScope } from './compound-scope';
import { isObj, type LegacyObject } from './text';

/** The v5 compound keys the mapper reads; every other key is an unknown legacy field. */
export const KNOWN_COMPOUND_KEYS: ReadonlySet<string> = new Set([
  'id', 'name', 'tags', 'image', 'smiles', 'formula', 'properties', 'node', 'functionalGroups', 'compoundClass', 'acidBase', 'aromaticity',
  'stereo', 'nodeType', 'genericFormula', 'fgId', 'jee',
]);

const AROMATICITY_OF: Readonly<Record<string, NonNullable<Species['aromaticity']>>> = {
  aromatic: 'aromatic',
  'non-aromatic': 'non_aromatic',
  antiaromatic: 'antiaromatic',
};

export interface ConvertedFields {
  readonly canonicalName: string;
  readonly structure?: StructureRep;
  readonly formula?: string;
  /** Species `notes` (from `properties`). */
  readonly notes?: string;
  /** Class `description` (from `properties`). */
  readonly description?: string;
  readonly acidBaseNotes?: string;
  readonly aromaticity?: NonNullable<Species['aromaticity']>;
  readonly stereo?: NonNullable<Species['stereo']>;
  readonly studyNotes?: string;
  /** Class `generic.formulaText` (from `genericFormula`). */
  readonly formulaText?: string;
  /** Class `generic.generalFormula` (from a hub `formula` that differs from its `genericFormula`, step 3.10 review). */
  readonly generalFormula?: string;
  readonly tags: string[];
  /** `node: false`: an `entity_display { showAsNode: 'never' }` is created. */
  readonly neverNode: boolean;
}

const isEmpty = (value: unknown): boolean => value === undefined || value === '' || value === null;
const valid = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): value is string => typeof value === 'string' && schema.safeParse(value).success;

/**
 * Reads one legacy field that goes to one text field: `stored` when it fits `schema`, nothing when empty; otherwise the value is kept
 * in `unmapped` with `reasonWhenKept` (when given: some kept values need no decision).
 */
export function take(scope: CompoundScope, path: readonly string[], value: unknown, schema: Parameters<typeof valid>[0], reasonWhenKept?: string): string | undefined {
  if (isEmpty(value)) {
    if (value !== undefined) scope.consume(path, value);
    return undefined;
  }
  if (valid(schema, value)) {
    scope.consume(path, value);
    return value;
  }
  scope.keep(path, value);
  scope.reason(reasonWhenKept ?? `${path.join('.')} cannot be stored (${typeof value === 'string' ? 'too long or has control characters' : `it is ${typeof value}`}); kept in legacy.unmapped`);
  return undefined;
}

/** A field the target record kind has no place for: kept whole (consumed when empty). `reason` only when a person must decide. */
export function keepOnly(scope: CompoundScope, path: readonly string[], value: unknown, reason?: string): void {
  if (isEmpty(value)) {
    if (value !== undefined) scope.consume(path, value);
    return;
  }
  scope.keep(path, value);
  if (reason !== undefined) scope.reason(reason);
}

export function tagsOf(scope: CompoundScope, value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    keepOnly(scope, ['tags'], value, `tags is not a list (${excerpt(value)}); kept in legacy.unmapped`);
    return [];
  }
  const stored: string[] = [];
  const overflow: unknown[] = [];
  value.forEach((tag, index) => {
    if (valid(TagSchema, tag) && stored.length < LIMITS.tags) {
      stored.push(tag);
      scope.consume(['tags', index], tag);
    } else overflow.push(tag);
  });
  if (overflow.length > 0) {
    scope.keep(['tags'], overflow);
    scope.reason(`${overflow.length} tag(s) cannot be stored (over ${LIMITS.tag} characters, blank, with control characters, or beyond ${LIMITS.tags} tags); kept in legacy.unmapped`);
  }
  return stored;
}

/** The name the record gets: the legacy name when the schema accepts it as it stands, else a numbered placeholder. Pure. */
export function canonicalNameOf(compound: LegacyObject, position: number): string {
  return valid(NameTextSchema, compound.name) ? compound.name : `Unnamed legacy compound #${position}`;
}

/** `kind`: the ORN record the compound becomes. `position`: 1-based place in the file (for the name of a nameless compound). */
export function convertFields(compound: LegacyObject, kind: 'species' | 'class', position: number, scope: CompoundScope): ConvertedFields {
  const isClass = kind === 'class';
  const canonicalName = canonicalNameOf(compound, position);
  if (valid(NameTextSchema, compound.name)) scope.consume(['name'], compound.name);
  else if (isEmpty(compound.name)) {
    if (compound.name !== undefined) scope.consume(['name'], compound.name);
    scope.reason('the compound has no name; a placeholder name was used');
  } else {
    scope.keep(['name'], compound.name);
    scope.reason(`name cannot be stored (${typeof compound.name === 'string' ? 'too long or has control characters' : `it is ${typeof compound.name}`}); kept in legacy.unmapped, a placeholder name was used`);
  }

  let structure: StructureRep | undefined;
  if (isClass) {
    keepOnly(scope, ['smiles'], compound.smiles, 'representative SMILES not used; add an example species if intended');
  } else if (!isEmpty(compound.smiles) && typeof compound.smiles === 'string' && StructureRepSchema.safeParse({ format: 'smiles', value: compound.smiles }).success) {
    structure = { format: 'smiles', value: compound.smiles };
    scope.consume(['smiles'], compound.smiles);
  } else keepOnly(scope, ['smiles'], compound.smiles, `smiles cannot be stored as a structure (${excerpt(compound.smiles)}); kept in legacy.unmapped`);

  const formula = isClass ? undefined : take(scope, ['formula'], compound.formula, LabelTextSchema);
  let generalFormula: string | undefined;
  if (isClass) {
    // A hub's `formula` that is not just its `genericFormula` again (the demo: CnH2n+2 next to R-notation) is the series' general
    // formula; compared exactly as stored. It needs a person's eye. Equal to `genericFormula`: nothing new, kept in unmapped, no review.
    const legacy = compound.formula;
    if (isEmpty(legacy) || legacy === compound.genericFormula) keepOnly(scope, ['formula'], legacy);
    else if (valid(LabelTextSchema, legacy)) {
      generalFormula = legacy;
      scope.consume(['formula'], legacy);
      scope.reason('general formula taken from the legacy hub formula; check it');
    } else keepOnly(scope, ['formula'], legacy, `formula cannot be stored as a general formula (${excerpt(legacy)}); kept in legacy.unmapped`);
  }
  const properties = take(scope, ['properties'], compound.properties, RichTextSchema);
  let acidBaseNotes: string | undefined;
  if (isClass) keepOnly(scope, ['acidBase'], compound.acidBase);
  else acidBaseNotes = take(scope, ['acidBase'], compound.acidBase, RichTextSchema);

  let aromaticity: ConvertedFields['aromaticity'];
  const aromatic = compound.aromaticity;
  if (typeof aromatic === 'string' && Object.hasOwn(AROMATICITY_OF, aromatic)) {
    if (isClass) keepOnly(scope, ['aromaticity'], aromatic);
    else {
      aromaticity = AROMATICITY_OF[aromatic];
      scope.consume(['aromaticity'], aromatic);
    }
  } else keepOnly(scope, ['aromaticity'], aromatic, `aromaticity ${excerpt(aromatic)} is not exactly aromatic, non-aromatic or antiaromatic; kept in legacy.unmapped`);

  let stereo: ConvertedFields['stereo'];
  if (!isEmpty(compound.stereo)) {
    if (!isClass && valid(RichTextSchema, compound.stereo)) {
      stereo = { kind: 'unspecified', descriptors: [], note: compound.stereo };
      scope.consume(['stereo'], compound.stereo);
    } else scope.keep(['stereo'], compound.stereo);
    scope.reason(`stereo text ${excerpt(compound.stereo)} was not interpreted (kind unspecified); ${stereo === undefined ? 'kept in legacy.unmapped' : 'the text is the note'}`);
  } else keepOnly(scope, ['stereo'], compound.stereo);

  let studyNotes: string | undefined;
  const jee = compound.jee;
  if (isObj(jee) && !Array.isArray(jee)) {
    keepOnly(scope, ['jee', 'level'], jee.level);
    studyNotes = take(scope, ['jee', 'notes'], jee.notes, RichTextSchema);
    const unknown = Object.keys(jee).filter((key) => key !== 'level' && key !== 'notes');
    for (const key of unknown) scope.keep(['jee', key], jee[key]);
    if (unknown.length > 0) scope.reason(`unknown legacy field(s) in jee kept in legacy.unmapped: ${unknown.map((key) => excerpt(key, 30)).join(', ')}`);
  } else keepOnly(scope, ['jee'], jee, `jee is not an object (${excerpt(jee)}); kept in legacy.unmapped`);

  const formulaText = isClass ? take(scope, ['genericFormula'], compound.genericFormula, LabelTextSchema) : undefined;
  if (!isClass) keepOnly(scope, ['genericFormula'], compound.genericFormula);

  if (compound.node !== undefined) scope.consume(['node'], compound.node);
  const nodeType = compound.nodeType;
  if (nodeType === 'branched' || nodeType === 'sub') scope.keep(['nodeType'], nodeType);
  else if (nodeType !== undefined) scope.consume(['nodeType'], nodeType);

  return {
    canonicalName,
    ...(structure === undefined ? {} : { structure }),
    ...(formula === undefined ? {} : { formula }),
    ...(properties === undefined ? {} : isClass ? { description: properties } : { notes: properties }),
    ...(acidBaseNotes === undefined ? {} : { acidBaseNotes }),
    ...(aromaticity === undefined ? {} : { aromaticity }),
    ...(stereo === undefined ? {} : { stereo }),
    ...(studyNotes === undefined ? {} : { studyNotes }),
    ...(formulaText === undefined ? {} : { formulaText }),
    ...(generalFormula === undefined ? {} : { generalFormula }),
    tags: tagsOf(scope, compound.tags),
    neverNode: compound.node === false,
  };
}
