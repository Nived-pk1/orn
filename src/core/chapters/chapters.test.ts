/**
 * 7.3b A2, C1, C2: a record's chapter is the nearest topic of kind "chapter" at or above each topic it is mapped to (a topic with no
 * chapter above it: its top-level topic); the chapter list with counts, the exam scope, "No chapter yet", and one chapter's contents in
 * the fixed study order. Pure and derived.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord, CanonicalState, RecordRef } from '@/core/schema';
import { examVersion, prerequisiteOf, topic, topicMapping } from '@/test-support/curriculum-kit';
import { concept, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { buildChapterIndex, chapterContents, chaptersOf, NO_CHAPTER } from './index';

const rec = (kind: RecordRef['kind'], id: string): RecordRef => ({ kind, id }) as RecordRef;
const cpt = (body: string): RecordRef => rec('concept', `cpt_${body}`);
const nameOf = (state: CanonicalState) => (ref: RecordRef): string => {
  const table = state.records[ref.kind] as Record<string, { name?: string; names?: { canonical: string } }>;
  const one = table[ref.id];
  return one?.name ?? one?.names?.canonical ?? ref.id;
};

const topics = [
  topic('subj', 'Organic', { kind: 'subject', order: 1 }),
  topic('chap-b', 'Bravo chapter', { kind: 'chapter', parent: 'subj', order: 2 }),
  topic('chap-a', 'Alpha chapter', { kind: 'chapter', parent: 'subj', order: 1 }),
  topic('a-s1', 'Alpha section one', { kind: 'section', parent: 'chap-a', order: 1 }),
  topic('a-s2', 'Alpha section two', { kind: 'section', parent: 'chap-a', order: 2 }),
  topic('a-s2-t', 'Alpha topic deep', { kind: 'topic', parent: 'a-s2', order: 1 }),
  topic('loose', 'Loose section', { kind: 'section', parent: 'subj', order: 3 }),
];

function stateWith(...more: AnyRecord[]): CanonicalState {
  return stateOf(...topics, ...more);
}

describe('buildChapterIndex: the chapter of a record (A2)', () => {
  it('lists the chapter topics in tree order (sibling order, not alphabetical), then a top-level topic that is a chapter by default', () => {
    const index = buildChapterIndex(stateWith());
    expect(index.chapters.map((c) => c.title)).toEqual(['Alpha chapter', 'Bravo chapter']);
    expect(index.chapters.map((c) => c.order)).toEqual([0, 1]);
  });

  it('a record mapped to a section or a deep topic is in the chapter above it', () => {
    const state = stateWith(concept('c1', 'One', 'general'), topicMapping('m1', 'a-s2-t', cpt('c1')));
    const found = buildChapterIndex(state).membershipsOf(cpt('c1'));
    expect(found.map((m) => m.chapterId)).toEqual(['top_chap-a']);
  });

  it('a topic with no chapter above it is its own top-level topic (listed as a chapter)', () => {
    const state = stateWith(concept('c1', 'One', 'general'), topicMapping('m1', 'loose', cpt('c1')));
    const index = buildChapterIndex(state);
    expect(index.membershipsOf(cpt('c1')).map((m) => m.chapterId)).toEqual(['top_subj']);
    expect(index.chapters.map((c) => c.id)).toContain('top_subj');
  });

  it('a record mapped to two sections of one chapter is listed once there, with the strongest role', () => {
    const state = stateWith(concept('c1', 'One', 'general'), topicMapping('m1', 'a-s1', cpt('c1'), 'enrichment'), topicMapping('m2', 'a-s2', cpt('c1'), 'core'));
    const found = buildChapterIndex(state).membershipsOf(cpt('c1'));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ chapterId: 'top_chap-a', role: 'core' });
  });

  it('a record mapped into two chapters is listed in each', () => {
    const state = stateWith(concept('c1', 'One', 'general'), topicMapping('m1', 'chap-a', cpt('c1')), topicMapping('m2', 'chap-b', cpt('c1'), 'supporting'));
    const found = buildChapterIndex(state).membershipsOf(cpt('c1'));
    expect(found.map((m) => `${m.chapterId}:${m.role}`)).toEqual(['top_chap-a:core', 'top_chap-b:supporting']);
  });

  it('a concept with no mapping of its own takes the chapters of the records it is a prerequisite of, as "supporting"', () => {
    const r = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const state = stateWith(concept('c1', 'One', 'general'), r, species('sp-a', 'A'), species('sp-b', 'B'), topicMapping('m1', 'chap-b', rec('reaction', 'rxn_r1')), prerequisiteOf('p1', cpt('c1'), rec('reaction', 'rxn_r1')));
    const found = buildChapterIndex(state).membershipsOf(cpt('c1'));
    expect(found.map((m) => `${m.chapterId}:${m.role}`)).toEqual(['top_chap-b:supporting']);
    // a species gets no such rule
    expect(buildChapterIndex(state).membershipsOf(rec('species', 'spc_sp-a'))).toEqual([]);
  });
});

describe('chaptersOf: the list with counts (C1)', () => {
  const state = stateWith(
    concept('c1', 'One', 'general'),
    concept('c2', 'Two', 'general'),
    concept('c3', 'Three', 'general'),
    species('sp-a', 'A'),
    species('sp-lonely', 'Lonely'),
    topicMapping('m1', 'a-s1', cpt('c1')),
    topicMapping('m2', 'chap-a', cpt('c2'), 'supporting'),
    topicMapping('m3', 'chap-b', cpt('c3')),
    topicMapping('m4', 'chap-a', rec('species', 'spc_sp-a')),
    examVersion('v-main', 'jee-main', [{ topic: 'chap-a', coverage: 'included' }, { topic: 'chap-b', coverage: 'partial' }]),
    examVersion('v-adv', 'jee-adv', [{ topic: 'chap-b', coverage: 'included' }, { topic: 'chap-a', coverage: 'excluded' }]),
  );

  it('counts core and other records per kind, in tree order, with the exam versions that cover each chapter', () => {
    const list = chaptersOf(state, buildChapterIndex(state));
    expect(list.chapters.map((c) => c.title)).toEqual(['Alpha chapter', 'Bravo chapter']);
    const alpha = list.chapters[0];
    expect(alpha?.counts.concepts).toEqual({ core: 1, other: 1 });
    expect(alpha?.counts.compounds).toEqual({ core: 1, other: 0 });
    expect(alpha?.exams.map((e) => `${e.examVersionId}:${e.coverage}`)).toEqual(['exv_v-main:included']);
    const bravo = list.chapters[1];
    expect(bravo?.exams.map((e) => `${e.examVersionId}:${e.coverage}`).sort()).toEqual(['exv_v-adv:included', 'exv_v-main:partial']);
  });

  it('"No chapter yet" holds the records mapped nowhere, counted per kind', () => {
    const list = chaptersOf(state, buildChapterIndex(state));
    expect(list.noChapter.counts.compounds).toEqual({ core: 1, other: 0 });
    expect(list.noChapter.total).toBe(1);
  });

  it('with an exam scope only the chapters that version covers are listed, partial ones marked, and the notice says how many are hidden', () => {
    const list = chaptersOf(state, buildChapterIndex(state), { examVersionId: 'exv_v-adv' });
    expect(list.chapters.map((c) => c.title)).toEqual(['Bravo chapter']);
    expect(list.hiddenByExam).toBe(1);
    const partial = chaptersOf(state, buildChapterIndex(state), { examVersionId: 'exv_v-main' });
    expect(partial.chapters.map((c) => `${c.title}:${c.scopeCoverage}`)).toEqual(['Alpha chapter:included', 'Bravo chapter:partial']);
  });
});

describe('chapterContents: one chapter in the fixed study order (C2)', () => {
  const r1 = reaction({ slug: 'g1', name: 'General oxidation', scope: 'generic', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
  const r2 = reaction({ slug: 'e1', name: 'Example oxidation', scope: 'specific', instanceOf: 'g1', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
  const state = stateWith(
    concept('zed', 'Zed idea', 'general'),
    concept('alpha', 'alpha idea', 'general'),
    concept('side', 'Side idea', 'general'),
    concept('extra', 'Extra idea', 'general'),
    species('sp-a', 'A'),
    species('sp-b', 'B'),
    r1,
    r2,
    topicMapping('m1', 'a-s2', cpt('zed')),
    topicMapping('m2', 'a-s1', cpt('alpha')),
    topicMapping('m3', 'chap-a', cpt('side'), 'supporting'),
    topicMapping('m4', 'chap-a', cpt('extra'), 'enrichment'),
    topicMapping('m5', 'chap-a', rec('reaction', 'rxn_g1')),
    topicMapping('m6', 'chap-a', rec('reaction', 'rxn_e1')),
    topicMapping('m7', 'chap-a', rec('species', 'spc_sp-a')),
  );

  it('the groups come in the study order, empty ones are left out', () => {
    const contents = chapterContents(state, buildChapterIndex(state), 'top_chap-a', { nameOf: nameOf(state) });
    expect(contents.groups.map((g) => g.key)).toEqual(['concepts', 'reactions', 'compounds']);
    expect(contents.groups.map((g) => g.title)).toEqual(['Concepts', 'Reactions', 'Compounds and classes']);
  });

  it('inside a group: core first (section-topic order, then folded name, then id), then "Also used here", then "Extra"', () => {
    const contents = chapterContents(state, buildChapterIndex(state), 'top_chap-a', { nameOf: nameOf(state) });
    const concepts = contents.groups.find((g) => g.key === 'concepts');
    expect(concepts?.parts.map((p) => `${p.part}:${p.refs.map((r) => r.id).join(',')}`)).toEqual([
      'core:cpt_alpha,cpt_zed', // section one comes before section two although "Zed" sorts after "alpha" either way
      'supporting:cpt_side',
      'enrichment:cpt_extra',
    ]);
    expect(concepts?.parts.map((p) => p.title)).toEqual([undefined, 'Also used here', 'Extra']);
    expect(concepts?.count).toBe(4);
  });

  it('the reactions of the group fold their examples (one list), and the count is cards', () => {
    const contents = chapterContents(state, buildChapterIndex(state), 'top_chap-a', { nameOf: nameOf(state) });
    const reactions = contents.groups.find((g) => g.key === 'reactions');
    expect(reactions?.count).toBe(1);
    expect(reactions?.parts[0]?.refs.map((r) => r.id)).toEqual(['rxn_g1']);
    expect(reactions?.examplesOf?.get('rxn_g1')).toEqual(['rxn_e1']);
    expect(reactions?.exampleCount).toBe(1);
  });

  it('"No chapter yet" holds the records mapped nowhere', () => {
    const lonely = stateWith(species('sp-x', 'X'), concept('c1', 'One', 'general'), topicMapping('m1', 'chap-a', cpt('c1')));
    const contents = chapterContents(lonely, buildChapterIndex(lonely), NO_CHAPTER, { nameOf: nameOf(lonely) });
    expect(contents.groups.map((g) => g.key)).toEqual(['compounds']);
    expect(contents.groups[0]?.parts[0]?.refs.map((r) => r.id)).toEqual(['spc_sp-x']);
  });

  it('an unknown chapter id has no groups', () => {
    const contents = chapterContents(state, buildChapterIndex(state), 'top_nope', { nameOf: nameOf(state) });
    expect(contents.groups).toEqual([]);
  });
});
