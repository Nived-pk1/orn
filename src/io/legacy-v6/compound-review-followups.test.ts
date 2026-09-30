/**
 * Step 3.10 review follow-ups (reviewer verdict 2026-09-30): (c) a hub's `formula` that differs from its `genericFormula` becomes
 * `generic.generalFormula`; (d) created classes are `published` + `review_required` and raise no RVW-002; (e) the class-ID namespaces
 * share one collision pass, so a crafted clash is settled by the ladder and the last-resort guard cannot be reached. Expected values
 * are written out by hand or computed from the ID rules of MIGRATION.md §4.2 (`legacyPart`, `textPart`), never from the mapper.
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hash64 } from '@/core/hash';
import { coreIndexEngine } from '@/core/indexes/engine';
import { AnyRecordSchema, type AnyRecord, type ChemicalClass, type Species } from '@/core/schema';
import { validator } from '@/core/validation';
import { legacyFixture } from '@/test-support/legacy-kit';
import { allRecords, mapLegacy, stateOfRecords } from '@/test-support/legacy-map-kit';
import { duplicatedIds } from './compound-review';
import { legacyPart, textPart } from './id-parts';

const doc = (compounds: unknown[]) => ({ schemaVersion: 5, compounds, reactions: [] });
const FIXTURES = ['v6-demo-export.json', 'v4-sample.json'] as const;
const GENERAL = 'general formula taken from the legacy hub formula; check it';
const unmappedOf = (record: { provenance: { legacy?: { unmapped?: unknown } } }): Record<string, unknown> => (record.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;

describe('(c) hub formula → generic.generalFormula', () => {
  it('a formula that differs from genericFormula is the general formula, with a review reason', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'h', name: 'Alkanes', nodeType: 'major', formula: 'CnH2n+2', genericFormula: 'R–H' }]));
    const hub = mapped.records.class[0] as ChemicalClass;
    expect(hub.generic).toEqual({ formulaText: 'R–H', generalFormula: 'CnH2n+2' });
    expect(hub.review.reasons).toEqual([GENERAL]);
    expect(unmappedOf(hub)).not.toHaveProperty('formula');
    expect(mapped.report.reviewItems).toContainEqual({ subject: { kind: 'class', id: hub.id }, reason: GENERAL });
    expect(mapped.consumed.has('compounds[0].formula')).toBe(true);
  });

  it('a formula equal to genericFormula stays in legacy.unmapped, without a review reason', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'h', name: 'Halides', nodeType: 'major', formula: 'R–X', genericFormula: 'R–X' }]));
    const hub = mapped.records.class[0] as ChemicalClass;
    expect(hub.generic).toEqual({ formulaText: 'R–X' });
    expect(unmappedOf(hub)).toEqual({ formula: 'R–X' });
    expect(hub.review.reasons).toEqual([]);
    expect(mapped.report.preservedUnmappedFields).toEqual({ formula: 1 });
  });

  it('is compared exactly as stored: a dash, a space or a case difference counts as different', async () => {
    const { mapped } = await mapLegacy(doc([
      { id: 'h1', name: 'A', nodeType: 'major', formula: 'ArOH', genericFormula: 'Ar–OH' },
      { id: 'h2', name: 'B', nodeType: 'major', formula: 'R-X ', genericFormula: 'R-X' },
    ]));
    expect(mapped.records.class.map((c) => c.generic?.generalFormula)).toEqual(['ArOH', 'R-X ']);
  });

  it('a formula but no genericFormula is the general formula too; an empty formula stores nothing', async () => {
    const { mapped } = await mapLegacy(doc([
      { id: 'h1', name: 'A', nodeType: 'major', formula: 'CnHm' },
      { id: 'h2', name: 'B', nodeType: 'major', formula: '', genericFormula: 'R–H' },
    ]));
    expect(mapped.records.class[0]?.generic).toEqual({ generalFormula: 'CnHm' });
    expect(mapped.records.class[1]?.generic).toEqual({ formulaText: 'R–H' });
    expect(mapped.records.class[1]?.review.reasons).toEqual([]);
  });

  it('a formula the field cannot hold is kept whole with a reason (nothing invented, nothing lost)', async () => {
    const long = 'C'.repeat(500);
    const { mapped } = await mapLegacy(doc([{ id: 'h1', name: 'A', nodeType: 'major', formula: long, genericFormula: 'R–H' }, { id: 'h2', name: 'B', nodeType: 'major', formula: 7 }]));
    const [a, b] = mapped.records.class as [ChemicalClass, ChemicalClass];
    for (const hub of [a, b]) expect(hub.generic?.generalFormula).toBeUndefined();
    expect(unmappedOf(a)).toEqual({ formula: long });
    expect(unmappedOf(b)).toEqual({ formula: 7 });
    expect(a.review.reasons[0]).toContain('cannot be stored as a general formula');
  });

  it('a hub decided as species keeps its formula as the species formula; a species is untouched', async () => {
    const decisions = new Map([['h', 'species' as const]]);
    const { mapped } = await mapLegacy(doc([{ id: 'h', name: 'Alkanes', nodeType: 'major', formula: 'CnH2n+2', genericFormula: 'R–H' }, { id: 'c1', name: 'Ethane', formula: 'C2H6' }]), {}, decisions);
    expect(mapped.records.species.map((s) => s.formula)).toEqual(['CnH2n+2', 'C2H6']);
    expect(mapped.records.species.every((s) => !s.review.reasons.includes(GENERAL))).toBe(true);
  });

  it('on the demo fixture: the series formulas are general formulas, hubs whose formula repeats genericFormula are not', async () => {
    const { mapped } = await mapLegacy(legacyFixture('v6-demo-export.json'));
    const generals = new Map(mapped.records.class.filter((c) => c.generic?.generalFormula !== undefined).map((c) => [c.id, c.generic?.generalFormula] as const));
    expect(generals.get('cls_v6-c1' as never)).toBe('CnH2n+2');
    expect(generals.get('cls_v6-c2' as never)).toBe('CnH2n');
    expect(generals.get('cls_v6-c3' as never)).toBe('CnH2n-2');
    expect(generals.get('cls_v6-c4' as never)).toBe('CnHm');
    expect(generals.has('cls_v6-c5' as never)).toBe(false); // R–X = R–X
    expect(unmappedOf(mapped.records.class.find((c) => c.id === 'cls_v6-c5') as ChemicalClass)).toMatchObject({ formula: 'R–X' });
  });
});

describe('(d) created classes are published + review_required', () => {
  it.each(FIXTURES)('%s: created classes raise no RVW-002, and the mapped records have no L1-L3 ERROR', async (name) => {
    const { mapped } = await mapLegacy(legacyFixture(name));
    const created = mapped.records.class.filter((k) => k.id.startsWith('cls_v6-fg-') || k.id.startsWith('cls_v6-l-'));
    for (const c of created) {
      expect(c.review, c.id).toMatchObject({ lifecycle: 'published', status: 'review_required' });
    }
    if (name === 'v6-demo-export.json') expect(created.length).toBeGreaterThan(0);
    const records = allRecords(mapped);
    for (const record of records) expect(AnyRecordSchema.safeParse(record), record.id).toMatchObject({ success: true });
    const state = stateOfRecords(records as AnyRecord[]);
    const findings = validator.validateAll(state, coreIndexEngine.build(state, 1));
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(findings.filter((f) => f.ruleId === 'RVW-002')).toEqual([]);
  });

  it('the created-class kinds are both covered: a functional-group class and a compoundClass-text class', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'A', fgId: 'mystery', compoundClass: 'Some family' }, { id: 'c2', name: 'B', compoundClass: 'Some Family' }]));
    expect(mapped.records.class.map((c) => [c.classKind, c.review.lifecycle, c.review.status])).toEqual([
      ['functional_group', 'published', 'review_required'],
      ['compound_class', 'published', 'review_required'],
    ]);
    const state = stateOfRecords(allRecords(mapped) as AnyRecord[]);
    expect(validator.validateAll(state, coreIndexEngine.build(state, 1)).filter((f) => f.ruleId === 'RVW-002')).toEqual([]);
  });
});

describe('(e) the class-ID namespaces share one collision pass', () => {
  const ids = (mapped: Awaited<ReturnType<typeof mapLegacy>>['mapped']): string[] => allRecords(mapped).map((r) => r.id as string);

  it('a hub `fg-x` and the functional-group class of `x` are both moved to longer hashes and reported', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'fg-x', name: 'H', nodeType: 'major' }, { id: 'c1', name: 'S', fgId: 'x' }]));
    const [hub, made] = mapped.records.class as [ChemicalClass, ChemicalClass];
    expect(hub.id).toBe(`cls_v6-fg-x-${hash64('fg-x').slice(0, 12)}`);
    expect(made.id).toBe(`cls_v6-fg-x-${hash64('x').slice(0, 12)}`);
    expect(new Set(ids(mapped)).size).toBe(ids(mapped).length);
    // the hub's other IDs move with its part: one part per compound, whatever the prefix
    expect(mapped.records.navigator_anchor[0]?.id).toBe(`anc_v6-fg-x-${hash64('fg-x').slice(0, 12)}`);
    expect(hub.review.reasons.some((r) => r.includes('its ID part collided with "x"'))).toBe(true);
    expect(made.review.reasons.some((r) => r.includes('its ID part collided with "fg-x"'))).toBe(true);
    expect(mapped.report.reviewItems.filter((i) => i.reason.includes('collided'))).toHaveLength(2);
  });

  it('a hub whose id reads like the class of a compoundClass text is settled the same way', async () => {
    const part = textPart('some family', 0);
    const clash = `l-${part}`; // cls_v6-l-<part> from the compound, and from the text
    const { mapped } = await mapLegacy(doc([{ id: clash, name: 'H', nodeType: 'major' }, { id: 'c1', name: 'S', compoundClass: 'Some family' }]));
    const [hub, made] = mapped.records.class as [ChemicalClass, ChemicalClass];
    expect(hub.id).toBe(`cls_v6-${legacyPart(clash, 1)}`);
    expect(made.id).toBe(`cls_v6-l-${textPart('some family', 1)}`);
    expect(new Set(ids(mapped)).size).toBe(ids(mapped).length);
    expect((mapped.records.species[0] as Species).classIds).toEqual([made.id]);
  });

  it('a compound whose id reads like a label species part is settled in the spc family', async () => {
    const { createLegacyIdSpace } = await import('./id-space');
    const clash = `l-${textPart('koh', 0)}`;
    const space = createLegacyIdSpace({ compoundIds: [clash], labels: ['KOH'] });
    expect(space.speciesId(clash)).not.toBe(space.speciesFromLabelId('KOH'));
    expect(space.collisions.map((c) => c.namespace)).toEqual(['compound+label']);
    expect(space.reagentFromLabelId('KOH')).toBe(`rgt_v6-l-${textPart('koh', 1)}`); // the label part moved, in every prefix
  });

  it('a label and a class text that fold alike are NOT a collision (different ID families)', async () => {
    const { createLegacyIdSpace } = await import('./id-space');
    const space = createLegacyIdSpace({ labels: ['KOH'], classTexts: ['koh'] });
    expect(space.collisions).toEqual([]);
    expect(space.speciesFromLabelId('KOH')).toBe(`spc_v6-l-${textPart('koh', 0)}`);
    expect(space.classFromTextId('koh')).toBe(`cls_v6-l-${textPart('koh', 0)}`);
  });

  it('is order independent and deterministic', async () => {
    const a = await mapLegacy(doc([{ id: 'fg-x', name: 'H', nodeType: 'major' }, { id: 'c1', name: 'S', fgId: 'x' }]));
    const b = await mapLegacy(doc([{ id: 'c1', name: 'S', fgId: 'x' }, { id: 'fg-x', name: 'H', nodeType: 'major' }]));
    expect(ids(b.mapped).sort()).toEqual(ids(a.mapped).sort());
  });

  it.each(FIXTURES)('%s: without a clash every ID is exactly the tier-0 part of §4.2 and nothing is reported as a collision', async (name) => {
    const { mapped, data } = await mapLegacy(legacyFixture(name));
    const expected = new Set<string>();
    for (const compound of data.compounds) {
      const id = compound.id as string;
      const hub = compound.nodeType === 'major';
      expected.add(hub ? `cls_v6-${legacyPart(id, 0)}` : `spc_v6-${legacyPart(id, 0)}`);
      if (hub) expected.add(`anc_v6-${legacyPart(id, 0)}`);
      if (compound.node === false) expected.add(`edp_v6-${legacyPart(id, 0)}`);
    }
    for (const [fg, classId] of mapped.functionalGroupClass) if (classId.startsWith('cls_v6-fg-')) expect(classId).toBe(`cls_v6-fg-${legacyPart(fg, 0)}`);
    const got = new Set(ids(mapped).filter((id) => /^(spc|anc|edp)_/.test(id) || (id.startsWith('cls_v6-') && !id.startsWith('cls_v6-fg-') && !id.startsWith('cls_v6-l-'))));
    expect([...got].sort()).toEqual([...expected].sort());
    for (const item of mapped.report.reviewItems) expect(item.reason).not.toContain('collided');
  });

  it('DUPLICATE_RECORD_ID is a last-resort guard: it reports what occurs twice and cannot be reached from crafted clashes (property)', async () => {
    expect(duplicatedIds(['a', 'b', 'a', 'c', 'b', 'a'])).toEqual(['a', 'b']);
    expect(duplicatedIds(['a', 'b'])).toEqual([]);
    const piece = fc.constantFrom('fg-', 'l-', 'x', 'alkene', 'c1', '-', '!', 'Some family', 'koh', hash64('x').slice(0, 6), hash64('alkene').slice(0, 6), hash64('fg-x').slice(0, 6));
    const text = fc.array(piece, { minLength: 1, maxLength: 4 }).map((parts) => parts.join(''));
    const compound = fc.record({ id: text, hub: fc.boolean(), fgId: fc.option(text, { nil: undefined }), compoundClass: fc.option(text, { nil: undefined }) });
    await fc.assert(
      fc.asyncProperty(fc.array(compound, { minLength: 1, maxLength: 8 }), async (list) => {
        const compounds = list.map((c, i) => ({ id: c.id, name: `N${i}`, ...(c.hub ? { nodeType: 'major' } : {}), ...(c.fgId === undefined ? {} : { fgId: c.fgId }), ...(c.compoundClass === undefined ? {} : { compoundClass: c.compoundClass }) }));
        const { mapped } = await mapLegacy(doc(compounds)); // throws when the mapper refuses
        const all = ids(mapped);
        expect(new Set(all).size).toBe(all.length);
      }),
      { numRuns: 120, seed: 11 },
    );
  });
});
