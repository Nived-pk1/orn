/**
 * Step 3.11b: the transformation rows of docs/MIGRATION.md §4.5: `transformation.from / to` → `generalizedEquation`, `fgFrom / fgTo` →
 * a transformation record matched by class sets, `bondChanges` → its `bondChangeSummary`. Small v5 documents run through the real
 * chain; every expected value is written by hand.
 */
import { describe, expect, it } from 'vitest';
import { TransformationIdSchema, type Reaction } from '@/core/schema';
import { mapClassified, type ClassifiedAll } from '@/test-support/legacy-classify-kit';
import type { HubDecision } from './compound-map';

const COMPOUNDS = [
  { id: 'c1', name: 'Alkenes', nodeType: 'major', fgId: 'alkene' },
  { id: 'c2', name: 'Alcohols', nodeType: 'major', fgId: 'alcohol' },
  { id: 'c3', name: 'Ethene', functionalGroups: ['alkene'] },
  { id: 'c4', name: 'Ethanol', functionalGroups: ['alcohol'] },
];
const part = (role: string, ref: string, extra: Record<string, unknown> = {}) => ({ ref, label: '', role, major: false, note: '', image: '', ...extra });
const BASE = [part('substrate', 'c3'), part('product', 'c4', { major: true })];
const rx = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Reaction ${id}`, participants: BASE, ...extra });
const run = (reactions: unknown[], options: Parameters<typeof mapClassified>[1] = {}, compounds: unknown[] = COMPOUNDS) => mapClassified({ schemaVersion: 5, compounds, reactions }, options);
const reactionOf = (all: ClassifiedAll, n = 0): Reaction => all.classification.records.reaction[n] as Reaction;
const unmappedOf = (record: { provenance: { legacy?: { unmapped?: unknown } } }): Record<string, unknown> => (record.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;
const reasonsOf = (r: Reaction): string[] => [...r.review.reasons];

describe('transformation.from / to → generalizedEquation', () => {
  it.each([
    [{ from: 'R–CH2OH', to: 'R–CHO' }, 'R–CH2OH → R–CHO'],
    [{ from: 'R–X', to: '' }, 'R–X'],
    [{ from: '', to: 'R–OH' }, '→ R–OH'],
  ])('%j → %j', async (transformation, expected) => {
    const all = await run([rx('r1', { transformation })]);
    expect(reactionOf(all).generalizedEquation).toBe(expected);
    expect(all.classification.consumed.has('reactions[0].transformation.from')).toBe(true);
    expect(all.classification.consumed.has('reactions[0].transformation.to')).toBe(true);
  });

  it('both empty: no equation, both leaves consumed', async () => {
    const all = await run([rx('r1', { transformation: { from: '', to: '' } })]);
    expect(reactionOf(all).generalizedEquation).toBeUndefined();
    expect(all.classification.consumed.has('reactions[0].transformation.from')).toBe(true);
  });

  it('text the equation cannot hold is kept whole with a reason (never cut)', async () => {
    const long = 'x'.repeat(1_500);
    const all = await run([rx('r1', { transformation: { from: long, to: 'B' } })]);
    const reaction = reactionOf(all);
    expect(reaction.generalizedEquation).toBe('→ B');
    expect(unmappedOf(reaction).transformation).toEqual({ from: long });
    expect(reasonsOf(reaction).some((r) => r.startsWith('transformation.from cannot be stored as equation text'))).toBe(true);
  });
});

describe('transformation.fgFrom / fgTo → a transformation record matched by class sets', () => {
  const tf = (extra: Record<string, unknown> = {}) => ({ from: 'R2C=CR2', to: 'R–CH2OH', fgFrom: ['alkene'], fgTo: ['alcohol'], bondChanges: '', ...extra });

  it('creates ONE published, review_required transformation from the hub classes; the reaction refers to it', async () => {
    const all = await run([rx('r1', { transformation: tf({ bondChanges: 'C=C π bond → C–O σ bond' }) })]);
    const [record, ...others] = all.classification.records.transformation;
    expect(others).toEqual([]);
    expect(TransformationIdSchema.safeParse(record?.id).success).toBe(true);
    expect(record).toMatchObject({
      kind: 'transformation',
      name: 'Alkenes → Alcohols',
      fromClassIds: ['cls_v6-c1'],
      toClassIds: ['cls_v6-c2'],
      bondChangeSummary: 'C=C π bond → C–O σ bond',
      conceptIds: [],
      review: { lifecycle: 'published', status: 'review_required' },
    });
    expect(record?.review.reasons).toHaveLength(1);
    expect(reactionOf(all).transformationIds).toEqual([record?.id]);
    expect(all.classification.consumed.has('reactions[0].transformation.bondChanges')).toBe(true);
    expect(all.classification.report.createdCounts.transformation).toBe(1);
    expect(all.classification.report.reviewItems.filter((i) => i.subject.id === record?.id)).toHaveLength(1);
  });

  it('a second reaction with the same class sets (other order, repeats, another spelling of the group) shares the record', async () => {
    const all = await run([
      rx('r1', { transformation: tf({ fgFrom: ['alkene', 'alkene'] }) }),
      rx('r2', { transformation: tf({ fgFrom: ['Olefin'], from: 'other text' }) }),
    ]);
    expect(all.classification.records.transformation).toHaveLength(1);
    expect(all.classification.records.reaction.map((r) => r.transformationIds)).toEqual([[all.classification.records.transformation[0]?.id], [all.classification.records.transformation[0]?.id]]);
    expect(all.classification.report.notes.FG_REPEATED_IN_SET).toBe(1);
    // both keep their own equation text
    expect(all.classification.records.reaction.map((r) => r.generalizedEquation)).toEqual(['R2C=CR2 → R–CH2OH', 'other text → R–CH2OH']);
  });

  it('the same class set written in another order on another reaction is the same record, and its class lists are sorted', async () => {
    const all = await run([rx('r1', { transformation: tf({ fgFrom: ['alkene', 'alcohol'], fgTo: ['alcohol'] }) }), rx('r2', { transformation: tf({ fgFrom: ['alcohol', 'alkene'], fgTo: ['alcohol'] }) })]);
    expect(all.classification.records.transformation).toHaveLength(1);
    expect(all.classification.records.transformation[0]?.fromClassIds).toEqual(['cls_v6-c1', 'cls_v6-c2']);
    expect(all.classification.records.reaction.map((r) => r.transformationIds)).toEqual([[all.classification.records.transformation[0]?.id], [all.classification.records.transformation[0]?.id]]);
  });

  it('different class sets are different records; the ID does not depend on the order of the ids inside a set', async () => {
    const a = await run([rx('r1', { transformation: tf({ fgFrom: ['alkene', 'alcohol'], fgTo: ['alcohol'] }) })]);
    const b = await run([rx('r1', { transformation: tf({ fgFrom: ['alcohol', 'alkene'], fgTo: ['alcohol'] }) })]);
    const c = await run([rx('r1', { transformation: tf() })]);
    expect(a.classification.records.transformation[0]?.id).toBe(b.classification.records.transformation[0]?.id);
    expect(a.classification.records.transformation[0]?.id).not.toBe(c.classification.records.transformation[0]?.id);
    expect(a.classification.records.transformation[0]?.fromClassIds).toEqual(['cls_v6-c1', 'cls_v6-c2']);
  });

  it('a later reaction with another bond-change text: the first stays, the new text is kept in unmapped with a reason', async () => {
    const all = await run([rx('r1', { transformation: tf({ bondChanges: 'first' }) }), rx('r2', { transformation: tf({ bondChanges: 'second' }) }), rx('r3', { transformation: tf({ bondChanges: 'first' }) })]);
    expect(all.classification.records.transformation[0]?.bondChangeSummary).toBe('first');
    const [, second, third] = all.classification.records.reaction;
    expect(unmappedOf(second as Reaction).transformation).toEqual({ bondChanges: 'second' });
    expect(reasonsOf(second as Reaction).some((r) => r.includes('already has another bond-change text'))).toBe(true);
    expect(unmappedOf(third as Reaction).transformation).toBeUndefined();
  });

  it('a bond-change text on a record without one is stored (first non-empty wins, whichever reaction comes first)', async () => {
    const all = await run([rx('r1', { transformation: tf() }), rx('r2', { transformation: tf({ bondChanges: 'later text' }) })]);
    expect(all.classification.records.transformation[0]?.bondChangeSummary).toBe('later text');
    expect(unmappedOf(reactionOf(all, 1)).transformation).toBeUndefined();
  });

  it('a group carried only by a hub decided as class resolves to that hub class, even when no species lists it (the first hub wins)', async () => {
    const compounds = [{ id: 'h1', name: 'Alkenes', nodeType: 'major', fgId: 'alkene' }, { id: 'h2', name: 'Alkenes again', nodeType: 'major', fgId: 'alkene' }, { id: 'h3', name: 'Alcohols', nodeType: 'major', fgId: 'alcohol' }, { id: 'c9', name: 'Ethene' }];
    const reaction = { id: 'r1', name: 'R', participants: [part('substrate', 'c9'), part('product', 'c9', { major: true })], transformation: tf() };
    const asClass = await run([reaction], {}, compounds);
    expect(asClass.classification.records.transformation[0]).toMatchObject({ fromClassIds: ['cls_v6-h1'], toClassIds: ['cls_v6-h3'] });
    // decided as species, a hub is a member of its own group (step 3.10 made a functional-group class for it): the group resolves to that class
    const asSpecies = await run([reaction], { decisions: new Map<string, HubDecision>([['h1', 'species'], ['h2', 'species'], ['h3', 'species']]) }, compounds);
    expect(asSpecies.classification.records.transformation[0]).toMatchObject({ fromClassIds: ['cls_v6-fg-alkene'], toClassIds: ['cls_v6-fg-alcohol'] });
    // the second hub decided as class while the first is a species: the first hub that IS a class carries the group
    const mixed = await run([reaction], { decisions: new Map<string, HubDecision>([['h1', 'species']]) }, compounds);
    expect(mixed.classification.records.transformation[0]).toMatchObject({ fromClassIds: ['cls_v6-h2'] });
  });

  it('a functional group no compound carries is kept with a reason; the class that exists is still used', async () => {
    const all = await run([rx('r1', { transformation: tf({ fgTo: ['alcohol', 'mystery'] }) })]);
    const reaction = reactionOf(all);
    expect(all.classification.records.transformation[0]?.toClassIds).toEqual(['cls_v6-c2']);
    expect(unmappedOf(reaction).transformation).toEqual({ fgTo: ['mystery'] });
    expect(reasonsOf(reaction).some((r) => r.includes('"mystery"') && r.includes('have no class in this import'))).toBe(true);
  });

  it('no class at all: no transformation record; the groups are kept; bondChanges is kept with a reason', async () => {
    const all = await run([rx('r1', { transformation: tf({ fgFrom: ['mystery'], fgTo: [], bondChanges: 'text' }) })]);
    const reaction = reactionOf(all);
    expect(all.classification.records.transformation).toEqual([]);
    expect(reaction.transformationIds).toEqual([]);
    expect(unmappedOf(reaction).transformation).toEqual({ fgFrom: ['mystery'], bondChanges: 'text' });
    expect(reasonsOf(reaction).some((r) => r.includes('has no transformation record to belong to'))).toBe(true);
  });

  it('a bondChanges value that is not text is kept, never coerced', async () => {
    const all = await run([rx('r1', { transformation: tf({ bondChanges: 5 }) })]);
    expect(all.classification.records.transformation[0]?.bondChangeSummary).toBeUndefined();
    expect(unmappedOf(reactionOf(all)).transformation).toEqual({ bondChanges: 5 });
  });

  it('empty fg lists (the usual case) make no transformation and no reason', async () => {
    const all = await run([rx('r1', { transformation: tf({ fgFrom: [], fgTo: [] }) })]);
    expect(all.classification.records.transformation).toEqual([]);
    expect(reasonsOf(reactionOf(all))).toEqual([]);
  });

  // 'alkene' is in the legacy registry (label Alkene); 'alcohol' is not, so its class is named after the id
  it('with the hubs decided as species the groups resolve to created functional-group classes', async () => {
    const decisions = new Map<string, HubDecision>([['c1', 'species'], ['c2', 'species']]);
    const all = await run([rx('r1', { transformation: tf() })], { decisions });
    expect(all.classification.records.transformation[0]).toMatchObject({ fromClassIds: ['cls_v6-fg-alkene'], toClassIds: ['cls_v6-fg-alcohol'], name: 'Alkene → alcohol' });
  });

  it('an ID part collision is never merged: unusual group ids still give valid, distinct IDs', async () => {
    const compounds = [{ id: 'c1', name: 'A', functionalGroups: ['x y'] }, { id: 'c2', name: 'B', functionalGroups: ['x-y'] }, { id: 'c3', name: 'C', functionalGroups: ['X.Y'] }];
    const all = await run([rx('r1', { transformation: { fgFrom: ['x y'], fgTo: ['x-y'] } }), rx('r2', { transformation: { fgFrom: ['x-y'], fgTo: ['X.Y'] } })], {}, compounds);
    const ids = all.classification.records.transformation.map((t) => t.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(TransformationIdSchema.safeParse(id).success).toBe(true);
  });
});
