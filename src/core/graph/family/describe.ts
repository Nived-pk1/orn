/**
 * Plain-text names and formulas of records for the family study (step 5.5b). Presentation text only: no chemistry is decided here.
 * Read from the state the study is given; a record that is gone is written by its ID.
 */
import type { CanonicalState, RecordRef, StructureRep } from '../../schema';
import type { TermSubstance } from '../equation-term';

type Loose = Readonly<Record<string, unknown>>;
type Described = { readonly name: string; readonly formula?: string };

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

function nameOf(record: Loose): string {
  const names = record.names as Loose | undefined;
  return text(names?.display) ?? text(names?.canonical) ?? text(record.name) ?? text(record.id) ?? '';
}

function formulaOf(record: Loose): string | undefined {
  const generic = record.generic as Loose | undefined;
  return text(record.formula) ?? text(record.formulaText) ?? text(generic?.formulaText) ?? text(generic?.generalFormula);
}

export interface RecordDescriber {
  /** Name and formula as plain text; undefined when the record is gone. */
  describe(ref: RecordRef): Described | undefined;
  /** Same, but a reagent has a formula only when it is exactly one species (the arrow-text rule). */
  describeForArrow(ref: RecordRef): Described | undefined;
  /** What the textbook equation needs of a term (equation step, part 5): name, structure, entered formula, charge; `missing` when the record is gone. */
  substanceOf(ref: RecordRef): TermSubstance;
}

export function createDescriber(state: CanonicalState): RecordDescriber {
  const recordOf = (ref: RecordRef): Loose | undefined => (state.records[ref.kind] as Readonly<Record<string, Loose>>)[ref.id];
  const describe = (ref: RecordRef): Described | undefined => {
    const record = recordOf(ref);
    if (record === undefined) return undefined;
    const formula = formulaOf(record);
    return { name: nameOf(record), ...(formula === undefined ? {} : { formula }) };
  };
  const describeForArrow = (ref: RecordRef): Described | undefined => {
    if (ref.kind !== 'reagent') return describe(ref);
    const reagent = recordOf(ref);
    if (reagent === undefined) return undefined;
    const speciesId = text(reagent.speciesId);
    const species = speciesId === undefined ? undefined : recordOf({ kind: 'species', id: speciesId } as RecordRef);
    const formula = species === undefined ? undefined : formulaOf(species);
    return { name: nameOf(reagent), ...(formula === undefined ? {} : { formula }) };
  };
  const structureOf = (value: unknown): StructureRep | undefined =>
    typeof value === 'object' && value !== null && typeof (value as Loose).value === 'string' && typeof (value as Loose).format === 'string' ? (value as StructureRep) : undefined;
  const substanceOf = (ref: RecordRef): TermSubstance => {
    const record = recordOf(ref);
    if (record === undefined) return { kind: 'missing', name: ref.id };
    const name = nameOf(record);
    if (ref.kind === 'class') {
      const generic = record.generic as Loose | undefined;
      const structure = structureOf(generic?.structure);
      const formula = text(generic?.formulaText) ?? text(generic?.generalFormula);
      return { kind: 'class', name, ...(structure === undefined ? {} : { structure }), ...(formula === undefined ? {} : { formula }) };
    }
    // a species, or a reagent by its species (a reagent that is not one species has nothing but its name)
    const speciesId = ref.kind === 'reagent' ? text(record.speciesId) : undefined;
    const speciesRecord = ref.kind === 'reagent' ? (speciesId === undefined ? undefined : recordOf({ kind: 'species', id: speciesId } as RecordRef)) : record;
    const kind = ref.kind === 'reagent' ? 'reagent' : 'species';
    if (speciesRecord === undefined) return { kind, name };
    const structure = structureOf(speciesRecord.structure);
    const formula = text(speciesRecord.formula);
    const charge = typeof speciesRecord.charge === 'number' ? speciesRecord.charge : undefined;
    return { kind, name, ...(structure === undefined ? {} : { structure }), ...(formula === undefined ? {} : { formula }), ...(charge === undefined ? {} : { charge }) };
  };
  return { describe, describeForArrow, substanceOf };
}
