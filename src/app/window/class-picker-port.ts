/**
 * The Classes section's port (step 6.2a part 4), made from the search service, the canonical state and the active exam. Classes are found
 * by name through the search engine; each choice carries its kind and its scope in words (the scope of the chosen exam version, or "no exam
 * chosen"). Derived at the moment it is asked; nothing is stored. No chemistry.
 */
import type { ClassChoice, ClassPickerPort } from '@/features/workbench';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import { createScopeOf } from '@/core/graph/scope';
import type { CanonicalState, ChemicalClass } from '@/core/schema';
import type { SearchService } from '@/workers/search';
import type { ActiveExam } from '@/ui/state';

export interface ClassPickerDeps {
  readonly search: SearchService['search'];
  readonly state: () => CanonicalState;
  readonly indexes: () => ReadonlyIndexes;
  readonly activeExam: () => ActiveExam | null;
}

const KIND_WORDS: Readonly<Record<ChemicalClass['classKind'], string>> = {
  compound_class: 'compound class',
  functional_group: 'functional group',
  structural_family: 'structural family',
  homologous_series: 'homologous series',
  reagent_family: 'reagent family',
};
const SCOPE_WORDS = { official: 'in the syllabus', prerequisite: 'prerequisite', enrichment: 'enrichment', outside: 'outside the syllabus', unmapped: 'not mapped to the syllabus' } as const;

export const PICKER_CHANNEL = 'class-picker';

export function createClassPicker(deps: ClassPickerDeps): ClassPickerPort {
  const describe = (id: string): ClassChoice | undefined => {
    const table = deps.state().records.class;
    const record = Object.hasOwn(table, id) ? table[id] : undefined;
    if (record === undefined) return undefined;
    const exam = deps.activeExam();
    const scope = exam === null ? 'no exam chosen' : SCOPE_WORDS[createScopeOf(deps.indexes(), exam.examId, exam.examVersionId)({ kind: 'class', id: record.id })];
    return { id: record.id, name: record.names.canonical, kind: KIND_WORDS[record.classKind], scope };
  };
  return {
    describe,
    async search(text) {
      const answer = await deps.search(PICKER_CHANNEL, { text, kinds: ['class'], limit: 10 });
      if (!answer.ok) return [];
      return answer.value.flatMap((hit) => {
        const choice = describe(hit.ref.id);
        return choice === undefined ? [] : [choice];
      });
    },
  };
}
