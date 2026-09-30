/**
 * Step 3.10: class membership of mapped compounds (docs/MIGRATION.md §4.4: fgId, functionalGroups, compoundClass), records without an
 * id or with a repeated one, and collisions in the compound ID namespace. Expected values are written out by hand.
 */
import { describe, expect, it } from 'vitest';
import { hash64 } from '@/core/hash';
import type { ChemicalClass, Species } from '@/core/schema';
import { mapLegacy } from '@/test-support/legacy-map-kit';
import type { HubDecision } from './compound-map';

const doc = (compounds: unknown[]) => ({ schemaVersion: 5, compounds, reactions: [] });
const classOf = (m: Awaited<ReturnType<typeof mapLegacy>>['mapped']): ChemicalClass => m.records.class[0] as ChemicalClass;
const unmappedOf = (record: { provenance: { legacy?: { unmapped?: unknown } } }): Record<string, unknown> => (record.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;

describe('class membership (fgId, functionalGroups, compoundClass)', () => {
  const hub = { id: 'h1', name: 'Alkenes', nodeType: 'major', fgId: 'alkene' };

  it('a species joins the hub class with the same fgId, whether the id is in fgId or in functionalGroups', async () => {
    const { mapped } = await mapLegacy(doc([hub, { id: 'c1', name: 'Propene', fgId: 'alkene' }, { id: 'c2', name: 'Butene', functionalGroups: ['alkene'] }]));
    expect(mapped.records.species.map((s) => [s.id, s.classIds])).toEqual([['spc_v6-c1', ['cls_v6-h1']], ['spc_v6-c2', ['cls_v6-h1']]]);
    expect(mapped.records.class).toHaveLength(1);
    expect(mapped.report.reviewItems).toEqual([]);
  });

  it('with no hub for it, a functional_group class is created from the legacy registry label (review), once for all users', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'Ethanol', fgId: '1-alcohol' }, { id: 'c2', name: 'Propanol', functionalGroups: ['primary alcohol'] }]));
    expect(mapped.records.class).toHaveLength(1);
    const created = classOf(mapped);
    expect(created).toMatchObject({ id: 'cls_v6-fg-1-alcohol', classKind: 'functional_group' });
    expect(created.names.canonical).toBe('1° alcohol');
    expect(created.review).toEqual({ lifecycle: 'published', status: 'review_required', reasons: ['no hub carries fgId "1-alcohol"; functional-group class created from the legacy registry label "1° alcohol"'] });
    expect(mapped.records.species.map((s) => s.classIds)).toEqual([['cls_v6-fg-1-alcohol'], ['cls_v6-fg-1-alcohol']]);
    expect(mapped.functionalGroupClass.get('1-alcohol')).toBe('cls_v6-fg-1-alcohol');
  });

  it('a functional group v6 does not know is created from its own text and said so', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'X', functionalGroups: ['mystery'] }]));
    expect(classOf(mapped).names.canonical).toBe('mystery');
    expect(classOf(mapped).review.reasons[0]).toContain('is not in the legacy registry');
  });

  it('a hub decided as species is not a class: a functional_group class is created for its fgId instead', async () => {
    const { mapped } = await mapLegacy(doc([hub, { id: 'c1', name: 'Propene', fgId: 'alkene' }]), {}, new Map<string, HubDecision>([['h1', 'species']]));
    expect(mapped.records.species.find((s) => s.id === 'spc_v6-c1')?.classIds).toEqual(['cls_v6-fg-alkene']);
    expect(mapped.records.class.map((c) => c.classKind)).toEqual(['functional_group']);
  });

  it('two hubs with one fgId: the first is used and the species says so', async () => {
    const { mapped } = await mapLegacy(doc([hub, { ...hub, id: 'h2', name: 'Alkenes again' }, { id: 'c1', name: 'Propene', fgId: 'alkene' }]));
    const species = mapped.records.species[0] as Species;
    expect(species.classIds).toEqual(['cls_v6-h1']);
    expect(species.review.reasons[0]).toContain('matches several hubs (h1, h2); the first (h1) was used');
  });

  it('compoundClass names the class with that folded name; otherwise a class is created (review)', async () => {
    const { mapped } = await mapLegacy(doc([
      { id: 'h1', name: 'Fatty  Acids', nodeType: 'major' },
      { id: 'c1', name: 'A', compoundClass: 'fatty acids' },
      { id: 'c2', name: 'B', compoundClass: 'long-chain fatty acid' },
      { id: 'c3', name: 'C', compoundClass: 'Long-Chain Fatty Acid' },
    ]));
    const byId = new Map<string, readonly string[]>(mapped.records.species.map((s) => [s.id, s.classIds]));
    const created = mapped.records.class.filter((c) => c.id !== 'cls_v6-h1');
    expect(byId.get('spc_v6-c1')).toEqual(['cls_v6-h1']);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ classKind: 'compound_class', review: { lifecycle: 'published', status: 'review_required' } });
    expect(created[0]?.names.canonical).toBe('long-chain fatty acid');
    expect(created[0]?.id).toBe(`cls_v6-l-long-chain-fatty-acid-${hash64('long chain fatty acid').slice(0, 6)}`);
    expect(byId.get('spc_v6-c2')).toEqual([created[0]?.id]);
    expect(byId.get('spc_v6-c3')).toEqual([created[0]?.id]); // folds alike: one class
  });

  it('does not depend on the order of the compounds: a compoundClass equal to a functional-group class name uses it', async () => {
    const docs = [
      doc([{ id: 'c1', name: 'A', compoundClass: 'alkene' }, { id: 'c2', name: 'B', fgId: 'alkene' }]),
      doc([{ id: 'c2', name: 'B', fgId: 'alkene' }, { id: 'c1', name: 'A', compoundClass: 'alkene' }]),
    ];
    for (const d of docs) {
      const { mapped } = await mapLegacy(d);
      expect(mapped.records.class.map((c) => c.id)).toEqual(['cls_v6-fg-alkene']);
      expect(mapped.records.species.every((s) => s.classIds.join() === 'cls_v6-fg-alkene')).toBe(true);
    }
  });
});

describe('records without an id, repeated ids and ids that are not text', () => {
  it('a record without an id (3.8 placeholder) carries the review item "record had no id in the legacy file"', async () => {
    const { mapped } = await mapLegacy(doc([{ name: 'A' }, { id: 'c2', name: 'B' }]));
    const first = mapped.records.species[0] as Species;
    expect(first.id).toBe('spc_v6-c-missing-1');
    expect(first.review.reasons).toEqual(['record had no id in the legacy file; the placeholder "c-missing-1" was assigned']);
    expect(mapped.report.reviewItems).toEqual([{ subject: { kind: 'species', id: 'spc_v6-c-missing-1' }, reason: first.review.reasons[0] }]);
    expect(mapped.records.species[1]?.review.reasons).toEqual([]);
  });

  it('a repeated legacy id is never merged: the later record gets its own ID, references resolve to the first', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'First' }, { id: 'c1', name: 'Second' }]));
    const [first, second] = mapped.records.species as [Species, Species];
    expect(first.id).toBe('spc_v6-c1');
    expect(second.id).not.toBe(first.id);
    expect(second.id).toMatch(/^spc_v6-c1-2-[0-9a-f]{6}$/);
    expect(second.review.reasons[0]).toContain('another compound has the legacy id "c1"');
    expect(mapped.refByLegacyId.get('c1')).toEqual({ kind: 'species', id: 'spc_v6-c1' });
  });

  it('an id that is not text is kept in unmapped and the record still maps', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 5, name: 'Five' }]));
    const species = mapped.records.species[0] as Species;
    expect(unmappedOf(species)).toEqual({ id: 5 });
    expect(species.provenance.legacy).not.toHaveProperty('legacyId');
    expect(species.review.status).toBe('review_required');
  });
});

describe('ID collisions in the compound namespace', () => {
  it('a crafted ID that looks like a produced part is never merged; the record says so', async () => {
    const produced = `c15--${hash64('c15!').slice(0, 6)}`;
    const { mapped } = await mapLegacy(doc([{ id: 'c15!', name: 'A' }, { id: produced, name: 'B' }]));
    const [a, b] = mapped.records.species as [Species, Species];
    expect(a.id).not.toBe(b.id);
    expect(a.review.reasons[0]).toContain('its ID part collided with');
    expect(b.review.reasons[0]).toContain('its ID part collided with');
  });

  it('a hub whose id reads like a functional-group class part is settled by the collision ladder, not refused (step 3.10 review)', async () => {
    // hub `fg-alkene` is `cls_v6-fg-alkene`; the functional-group class of `alkene` would be `cls_v6-fg-alkene` too
    const { mapped } = await mapLegacy(doc([{ id: 'fg-alkene', name: 'H', nodeType: 'major' }, { id: 'c1', name: 'S', fgId: 'alkene' }]));
    const ids = mapped.records.class.map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual([`cls_v6-fg-alkene-${hash64('fg-alkene').slice(0, 12)}`, `cls_v6-fg-alkene-${hash64('alkene').slice(0, 12)}`]);
    expect(mapped.functionalGroupClass.get('alkene')).toBe(ids[1]);
    expect((mapped.records.species[0] as Species).classIds).toEqual([ids[1]]);
  });
});
