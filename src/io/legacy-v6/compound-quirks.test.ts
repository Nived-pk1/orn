/**
 * Step 3.10: the §4.9 quirk of compounds in real v6 data ("Hubs carry example structures: Alkanes CCCC, Alkenes C=CC, Arenes
 * anthracene, Alcohols CCO, Ketones acetone") on the real fixture, in both hub decisions, plus what the two fixtures and the hostile
 * cases must produce as strict-L1 records. Expected SMILES are typed here, not read from the mapper.
 */
import { describe, expect, it } from 'vitest';
import { AnyRecordSchema, type ChemicalClass, type Species } from '@/core/schema';
import { allRecords, mapLegacy } from '@/test-support/legacy-map-kit';
import { legacyFixture } from '@/test-support/legacy-kit';
import type { HubDecision } from './compound-map';

const EXAMPLES = [
  ['c1', 'Alkanes', 'CCCC'],
  ['c2', 'Alkenes', 'C=CC'],
  ['c4', 'Arenes', 'c1ccc2cc3ccccc3cc2c1'], // anthracene
  ['c6', 'Alcohols', 'CCO'],
  ['c10', 'Ketones', 'CC(=O)C'], // acetone
] as const;

describe('§4.9: hubs carry example structures', () => {
  it.each(EXAMPLES)('hub %s (%s) as class: the example SMILES %s is not the class structure; it is in unmapped and the class is review_required', async (legacyId, name, smiles) => {
    const { mapped } = await mapLegacy(legacyFixture('v6-demo-export.json'));
    const hub = mapped.records.class.find((c) => c.id === `cls_v6-${legacyId}`) as ChemicalClass;
    expect(hub.names.canonical).toBe(name);
    expect(hub.provenance.legacy?.unmapped).toMatchObject({ smiles });
    expect(hub.generic?.structure).toBeUndefined();
    expect(hub.exampleSpeciesIds).toEqual([]);
    expect(hub.review.status).toBe('review_required');
    expect(hub.review.reasons).toContain('representative SMILES not used; add an example species if intended');
    expect(mapped.report.reviewItems).toContainEqual({ subject: { kind: 'class', id: hub.id }, reason: 'representative SMILES not used; add an example species if intended' });
    // and no species was created from it
    expect(mapped.records.species.some((s) => s.structure?.value === smiles)).toBe(false);
  });

  it.each(EXAMPLES)('hub %s (%s) decided as species: the SMILES %s is that species\' structure', async (legacyId, name, smiles) => {
    const { mapped } = await mapLegacy(legacyFixture('v6-demo-export.json'), {}, new Map<string, HubDecision>([[legacyId, 'species']]));
    const species = mapped.records.species.find((s) => s.id === `spc_v6-${legacyId}`) as Species;
    expect(species.names.canonical).toBe(name);
    expect(species.structure).toEqual({ format: 'smiles', value: smiles });
    expect(mapped.records.class.some((c) => c.id === `cls_v6-${legacyId}`)).toBe(false);
    expect(mapped.records.navigator_anchor.find((a) => a.id === `anc_v6-${legacyId}`)?.target).toEqual({ kind: 'species', id: `spc_v6-${legacyId}` });
  });

  it('a hub without an example structure (Alkynes, no SMILES) needs no review for it (only its general formula is to be checked)', async () => {
    const { mapped } = await mapLegacy(legacyFixture('v6-demo-export.json'));
    const alkynes = mapped.records.class.find((c) => c.id === 'cls_v6-c3') as ChemicalClass;
    expect(alkynes.review.reasons).toEqual(['general formula taken from the legacy hub formula; check it']);
    expect(alkynes.provenance.legacy?.unmapped).not.toHaveProperty('smiles');
  });
});

describe('the two real fixtures', () => {
  it('v6-demo-export.json: 13 hubs → 13 classes + 13 anchors in file order, 8 species, one created class, one hidden node', async () => {
    const { mapped } = await mapLegacy(legacyFixture('v6-demo-export.json'));
    expect(mapped.records.navigator_anchor.map((a) => [a.id, a.order])).toEqual(Array.from({ length: 13 }, (_, i) => [`anc_v6-c${i + 1}`, i + 1]));
    expect(mapped.records.class.slice(0, 13).map((c) => c.id)).toEqual(Array.from({ length: 13 }, (_, i) => `cls_v6-c${i + 1}`));
    expect(mapped.records.species.map((s) => s.names.canonical)).toEqual(['Water', 'Cumene', 'Palmitic acid', 'Oxime', 'Cyanohydrin', 'p-Bromocumene', 'Test compound A (unanchored)', 'Test compound B (unanchored)']);
    expect(mapped.records.entity_display.map((d) => d.target.id)).toEqual(['spc_v6-c14']); // Water: node:false
    expect(mapped.report.notImported).toEqual([]);
    expect(mapped.report.createdCounts).toEqual({ class: 14, entity_display: 1, navigator_anchor: 13, species: 8 });
  });

  it('v6-demo-export.json: Cumene and Palmitic acid join the hubs by fgId; "long-chain fatty acid" is a created class', async () => {
    const { mapped } = await mapLegacy(legacyFixture('v6-demo-export.json'));
    const classesOf = (id: string) => (mapped.records.species.find((s) => s.id === id) as Species).classIds;
    expect(classesOf('spc_v6-c15')).toEqual(['cls_v6-c4']); // Cumene: fgId arene → the Arenes hub (c4)
    const palmitic = classesOf('spc_v6-c16');
    expect(palmitic).toHaveLength(2);
    expect(palmitic[0]).toBe('cls_v6-c11'); // carboxylic-acid → the Carboxylic acids hub
    expect(mapped.records.class.find((c) => c.id === palmitic[1])?.names.canonical).toBe('long-chain fatty acid');
    expect(classesOf('spc_v6-c14')).toEqual([]);
  });

  it('v4-sample.json: no hubs (v4 has no nodeType), six species, duplicate folded name told on both, one hidden node', async () => {
    const { mapped } = await mapLegacy(legacyFixture('v4-sample.json'));
    expect(mapped.records.class).toEqual([]);
    expect(mapped.records.navigator_anchor).toEqual([]);
    expect(mapped.records.species.map((s) => s.id)).toEqual(['spc_v6-c1', 'spc_v6-c2', 'spc_v6-c3', 'spc_v6-c4', 'spc_v6-c5', 'spc_v6-c6']);
    expect(mapped.report.reviewItems.map((r) => r.subject.id)).toEqual(['spc_v6-c1', 'spc_v6-c6']);
    expect(mapped.records.entity_display.map((d) => d.target.id)).toEqual(['spc_v6-c4']);
    // the v4 hub tag is just a tag
    expect(mapped.records.species[0]?.tags).toEqual(['hub']);
  });

  it('every record of both fixtures passes strict L1', async () => {
    for (const name of ['v6-demo-export.json', 'v4-sample.json']) {
      const { mapped } = await mapLegacy(legacyFixture(name));
      for (const decision of ['class', 'species'] as const) {
        const again = decision === 'class' ? mapped : (await mapLegacy(legacyFixture(name), {}, new Map(mapped.hubs.map((h) => [h.key, 'species'] as const)))).mapped;
        for (const record of allRecords(again)) expect(AnyRecordSchema.safeParse(record), `${name} ${decision} ${record.id}`).toMatchObject({ success: true });
      }
    }
  });
});
