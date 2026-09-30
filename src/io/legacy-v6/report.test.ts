/**
 * Step 3.10: the `LegacyImportReport` skeleton (docs/MIGRATION.md §4.7-§4.8): counts, review items, preserved unmapped fields,
 * consumed-by-default counts, informational notes (never review items), notImported. Deterministic key order.
 */
import { describe, expect, it } from 'vitest';
import { mapLegacy } from '@/test-support/legacy-map-kit';
import { createDocumentIds, mapLegacyCompounds, normalizeLegacyData } from './index';
import { createReportBuilder, LEGACY_SYSTEM } from './report';
import { generalizePath, isEmptyLegacyValue } from './trace';

const ref = (id: string) => ({ kind: 'species', id }) as const;

describe('createReportBuilder', () => {
  it('starts empty and stamps the source system and schema version', () => {
    expect(createReportBuilder(5).build()).toEqual({
      sourceSystem: LEGACY_SYSTEM,
      sourceSchemaVersion: 5,
      createdCounts: {},
      reviewItems: [],
      preservedUnmappedFields: {},
      notImported: [],
      consumedByDefault: {},
      notes: {},
      documentUnmapped: {},
    });
  });

  it('counts what it is told, in sorted key order; notes never become review items', () => {
    const report = createReportBuilder(5);
    report.created('species');
    report.created('class');
    report.created('species');
    report.review(ref('spc_v6-c1'), 'why');
    report.preserved('smiles');
    report.preserved('jee.level');
    report.preserved('smiles');
    report.consumedByDefault('compounds[*].name');
    report.note('FLAG_SUBSUMED');
    report.note('FLAG_SUBSUMED');
    report.notImported('c9', 'because');
    const built = report.build();
    expect(built.createdCounts).toEqual({ class: 1, species: 2 });
    expect(Object.keys(built.createdCounts)).toEqual(['class', 'species']);
    expect(built.reviewItems).toEqual([{ subject: ref('spc_v6-c1'), reason: 'why' }]);
    expect(Object.entries(built.preservedUnmappedFields)).toEqual([['jee.level', 1], ['smiles', 2]]);
    expect(built.consumedByDefault).toEqual({ 'compounds[*].name': 1 });
    expect(built.notes).toEqual({ FLAG_SUBSUMED: 2 });
    expect(built.notImported).toEqual([{ legacyId: 'c9', reason: 'because' }]);
  });

  it('absorb adds another report to this one', () => {
    const a = createReportBuilder(5);
    a.created('species');
    a.preserved('smiles');
    a.note('X');
    const b = createReportBuilder(5);
    b.created('species');
    b.created('reaction');
    b.review(ref('spc_v6-c1'), 'r');
    b.preserved('smiles');
    b.consumedByDefault('p');
    b.notImported('c1', 'no');
    a.absorb(b.build());
    expect(a.build()).toMatchObject({ createdCounts: { reaction: 1, species: 2 }, preservedUnmappedFields: { smiles: 2 }, consumedByDefault: { p: 1 }, notes: { X: 1 }, notImported: [{ legacyId: 'c1', reason: 'no' }] });
    expect(a.build().reviewItems).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('generalizePath writes every index as [*]', () => {
    expect(generalizePath('compounds[12].tags[3]')).toBe('compounds[*].tags[*]');
    expect(generalizePath('compounds[0].jee.level')).toBe('compounds[*].jee.level');
    expect(generalizePath('compounds[0]["a[1]b"]')).toBe('compounds[*]["a[*]b"]');
  });

  it.each([['', true], [null, true], [[], true], [{}, true], [0, false], [false, false], ['x', false], [[0], false], [{ a: 1 }, false], [undefined, false]])('isEmptyLegacyValue(%j) = %s', (value, expected) => {
    expect(isEmptyLegacyValue(value)).toBe(expected);
  });
});

describe('the report of the compound mapper', () => {
  const input = { schemaVersion: 5, reactions: [], compounds: [{ id: 'c1', name: 'H', nodeType: 'major', smiles: 'CC' }, { name: 'no id' }] };

  it('a successful run is absorbed into the caller\'s builder; the run\'s own report is the compound part', async () => {
    const shared = createReportBuilder(5);
    shared.created('reaction'); // something step 3.11 already counted
    const { mapped } = await mapLegacy(input, { report: shared });
    expect(mapped.report.createdCounts).toEqual({ class: 1, navigator_anchor: 1, species: 1 });
    expect(shared.build().createdCounts).toEqual({ class: 1, navigator_anchor: 1, reaction: 1, species: 1 });
    expect(shared.build().reviewItems).toEqual(mapped.report.reviewItems);
  });

  it("a REFUSED run leaves the caller's builder exactly as it was", async () => {
    const shared = createReportBuilder(5);
    shared.created('reaction');
    const before = JSON.stringify(shared.build());
    const n = normalizeLegacyData({ schemaVersion: 5, reactions: [], compounds: [{ id: 'h', name: 'H', nodeType: 'major' }, { id: 'c1', name: 'S', fgId: 'alkene' }] });
    if (!n.ok) throw new Error(n.message);
    const result = await mapLegacyCompounds({ data: n.data, dropped: n.dropped, assignedIds: n.assignedIds, ids: createDocumentIds(n.data) }, { now: () => 'yesterday', report: shared });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_CLOCK' });
    expect(JSON.stringify(shared.build())).toBe(before);
  });

  it('every review item names a record that exists and repeats a reason the record itself carries', async () => {
    const { mapped } = await mapLegacy({ schemaVersion: 5, reactions: [], compounds: [{ id: 'h', name: 'H', nodeType: 'major', smiles: 'CC' }, { id: 'c1', name: 'S', fgId: 'mystery', stereo: 'R' }] });
    const records = new Map([...mapped.records.species, ...mapped.records.class].map((r) => [r.id, r] as const));
    expect(mapped.report.reviewItems.length).toBeGreaterThan(2);
    for (const item of mapped.report.reviewItems) expect(records.get(item.subject.id as never)?.review.reasons, item.reason).toContain(item.reason);
    // and every review_required record is in the report
    for (const record of records.values()) if (record.review.status === 'review_required') expect(mapped.report.reviewItems.some((i) => i.subject.id === record.id)).toBe(true);
  });
});
