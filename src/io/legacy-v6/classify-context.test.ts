/**
 * Step 3.11b: matching against the LIVE dataset (`LegacyMatchContext`): concepts, named reactions and topics are reused when a context
 * record has the folded name or alias; exams are matched and NEVER created; the context is read-only plain data, optional, and the
 * output depends on it only through what it lists. Hand-made contexts, and one built from data/seed/demo.orn.json.
 */
import { describe, expect, it } from 'vitest';
import { fold } from '@/core/text';
import type { Reaction } from '@/core/schema';
import { demoContext, demoRecords, mapClassified, type ClassifiedAll } from '@/test-support/legacy-classify-kit';
import { legacyFixture } from '@/test-support/legacy-kit';
import { createMatchIndex, EMPTY_MATCH_CONTEXT, matchContextFromRecords, type LegacyMatchContext, type MatchRecord } from './match-context';

const part = (role: string, ref: string, extra: Record<string, unknown> = {}) => ({ ref, label: '', role, major: false, note: '', image: '', ...extra });
const rx = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Reaction ${id}`, participants: [part('substrate', 'c1'), part('product', 'c2', { major: true })], ...extra });
const COMPOUNDS = [{ id: 'c1', name: 'Ethene' }, { id: 'c2', name: 'Ethane' }];
const run = (reactions: unknown[], context?: LegacyMatchContext) => mapClassified({ schemaVersion: 5, compounds: COMPOUNDS, reactions }, context === undefined ? {} : { context });
const reactionOf = (all: ClassifiedAll, n = 0): Reaction => all.classification.records.reaction[n] as Reaction;
const reasonsOf = (r: Reaction): string[] => [...r.review.reasons];
const unmappedOf = (r: Reaction): Record<string, unknown> => (r.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;

const concept = (id: string, conceptKind: MatchRecord['conceptKind'], ...names: string[]): MatchRecord => ({ id, kind: 'concept', names: names.map(fold), ...(conceptKind === undefined ? {} : { conceptKind }) });
const named = (id: string, ...names: string[]): MatchRecord => ({ id, kind: 'named_reaction', names: names.map(fold) });
const topic = (id: string, parentId: string | undefined, ...names: string[]): MatchRecord => ({ id, kind: 'topic', names: names.map(fold), ...(parentId === undefined ? {} : { parentId }) });
const exam = (id: string, name: string): MatchRecord => ({ id, kind: 'exam', names: [fold(name)] });
const context = (...records: MatchRecord[]): LegacyMatchContext => ({ records });

describe('the context is optional and defaults to empty', () => {
  it('no context, the empty context and a context that lists nothing that matches give identical records and reports', async () => {
    const reactions = [rx('r1', { reactionType: 'addition', namedReaction: 'Grignard reaction', chapter: 'Hydrocarbons', jee: { relevance: 'both', concepts: ['x'] } })];
    const none = await run(reactions);
    const empty = await run(reactions, EMPTY_MATCH_CONTEXT);
    const unrelated = await run(reactions, context(concept('cpt_other', 'general', 'unrelated'), topic('top_other', undefined, 'other'), exam('exm_other', 'Some Exam')));
    expect(JSON.stringify(empty.classification)).toBe(JSON.stringify(none.classification));
    expect(JSON.stringify(unrelated.classification)).toBe(JSON.stringify(none.classification));
  });

  it('the mapper never writes to the context (deep-frozen, and the same object gives the same output twice)', async () => {
    const ctx = context(concept('cpt_add', 'reaction_type', 'Addition'), topic('top_hc', 'top_org', 'Hydrocarbons'), named('nrx_g', 'Grignard reaction'), exam('exm_main', 'JEE Main'));
    for (const record of ctx.records) Object.freeze(record.names);
    Object.freeze(ctx.records);
    for (const record of ctx.records) Object.freeze(record);
    Object.freeze(ctx);
    const reactions = [rx('r1', { reactionType: 'addition', namedReaction: 'grignard reaction', chapter: 'hydrocarbons', jee: { relevance: 'main' } })];
    const a = await run(reactions, ctx);
    const b = await run(reactions, ctx);
    expect(JSON.stringify(a.classification)).toBe(JSON.stringify(b.classification));
  });
});

describe('concepts', () => {
  it('a dataset concept of the same kind is reused by folded name and by alias; nothing is created', async () => {
    const ctx = context(concept('cpt_add', 'reaction_type', 'Addition', 'Addn'), concept('cpt_ade', 'mechanism_class', 'Electrophilic addition (AdE)', 'AdE'), concept('cpt_fam', 'reaction_family', 'Named family'));
    const all = await run([rx('r1', { reactionType: 'ADDITION', mechanism: { type: 'ade', summary: '' }, reactionFamily: 'named  family' }), rx('r2', { reactionType: 'addn' })], ctx);
    const [r1, r2] = all.classification.records.reaction as [Reaction, Reaction];
    expect(all.classification.records.concept).toEqual([]);
    expect(r1.reactionTypes).toEqual([{ conceptId: 'cpt_add', certainty: 'definite' }]);
    expect(r1.mechanismClasses).toEqual([{ conceptId: 'cpt_ade', certainty: 'probable' }]);
    expect(r1.conceptIds).toEqual(['cpt_fam']);
    expect(r2.reactionTypes).toEqual([{ conceptId: 'cpt_add', certainty: 'definite' }]);
    expect(reasonsOf(r1)).toEqual([]);
    expect(all.classification.report.createdCounts.concept).toBeUndefined();
  });

  it('a concept of ANOTHER kind is not reused for a kind-specific role: a new one is created and says why', async () => {
    const all = await run([rx('r1', { mechanism: { type: 'Substitution', summary: '' } })], context(concept('cpt_sub', 'reaction_type', 'Substitution')));
    const [created, ...others] = all.classification.records.concept;
    expect(others).toEqual([]);
    expect(created).toMatchObject({ name: 'Substitution', conceptKind: 'mechanism_class' });
    expect(created?.id).not.toBe('cpt_sub');
    expect(created?.review.reasons.some((r) => r.includes('of another kind (reaction_type)'))).toBe(true);
    expect(reactionOf(all).mechanismClasses).toEqual([{ conceptId: created?.id, certainty: 'probable' }]);
  });

  it('the general kind (prerequisites, concepts) reuses a dataset concept of any kind', async () => {
    const all = await run([rx('r1', { jee: { prerequisites: ['carbocation stability'], concepts: ['Markovnikov rule'] } })], context(concept('cpt_stab', 'stability', 'Carbocation stability'), concept('cpt_rule', 'rule', 'Markovnikov rule')));
    expect(all.classification.records.concept).toEqual([]);
    expect(reactionOf(all).prerequisiteConceptIds).toEqual(['cpt_stab']);
    expect(reactionOf(all).conceptIds).toEqual(['cpt_rule']);
  });

  it('several dataset matches: the first by ID is used, and the reaction carries a review reason saying so', async () => {
    const all = await run([rx('r1', { reactionType: 'oxidation' })], context(concept('cpt_z', 'reaction_type', 'Oxidation'), concept('cpt_a', 'reaction_type', 'oxidation')));
    expect(reactionOf(all).reactionTypes).toEqual([{ conceptId: 'cpt_a', certainty: 'definite' }]);
    expect(reasonsOf(reactionOf(all)).filter((r) => r.startsWith('2 concepts of the dataset are named'))).toHaveLength(1);
  });

  it('the dataset wins over a record this import created earlier for the same text (general kind)', async () => {
    const all = await run([rx('r1', { reactionFamily: 'shared text' }), rx('r2', { jee: { concepts: ['shared text'] } })], context(concept('cpt_shared', 'stability', 'Shared text')));
    // reaction_family is kind-specific: the stability concept is not reused there, so one is created; the general use then finds the dataset's
    expect(all.classification.records.concept.map((c) => [c.conceptKind, c.name])).toEqual([['reaction_family', 'shared text']]);
    expect(reactionOf(all, 1).conceptIds).toEqual(['cpt_shared']);
  });
});

describe('named reactions', () => {
  it('reused by folded name and alias (not created); several matches use the first by ID with a reason', async () => {
    const ctx = context(named('nrx_lind', 'Lindlar reduction', 'Lindlar hydrogenation'), named('nrx_b', 'Twin name'), named('nrx_a', 'twin  NAME'));
    const all = await run([rx('r1', { namedReaction: 'lindlar hydrogenation' }), rx('r2', { namedReaction: 'Twin name' }), rx('r3', { namedReaction: 'New one' })], ctx);
    expect(all.classification.records.reaction.map((r) => r.namedReactionIds)).toEqual([['nrx_lind'], ['nrx_a'], [all.classification.records.named_reaction[0]?.id]]);
    expect(all.classification.records.named_reaction.map((n) => n.name)).toEqual(['New one']);
    expect(reasonsOf(reactionOf(all, 1)).some((r) => r.startsWith('2 named reactions of the dataset are named'))).toBe(true);
    expect(reasonsOf(reactionOf(all, 0))).toEqual([]);
  });
});

describe('topics', () => {
  it('a chapter is matched by folded name or alias; the mapping points at the dataset topic; nothing is created', async () => {
    const ctx = context(topic('top_hc', 'top_org', 'Hydrocarbons'), topic('top_hal', 'top_org', 'Haloalkanes and haloarenes', 'Alkyl and aryl halides'));
    const all = await run([rx('r1', { chapter: 'hydrocarbons' }), rx('r2', { chapter: 'Alkyl and aryl halides' })], ctx);
    expect(all.classification.records.topic).toEqual([]);
    expect(all.classification.records.topic_mapping.map((m) => [m.id, m.topicId, m.role])).toEqual([['tmp_v6-r1', 'top_hc', 'core'], ['tmp_v6-r2', 'top_hal', 'core']]);
  });

  it('two topics of one name: the one with a parent (a chapter under a subject) wins over a root, then the first by ID', async () => {
    const all = await run([rx('r1', { chapter: 'Organic chemistry' }), rx('r2', { chapter: 'Same' })], context(topic('top_a_root', undefined, 'Organic chemistry'), topic('top_b_child', 'top_x', 'Organic chemistry'), topic('top_2', 'top_x', 'Same'), topic('top_1', 'top_y', 'Same')));
    expect(all.classification.records.topic_mapping.map((m) => m.topicId)).toEqual(['top_b_child', 'top_1']);
    expect(reasonsOf(reactionOf(all)).some((r) => r.startsWith('2 topics of the dataset are named'))).toBe(true);
  });

  it('an unmatched chapter is created at the root and mapped; "Uncategorised" is never matched, even when the dataset has a topic of that name', async () => {
    const all = await run([rx('r1', { chapter: 'Uncategorised' }), rx('r2', { chapter: 'Amines' })], context(topic('top_unc', undefined, 'Uncategorised')));
    expect(all.classification.records.topic.map((t) => [t.name, t.parentId, t.topicKind])).toEqual([['Amines', undefined, 'chapter']]);
    expect(all.classification.records.topic_mapping.map((m) => m.target.id)).toEqual(['rxn_v6-r2']);
  });
});

describe('exam relevance (exams are matched, never created)', () => {
  const MAIN = exam('exm_main', 'JEE Main');
  const ADV = exam('exm_adv', 'JEE Advanced');
  const jee = (relevance: string) => ({ jee: { relevance } });

  it('both → one exam_relevance per exam, scope official, version-agnostic, review_required with the reason', async () => {
    const all = await run([rx('r1', jee('both'))], context(MAIN, ADV));
    const records = all.classification.records.exam_relevance;
    expect(records.map((r) => [r.id, r.examId, r.examVersionIds, r.scope, r.target])).toEqual([
      ['erl_v6-r1-main', 'exm_main', [], 'official', { kind: 'reaction', id: 'rxn_v6-r1' }],
      ['erl_v6-r1-advanced', 'exm_adv', [], 'official', { kind: 'reaction', id: 'rxn_v6-r1' }],
    ]);
    for (const r of records) expect(r.review).toEqual({ lifecycle: 'published', status: 'review_required', reasons: ['imported flag, not verified against a syllabus'] });
    expect(unmappedOf(reactionOf(all)).jee).toBeUndefined();
    expect(all.classification.consumed.has('reactions[0].jee.relevance')).toBe(true);
    expect(all.classification.report.createdCounts.exam_relevance).toBe(2);
    expect(all.classification.report.reviewItems.filter((i) => i.subject.kind === 'exam_relevance')).toHaveLength(2);
  });

  it('main → the Main record only; advanced → the Advanced record only', async () => {
    const all = await run([rx('r1', jee('main')), rx('r2', jee('advanced'))], context(MAIN, ADV));
    expect(all.classification.records.exam_relevance.map((r) => [r.id, r.examId])).toEqual([['erl_v6-r1-main', 'exm_main'], ['erl_v6-r2-advanced', 'exm_adv']]);
  });

  it('a needed exam missing from the dataset: the value is kept in unmapped with a review reason; the exam that exists is still used', async () => {
    const onlyMain = await run([rx('r1', jee('both')), rx('r2', jee('advanced'))], context(MAIN));
    expect(onlyMain.classification.records.exam_relevance.map((r) => r.id)).toEqual(['erl_v6-r1-main']);
    for (const r of onlyMain.classification.records.reaction) {
      expect(unmappedOf(r).jee).toEqual({ relevance: r.name.endsWith('r1') ? 'both' : 'advanced' });
      expect(reasonsOf(r).some((x) => x.includes('exam in this dataset') && x.includes('kept in legacy.unmapped'))).toBe(true);
    }
    expect(onlyMain.classification.consumed.has('reactions[0].jee.relevance')).toBe(false);
    expect(onlyMain.classification.consumed.has('reactions[1].jee.relevance')).toBe(false);
  });

  it('no exam is ever created, whatever the input', async () => {
    const all = await run([rx('r1', jee('both'))]);
    expect(Object.keys(all.classification.records)).not.toContain('exam');
    expect(all.all.some((r) => r.kind === 'exam' || r.kind === 'exam_version')).toBe(false);
  });

  it('exams are matched by folded name (case and spacing); two exams of one name: the first by ID, said on the record', async () => {
    const all = await run([rx('r1', jee('main'))], context(exam('exm_2', 'jee  main'), exam('exm_1', 'JEE MAIN')));
    expect(all.classification.records.exam_relevance[0]?.examId).toBe('exm_1');
    expect(all.classification.records.exam_relevance[0]?.review.reasons).toEqual(['imported flag, not verified against a syllabus', '2 exams of the dataset are named "JEE Main"; the first by ID (exm_1) was used']);
  });

  it('an exam relevance never comes from a concept, topic or other record of that name', async () => {
    const all = await run([rx('r1', jee('main'))], context(concept('cpt_x', 'general', 'JEE Main'), topic('top_x', undefined, 'JEE Main')));
    expect(all.classification.records.exam_relevance).toEqual([]);
  });
});

describe('the match index and the context of a live dataset', () => {
  it('candidates for a name are ordered by ID, whatever the order of the context', () => {
    const records = [concept('cpt_c', 'general', 'x'), concept('cpt_a', 'general', 'x'), concept('cpt_b', 'general', 'x')];
    expect(createMatchIndex(context(...records)).find('concept', 'x').map((r) => r.id)).toEqual(['cpt_a', 'cpt_b', 'cpt_c']);
    expect(createMatchIndex(context(...[...records].reverse())).find('concept', 'x').map((r) => r.id)).toEqual(['cpt_a', 'cpt_b', 'cpt_c']);
    expect(createMatchIndex(context(...records)).find('named_reaction', 'x')).toEqual([]);
  });

  it('the same import gives the same output for a shuffled context', async () => {
    const records = [concept('cpt_add', 'reaction_type', 'Addition'), named('nrx_g', 'Grignard reaction'), topic('top_hc', 'top_o', 'Hydrocarbons'), exam('exm_main', 'JEE Main'), exam('exm_adv', 'JEE Advanced'), concept('cpt_add2', 'reaction_type', 'addition')];
    const reactions = [rx('r1', { reactionType: 'addition', namedReaction: 'Grignard reaction', chapter: 'Hydrocarbons', jee: { relevance: 'both' } })];
    const a = await run(reactions, context(...records));
    const b = await run(reactions, context(...[...records].reverse()));
    expect(JSON.stringify(a.classification)).toBe(JSON.stringify(b.classification));
  });

  it('matchContextFromRecords keeps concepts (with their kind), named reactions, topics (with the parent) and exams, folds every name and alias, and ignores the rest', () => {
    const ctx = demoContext();
    const kinds = new Set(ctx.records.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(['concept', 'exam', 'named_reaction', 'topic']);
    const goc = ctx.records.find((r) => r.id === 'top_goc');
    expect(goc).toEqual({ id: 'top_goc', kind: 'topic', names: [fold('Some basic principles and techniques (GOC)'), fold('GOC')], parentId: 'top_organic-chemistry' });
    expect(ctx.records.find((r) => r.id === 'cpt_addition')).toMatchObject({ kind: 'concept', conceptKind: 'reaction_type', names: [fold('Addition')] });
    expect(ctx.records.find((r) => r.id === 'exm_jee-main')).toEqual({ id: 'exm_jee-main', kind: 'exam', names: [fold('JEE Main')] });
    expect(ctx.records.find((r) => r.id === 'top_organic-chemistry')?.parentId).toBeUndefined();
    expect(matchContextFromRecords([]).records).toEqual([]);
  });
});

describe('a context built from data/seed/demo.orn.json', () => {
  const load = () => legacyFixture('v6-demo-export.json');

  it('reuses the dataset topic, concepts, named reactions and both exams; creates the rest', async () => {
    const all = await mapClassified(load(), { context: demoContext() });
    const r1 = reactionOf(all);
    expect(all.classification.records.topic_mapping[0]).toMatchObject({ id: 'tmp_v6-r1', topicId: 'top_hydrocarbons' });
    expect(r1.reactionTypes).toEqual([{ conceptId: 'cpt_addition', certainty: 'definite' }]);
    expect(all.classification.records.topic.map((t) => t.name)).toEqual(['Haloalkanes & Haloarenes', 'Aldehydes, Ketones & Carboxylic Acids', 'Alcohols, Phenols & Ethers', 'Amines']);
    expect(all.classification.records.named_reaction.map((n) => n.name)).toEqual(['Hofmann ammonolysis', 'Saponification', 'Friedel–Crafts alkylation', 'EAS bromination']);
    const byName = new Map(all.classification.records.reaction.map((r, i) => [(all.data.reactions[i] as { namedReaction: string }).namedReaction, r] as const));
    expect(byName.get('Fischer esterification')?.namedReactionIds).toEqual(['nrx_fischer-esterification']);
    expect(byName.get('Grignard reaction')?.namedReactionIds).toEqual(['nrx_grignard']);
    expect(byName.get('Lindlar reduction')?.namedReactionIds).toEqual(['nrx_lindlar']);
    // 21 reactions carry a relevance flag (r22 does not): both → 42 records, none created for a missing exam
    expect(all.classification.records.exam_relevance).toHaveLength(42);
    expect(new Set(all.classification.records.exam_relevance.map((r) => r.examId))).toEqual(new Set(['exm_jee-main', 'exm_jee-advanced']));
  });

  it('every reference to a dataset record names a record the demo dataset has', async () => {
    const ids = new Set(demoRecords().map((r) => r.id as string));
    const all = await mapClassified(load(), { context: demoContext() });
    const used = new Set<string>();
    for (const r of all.classification.records.reaction) {
      for (const c of [...r.reactionTypes, ...r.mechanismClasses]) used.add(c.conceptId);
      for (const id of [...r.conceptIds, ...r.prerequisiteConceptIds, ...r.namedReactionIds]) used.add(id);
    }
    for (const m of all.classification.records.topic_mapping) used.add(m.topicId);
    for (const e of all.classification.records.exam_relevance) used.add(e.examId);
    const fromDataset = [...used].filter((id) => !id.includes('_v6-'));
    expect(fromDataset.length).toBeGreaterThan(5);
    for (const id of fromDataset) expect(ids.has(id), id).toBe(true);
  });
});
