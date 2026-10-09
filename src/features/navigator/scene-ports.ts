/**
 * The Scene's ports over one state snapshot (step 5.5a, item f): `describe` (name, formula, charge as plain text), `depictionKeyOf` (a species record with a structure, through the depiction binding; step 5.5a part 2). Everything is read from the state it is given;
 * nothing is scanned.
 */
import type { CanonicalState, RecordRef, StructureRep } from '@/core/schema';
import type { ScenePorts } from '@/render/scene';

type Loose = Readonly<Record<string, unknown>>;
type Described = NonNullable<ReturnType<ScenePorts['describe']>>;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

function nameOf(record: Loose): string {
  const names = record.names as Loose | undefined;
  return text(names?.display) ?? text(names?.canonical) ?? text(record.id) ?? '';
}

function formulaOf(record: Loose): string | undefined {
  const generic = record.generic as Loose | undefined;
  return text(record.formula) ?? text(record.formulaText) ?? text(generic?.formulaText) ?? text(generic?.generalFormula);
}

export function createScenePorts(state: CanonicalState, depictionKeyOfStructure?: (structure: StructureRep) => string): ScenePorts {
  const recordOf = (ref: RecordRef): Loose | undefined => (state.records[ref.kind] as Readonly<Record<string, Loose>>)[ref.id];
  const describe: ScenePorts['describe'] = (ref) => {
    const record = recordOf(ref);
    if (record === undefined) return undefined;
    const formula = formulaOf(record);
    const charge = typeof record.charge === 'number' ? record.charge : undefined;
    const described: Described = { name: nameOf(record), ...(formula === undefined ? {} : { formula }), ...(charge === undefined ? {} : { charge }) };
    return described;
  };
  return {
    describe,
    // Only a species record with a structure has a depiction key (a class' generic structure is never drawn here).
    depictionKeyOf(ref) {
      if (depictionKeyOfStructure === undefined || ref.kind !== 'species') return undefined;
      const structure = state.records.species[ref.id]?.structure;
      return structure === undefined ? undefined : depictionKeyOfStructure(structure);
    },
    // The overview is calm (ADR-037): no arrow text; the family page writes it, from core (`familyStudy`).
    arrowTextOf: () => undefined,
  };
}
