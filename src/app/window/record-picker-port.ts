/**
 * The record pickers' port (step 6.2b decision D4, from the Classes section's port of 6.2a), made from the search service, the canonical
 * state, the indexes and the active exam. Records are found by name through the search engine; each choice carries its kind and its scope
 * in words (the scope of the chosen exam version, or empty when no exam is chosen). It also answers the two cycle questions a picker asks before
 * Save (a class parent, a reagent component) through the core's guards, in words. Derived at the moment it is asked; nothing is stored.
 * No chemistry.
 */
import type { PickKind, RecordChoice, RecordPickerPort } from '@/features/workbench';
import { classParentGuard, reagentComponentGuard } from '@/core/editing';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import { createScopeOf } from '@/core/graph/scope';
import type { CanonicalState, ChemicalClass } from '@/core/schema';
import type { SearchService } from '@/workers/search';
import type { ActiveExam } from '@/ui/state';

export interface RecordPickerDeps {
  readonly search: SearchService['search'];
  readonly state: () => CanonicalState;
  readonly indexes: () => ReadonlyIndexes;
  readonly activeExam: () => ActiveExam | null;
}

const CLASS_KIND_WORDS: Readonly<Record<ChemicalClass['classKind'], string>> = {
  compound_class: 'compound class',
  functional_group: 'functional group',
  structural_family: 'structural family',
  homologous_series: 'homologous series',
  reagent_family: 'reagent family',
};
const SCOPE_WORDS = { official: 'in the syllabus', prerequisite: 'prerequisite', enrichment: 'enrichment', outside: 'outside the syllabus', unmapped: 'not mapped to the syllabus' } as const;

export const PICKER_CHANNEL = 'record-picker';

export function createRecordPicker(deps: RecordPickerDeps): RecordPickerPort {
  const describe = (kind: PickKind, id: string): RecordChoice | undefined => {
    const table = deps.state().records[kind] as Readonly<Record<string, { readonly id: string; readonly names?: { readonly canonical: string }; readonly name?: string; readonly scope?: 'generic' | 'specific'; readonly classKind?: ChemicalClass['classKind']; readonly speciesKind?: string }>>;
    const record = Object.hasOwn(table, id) ? table[id] : undefined;
    if (record === undefined) return undefined;
    const exam = deps.activeExam();
    const scope = exam === null ? '' : SCOPE_WORDS[createScopeOf(deps.indexes(), exam.examId, exam.examVersionId)({ kind, id: record.id } as never)];
    const reactionScope = kind === 'reaction' ? record.scope : undefined;
    const kindWords = kind === 'reaction' ? `${reactionScope ?? ''} reaction`.trim() : kind === 'class' ? CLASS_KIND_WORDS[record.classKind as ChemicalClass['classKind']] : kind === 'species' ? (record.speciesKind === undefined || record.speciesKind === 'unspecified' ? 'species' : record.speciesKind.replace(/_/g, ' ')) : 'reagent';
    return { kind, id: record.id, name: kind === 'reaction' ? (record.name ?? record.id) : (record.names?.canonical ?? record.id), kindWords, scope, ...(reactionScope === undefined ? {} : { reactionScope }) };
  };
  const nameOf = (kind: PickKind, id: string): string => describe(kind, id)?.name ?? id;
  return {
    describe,
    async search(kinds, text) {
      const answer = await deps.search(`${PICKER_CHANNEL}:${kinds.join(',')}`, { text, kinds: [...kinds], limit: 10 });
      if (!answer.ok) return [];
      return answer.value.flatMap((hit) => {
        const choice = describe(hit.ref.kind as PickKind, hit.ref.id);
        return choice === undefined ? [] : [choice];
      });
    },
    parentRefusal(owner, candidate) {
      const why = classParentGuard(deps.indexes(), owner)(candidate);
      if (why === undefined) return undefined;
      return why === 'self' ? 'A class cannot be its own parent.' : `${nameOf('class', candidate)} is already below this class, so it cannot be its parent: that would make a cycle.`;
    },
    componentRefusal(owner, candidate) {
      if (candidate.kind !== 'reagent') return undefined; // only a reagent can close a cycle of compositions
      const why = reagentComponentGuard(deps.indexes(), owner)(candidate.id);
      if (why === undefined) return undefined;
      if (why === 'self') return 'A reagent cannot be a component of itself.';
      if (why === 'unchecked') return 'The composition is too large to check, so no reagent can be chosen here.';
      return `${nameOf('reagent', candidate.id)} is already built from this reagent, so it cannot be one of its components: that would make a cycle.`;
    },
    profilesOf(reagentId) {
      const reagent = deps.state().records.reagent[reagentId as never];
      return reagent === undefined ? [] : reagent.profiles.map((profile) => ({ id: profile.id, label: profile.label }));
    },
    isMapFamily: (classId) => deps.indexes().referrersOf(classId).some((r) => r.owner.kind === 'navigator_anchor' && r.path === 'target'),
  };
}
