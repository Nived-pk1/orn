/**
 * Step 3.10: v5 compounds → ORN records (docs/MIGRATION.md §4.4), row by row. Inputs are small v5 documents run through the real
 * 3.8 port and the real ID space; every expected value is written out by hand, never derived from the mapper.
 */
import { describe, expect, it } from 'vitest';
import { AnyRecordSchema, type AnyRecord, type ChemicalClass, type Species } from '@/core/schema';
import { validator } from '@/core/validation';
import { coreIndexEngine } from '@/core/indexes/engine';
import { allRecords, FIXED_NOW, mapLegacy, stateOfRecords } from '@/test-support/legacy-map-kit';
import type { HubDecision } from './compound-map';

const doc = (compounds: unknown[]) => ({ schemaVersion: 5, compounds, reactions: [] });
const one = async (compound: Record<string, unknown>, decisions?: ReadonlyMap<string, HubDecision>) => {
  const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'Thing', ...compound }]), {}, decisions);
  return mapped;
};
const speciesOf = (m: Awaited<ReturnType<typeof one>>): Species => m.records.species[0] as Species;
const unmappedOf = (record: { provenance: { legacy?: { unmapped?: unknown } } }): Record<string, unknown> => (record.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;

describe('hubs (nodeType major)', () => {
  const hubs = doc([
    { id: 'c1', name: 'Alkanes', nodeType: 'major', fgId: 'alkane', genericFormula: 'R–H', smiles: 'CCCC', properties: 'Saturated.' },
    { id: 'c2', name: 'Some species' },
    { id: 'c3', name: 'Alcohols', nodeType: 'major', smiles: '' },
  ]);

  it('become a compound_class plus a navigator_anchor, in legacy order; the default decision is "class"', async () => {
    const { mapped } = await mapLegacy(hubs);
    expect(mapped.records.class.map((c) => [c.id, c.classKind, c.names.canonical])).toEqual([
      ['cls_v6-c1', 'compound_class', 'Alkanes'],
      ['cls_v6-c3', 'compound_class', 'Alcohols'],
    ]);
    expect(mapped.records.navigator_anchor.map((a) => [a.id, a.target, a.order])).toEqual([
      ['anc_v6-c1', { kind: 'class', id: 'cls_v6-c1' }, 1],
      ['anc_v6-c3', { kind: 'class', id: 'cls_v6-c3' }, 2],
    ]);
    expect(mapped.records.species.map((s) => s.id)).toEqual(['spc_v6-c2']);
    expect(mapped.hubs.map((h) => [h.legacyId, h.decision, h.ref])).toEqual([
      ['c1', 'class', { kind: 'class', id: 'cls_v6-c1' }],
      ['c3', 'class', { kind: 'class', id: 'cls_v6-c3' }],
    ]);
  });

  it('decided as species: a species (with its own structure) whose anchor targets the species; review says so', async () => {
    const { mapped } = await mapLegacy(hubs, {}, new Map<string, HubDecision>([['c1', 'species']]));
    // as a species the hub has memberships like any species: its fgId names no hub class, so a functional-group class is created
    expect(mapped.records.class.map((c) => c.id)).toEqual(['cls_v6-c3', 'cls_v6-fg-alkane']);
    const species = mapped.records.species.find((s) => s.id === 'spc_v6-c1') as Species;
    expect(species.classIds).toEqual(['cls_v6-fg-alkane']);
    expect(species.structure).toEqual({ format: 'smiles', value: 'CCCC' });
    expect(species.speciesKind).toBe('unspecified');
    expect(species.review.reasons).toContain('hub treated as a species by decision; its anchor targets the species');
    expect(mapped.records.navigator_anchor.map((a) => [a.id, a.target.kind, a.order])).toEqual([['anc_v6-c1', 'species', 1], ['anc_v6-c3', 'class', 2]]);
    expect(mapped.hubs[0]).toMatchObject({ legacyId: 'c1', decision: 'species' });
    // the hub's genericFormula has no species field: kept, not lost
    expect(unmappedOf(species)).toMatchObject({ genericFormula: 'R–H' });
  });

  it('never use the hub SMILES as the class structure: it stays in legacy.unmapped and the class is review_required', async () => {
    const { mapped } = await mapLegacy(hubs);
    const alkanes = mapped.records.class[0] as ChemicalClass;
    expect(alkanes.generic).toEqual({ formulaText: 'R–H' });
    expect(alkanes.exampleSpeciesIds).toEqual([]);
    expect(unmappedOf(alkanes)).toMatchObject({ smiles: 'CCCC' });
    expect(alkanes.review).toEqual({ lifecycle: 'published', status: 'review_required', reasons: ['representative SMILES not used; add an example species if intended'] });
    expect(JSON.stringify(alkanes)).not.toContain('structure');
    // a hub without a SMILES has nothing to explain
    expect(mapped.records.class[1]?.review).toEqual({ lifecycle: 'published', status: 'unreviewed', reasons: [] });
  });

  it('keep their functional-group and class fields as descriptions of the hub itself, not as memberships', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'Alkenes', nodeType: 'major', fgId: 'alkene', functionalGroups: ['alkene'], compoundClass: 'alkene' }]));
    expect(unmappedOf(mapped.records.class[0] as ChemicalClass)).toEqual({ fgId: 'alkene', functionalGroups: ['alkene'], compoundClass: 'alkene' });
    expect(mapped.records.class).toHaveLength(1); // no class was created for them
    expect(mapped.report.reviewItems).toEqual([]);
  });

  it('a hub with node:false is still a hub: class, anchor and an entity_display that never draws it as a node', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c2', name: 'Water', nodeType: 'major', node: false }]));
    expect(mapped.records.entity_display.map((d) => [d.id, d.target, d.showAsNode])).toEqual([['edp_v6-c2', { kind: 'class', id: 'cls_v6-c2' }, 'never']]);
    expect(mapped.records.navigator_anchor).toHaveLength(1);
  });
});

describe('plain compounds', () => {
  it.each(['auto', 'branched', 'sub'])('nodeType %s is a species with speciesKind unspecified', async (nodeType) => {
    const species = speciesOf(await one({ nodeType }));
    expect(species).toMatchObject({ id: 'spc_v6-c1', kind: 'species', speciesKind: 'unspecified', classIds: [], properties: [], citations: [] });
    expect(species.names).toEqual({ canonical: 'Thing', common: [], aliases: [] });
  });

  it('branched / sub are kept as unmapped.nodeType (a v6 view hint); auto leaves nothing behind', async () => {
    expect(unmappedOf(speciesOf(await one({ nodeType: 'branched' })))).toEqual({ nodeType: 'branched' });
    expect(unmappedOf(speciesOf(await one({ nodeType: 'sub' })))).toEqual({ nodeType: 'sub' });
    expect(speciesOf(await one({ nodeType: 'auto' })).provenance.legacy).toEqual({ system: 'organic-reaction-navigator-v6', legacyId: 'c1' });
  });

  it('name, smiles, formula, properties, acidBase and stereo land in their fields verbatim', async () => {
    const species = speciesOf(await one({ name: '  Ethanol ', smiles: 'CCO', formula: 'C2H6O', properties: 'A liquid.', acidBase: 'Weakly acidic.', tags: ['solvent', 'organic'] }));
    expect(species.names.canonical).toBe('  Ethanol '); // stored as written: no silent trimming
    expect(species.structure).toEqual({ format: 'smiles', value: 'CCO' });
    expect(species.formula).toBe('C2H6O');
    expect(species.notes).toBe('A liquid.');
    expect(species.acidBaseNotes).toBe('Weakly acidic.');
    expect(species.tags).toEqual(['solvent', 'organic']);
    expect(species.provenance.legacy?.unmapped).toBeUndefined();
    expect(species.review).toEqual({ lifecycle: 'published', status: 'unreviewed', reasons: [] });
  });

  it('empty legacy values store nothing', async () => {
    const species = speciesOf(await one({ smiles: '', formula: '', properties: '', acidBase: '', stereo: '', aromaticity: '', compoundClass: '' }));
    for (const key of ['structure', 'formula', 'notes', 'acidBaseNotes', 'stereo', 'aromaticity', 'studyNotes']) expect(species).not.toHaveProperty(key);
  });

  it.each([
    ['aromatic', 'aromatic'],
    ['non-aromatic', 'non_aromatic'],
    ['antiaromatic', 'antiaromatic'],
  ])('aromaticity "%s" is the enum value %s', async (text, value) => {
    const species = speciesOf(await one({ aromaticity: text }));
    expect(species.aromaticity).toBe(value);
    expect(species.review.reasons).toEqual([]);
  });

  it.each(['Aromatic', 'non aromatic', 'aromatic ', 'benzenoid'])('aromaticity %j is not exactly one of the three: unmapped + review, no guess', async (text) => {
    const species = speciesOf(await one({ aromaticity: text }));
    expect(species).not.toHaveProperty('aromaticity');
    expect(unmappedOf(species)).toEqual({ aromaticity: text });
    expect(species.review.status).toBe('review_required');
    expect(species.review.reasons[0]).toContain('is not exactly aromatic, non-aromatic or antiaromatic');
  });

  it('stereo text becomes stereo { kind: unspecified, descriptors: [], note } with a review reason; it is never interpreted', async () => {
    const species = speciesOf(await one({ stereo: '(2R,3S)-meso' }));
    expect(species.stereo).toEqual({ kind: 'unspecified', descriptors: [], note: '(2R,3S)-meso' });
    expect(species.review.status).toBe('review_required');
    expect(species.review.reasons[0]).toContain('stereo text "(2R,3S)-meso" was not interpreted');
  });

  it('jee.level goes to unmapped, jee.notes to studyNotes, unknown jee fields are kept and reported', async () => {
    const species = speciesOf(await one({ jee: { level: 'advanced', notes: 'Know the mechanism.', extra: { a: 1 } } }));
    expect(species.studyNotes).toBe('Know the mechanism.');
    expect(unmappedOf(species)).toEqual({ jee: { level: 'advanced', extra: { a: 1 } } });
    expect(species.review.reasons).toEqual(['unknown legacy field(s) in jee kept in legacy.unmapped: "extra"']);
  });

  it('node:false becomes an entity_display { showAsNode: never }; node:true creates nothing', async () => {
    const hidden = await one({ node: false });
    expect(hidden.records.entity_display).toEqual([
      { id: 'edp_v6-c1', kind: 'entity_display', target: { kind: 'species', id: 'spc_v6-c1' }, showAsNode: 'never', provenance: { origin: 'legacy_import', createdAt: FIXED_NOW, updatedAt: FIXED_NOW, legacy: { system: 'organic-reaction-navigator-v6', legacyId: 'c1' } } },
    ]);
    expect((await one({ node: true })).records.entity_display).toEqual([]);
  });

  it('tags over 64 characters (and blank ones) go to unmapped with a review reason; the others stay tags', async () => {
    const long = 'x'.repeat(65);
    const species = speciesOf(await one({ tags: ['ok', long, 'y'.repeat(64)] }));
    expect(species.tags).toEqual(['ok', 'y'.repeat(64)]);
    expect(unmappedOf(species)).toEqual({ tags: [long] });
    expect(species.review.reasons[0]).toContain('1 tag(s) cannot be stored');
  });

  it('a name the schema cannot hold keeps the value in unmapped and uses a numbered placeholder, with a review reason', async () => {
    for (const name of ['x'.repeat(301), 'bad\u0007name']) {
      const species = speciesOf(await one({ name }));
      expect(species.names.canonical).toBe('Unnamed legacy compound #1');
      expect(unmappedOf(species)).toEqual({ name });
      expect(species.review.status).toBe('review_required');
    }
    const nameless = speciesOf(await one({ name: '' }));
    expect(nameless.names.canonical).toBe('Unnamed legacy compound #1');
    expect(nameless.review.reasons).toEqual(['the compound has no name; a placeholder name was used']);
  });

  it('unknown fields are kept whole in unmapped and reported once per record', async () => {
    const species = speciesOf(await one({ custom: { deep: [1, 2] }, other: 'x' }));
    expect(unmappedOf(species)).toEqual({ custom: { deep: [1, 2] }, other: 'x' });
    expect(species.review.reasons).toEqual(['unknown legacy field(s) kept in legacy.unmapped: "custom", "other"']);
  });

  it('a smiles the schema cannot hold as a structure is kept in unmapped with a reason', async () => {
    const species = speciesOf(await one({ smiles: 'C'.repeat(20_001) }));
    expect(species).not.toHaveProperty('structure');
    expect(unmappedOf(species)).toEqual({ smiles: 'C'.repeat(20_001) });
    expect(species.review.status).toBe('review_required');
  });
});

describe('duplicate folded names', () => {
  it('a species and a class with one folded name are NOT told: SPC-005 (an INFO finding) covers that, and it is no duplicate', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'Alcohols' }, { id: 'c2', name: 'alcohols', nodeType: 'major' }]));
    expect(mapped.records.species[0]?.review.reasons).toEqual([]);
    expect(mapped.records.class[0]?.review.reasons).toEqual([]);
  });

  it('two species that fold alike are both told (SPC-001) and both review_required; two classes likewise (CLS-002)', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'Ethanol' }, { id: 'c2', name: 'ethanol' }, { id: 'c3', name: 'Alcohols', nodeType: 'major' }, { id: 'c4', name: 'alcohols', nodeType: 'major' }, { id: 'c5', name: 'Unique' }]));
    const reason = (id: string) => (mapped.records.species.find((s) => s.id === id) ?? mapped.records.class.find((c) => c.id === id))?.review.reasons;
    expect(reason('spc_v6-c1')).toEqual(['same folded name as "c2" (SPC-001); check whether they are duplicates']);
    expect(reason('spc_v6-c2')).toEqual(['same folded name as "c1" (SPC-001); check whether they are duplicates']);
    expect(reason('cls_v6-c3')).toEqual(['same folded name as "c4" (CLS-002); check whether they are duplicates']);
    expect(reason('cls_v6-c4')).toEqual(['same folded name as "c3" (CLS-002); check whether they are duplicates']);
    expect(reason('spc_v6-c5')).toEqual([]);
  });
});

describe('the §4.8 rule for what the v4 → v5 port dropped', () => {
  it('a dropped leaf with content is kept in unmapped.dropped with a review reason; an empty one is counted as consumed by default', async () => {
    const { mapped, normalized } = await mapLegacy(doc([{ id: 'c1', name: 'A', tags: [' padded ', ''], functionalGroups: 'Olefin, ' }]));
    expect(normalized.dropped.map((d) => d.path)).toEqual(expect.arrayContaining(['compounds[0].tags[0]', 'compounds[0].tags[1]']));
    const species = mapped.records.species[0] as Species;
    expect(unmappedOf(species).dropped).toMatchObject({ 'tags[0]': ' padded ', 'functionalGroups': 'Olefin, ' });
    expect(species.review.reasons.some((r) => r.includes("changed or dropped by v6's own normalisation"))).toBe(true);
    expect(mapped.report.consumedByDefault).toEqual({ 'compounds[*].tags[*]': 1 });
    expect(mapped.report.preservedUnmappedFields).toMatchObject({ 'dropped.tags[*]': 1, 'dropped.functionalGroups': 1 });
  });

  it('dropped leaves that belong to no compound come back untouched for step 3.11', async () => {
    // v6 stamps schemaVersion 5 and deletes v4 keys (`start`) from a v5 reaction: both are dropped leaves outside any compound
    const { mapped } = await mapLegacy({ ...doc([{ id: 'c1', name: 'A' }]), schemaVersion: 4, reactions: [{ id: 'r1', name: 'R', participants: [], start: 'c1' }] });
    expect(mapped.unhandledDropped.map((d) => d.path)).toEqual(expect.arrayContaining(['schemaVersion', 'reactions[0].start']));
    expect(mapped.unhandledDropped.every((d) => !d.path.startsWith('compounds['))).toBe(true);
  });
});

describe('timestamps, determinism, schema', () => {
  const rich = doc([
    { id: 'c1', name: 'Alkenes', nodeType: 'major', smiles: 'C=CC', fgId: 'alkene', tags: ['a'] },
    { id: 'c2', name: 'Propene', fgId: 'alkene', formula: 'C3H6', stereo: 'E', aromaticity: 'weird', compoundClass: 'olefin family', node: false },
    { id: 'c3', name: 'Other', functionalGroups: ['mystery'], jee: { level: 'x', notes: 'n' }, custom: 1 },
  ]);

  it('every timestamp comes from the injected clock', async () => {
    const { mapped } = await mapLegacy(rich, { now: () => '2030-01-02T03:04:05.006Z' });
    for (const record of allRecords(mapped)) {
      expect(record.provenance).toMatchObject({ origin: 'legacy_import', createdAt: '2030-01-02T03:04:05.006Z', updatedAt: '2030-01-02T03:04:05.006Z' });
    }
  });

  it('a clock that is not a UTC ISO timestamp is refused as a value, nothing is mapped', async () => {
    const { normalizeLegacyData, createDocumentIds, mapLegacyCompounds } = await import('./index');
    const n = normalizeLegacyData(rich);
    if (!n.ok) throw new Error('port');
    const result = await mapLegacyCompounds({ data: n.data, dropped: n.dropped, assignedIds: n.assignedIds, ids: createDocumentIds(n.data) }, { now: () => 'yesterday' });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_CLOCK' });
  });

  it('is deterministic: the same input gives byte-identical output, and never reads the system clock or Math.random', async () => {
    const realNow = Date.now;
    const realRandom = Math.random;
    let touched = 0;
    Date.now = () => ((touched += 1), realNow());
    Math.random = () => ((touched += 1), realRandom());
    try {
      const a = await mapLegacy(structuredClone(rich));
      const b = await mapLegacy(structuredClone(rich));
      expect(touched).toBe(0);
      expect(JSON.stringify(a.mapped, (_k, v: unknown) => (v instanceof Set ? [...v] : v instanceof Map ? [...v] : v))).toBe(JSON.stringify(b.mapped, (_k, v: unknown) => (v instanceof Set ? [...v] : v instanceof Map ? [...v] : v)));
    } finally {
      Date.now = realNow;
      Math.random = realRandom;
    }
  });

  it('every mapped record passes strict L1, and the mapped records alone have no L2/L3 ERROR', async () => {
    const { mapped } = await mapLegacy(rich);
    const records = allRecords(mapped);
    expect(records.length).toBeGreaterThan(6);
    for (const record of records) expect(AnyRecordSchema.safeParse(record), record.id).toMatchObject({ success: true });
    const state = stateOfRecords(records as AnyRecord[]);
    const findings = validator.validateAll(state, coreIndexEngine.build(state, 1));
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('the report counts what was created', async () => {
    const { mapped } = await mapLegacy(rich);
    expect(mapped.report).toMatchObject({ sourceSystem: 'organic-reaction-navigator-v6', sourceSchemaVersion: 5, notImported: [] });
    expect(mapped.report.createdCounts).toEqual({ class: 3, entity_display: 1, navigator_anchor: 1, species: 2 });
  });
});

