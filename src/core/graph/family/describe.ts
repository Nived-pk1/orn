/**
 * Plain-text names and formulas of records for the family study (step 5.5b). Presentation text only: no chemistry is decided here.
 * Read from the state the study is given; a record that is gone is written by its ID.
 */
import type { CanonicalState, RecordRef } from '../../schema';

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
  return { describe, describeForArrow };
}
