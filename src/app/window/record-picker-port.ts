/**
 * The record pickers' port (step 6.2b decision D4, from the Classes section's port of 6.2a), made from the search service, the canonical
 * state, the indexes and the active exam. Records are found by name through the search engine; each choice carries its kind and its scope
 * in words (the scope of the chosen exam version, or empty when no exam is chosen). It also answers the two cycle questions a picker asks before
 * Save (a class parent, a reagent component) through the core's guards, in words. Derived at the moment it is asked; nothing is stored.
 * No chemistry.
 */
import { createCurriculumPort } from './curriculum-picker-port';
import type { ParentKind, PickKind, RecordChoice, RecordPickerPort } from '@/features/workbench';
import { hierarchyParentGuard, reagentComponentGuard } from '@/core/editing';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import { createScopeOf } from '@/core/graph/scope';
import { RELATIONSHIP_TYPE_SPECS, type CanonicalState, type ChemicalClass } from '@/core/schema';
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

/** Most relationships listed for one record (a record with more says so by the cap, not by a wall of rows). */
export const MAX_RELATIONSHIP_LINES = 50;
const DESCRIBED = new Set(['species', 'class', 'reagent', 'reaction', 'mechanism', 'concept', 'reference', 'named_reaction', 'transformation', 'caveat', 'route']);

export function createRecordPicker(deps: RecordPickerDeps): RecordPickerPort {
  const describe = (kind: PickKind, id: string): RecordChoice | undefined => {
    const table = deps.state().records[kind] as Readonly<Record<string, { readonly id: string; readonly names?: { readonly canonical: string }; readonly name?: string; readonly scope?: 'generic' | 'specific'; readonly classKind?: ChemicalClass['classKind']; readonly speciesKind?: string; readonly conceptKind?: string; readonly title?: string; readonly caveatKind?: string; readonly refKind?: string; readonly year?: number }>>;
    const record = Object.hasOwn(table, id) ? table[id] : undefined;
    if (record === undefined) return undefined;
    if (kind === 'concept') return { kind, id: record.id, name: record.name ?? record.id, kindWords: String(record.conceptKind ?? 'concept').replace(/_/g, ' '), scope: '', ...(record.conceptKind === undefined ? {} : { conceptKind: record.conceptKind }) };
    if (kind === 'named_reaction' || kind === 'transformation') return { kind, id: record.id, name: record.name ?? record.id, kindWords: kind.replace(/_/g, ' '), scope: '' };
    if (kind === 'route') return { kind, id: record.id, name: record.name ?? record.id, kindWords: 'route', scope: '' };
    if (kind === 'caveat') return { kind, id: record.id, name: record.title ?? record.id, kindWords: String(record.caveatKind ?? 'caveat').replace(/_/g, ' '), scope: '' };
    if (kind === 'reference') return { kind, id: record.id, name: record.title ?? record.id, kindWords: [String(record.refKind ?? 'source').replace(/_/g, ' '), record.year].filter((part) => part !== undefined).join(', '), scope: '' };
    const exam = deps.activeExam();
    const scope = exam === null ? '' : SCOPE_WORDS[createScopeOf(deps.indexes(), exam.examId, exam.examVersionId)({ kind, id: record.id } as never)];
    const reactionScope = kind === 'reaction' ? record.scope : undefined;
    const kindWords = kind === 'reaction' ? `${reactionScope ?? ''} reaction`.trim() : kind === 'class' ? CLASS_KIND_WORDS[record.classKind as ChemicalClass['classKind']] : kind === 'species' ? (record.speciesKind === undefined || record.speciesKind === 'unspecified' ? 'species' : record.speciesKind.replace(/_/g, ' ')) : kind === 'mechanism' ? 'mechanism' : 'reagent';
    return { kind, id: record.id, name: kind === 'reaction' || kind === 'mechanism' ? (record.name ?? record.id) : (record.names?.canonical ?? record.id), kindWords, scope, ...(reactionScope === undefined ? {} : { reactionScope }) };
  };
  const nameOf = (kind: PickKind, id: string): string => describe(kind, id)?.name ?? id;
  const curriculum = createCurriculumPort(
    deps.state,
    (kind, id) => (DESCRIBED.has(kind) ? nameOf(kind as PickKind, id) : id),
    (kind, id) => (DESCRIBED.has(kind) ? (describe(kind as PickKind, id)?.kindWords ?? kind) : kind.replace(/_/g, ' ')),
  );
  return {
    ...curriculum,
    describe,
    async search(kinds, text) {
      const answer = await deps.search(`${PICKER_CHANNEL}:${kinds.join(',')}`, { text, kinds: [...kinds], limit: 10 });
      if (!answer.ok) return [];
      return answer.value.flatMap((hit) => {
        const choice = describe(hit.ref.kind as PickKind, hit.ref.id);
        return choice === undefined ? [] : [choice];
      });
    },
    parentRefusal(owner, candidate, kind: ParentKind = 'class') {
      const why = hierarchyParentGuard(deps.indexes(), kind, owner)(candidate);
      if (why === undefined) return undefined;
      const noun = kind.replace(/_/g, ' ');
      const name = kind === 'topic' ? (deps.state().records.topic[candidate as never]?.name ?? candidate) : nameOf(kind, candidate);
      return why === 'self' ? `A ${noun} cannot be its own parent.` : `${name} is already below this ${noun}, so it cannot be its parent: that would make a cycle.`;
    },
    relationshipsOf(ref) {
      const lines: { id: string; words: string }[] = [];
      for (const rel of Object.values(deps.state().records.relationship)) {
        const isFrom = rel.from.kind === ref.kind && rel.from.id === ref.id;
        if (!isFrom && !(rel.to.kind === ref.kind && rel.to.id === ref.id)) continue;
        const spec = RELATIONSHIP_TYPE_SPECS[rel.type];
        const other = isFrom ? rel.to : rel.from;
        const name = DESCRIBED.has(other.kind) ? nameOf(other.kind as PickKind, other.id) : other.id;
        lines.push({ id: rel.id, words: `${isFrom ? spec.label : spec.inverseLabel} ${name}` });
      }
      return lines.sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, MAX_RELATIONSHIP_LINES);
    },
    usedBy(kind, id) {
      const field = kind === 'named_reaction' ? 'namedReactionIds' : 'transformationIds';
      const seen = new Set<string>();
      const users: RecordChoice[] = [];
      for (const referrer of deps.indexes().referrersOf(id)) {
        if (referrer.owner.kind !== 'reaction' || !referrer.path.startsWith(field) || seen.has(referrer.owner.id)) continue;
        seen.add(referrer.owner.id);
        const choice = describe('reaction', referrer.owner.id);
        if (choice !== undefined) users.push(choice);
      }
      return users;
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
    memberOf: (classId, speciesId) => deps.state().records.species[speciesId as never]?.classIds.includes(classId as never) === true,
    count: (kind) => Object.keys(deps.state().records[kind]).length,
    sourceOf(referenceId) {
      const table = deps.state().records.reference;
      const source = Object.hasOwn(table, referenceId) ? table[referenceId as never] : undefined;
      return source === undefined ? undefined : { title: source.title, year: source.year };
    },
    isMapFamily: (classId) => deps.indexes().referrersOf(classId).some((r) => r.owner.kind === 'navigator_anchor' && r.path === 'target'),
  };
}
