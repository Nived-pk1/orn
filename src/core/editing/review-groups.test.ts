/**
 * The Review page's two groupings (7.3a E1, E3): by CHAPTER ("<exam version> › <unit>", from the record's own topic mappings, else its
 * derived scope) and by KIND. Pure. Tests written first (seen red: the module did not exist). There is no grouping by import: a record
 * carries no import id (E3, REVIEW REQUIRED in docs/PROGRESS.md).
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';
import { chapterIndexOf, facetCountsOf, groupByOf, groupQueueRows, NO_CHAPTER_TITLE } from './review-groups';
import { queueRows } from './review-queue';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('duplicate IDs');
const DEMO: CanonicalState = parsed.state;
const ref = (kind: string, id: string): RecordRef => ({ kind, id }) as RecordRef;
const titles = (chapters: readonly { readonly title: string }[]): string[] => chapters.map((one) => one.title);

describe('chapterIndexOf (from a record\'s own topic mappings)', () => {
  const chaptersOf = chapterIndexOf(DEMO);

  it('a reaction mapped to a section is in the unit that covers the section\'s chapter, once per exam version', () => {
    const chapters = titles(chaptersOf(ref('reaction', 'rxn_alcohol1-to-aldehyde-pcc')));
    expect(chapters).toHaveLength(2);
    expect(chapters.every((one) => one.endsWith(' › Alcohols, phenols and ethers'))).toBe(true);
    expect(chapters.map((one) => one.split(' › ')[0])).toEqual(['JEE Advanced 2026 (provisional)', 'JEE Main 2026 (provisional)']);
  });

  it('a record with no mapping and no derived scope has no chapter', () => {
    expect(chaptersOf(ref('species', 'spc_ethanol'))).toEqual([]);
  });

  it('a record mapped to two topics in different units is in both chapters', () => {
    const extra = { ...DEMO.records.topic_mapping['tmp_alcohol1-to-aldehyde-pcc-alcohol-oxidation-dehydration' as never] } as Record<string, unknown>;
    const state = {
      ...DEMO,
      records: { ...DEMO.records, topic_mapping: { ...DEMO.records.topic_mapping, tmp_x_second: { ...extra, id: 'tmp_x_second', topicId: 'top_hydrocarbons' } } },
    } as unknown as CanonicalState;
    const chapters = titles(chapterIndexOf(state)(ref('reaction', 'rxn_alcohol1-to-aldehyde-pcc')));
    expect(chapters.filter((one) => one.endsWith('Hydrocarbons'))).toHaveLength(2);
    expect(chapters.filter((one) => one.endsWith('Alcohols, phenols and ethers'))).toHaveLength(2);
  });

  it('a topic the unit excludes places nothing', () => {
    const versions = Object.fromEntries(
      Object.entries(DEMO.records.exam_version).map(([id, v]) => [id, { ...v, units: v.units.map((u) => ({ ...u, topicCoverage: u.topicCoverage.map((c) => ({ ...c, coverage: 'excluded' })) })) }]),
    );
    const state = { ...DEMO, records: { ...DEMO.records, exam_version: versions } } as unknown as CanonicalState;
    expect(chapterIndexOf(state)(ref('reaction', 'rxn_alcohol1-to-aldehyde-pcc'))).toEqual([]);
  });

  it('only the chosen exam version when one is given', () => {
    const id = Object.keys(DEMO.records.exam_version)[0] as string;
    const chapters = chapterIndexOf(DEMO, id)(ref('reaction', 'rxn_alcohol1-to-aldehyde-pcc'));
    expect(chapters).toHaveLength(1);
  });

  it('a concept that is a prerequisite of a mapped reaction takes that reaction\'s chapters (the exam scope\'s own one-hop rule)', () => {
    const reaction = DEMO.records.reaction['rxn_alcohol1-to-aldehyde-pcc' as never] as Record<string, unknown>;
    const state = {
      ...DEMO,
      records: { ...DEMO.records, reaction: { ...DEMO.records.reaction, 'rxn_alcohol1-to-aldehyde-pcc': { ...reaction, prerequisiteConceptIds: ['cpt_addition'] } } },
    } as unknown as CanonicalState;
    const index = chapterIndexOf(state);
    expect(titles(index(ref('concept', 'cpt_addition')))).toEqual(titles(index(ref('reaction', 'rxn_alcohol1-to-aldehyde-pcc'))));
    expect(index(ref('concept', 'cpt_ade'))).toEqual([]);
  });
});

describe('groupQueueRows', () => {
  const rows = queueRows(DEMO, () => [], {});
  const chaptersOf = chapterIndexOf(DEMO);

  it('by kind: one group per kind in the kind words\' order, every row once', () => {
    const groups = groupQueueRows(rows, 'kind', chaptersOf);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(rows.length);
    const names = groups.map((g) => g.title);
    expect([...names].sort()).toEqual(names);
    expect(groups.every((g) => g.rows.every((r) => r.kindWords === g.title))).toBe(true);
  });

  it('by chapter: a row in several chapters is listed in each, a row with none is in "No chapter yet", last', () => {
    const groups = groupQueueRows(rows, 'chapter', chaptersOf);
    expect(groups.at(-1)?.title).toBe(NO_CHAPTER_TITLE);
    const listed = new Map<string, number>();
    for (const g of groups) for (const r of g.rows) listed.set(`${r.ref.kind}:${r.ref.id}`, (listed.get(`${r.ref.kind}:${r.ref.id}`) ?? 0) + 1);
    expect(listed.size).toBe(rows.length);
    expect(listed.get('reaction:rxn_alcohol1-to-aldehyde-pcc') ?? 0).toBeGreaterThanOrEqual(2);
    const none = groups.find((g) => g.title === NO_CHAPTER_TITLE);
    expect(none?.rows.some((r) => r.ref.kind === 'species')).toBe(true);
  });

  it('chapter groups are in exam version order then the unit\'s order in the version', () => {
    const groups = groupQueueRows(rows, 'chapter', chaptersOf).filter((g) => g.title !== NO_CHAPTER_TITLE);
    const versions = groups.map((g) => g.title.split(' › ')[0]);
    expect([...versions].sort()).toEqual(versions);
  });

  it('a group key is stable and unique', () => {
    const groups = groupQueueRows(rows, 'chapter', chaptersOf);
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });
});

describe('groupByOf (the saved choice, read tolerantly)', () => {
  it('keeps a known choice and falls back to Kind for anything else', () => {
    expect(groupByOf({ groupBy: 'chapter' })).toBe('chapter');
    expect(groupByOf({ groupBy: 'kind' })).toBe('kind');
    for (const bad of [undefined, null, 3, 'chapter', {}, { groupBy: 'import' }, { groupBy: 7 }, []]) expect(groupByOf(bad)).toBe('kind');
  });
});

describe('facetCountsOf (counts for the filter options, each dimension ignoring itself)', () => {
  const rows = queueRows(DEMO, () => [], {});
  const chaptersOf = chapterIndexOf(DEMO);

  it('with nothing chosen the kind counts add up to the rows', () => {
    const facets = facetCountsOf(rows, chaptersOf, {});
    expect([...facets.kinds.values()].reduce((n, one) => n + one.count, 0)).toBe(rows.length);
    expect([...facets.statuses.values()].reduce((n, one) => n + one.count, 0)).toBe(rows.length);
  });

  it('a chapter chosen narrows the kind counts but not the chapter counts', () => {
    const all = facetCountsOf(rows, chaptersOf, {});
    const key = [...all.chapters.keys()][0] as string;
    const facets = facetCountsOf(rows, chaptersOf, { chapter: key });
    expect(facets.chapters.get(key)?.count).toBe(all.chapters.get(key)?.count);
    expect([...facets.kinds.values()].reduce((n, one) => n + one.count, 0)).toBe(all.chapters.get(key)?.count);
  });

  it('rows with no chapter are counted under "No chapter yet"', () => {
    const facets = facetCountsOf(rows, chaptersOf, {});
    expect(facets.chapters.get('none')?.title).toBe(NO_CHAPTER_TITLE);
    expect((facets.chapters.get('none')?.count ?? 0) > 0).toBe(true);
  });
});
