/**
 * The duplicate check on Save (step 6.2a part 5, decision D4; classes and reagents in step 6.2b part 4, decision D6): after L1 passes and before the store's gate, the records the
 * draft may repeat. By NAME: the same folded canonical name with equal folded qualifiers (the rule SPC-001 uses, `sameNameRecords`). By
 * STRUCTURE: the same canonical structure (the chem worker's canonical SMILES of the draft, read against the L4 service's derived groups,
 * `speciesWithCanonical`). The record itself is never a match. A chem worker that cannot answer is said (`structureChecked: false`), never
 * a clean answer. A CLASS is compared by name only; a REAGENT by name and by the same backing species (`speciesId`, read from the reverse
 * references). Advice only: nothing here changes data and the store's gate still runs. No chemistry: the worker decides.
 */
import { speciesRequest } from '@/chem/checks/plan-species';
import type { CoreIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, ChemicalClass, Reagent, RecordRef, Reference, Species, StructureRep } from '@/core/schema';
import { sourceDuplicates } from './source-duplicates';
import { parseRecord, sameNameRecords } from '@/core/validation';
import type { DuplicateCheckPort, DuplicateMatch, DuplicateOutcome } from '@/features/workbench';
import type { ChemService, L4Service } from '@/workers/chem';

export interface DuplicateCheckOptions {
  readonly state: () => CanonicalState;
  readonly indexes: () => CoreIndexes;
  readonly chem: Pick<ChemService, 'checkSpecies'>;
  readonly l4: Pick<L4Service, 'speciesWithCanonical' | 'flush'>;
}

/** The most matches listed (a dataset full of twins says so by the count, not by a wall of rows). */
export const MAX_DUPLICATE_MATCHES = 10;

const NOT_CHECKED = 'Structure duplicates could not be checked';

export function createDuplicateCheck(options: DuplicateCheckOptions): DuplicateCheckPort {
  return {
    async check(kind, draft): Promise<DuplicateOutcome> {
      if (kind === 'reference') {
        const parsedSource = parseRecord('reference', draft);
        return parsedSource.ok ? sourceDuplicates(options.state(), parsedSource.record as Reference) : { matches: [], more: 0, structureChecked: true };
      }
      if (kind === 'class' || kind === 'reagent') return namedCheck(options, kind, draft);
      if (kind !== 'species') return { matches: [], more: 0, structureChecked: true };
      const parsed = parseRecord('species', draft);
      if (!parsed.ok) return { matches: [], more: 0, structureChecked: true };
      const species = parsed.record as Species;
      const state = options.state();
      const found = new Map<string, { record: Species; reasons: Set<'name' | 'structure'> }>();
      const note = (record: Species, reason: 'name' | 'structure'): void => {
        if (record.id === species.id) return;
        const entry = found.get(record.id) ?? { record, reasons: new Set() };
        entry.reasons.add(reason);
        found.set(record.id, entry);
      };
      for (const twin of sameNameRecords(species, { state, indexes: options.indexes() }, 'species')) if (twin.kind === 'species') note(twin, 'name');

      let structureChecked = true;
      let message: string | undefined;
      const request = speciesRequest(species);
      if (request !== undefined) {
        const call = await options.chem.checkSpecies([request]);
        const result = call.ok ? call.value.results[0] : undefined;
        if (!call.ok || result === undefined || result.status.state === 'not_checked') {
          structureChecked = false;
          message = `${NOT_CHECKED}: ${!call.ok ? call.error : result?.status.state === 'not_checked' ? result.status.message : 'the chemistry engine gave no answer'}`;
        } else if (result.canonicalSmiles !== undefined) {
          await options.l4.flush(); // the groups are as current as the checks can make them
          for (const id of options.l4.speciesWithCanonical(result.canonicalSmiles)) {
            const record = Object.hasOwn(state.records.species, id) ? state.records.species[id] : undefined;
            if (record !== undefined) note(record, 'structure');
          }
        }
        // an unreadable structure has no canonical form: CHEM-001 says so, and it matches nothing
      }
      const all = [...found.values()].sort((a, b) => (a.record.id < b.record.id ? -1 : 1));
      const matches: DuplicateMatch[] = all.slice(0, MAX_DUPLICATE_MATCHES).map(({ record, reasons }) => ({
        ref: { kind: 'species', id: record.id } satisfies RecordRef,
        name: record.names.canonical,
        ...(record.names.qualifier === undefined ? {} : { qualifier: record.names.qualifier }),
        ...(record.formula === undefined ? {} : { formula: record.formula }),
        ...(record.structure === undefined ? {} : { structure: record.structure satisfies StructureRep }),
        reasons: [...reasons].sort(),
      }));
      return { matches, more: Math.max(0, all.length - matches.length), structureChecked, ...(message === undefined ? {} : { message }) };
    },
  };
}

const NONE: DuplicateOutcome = { matches: [], more: 0, structureChecked: true };

/** Classes and reagents (decision D6): by folded name with equal qualifiers; a reagent also by the same backing species. No chemistry, so `structureChecked` is true. */
function namedCheck(options: DuplicateCheckOptions, kind: 'class' | 'reagent', draft: unknown): DuplicateOutcome {
  const parsed = parseRecord(kind, draft);
  if (!parsed.ok) return NONE; // L1 first
  const record = parsed.record as ChemicalClass | Reagent;
  const state = options.state();
  const indexes = options.indexes();
  const found = new Map<string, { record: ChemicalClass | Reagent; reasons: Set<'name' | 'species'> }>();
  const note = (other: ChemicalClass | Reagent, reason: 'name' | 'species'): void => {
    if (other.id === record.id) return;
    const entry = found.get(other.id) ?? { record: other, reasons: new Set() };
    entry.reasons.add(reason);
    found.set(other.id, entry);
  };
  for (const twin of sameNameRecords(record, { state, indexes }, kind)) if (twin.kind === kind) note(twin as ChemicalClass | Reagent, 'name');
  if (record.kind === 'reagent' && record.speciesId !== undefined) {
    for (const referrer of indexes.referrersOf(record.speciesId)) {
      if (referrer.owner.kind !== 'reagent' || referrer.path !== 'speciesId') continue;
      const other = Object.hasOwn(state.records.reagent, referrer.owner.id) ? state.records.reagent[referrer.owner.id] : undefined;
      if (other !== undefined) note(other, 'species');
    }
  }
  const all = [...found.values()].sort((a, b) => (a.record.id < b.record.id ? -1 : 1));
  const matches: DuplicateMatch[] = all.slice(0, MAX_DUPLICATE_MATCHES).map(({ record: other, reasons }) => {
    const formula = other.kind === 'class' ? other.generic?.formulaText : other.formulaText;
    return {
      ref: { kind: other.kind, id: other.id } as RecordRef,
      name: other.names.canonical,
      ...(other.names.qualifier === undefined ? {} : { qualifier: other.names.qualifier }),
      ...(formula === undefined ? {} : { formula }),
      reasons: [...reasons].sort(),
    };
  });
  return { matches, more: Math.max(0, all.length - matches.length), structureChecked: true };
}
