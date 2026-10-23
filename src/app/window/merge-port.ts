/**
 * The merge dialog's port (step 6.8a, D3), made from the store, the indexes and the chem worker. The core (`mergePreview`, `mergeEnvelope`)
 * decides what changes; this adds the one thing it cannot: two species that both have a structure must be the SAME compound (the duplicate
 * check's key, the chem worker's canonical SMILES), else the merge is refused in words. A worker that does not answer is said, never read as
 * "the same". Derived at the moment it is asked; nothing is stored. No chemistry here: the worker decides.
 */
import { speciesRequest } from '@/chem/checks/plan-species';
import { mergeEnvelope, mergePreview, nameOfRef } from '@/core/editing';
import type { CommandEnvelope, CommitResult } from '@/core/commands';
import type { CoreIndexes } from '@/core/indexes/contracts';
import type { AnyRecord, CanonicalState, RecordKind, RecordRef, Species } from '@/core/schema';
import { fold } from '@/core/text/normalizer';
import type { MergePort, MergeView } from '@/features/workbench';
import type { ChemService } from '@/workers/chem';

const MAX_CANDIDATES = 20;
export const DIFFERENT_COMPOUNDS = 'These structures are different compounds';

export interface MergePortDeps {
  readonly state: () => CanonicalState;
  readonly indexes: () => CoreIndexes;
  readonly dispatch: (envelope: CommandEnvelope) => CommitResult;
  readonly chem?: Pick<ChemService, 'checkSpecies'> | undefined;
  readonly now: () => string;
}

const sameStructure = (a: Species, b: Species): boolean => a.structure !== undefined && b.structure !== undefined && a.structure.format === b.structure.format && a.structure.value === b.structure.value;

export function createMergePort(deps: MergePortDeps): MergePort {
  /** Words when two species with structures cannot be merged; undefined when they can. */
  async function structureRefusal(from: AnyRecord, into: RecordRef): Promise<string | undefined> {
    if (from.kind !== 'species' || into.kind !== 'species') return undefined;
    const target = deps.state().records.species[into.id as never] as Species | undefined;
    const a = from as Species;
    if (target === undefined || a.structure === undefined || target.structure === undefined || sameStructure(a, target)) return undefined;
    const requests = [speciesRequest(a), speciesRequest(target)];
    if (deps.chem === undefined || requests.some((request) => request === undefined)) return 'The structures could not be compared here, so they are not merged';
    const call = await deps.chem.checkSpecies(requests.flatMap((request) => (request === undefined ? [] : [request])));
    const [first, second] = call.ok ? call.value.results : [];
    const [x, y] = [first?.canonicalSmiles, second?.canonicalSmiles];
    if (!call.ok || x === undefined || y === undefined) return `The structures could not be compared (${call.ok ? 'the engine could not read one of them' : call.error}), so they are not merged`;
    return x === y ? undefined : DIFFERENT_COMPOUNDS;
  }

  return {
    candidates(kind, text, exceptId) {
      const state = deps.state();
      const table = state.records[kind as RecordKind] as Readonly<Record<string, AnyRecord>>;
      const wanted = fold(text);
      return Object.keys(table)
        .filter((id) => id !== exceptId)
        .sort()
        .map((id) => ({ ref: { kind, id } as RecordRef, name: nameOfRef(state, { kind, id } as RecordRef) }))
        .filter((one) => wanted === '' || fold(one.name).includes(wanted))
        .slice(0, MAX_CANDIDATES);
    },
    async preview(from, into): Promise<MergeView> {
      const record = from as AnyRecord;
      const preview = mergePreview(deps.state(), deps.indexes(), record, into);
      if (!preview.ok) return preview;
      const refusal = await structureRefusal(record, into);
      return refusal === undefined ? preview : { ok: false, message: refusal };
    },
    async run(from, into, picks) {
      const record = from as AnyRecord;
      const refusal = await structureRefusal(record, into);
      if (refusal !== undefined) return { ok: false, message: refusal };
      const built = mergeEnvelope(deps.state(), deps.indexes(), record, into, picks, deps.now());
      if (!built.ok) return { ok: false, message: built.message };
      const result = deps.dispatch(built.envelope);
      return result.ok ? { ok: true } : { ok: false, message: `The merge was refused: ${result.error.message}` };
    },
  };
}
