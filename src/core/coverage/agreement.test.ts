/**
 * 7.7 A: the derived scope, the Chapters list and the Syllabus give ONE answer for the same record (the 7.6 REVIEW REQUIRED cases that
 * disagreed). Written first (seen red: the scope said official for an excluded subtopic and the later of two entries won).
 */
import { describe, expect, it } from 'vitest';
import { buildChapterIndex, chaptersOf } from '@/core/chapters';
import { createScopeOf } from '@/core/graph/scope';
import { syllabusPage } from '@/core/syllabus';
import type { CoverageLevel } from '@/core/schema';
import { examId, examVersion, examVersionId, topic, topicMapping } from '@/test-support/curriculum-kit';
import { contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';

const EXAM = 'jee';
const rxn = (slug: string) => reaction({ slug, name: slug, scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
const ref = (slug: string) => ({ kind: 'reaction' as const, id: `rxn_${slug}` });
const topics = [
  topic('chap', 'Chapter', { kind: 'chapter', order: 1 }),
  topic('sect', 'Section', { kind: 'section', parent: 'chap', order: 1 }),
  topic('sect2', 'Other section', { kind: 'section', parent: 'chap', order: 2 }),
];

function world(coverage: readonly { topic: string; coverage: CoverageLevel }[]) {
  const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), rxn('r1'), rxn('r2'), ...topics, topicMapping('m1', 'sect2', ref('r1')), topicMapping('m2', 'sect', ref('r2')), examVersion('v1', EXAM, coverage));
  const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
  const page = syllabusPage(state, 'exv_v1');
  return { state, scopeOf, page };
}

describe('an excluded subtopic under an included chapter', () => {
  const { state, scopeOf, page } = world([{ topic: 'chap', coverage: 'included' }, { topic: 'sect', coverage: 'excluded' }]);

  it('scope: the record under the excluded subtopic is outside; the other one is official', () => {
    expect(scopeOf(ref('r2'))).toBe('outside');
    expect(scopeOf(ref('r1'))).toBe('official');
  });

  it('syllabus: the chapter counts only the record that is in scope; the excluded subtopic is listed apart', () => {
    const root = page?.units[0]?.roots[0];
    expect(root).toMatchObject({ name: 'Chapter', total: 1 });
    expect(page?.units[0]?.excluded.map((e) => e.name)).toEqual(['Section']);
    expect(page?.totals.records).toBe(1);
  });

  it('chapters: the chapter keeps its included chip', () => {
    const list = chaptersOf(state, buildChapterIndex(state), { examVersionId: 'exv_v1' });
    expect(list.chapters.map((c) => `${c.title}:${c.scopeCoverage}`)).toEqual(['Chapter:included']);
  });
});

describe('an included subtopic under an excluded chapter', () => {
  const { scopeOf, page } = world([{ topic: 'chap', coverage: 'excluded' }, { topic: 'sect', coverage: 'partial' }]);
  it('scope and syllabus agree: only the record under the listed subtopic is in', () => {
    expect(scopeOf(ref('r2'))).toBe('official');
    expect(scopeOf(ref('r1'))).toBe('outside');
    expect(page?.units[0]?.roots[0]).toMatchObject({ name: 'Section', total: 1 });
    expect(page?.totals.records).toBe(1);
  });
});

describe('one topic listed in two units', () => {
  const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }]);
  const first = v.units[0] as (typeof v.units)[number];
  const second = { ...v, units: [...v.units, { ...first, id: 'unt_second' as never, topicCoverage: [{ topicId: (first.topicCoverage[0] as (typeof first.topicCoverage)[number]).topicId, coverage: 'excluded' as const }] }] };
  const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), rxn('r1'), ...topics, topicMapping('m1', 'sect2', ref('r1')), second);
  const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));

  it('the strongest wins even when the excluded entry comes last (scope, syllabus and chapters alike)', () => {
    expect(scopeOf(ref('r1'))).toBe('official');
    expect(syllabusPage(state, 'exv_v1')?.units[0]?.roots[0]).toMatchObject({ name: 'Chapter', coverage: 'included', total: 1 });
    expect(chaptersOf(state, buildChapterIndex(state), { examVersionId: 'exv_v1' }).chapters[0]?.scopeCoverage).toBe('included');
  });
});
