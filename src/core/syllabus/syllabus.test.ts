/**
 * 7.6 C: the Syllabus page of one exam version (units, the covered topics as a tree, counts at the topic and below, gaps, the excluded
 * list), the totals, and the difference between two versions of one exam. Pure and derived. Written first (seen red: the module was absent).
 */
import { describe, expect, it } from 'vitest';
import { buildChapterIndex, chaptersOf, countWords } from '@/core/chapters';
import type { AnyRecord, CanonicalState, CoverageLevel, ExamVersion, RecordRef } from '@/core/schema';
import { examId, examVersionId, topic, topicId, topicMapping } from '@/test-support/curriculum-kit';
import { ident, meta } from '@/test-support/demo/kit';
import { concept as bareConcept, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { demoState } from '@/test-support/app-boot-kit';
import { syllabusDiff, syllabusPage, syllabusTotals } from './index';

const concept = (body: string, name: string, o: { summary?: string } = {}) => bareConcept(body, name, 'general', { summary: 'Some text.', ...o });
const rec = (kind: RecordRef['kind'], id: string): RecordRef => ({ kind, id }) as RecordRef;
const cpt = (body: string): RecordRef => rec('concept', `cpt_${body}`);

interface UnitSpec {
  readonly code?: string;
  readonly title: string;
  readonly officialText?: string;
  readonly coverage: readonly { readonly topic: string; readonly coverage: CoverageLevel; readonly note?: string }[];
}

function version(body: string, examBody: string, units: readonly UnitSpec[], o: { status?: ExamVersion['status'] } = {}): ExamVersion {
  return {
    id: examVersionId(body),
    kind: 'exam_version',
    examId: examId(examBody),
    label: body,
    status: o.status ?? 'provisional',
    units: units.map((unit, i) => ({
      id: ident<ExamVersion['units'][number]['id']>('unt', `${body}-u${i + 1}`),
      ...(unit.code === undefined ? {} : { code: unit.code }),
      title: unit.title,
      ...(unit.officialText === undefined ? {} : { officialText: unit.officialText }),
      topicCoverage: unit.coverage.map((c) => ({ topicId: topicId(c.topic), coverage: c.coverage, ...(c.note === undefined ? {} : { note: c.note }) })),
    })),
    ...meta(),
  };
}

const topics = [
  topic('subj', 'Organic', { kind: 'subject', order: 1 }),
  topic('chap-b', 'Bravo chapter', { kind: 'chapter', parent: 'subj', order: 2 }),
  topic('chap-a', 'Alpha chapter', { kind: 'chapter', parent: 'subj', order: 1 }),
  topic('a-s1', 'Alpha section one', { kind: 'section', parent: 'chap-a', order: 1 }),
  topic('a-s2', 'Alpha section two', { kind: 'section', parent: 'chap-a', order: 2 }),
  topic('a-s2-t', 'Alpha topic deep', { kind: 'topic', parent: 'a-s2', order: 1 }),
  topic('chap-c', 'Charlie chapter', { kind: 'chapter', parent: 'subj', order: 3 }),
];

const withState = (...more: AnyRecord[]): CanonicalState => stateOf(...topics, ...more);

describe('syllabusPage: units and the tree', () => {
  const state = withState(
    concept('c1', 'One'),
    concept('c2', 'Two'),
    species('sp-a', 'A'),
    topicMapping('m1', 'a-s1', cpt('c1')),
    topicMapping('m2', 'a-s2-t', cpt('c2')),
    topicMapping('m3', 'chap-b', rec('species', 'spc_sp-a')),
    version('v1', 'jee', [
      { code: 'U1', title: 'First unit', officialText: 'As published.', coverage: [{ topic: 'a-s2', coverage: 'partial', note: 'Only the basics' }, { topic: 'chap-a', coverage: 'included' }, { topic: 'a-s1', coverage: 'included' }, { topic: 'chap-c', coverage: 'excluded' }] },
      { title: 'Second unit', coverage: [{ topic: 'chap-b', coverage: 'included' }] },
    ]),
  );

  it('keeps the units in their stored order, with code, title and official wording', () => {
    const page = syllabusPage(state, 'exv_v1');
    expect(page?.units.map((u) => u.title)).toEqual(['First unit', 'Second unit']);
    expect(page?.units[0]).toMatchObject({ code: 'U1', officialText: 'As published.' });
    expect(page?.units[1]?.code).toBeUndefined();
  });

  it('nests the covered topics by the topic tree, in tree order (the `order` field), whatever order the unit lists them', () => {
    const unit = syllabusPage(state, 'exv_v1')?.units[0];
    expect(unit?.roots.map((n) => n.name)).toEqual(['Alpha chapter']);
    expect(unit?.roots[0]?.children.map((n) => n.name)).toEqual(['Alpha section one', 'Alpha section two']);
  });

  it('a covered topic carries its level and note; a topic under an uncovered middle topic still nests under its covered ancestor', () => {
    const unit = syllabusPage(state, 'exv_v1')?.units[0];
    const s2 = unit?.roots[0]?.children[1];
    expect(s2).toMatchObject({ coverage: 'partial', note: 'Only the basics' });
    expect(unit?.roots[0]?.coverage).toBe('included');
  });

  it('counts the records at the topic AND below it (a rolled-up count), each record once', () => {
    const unit = syllabusPage(state, 'exv_v1')?.units[0];
    const alpha = unit?.roots[0];
    expect(alpha?.total).toBe(2); // c1 in section one, c2 deep under section two
    expect(alpha?.counts.concepts).toBe(2);
    expect(alpha?.children[0]?.total).toBe(1);
    expect(alpha?.children[1]?.total).toBe(1);
  });

  it('a covered topic with no record at or below it is a gap; one with records is not', () => {
    const page = syllabusPage(state, 'exv_v1');
    expect(page?.units[0]?.roots[0]?.gap).toBe(false);
    expect(page?.units[1]?.roots[0]).toMatchObject({ name: 'Bravo chapter', total: 1, gap: false });
    const lonely = withState(version('v2', 'jee', [{ title: 'U', coverage: [{ topic: 'chap-a', coverage: 'included' }] }]));
    expect(syllabusPage(lonely, 'exv_v2')?.units[0]?.roots[0]).toMatchObject({ total: 0, gap: true });
  });

  it('a concept with no text is not counted (as in the chapters)', () => {
    const empty = withState(concept('c1', 'One', { summary: '' as never }), topicMapping('m1', 'a-s1', cpt('c1')), version('v2', 'jee', [{ title: 'U', coverage: [{ topic: 'a-s1', coverage: 'included' }] }]));
    const row = syllabusPage(empty, 'exv_v2')?.units[0]?.roots[0];
    expect(row?.total).toBe(0);
    expect(row?.gap).toBe(true);
  });

  it('lists the excluded topics under the unit, not in the tree', () => {
    const unit = syllabusPage(state, 'exv_v1')?.units[0];
    expect(unit?.excluded.map((e) => e.name)).toEqual(['Charlie chapter']);
    expect(unit?.roots.flatMap((n) => [n.name, ...n.children.map((c) => c.name)])).not.toContain('Charlie chapter');
  });

  it('an unknown version is undefined', () => {
    expect(syllabusPage(state, 'exv_nope')).toBeUndefined();
  });

  it('gives each covered topic the chapter a link should open (the nearest chapter at or above it)', () => {
    const unit = syllabusPage(state, 'exv_v1')?.units[0];
    expect(unit?.roots[0]?.chapterId).toBe('top_chap-a');
    expect(unit?.roots[0]?.children[1]?.chapterId).toBe('top_chap-a');
  });
});

describe('syllabusPage: a topic in two units, and the stronger level', () => {
  const state = withState(
    concept('c1', 'One'),
    topicMapping('m1', 'chap-a', cpt('c1')),
    version('v1', 'jee', [
      { title: 'U1', coverage: [{ topic: 'chap-a', coverage: 'partial', note: 'basics' }] },
      { title: 'U2', coverage: [{ topic: 'chap-a', coverage: 'included' }] },
    ]),
  );

  it('appears under each unit; its level is the stronger one (included over partial), as in the Chapters list', () => {
    const page = syllabusPage(state, 'exv_v1');
    expect(page?.units.map((u) => u.roots.map((n) => `${n.name}:${n.coverage}`))).toEqual([['Alpha chapter:included'], ['Alpha chapter:included']]);
  });

  it('an excluded row is ignored for a topic that another unit covers; excluded stays excluded when nothing covers it', () => {
    const mixed = withState(
      version('v1', 'jee', [
        { title: 'U1', coverage: [{ topic: 'chap-a', coverage: 'excluded' }, { topic: 'chap-b', coverage: 'excluded' }] },
        { title: 'U2', coverage: [{ topic: 'chap-a', coverage: 'partial' }] },
      ]),
    );
    const page = syllabusPage(mixed, 'exv_v1');
    expect(page?.units[0]?.roots).toEqual([]);
    expect(page?.units[0]?.excluded.map((e) => e.name)).toEqual(['Bravo chapter']);
    expect(page?.units[1]?.roots[0]).toMatchObject({ name: 'Alpha chapter', coverage: 'partial' });
  });
});

describe('the counts are the Chapters list counts', () => {
  it('for every chapter of the demo the words equal the Chapters list words', () => {
    const state = demoState();
    const list = chaptersOf(state, buildChapterIndex(state));
    const chapterIds = new Set(list.chapters.map((c) => c.id));
    let compared = 0;
    for (const v of Object.values(state.records.exam_version)) {
      const page = syllabusPage(state, v.id);
      for (const unit of page?.units ?? []) {
        for (const node of unit.roots) {
          if (!chapterIds.has(node.topicId)) continue;
          const chapter = list.chapters.find((c) => c.id === node.topicId);
          const expected = Object.fromEntries(Object.entries(chapter?.counts ?? {}).map(([k, c]) => [k, c.core + c.other]));
          expect(node.counts).toEqual(expected);
          expect(node.total).toBe(chapter?.total);
          expect(countWords(node.counts)).toBe(countWords(expected as never));
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(10);
  });

  it('reactions are counted as cards: an example folds under its general reaction', () => {
    const general = reaction({ slug: 'g1', name: 'General', scope: 'generic', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const example = reaction({ slug: 'e1', name: 'Example', scope: 'specific', instanceOf: 'g1', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const state = withState(general, example, species('sp-a', 'A'), species('sp-b', 'B'), topicMapping('m1', 'chap-a', rec('reaction', 'rxn_g1')), topicMapping('m2', 'a-s1', rec('reaction', 'rxn_e1')), version('v1', 'jee', [{ title: 'U', coverage: [{ topic: 'chap-a', coverage: 'included' }] }]));
    const node = syllabusPage(state, 'exv_v1')?.units[0]?.roots[0];
    expect(node?.counts.reactions).toBe(1);
    expect(node?.total).toBe(2); // both records are in the topic; the example is folded in the reactions count only
  });
});

describe('syllabusTotals', () => {
  const state = withState(
    concept('c1', 'One'),
    concept('c2', 'Two'),
    topicMapping('m1', 'a-s1', cpt('c1')),
    topicMapping('m2', 'chap-b', cpt('c2')),
    version('v1', 'jee', [
      { title: 'U1', coverage: [{ topic: 'chap-a', coverage: 'included' }, { topic: 'a-s1', coverage: 'partial' }, { topic: 'chap-c', coverage: 'included' }] },
      { title: 'U2', coverage: [{ topic: 'chap-a', coverage: 'included' }, { topic: 'chap-b', coverage: 'included' }, { topic: 'a-s2', coverage: 'excluded' }] },
    ]),
  );

  it('counts distinct covered topics, those with content, the gaps and the records in scope (each once)', () => {
    const page = syllabusPage(state, 'exv_v1');
    expect(page).toBeDefined();
    if (page === undefined) return;
    expect(syllabusTotals(page)).toEqual({ topics: 4, withContent: 3, gaps: 1, records: 2 });
  });
});

describe('syllabusDiff: two versions of one exam', () => {
  const a = version('new', 'jee', [
    { title: 'U1', coverage: [{ topic: 'chap-a', coverage: 'included' }, { topic: 'chap-c', coverage: 'included' }, { topic: 'a-s1', coverage: 'included' }, { topic: 'chap-b', coverage: 'excluded' }] },
  ]);
  const b = version('old', 'jee', [
    { title: 'Other unit title', coverage: [{ topic: 'chap-a', coverage: 'partial' }, { topic: 'chap-b', coverage: 'included' }, { topic: 'a-s1', coverage: 'included' }] },
  ]);
  const state = withState(concept('c1', 'One'), concept('c2', 'Two'), topicMapping('m1', 'chap-a', cpt('c1')), topicMapping('m2', 'chap-b', cpt('c2')), a, b);

  it('lists what is new in A, what is not in A any more, and what changed level; unchanged topics are not listed', () => {
    const diff = syllabusDiff(state, 'exv_new', 'exv_old');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.added.map((r) => r.name)).toEqual(['Charlie chapter']);
    expect(diff.removed.map((r) => r.name)).toEqual(['Bravo chapter']);
    expect(diff.changed.map((r) => `${r.name}:${r.from}>${r.to}`)).toEqual(['Alpha chapter:partial>included']);
    expect(diff.empty).toBe(false);
  });

  it('matches by TOPIC, never by unit (the unit titles differ here)', () => {
    const diff = syllabusDiff(state, 'exv_new', 'exv_old');
    expect(diff.ok && [...diff.added, ...diff.removed, ...diff.changed].some((r) => r.name === 'Alpha section one')).toBe(false);
  });

  it('each row carries the number of records at the topic and below, and its chapter', () => {
    const diff = syllabusDiff(state, 'exv_new', 'exv_old');
    if (!diff.ok) throw new Error('expected a diff');
    expect(diff.removed[0]).toMatchObject({ name: 'Bravo chapter', records: 1, chapterId: 'top_chap-b' });
    expect(diff.changed[0]).toMatchObject({ records: 1, chapterId: 'top_chap-a' });
    expect(diff.added[0]).toMatchObject({ records: 0 });
  });

  it('sorts rows by topic order and flips with the roles of the versions (partial back from included)', () => {
    const back = syllabusDiff(state, 'exv_old', 'exv_new');
    if (!back.ok) throw new Error('expected a diff');
    expect(back.added.map((r) => r.name)).toEqual(['Bravo chapter']);
    expect(back.removed.map((r) => r.name)).toEqual(['Charlie chapter']);
    expect(back.changed.map((r) => `${r.from}>${r.to}`)).toEqual(['included>partial']);
  });

  it('two versions that cover the same topics at the same levels have an empty diff', () => {
    const same = withState(version('vx', 'jee', [{ title: 'U', coverage: [{ topic: 'chap-a', coverage: 'included' }] }]), version('vy', 'jee', [{ title: 'V', coverage: [{ topic: 'chap-a', coverage: 'included' }] }]));
    const diff = syllabusDiff(same, 'exv_vx', 'exv_vy');
    expect(diff).toMatchObject({ ok: true, empty: true });
  });

  it('refuses two versions of different exams, and a version that does not exist', () => {
    const other = withState(version('vx', 'jee-main', [{ title: 'U', coverage: [] }]), version('vy', 'jee-adv', [{ title: 'U', coverage: [] }]));
    expect(syllabusDiff(other, 'exv_vx', 'exv_vy')).toEqual({ ok: false, reason: 'different_exams' });
    expect(syllabusDiff(other, 'exv_vx', 'exv_missing')).toEqual({ ok: false, reason: 'unknown_version' });
  });
});
