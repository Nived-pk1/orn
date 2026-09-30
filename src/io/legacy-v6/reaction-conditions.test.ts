/**
 * Step 3.11a: conditions (the step 3.9 parser into stage 1), participant notes, participant and reaction images, unknown fields and
 * the deferred fields (docs/MIGRATION.md §4.5). Expected values are written by hand; image hashes come from node:crypto.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AnyRecordSchema, type Asset, type Reaction } from '@/core/schema';
import { mapAll } from '@/test-support/legacy-reaction-kit';
import { createScope } from './compound-scope';
import { mapConditions } from './reaction-conditions';
import { createReportBuilder } from './report';
import { createTrace } from './trace';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const png = `data:image/png;base64,${PNG}`;
const sha = (b64: string): string => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

const part = (role: string, ref: string, extra: Record<string, unknown> = {}) => ({ ref, label: '', role, major: false, note: '', image: '', ...extra });
const doc = (participants: unknown[], reaction: Record<string, unknown> = {}, compounds: unknown[] = [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }]) => ({
  schemaVersion: 5,
  compounds,
  reactions: [{ id: 'r1', name: 'Test', participants, ...reaction }],
});
const base = [part('substrate', 'c1'), part('product', 'c2', { major: true })];
const run = async (participants: unknown[] = base, reaction: Record<string, unknown> = {}, compounds?: unknown[]) => {
  const all = await mapAll(doc(participants, reaction, compounds));
  return { ...all, reaction: all.reactions.records.reaction[0] as Reaction };
};
const unmappedOf = (record: { provenance: { legacy?: { unmapped?: unknown } } }): Record<string, unknown> => (record.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;

describe('conditions → stage 1', () => {
  it('conditions.text → parameters.text AND originalText; fields are parsed and listed in parsedFields; RXN-015 review', async () => {
    const { reaction } = await run(base, { conditions: { text: 'aqueous, 140°C, dil.', temperature: '140°C', phase: 'aqueous', medium: 'acidic', pressure: '2 atm', atmosphere: 'nitrogen' } });
    const stage = reaction.stages[0];
    expect(stage?.originalText).toBe('aqueous, 140°C, dil.');
    expect(stage?.parameters).toEqual({
      temperature: { kind: 'value', value: 140, unit: 'C' },
      pressure: { kind: 'value', value: 2, unit: 'atm' },
      medium: 'acidic',
      solventCharacter: ['aqueous'],
      atmosphere: 'nitrogen',
      activation: [],
      other: ['strength: dilute'], // v6 filled `strength` from the "dil." in the text; a condition has no strength field
      text: 'aqueous, 140°C, dil.',
      parsedFields: ['temperature', 'pressure', 'medium', 'solventCharacter', 'atmosphere'],
    });
    expect(reaction.review.status).toBe('review_required');
    expect(reaction.review.reasons).toContain('conditions were read from text by the importer (temperature, pressure, medium, solventCharacter, atmosphere; RXN-015): check them against the original wording');
  });

  it('the three regex-inferred flags become parameters and parsedFields', async () => {
    const { reaction } = await run(base, { conditions: { heat: true, light: true, anhydrous: true } });
    expect(reaction.stages[0]?.parameters).toMatchObject({ temperature: { kind: 'qualitative', value: 'heat' }, light: 'hv', anhydrous: true, parsedFields: ['temperature', 'anhydrous', 'light'] });
  });

  it('a heat flag next to a temperature is an informational note (counted, not a review item)', async () => {
    const { reaction, reactions } = await run(base, { conditions: { temperature: '140°C', heat: true } });
    expect(reactions.report.notes).toEqual({ FLAG_SUBSUMED: 1 });
    expect(reaction.review.reasons.some((x) => x.includes('FLAG_SUBSUMED') || x.includes('subsumed') || x.includes('conditions.heat is true'))).toBe(false);
    expect(reaction.stages[0]?.parameters.temperature).toEqual({ kind: 'value', value: 140, unit: 'C' });
  });

  it('values the parser cannot decide go to other[] with the parser\'s reason; strength has no stage field', async () => {
    const { reaction } = await run(base, { conditions: { strength: 'dilute', temperature: '100 °F' } });
    expect(reaction.stages[0]?.parameters.other).toEqual(['temperature: 100 °F', 'strength: dilute']);
    expect(reaction.review.reasons.some((x) => x.startsWith('conditions: '))).toBe(true);
    expect(reaction.stages[0]?.parameters.temperature).toBeUndefined();
  });

  it('unconsumed values (wrong type, a non-boolean flag) are kept whole in unmapped with a reason; unknown keys too', async () => {
    const { reaction, reactions } = await run(base, { conditions: { text: 'x', heat: 'yes', pressure: { a: 1 }, custom: [1, 2] } });
    expect(unmappedOf(reaction)).toMatchObject({ conditions: { heat: 'yes', pressure: { a: 1 }, custom: [1, 2] } });
    expect(reactions.report.preservedUnmappedFields).toMatchObject({ 'reaction.conditions.heat': 1, 'reaction.conditions.pressure': 1, 'reaction.conditions.custom': 1 });
    expect(reaction.review.reasons.some((x) => x.includes('unknown legacy field(s) in conditions'))).toBe(true);
    expect(reaction.review.reasons.some((x) => x.includes('conditions.heat is "yes", not a boolean'))).toBe(true);
  });

  it('a text the schema cannot hold stays whole in unmapped; a blank text too', async () => {
    const long = 'x'.repeat(2_500);
    const a = await run(base, { conditions: { text: long } });
    expect(unmappedOf(a.reaction)).toMatchObject({ conditions: { text: long } });
    expect(a.reaction.stages[0]?.originalText).toBeUndefined();
    const b = await run(base, { conditions: { text: '   ' } });
    expect(unmappedOf(b.reaction)).toMatchObject({ conditions: { text: '   ' } });
  });

  it('other[] entries beyond the 16 the schema holds are kept in unmapped, not dropped', async () => {
    const words = 700;
    const { reaction } = await run(base, { conditions: { atmosphere: 'zzzz '.repeat(words).trim() } });
    const stored = reaction.stages[0]?.parameters.other ?? [];
    const overflow = (unmappedOf(reaction).conditions as { overflowOther?: string[] }).overflowOther ?? [];
    expect(stored).toHaveLength(16);
    expect(overflow.length).toBeGreaterThan(0);
    // an entry may end inside a word, so count letters: none is lost
    const count = (entries: readonly string[]): number => entries.join('').split('z').length - 1;
    expect(count(stored) + count(overflow)).toBe(words * 4);
    expect(reaction.review.reasons.some((x) => x.includes('other[] entries'))).toBe(true);
  });

  it('empty defaults (v6\'s "" and false) are consumed and store nothing', async () => {
    const { reaction, reactions } = await run(base, { conditions: { text: '', temperature: '', medium: '', phase: '', strength: '', heat: false, light: false, pressure: '', atmosphere: '', anhydrous: false } });
    expect(reaction.stages[0]?.parameters).toEqual({ solventCharacter: [], activation: [], other: [], parsedFields: [] });
    expect(reaction.stages[0]?.originalText).toBeUndefined();
    expect(reactions.report.preservedUnmappedFields).toEqual({});
    expect(reaction.review.status).toBe('unreviewed');
  });

  it('a conditions value that is not an object (the port never produces one, but the mapper is total) is kept whole', () => {
    const report = createReportBuilder(5);
    const scope = createScope(['reactions', 0], createTrace(), report, 'reaction.');
    const mapped = mapConditions('hot', scope, report);
    expect(mapped.parameters).toEqual({ solventCharacter: [], activation: [], other: [], parsedFields: [] });
    expect(scope.unmapped()).toEqual({ conditions: 'hot' });
    expect(scope.reasons).toEqual(['conditions is not an object ("hot"); kept in legacy.unmapped']);
    const empty = createScope(['reactions', 0], createTrace(), report, 'reaction.');
    mapConditions('', empty, report);
    expect(empty.unmapped()).toBeUndefined();
  });
});

describe('participant notes and images', () => {
  it('a participant note → note (participant, product, intermediate); an unstorable note stays in unmapped', async () => {
    const { reaction } = await run([part('substrate', 'c1', { note: 'the substrate' }), part('product', 'c2', { major: true, note: 'the product' }), part('intermediate', 'c2', { note: 'transient' }), part('reagent', 'c1', { note: 'bad\u0001note' })]);
    expect(reaction.participants[0]?.note).toBe('the substrate');
    expect(reaction.outcomes[0]?.products[0]?.note).toBe('the product');
    expect(reaction.intermediates[0]?.note).toBe('transient');
    expect(reaction.participants[1]?.note).toBeUndefined();
    expect(unmappedOf(reaction)).toMatchObject({ 'participants[3].note': 'bad\u0001note' });
  });

  it('a participant image becomes an asset attached to the REACTION with the label as note; bytes are carried', async () => {
    const { reactions } = await run([part('substrate', 'c1', { image: png }), { ref: '', label: 'Drawn reagent', role: 'reagent', major: false, note: '', image: `data:image/gif;base64,${GIF}` }, part('product', 'c2', { major: true })]);
    const assets = reactions.records.asset;
    expect(assets.map((a) => [a.id, a.mediaType, a.assetRole, a.attachedTo])).toEqual([
      [`ast_v6-${sha(PNG).slice(0, 16)}`, 'image/png', 'legacy_image', [{ ref: { kind: 'reaction', id: 'rxn_v6-r1' }, note: 'c1' }]],
      [`ast_v6-${sha(GIF).slice(0, 16)}`, 'image/gif', 'legacy_image', [{ ref: { kind: 'reaction', id: 'rxn_v6-r1' }, note: 'Drawn reagent' }]],
    ]);
    expect(reactions.assetBytes.map((b) => [b.assetId, b.sha256, Buffer.from(b.bytes).equals(Buffer.from(b.mediaType === 'image/png' ? PNG : GIF, 'base64'))])).toEqual([
      [assets[0]?.id, sha(PNG), true],
      [assets[1]?.id, sha(GIF), true],
    ]);
    expect(reactions.report.createdCounts).toMatchObject({ asset: 2 });
  });

  it('the reaction image is attached to the reaction; the same bytes on a participant make ONE asset with two attachments', async () => {
    const { reactions } = await run([part('substrate', 'c1', { image: png }), part('product', 'c2', { major: true })], { image: png });
    expect(reactions.records.asset).toHaveLength(1);
    expect(reactions.records.asset[0]?.attachedTo).toEqual([{ ref: { kind: 'reaction', id: 'rxn_v6-r1' }, note: 'c1' }, { ref: { kind: 'reaction', id: 'rxn_v6-r1' } }]);
  });

  it('an image a compound already carries is one asset: the reaction mapper returns a changed copy, and the merge replaces the compound\'s record', async () => {
    const all = await mapAll(doc([part('substrate', 'c1'), part('product', 'c2', { major: true })], { image: png }, [{ id: 'c1', name: 'A', image: png }, { id: 'c2', name: 'B' }]));
    const id = `ast_v6-${sha(PNG).slice(0, 16)}`;
    expect(all.compounds.records.asset[0]?.attachedTo).toHaveLength(1); // the compound result is not mutated
    expect(all.reactions.records.asset).toEqual([]);
    expect(all.reactions.updatedAssets.map((a) => [a.id, a.attachedTo.map((t) => t.ref.kind)])).toEqual([[id, ['species', 'reaction']]]);
    expect(all.reactions.assetBytes).toEqual([]); // the bytes are the compound result's
    const merged = (all.merged.records.asset ?? []) as Asset[];
    expect(merged.map((a) => [a.id, a.attachedTo.length])).toEqual([[id, 2]]);
    expect(all.merged.assetBytes).toHaveLength(1);
  });

  it('an undecodable image stays in unmapped with a reason; nothing is attached', async () => {
    const { reaction, reactions } = await run([part('substrate', 'c1', { image: 'https://example.org/a.png' }), part('product', 'c2', { major: true })], { image: `data:image/png;base64,${GIF}` });
    expect(reactions.records.asset).toEqual([]);
    expect(unmappedOf(reaction)).toMatchObject({ image: `data:image/png;base64,${GIF}`, 'participants[0].image': 'https://example.org/a.png' });
    expect(reaction.review.reasons.filter((x) => x.includes('kept in legacy.unmapped'))).toHaveLength(2);
    expect(reactions.report.notImported).toEqual([]);
  });

  it('every attached asset passes strict L1 and a 65th attachment of one image is kept in unmapped', async () => {
    const participants = [part('substrate', 'c1'), ...Array.from({ length: 30 }, () => part('reagent', 'c1', { image: png })), part('product', 'c2', { major: true })];
    const reactions = Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`, participants }));
    const all = await mapAll({ schemaVersion: 5, compounds: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }], reactions });
    const asset = all.reactions.records.asset[0] as Asset;
    expect(asset.attachedTo).toHaveLength(64);
    expect(AnyRecordSchema.safeParse(asset)).toMatchObject({ success: true });
    const kept = all.reactions.records.reaction.flatMap((r) => Object.keys(unmappedOf(r)).filter((k) => k.endsWith('.image')));
    expect(kept).toHaveLength(90 - 64);
  });
});

describe('unknown fields and the fields of step 3.11b', () => {
  it('an unknown reaction field is kept in unmapped with a reason and counted', async () => {
    const { reaction, reactions } = await run(base, { customField: { a: [1, 2] }, other: 'x' });
    expect(unmappedOf(reaction)).toEqual({ customField: { a: [1, 2] }, other: 'x' });
    expect(reaction.review.reasons).toContain('unknown legacy field(s) kept in legacy.unmapped: "customField", "other"');
    expect(reactions.report.preservedUnmappedFields).toEqual({ 'reaction.customField': 1, 'reaction.other': 1 });
  });

  it('the fields of step 3.11b are returned as deferred leaf paths - not mapped, not dropped', async () => {
    const { reactions, reaction } = await run(base, {
      transformation: { from: 'A', to: 'B', fgFrom: ['x'], fgTo: [], bondChanges: '' },
      mechanism: { type: 'SN2', summary: '' },
      reactionType: 'substitution',
      reactionFamily: '',
      reagentFamily: 'KOH',
      namedReaction: 'Williamson',
      chapter: 'Alcohols',
      jee: { relevance: 'both', difficulty: 2, traps: ['t'], prerequisites: [], concepts: ['c'] },
      relatedReactions: ['r2'],
      collapseIntermediates: true,
      _v4: { reagent: 'r', extra: '', condition: '' },
    });
    expect(reactions.deferred).toContain('reactions[0].transformation.from');
    expect(reactions.deferred).toContain('reactions[0].transformation.fgFrom[0]');
    expect(reactions.deferred).toContain('reactions[0].jee.traps[0]');
    expect(reactions.deferred).toContain('reactions[0].relatedReactions[0]');
    expect(reactions.deferred).toContain('reactions[0].collapseIntermediates');
    expect(reactions.deferred).toContain('reactions[0]._v4.condition');
    expect(reactions.deferred.every((p) => /^reactions\[0\]\.(transformation|mechanism|reactionType|reactionFamily|reagentFamily|namedReaction|chapter|jee|relatedReactions|collapseIntermediates|_v4)/.test(p))).toBe(true);
    expect(unmappedOf(reaction)).toEqual({});
    expect(reaction.namedReactionIds).toEqual([]);
    expect(reaction.reactionTypes).toEqual([]);
  });

  it('dropped leaves of the port that are not under a compound come back untouched for step 3.11b', async () => {
    const all = await mapAll({ schemaVersion: 4, compounds: [{ id: 'c1', name: 'A' }], reactions: [{ id: 'r1', name: 'R', participants: [], start: 'c1' }] });
    expect(all.reactions.unhandledDropped.map((d) => d.path)).toEqual(expect.arrayContaining(['schemaVersion', 'reactions[0].start']));
  });
});
