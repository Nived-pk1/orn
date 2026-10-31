/**
 * The Review page's three groupings (7.3a E1; 7.3b A1, A2): by IMPORT (the batch a record arrived with, newest first), by CHAPTER (the
 * chapter topic of the record's own mappings, shared with the Chapters view) and by KIND. Pure.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';
import { chapterIndexOf, facetCountsOf, groupByOf, groupQueueRows, importIndexOf, NO_CHAPTER_TITLE, type GroupPlaces } from './review-groups';
import { queueRows, type QueueRow } from './review-queue';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('duplicate IDs');
const DEMO: CanonicalState = parsed.state;
const ref = (kind: string, id: string): RecordRef => ({ kind, id }) as RecordRef;
const titles = (chapters: readonly { readonly title: string }[]): string[] => chapters.map((one) => one.title);
const time = (iso: string): string => `at ${iso.slice(0, 10)}`;
const LOG = [
  { id: 'imp_new', fileName: 'second.orn.json', appliedAt: '2026-10-02T10:00:00.000Z' },
  { id: 'imp_old', fileName: 'first.orn.json', appliedAt: '2026-10-01T10:00:00.000Z' },
];

const places = (log = LOG): GroupPlaces => ({ chapters: chapterIndexOf(DEMO), imports: importIndexOf(log, time) });
const withBatch = (row: QueueRow, importBatchId: string | undefined, origin: QueueRow['origin']): QueueRow => ({ ...row, origin, ...(importBatchId === undefined ? {} : { importBatchId }) });

describe('chapterIndexOf: the chapter is the chapter TOPIC (A2)', () => {
  const chaptersOf = chapterIndexOf(DEMO);

  it('a reaction mapped to a section is in the chapter above it, ONCE (no exam version in the heading)', () => {
    expect(titles(chaptersOf(ref('reaction', 'rxn_alcohol1-to-aldehyde-pcc')))).toEqual(['Alcohols, phenols and ethers']);
  });

  it('a record with no mapping has no chapter', () => {
    expect(chaptersOf(ref('species', 'spc_ethanol'))).toEqual([]);
  });

  it('a record mapped into two chapters is in both, in chapter order', () => {
    const extra = { ...DEMO.records.topic_mapping['tmp_alcohol1-to-aldehyde-pcc-alcohol-oxidation-dehydration' as never] } as Record<string, unknown>;
    const state = {
      ...DEMO,
      records: { ...DEMO.records, topic_mapping: { ...DEMO.records.topic_mapping, tmp_x_second: { ...extra, id: 'tmp_x_second', topicId: 'top_hydrocarbons' } } },
    } as unknown as CanonicalState;
    expect(titles(chapterIndexOf(state)(ref('reaction', 'rxn_alcohol1-to-aldehyde-pcc')))).toEqual(['Hydrocarbons', 'Alcohols, phenols and ethers']);
  });

  it('a concept that is a prerequisite of a mapped reaction takes that reaction\'s chapter (one hop)', () => {
    const reaction = DEMO.records.reaction['rxn_alcohol1-to-aldehyde-pcc' as never] as Record<string, unknown>;
    const state = {
      ...DEMO,
      records: { ...DEMO.records, reaction: { ...DEMO.records.reaction, 'rxn_alcohol1-to-aldehyde-pcc': { ...reaction, prerequisiteConceptIds: ['cpt_addition'] } } },
    } as unknown as CanonicalState;
    const index = chapterIndexOf(state);
    expect(titles(index(ref('concept', 'cpt_addition')))).toEqual(['Alcohols, phenols and ethers']);
    expect(index(ref('concept', 'cpt_ade'))).toEqual([]);
  });
});

describe('importIndexOf: where a record came from (A1)', () => {
  const importOf = importIndexOf(LOG, time);
  const row = queueRows(DEMO, () => [], {})[0] as QueueRow;

  it('a record with a known batch id is in that import, named by the file and the time', () => {
    expect(importOf(withBatch(row, 'imp_old', 'import')).title).toBe('first.orn.json · imported at 2026-10-01');
  });

  it('newer imports sort first', () => {
    expect(importOf(withBatch(row, 'imp_new', 'import')).order).toBeLessThan(importOf(withBatch(row, 'imp_old', 'import')).order);
  });

  it('an imported record with no known batch id: "Imported before tracking"; seed: "Demo data"; user: "Made in Studio"', () => {
    expect(importOf(withBatch(row, undefined, 'import')).title).toBe('Imported before tracking');
    expect(importOf(withBatch(row, 'imp_gone', 'legacy_import')).title).toBe('Imported before tracking');
    expect(importOf(withBatch(row, undefined, 'seed')).title).toBe('Demo data');
    expect(importOf(withBatch(row, undefined, 'user')).title).toBe('Made in Studio');
  });

  it('the last three come after every real import, in that order', () => {
    const orders = [withBatch(row, 'imp_old', 'import'), withBatch(row, undefined, 'import'), withBatch(row, undefined, 'seed'), withBatch(row, undefined, 'user')].map((r) => importOf(r).order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('groupQueueRows', () => {
  const rows = queueRows(DEMO, () => [], {});

  it('by kind: one group per kind in the kind words\' order, every row once, heading "<kind> (n)"', () => {
    const groups = groupQueueRows(rows, 'kind', places());
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(rows.length);
    const names = groups.map((g) => g.title);
    expect([...names].sort()).toEqual(names);
    expect(groups.every((g) => g.rows.every((r) => r.kindWords === g.title))).toBe(true);
    expect(groups[0]?.heading).toBe(`${groups[0]?.title} (${groups[0]?.rows.length})`);
  });

  it('by chapter: a row with none is in "No chapter yet", last; every row once per chapter', () => {
    const groups = groupQueueRows(rows, 'chapter', places());
    expect(groups.at(-1)?.title).toBe(NO_CHAPTER_TITLE);
    const listed = new Map<string, number>();
    for (const g of groups) for (const r of g.rows) listed.set(`${r.ref.kind}:${r.ref.id}`, (listed.get(`${r.ref.kind}:${r.ref.id}`) ?? 0) + 1);
    expect(listed.size).toBe(rows.length);
    expect(listed.get('reaction:rxn_alcohol1-to-aldehyde-pcc')).toBe(1);
    expect(groups.find((g) => g.title === NO_CHAPTER_TITLE)?.rows.some((r) => r.ref.kind === 'species')).toBe(true);
  });

  it('by import: newest first, then before tracking, demo data, made in Studio; heading "<file> · imported <time> · n records"', () => {
    const mixed = [withBatch(rows[0] as QueueRow, 'imp_old', 'import'), withBatch(rows[1] as QueueRow, 'imp_new', 'import'), withBatch(rows[2] as QueueRow, undefined, 'seed'), withBatch(rows[3] as QueueRow, undefined, 'user'), withBatch(rows[4] as QueueRow, undefined, 'import')];
    const groups = groupQueueRows(mixed, 'import', places());
    expect(groups.map((g) => g.title)).toEqual(['second.orn.json · imported at 2026-10-02', 'first.orn.json · imported at 2026-10-01', 'Imported before tracking', 'Demo data', 'Made in Studio']);
    expect(groups[0]?.heading).toBe('second.orn.json · imported at 2026-10-02 · 1 record');
    expect(groupQueueRows(mixed.slice(0, 1).concat(withBatch(rows[5] as QueueRow, 'imp_old', 'import')), 'import', places())[0]?.heading).toBe('first.orn.json · imported at 2026-10-01 · 2 records');
  });

  it('a group key is stable and unique', () => {
    for (const by of ['kind', 'chapter', 'import'] as const) {
      const groups = groupQueueRows(rows, by, places());
      expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
    }
  });
});

describe('groupByOf (the saved choice, read tolerantly)', () => {
  it('keeps a known choice and falls back to Import (the default) for anything else', () => {
    expect(groupByOf({ groupBy: 'chapter' })).toBe('chapter');
    expect(groupByOf({ groupBy: 'kind' })).toBe('kind');
    expect(groupByOf({ groupBy: 'import' })).toBe('import');
    for (const bad of [undefined, null, 3, 'chapter', {}, { groupBy: 'weeks' }, { groupBy: 7 }, []]) expect(groupByOf(bad)).toBe('import');
  });
});

describe('facetCountsOf (counts for the filter options, each dimension ignoring itself)', () => {
  const rows = queueRows(DEMO, () => [], {});

  it('with nothing chosen the kind, status and import counts add up to the rows', () => {
    const facets = facetCountsOf(rows, places(), {});
    expect([...facets.kinds.values()].reduce((n, one) => n + one.count, 0)).toBe(rows.length);
    expect([...facets.statuses.values()].reduce((n, one) => n + one.count, 0)).toBe(rows.length);
    expect([...facets.imports.values()].reduce((n, one) => n + one.count, 0)).toBe(rows.length);
  });

  it('a chapter chosen narrows the kind counts but not the chapter counts', () => {
    const all = facetCountsOf(rows, places(), {});
    const key = [...all.chapters.keys()][0] as string;
    const facets = facetCountsOf(rows, places(), { chapter: key });
    expect(facets.chapters.get(key)?.count).toBe(all.chapters.get(key)?.count);
    expect([...facets.kinds.values()].reduce((n, one) => n + one.count, 0)).toBe(all.chapters.get(key)?.count);
  });

  it('an import chosen narrows the other counts', () => {
    const mixed = rows.map((r, i) => withBatch(r, i % 2 === 0 ? 'imp_old' : 'imp_new', 'import'));
    const all = facetCountsOf(mixed, places(), {});
    expect(all.imports.get('imp_old')?.count).toBe(Math.ceil(rows.length / 2));
    const chosen = facetCountsOf(mixed, places(), { import: 'imp_old' });
    expect([...chosen.kinds.values()].reduce((n, one) => n + one.count, 0)).toBe(Math.ceil(rows.length / 2));
  });

  it('rows with no chapter are counted under "No chapter yet"', () => {
    const facets = facetCountsOf(rows, places(), {});
    expect(facets.chapters.get('none')?.title).toBe(NO_CHAPTER_TITLE);
    expect((facets.chapters.get('none')?.count ?? 0) > 0).toBe(true);
  });
});
