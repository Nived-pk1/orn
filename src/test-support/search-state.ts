/**
 * Search test states (step 4.5): a generated dataset (src/test-support/generator.ts) with the curriculum and knowledge records the
 * generator does not make, so exam scope, topics, concepts, aliases and the other indexed kinds are all present. Deterministic.
 * Test-only.
 */
import type { AnyRecord, CanonicalState, RecordKind } from '@/core/schema';
import { indexEngine } from '@/core/indexes/full';
import { buildDocument, documentPortsOf } from '@/search/document';
import type { SearchDocument } from '@/search/contracts';
import { frozenStateOf } from './arbitraries';
import type { GeneratorParams } from './generator';
import { meta } from './demo/kit';

/** Every record id → record, added to the tables of a state. */
export function withRecords(state: CanonicalState, records: readonly AnyRecord[]): CanonicalState {
  const tables: Record<string, Record<string, AnyRecord>> = {};
  for (const kind of Object.keys(state.records)) tables[kind] = { ...(state.records[kind as RecordKind] as Record<string, AnyRecord>) };
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { ...state, records: tables as unknown as CanonicalState['records'] };
}

const topicIdsOf = (state: CanonicalState): string[] => Object.keys(state.records.topic).sort();

/** The generated state plus one exam with two versions, concepts, a named reaction, a prerequisite and the remaining indexed kinds. */
export const searchStateOf = (params: GeneratorParams): CanonicalState => withSearchExtras(frozenStateOf(params));

/** `base` (a generated state with topics and at least one reaction) plus the records of `searchStateOf`. */
export function withSearchExtras(base: CanonicalState): CanonicalState {
  const topics = topicIdsOf(base);
  const reaction = Object.keys(base.records.reaction).sort()[0];
  const coverage = (levels: readonly ('included' | 'partial' | 'excluded')[]) =>
    topics.map((topicId, i) => ({ topicId, coverage: levels[i % levels.length] as 'included' | 'partial' | 'excluded' }));
  const unit = (body: string, levels: readonly ('included' | 'partial' | 'excluded')[]) => ({ id: `unt_s-${body}`, title: `Unit ${body}`, topicCoverage: coverage(levels) });
  const records = [
    { id: 'exm_s-jee', kind: 'exam', name: 'Search exam', ...meta() },
    { id: 'exv_s-2025', kind: 'exam_version', examId: 'exm_s-jee', label: 'v2025', status: 'provisional', units: [unit('a', ['included', 'excluded', 'partial'])], ...meta() },
    { id: 'exv_s-2026', kind: 'exam_version', examId: 'exm_s-jee', label: 'v2026', status: 'provisional', units: [unit('b', ['partial', 'included'])], ...meta() },
    { id: 'cpt_s-sn2', kind: 'concept', name: 'SN2 substitution', aliases: ['bimolecular substitution'], conceptKind: 'mechanism_class', parentIds: [], summary: 'Backside attack, **inversion**.', ...meta() },
    { id: 'cpt_s-resonance', kind: 'concept', name: 'Resonance', aliases: [], conceptKind: 'general', parentIds: [], ...meta() },
    { id: 'cpt_s-inductive', kind: 'concept', name: 'Inductive effect', aliases: ['−I effect'], conceptKind: 'electronic_effect', parentIds: [], ...meta({ lifecycle: 'draft' }) },
    {
      id: 'nrx_s-wk', kind: 'named_reaction', name: 'Wolff–Kishner reduction', aliases: ['Wolff Kishner'], parentIds: [], summary: 'Carbonyl to methylene with hydrazine.',
      conceptIds: [], prerequisiteConceptIds: ['cpt_s-resonance'], ...meta(),
    },
    { id: 'trf_s-ox', kind: 'transformation', name: 'Alcohol to aldehyde', aliases: [], fromClassIds: [], toClassIds: [], conceptIds: [], ...meta() },
    { id: 'ref_s-ncert', kind: 'reference', refKind: 'ncert', title: 'NCERT Chemistry XII', authors: ['NCERT'], ...meta() },
    { id: 'cav_s-mark', kind: 'caveat', caveatKind: 'exception', title: 'Peroxide effect', statement: 'HBr adds **anti**-Markovnikov with peroxides.', targets: [], conceptIds: [], ...meta() },
    { id: 'rte_s-one', kind: 'route', name: 'Two step route', purpose: 'curated', steps: [{ id: 'rst_s-1', reactionId: reaction, inputFromStepIds: [], note: 'first step, with PCC' }], conceptIds: [], ...meta() },
  ] as unknown as AnyRecord[];
  const withMapping: AnyRecord[] = [
    ...(reaction === undefined ? [] : [{ id: 'rel_s-pre', kind: 'relationship', type: 'prerequisite_of', from: { kind: 'concept', id: 'cpt_s-sn2' }, to: { kind: 'reaction', id: reaction }, ...meta() } as unknown as AnyRecord]),
    { id: 'erl_s-1', kind: 'exam_relevance', target: { kind: 'concept', id: 'cpt_s-inductive' }, examId: 'exm_s-jee', examVersionIds: [], scope: 'enrichment', ...meta() } as unknown as AnyRecord,
  ];
  return withRecords(base, [...records, ...withMapping]);
}

/** The documents of a state, built from scratch (the reference the incremental index must equal), sorted by id. */
export function fullDocuments(state: CanonicalState, revision = 0): SearchDocument[] {
  const indexes = indexEngine.build(state, revision);
  const ports = documentPortsOf(state, indexes);
  const docs: SearchDocument[] = [];
  for (const kind of Object.keys(state.records) as RecordKind[]) {
    for (const record of Object.values(state.records[kind] as Record<string, AnyRecord>)) {
      const doc = buildDocument(record, ports);
      if (doc !== undefined) docs.push(doc);
    }
  }
  return docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
