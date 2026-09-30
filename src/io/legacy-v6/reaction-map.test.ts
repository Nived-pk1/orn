/**
 * Step 3.11a: v5 reactions → ORN records (docs/MIGRATION.md §4.5), row by row: roles, stages, the one outcome, intermediates,
 * references (mapped compounds, hub decisions, missing-compound placeholders), label-only participants, scope, lifecycle, IDs,
 * report. Small v5 documents run through the real port, ID space and compound mapper; every expected value is written by hand.
 */
import { describe, expect, it } from 'vitest';
import { AnyRecordSchema, type Reaction, type Reagent, type Species } from '@/core/schema';
import { mapAll } from '@/test-support/legacy-reaction-kit';
import type { HubDecision } from './compound-map';
import { createReportBuilder } from './report';

const COMPOUNDS = [
  { id: 'c1', name: 'Ethanol', smiles: 'CCO' },
  { id: 'c2', name: 'Ethene', smiles: 'C=C' },
  { id: 'c3', name: 'Water', smiles: 'O' },
  { id: 'h1', name: 'Alcohols', nodeType: 'major', fgId: 'alcohol' },
];
const part = (role: string, ref: string, extra: Record<string, unknown> = {}) => ({ ref, label: '', role, major: false, note: '', image: '', ...extra });
const label = (role: string, text: string, extra: Record<string, unknown> = {}) => ({ ref: '', label: text, role, major: false, note: '', image: '', ...extra });
const doc = (participants: unknown[], reaction: Record<string, unknown> = {}, compounds: unknown[] = COMPOUNDS) => ({
  schemaVersion: 5,
  compounds,
  reactions: [{ id: 'r1', name: 'Test', participants, ...reaction }],
});
const run = async (participants: unknown[], reaction: Record<string, unknown> = {}, compounds?: unknown[], decisions?: ReadonlyMap<string, HubDecision>) => {
  const all = await mapAll(doc(participants, reaction, compounds), {}, decisions);
  return { ...all, reaction: all.reactions.records.reaction[0] as Reaction };
};
const unmappedOf = (record: { provenance: { legacy?: { unmapped?: unknown } } }): Record<string, unknown> => (record.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;

describe('roles and stages', () => {
  it('substrate → reactant + isPrimarySubstrate; the other roles keep their name; stage 1 holds them all', async () => {
    const { reaction } = await run([part('substrate', 'c1'), part('reactant', 'c3'), part('reagent', 'c3'), part('catalyst', 'c3'), part('solvent', 'c3'), part('spectator', 'c3'), part('product', 'c2', { major: true })]);
    expect(reaction.participants.map((p) => [p.id, p.role, p.isPrimarySubstrate])).toEqual([
      ['prt_v6-r1-1', 'reactant', true],
      ['prt_v6-r1-2', 'reactant', undefined],
      ['prt_v6-r1-3', 'reagent', undefined],
      ['prt_v6-r1-4', 'catalyst', undefined],
      ['prt_v6-r1-5', 'solvent', undefined],
      ['prt_v6-r1-6', 'spectator', undefined],
    ]);
    expect(reaction.stages).toHaveLength(1);
    expect(reaction.stages[0]).toMatchObject({ id: 'stg_v6-r1-1', kind: 'reaction', participantIds: reaction.participants.map((p) => p.id) });
  });

  it('workup → workup_reagent in a second stage of kind workup; stage 1 holds all the others', async () => {
    const { reaction } = await run([part('substrate', 'c1'), part('workup', 'c3'), part('reagent', 'c3'), part('product', 'c2', { major: true })]);
    expect(reaction.participants.map((p) => p.role)).toEqual(['reactant', 'workup_reagent', 'reagent']);
    expect(reaction.stages.map((s) => [s.id, s.kind, s.participantIds])).toEqual([
      ['stg_v6-r1-1', 'reaction', ['prt_v6-r1-1', 'prt_v6-r1-3']],
      ['stg_v6-r1-2', 'workup', ['prt_v6-r1-2']],
    ]);
  });

  it('products and byproducts are the products of ONE outcome: major → main, other → coproduct, byproduct → byproduct; selectivity unspecified', async () => {
    const { reaction } = await run([
      part('substrate', 'c1'),
      part('product', 'c2', { major: true }),
      part('product', 'c3'),
      part('byproduct', 'c3'),
    ]);
    expect(reaction.outcomes).toHaveLength(1);
    expect(reaction.outcomes[0]).toMatchObject({ id: 'out_v6-r1-1', selectivity: 'unspecified', conditionVariantIds: [], conceptIds: [] });
    expect(reaction.outcomes[0]?.products.map((p) => [p.id, p.role, p.ref])).toEqual([
      ['pdt_v6-r1-2', 'main', { kind: 'species', id: 'spc_v6-c2' }],
      ['pdt_v6-r1-3', 'coproduct', { kind: 'species', id: 'spc_v6-c3' }],
      ['pdt_v6-r1-4', 'byproduct', { kind: 'species', id: 'spc_v6-c3' }],
    ]);
    expect(reaction.review.reasons.some((r) => r.includes('coproduct or minor isomer?'))).toBe(true);
    // the non-major product is the only reason for that text; the byproduct needs none
    expect(reaction.review.reasons.filter((r) => r.includes('coproduct or minor isomer?'))).toHaveLength(1);
  });

  it('intermediate → intermediates[] of kind other, with a review reason; by ref or by label', async () => {
    const { reaction } = await run([part('substrate', 'c1'), part('intermediate', 'c2', { note: 'carbocation-like' }), label('intermediate', 'carbocation'), part('product', 'c3', { major: true })]);
    expect(reaction.intermediates).toEqual([
      { id: 'int_v6-r1-2', intermediateKind: 'other', ref: { kind: 'species', id: 'spc_v6-c2' }, note: 'carbocation-like' },
      { id: 'int_v6-r1-3', intermediateKind: 'other', label: 'carbocation' },
    ]);
    expect(reaction.review.reasons).toContain('2 intermediate(s) imported with kind "other"; check the kind');
    expect(reaction.participants).toHaveLength(1);
  });

  it('a reaction with no participants still has stage 1; nothing is invented', async () => {
    const { reaction } = await run([]);
    expect(reaction.participants).toEqual([]);
    expect(reaction.stages).toEqual([expect.objectContaining({ id: 'stg_v6-r1-1', kind: 'reaction', participantIds: [] })]);
    expect(reaction.outcomes).toEqual([]);
  });

  it('an unrecognised role (v6 treats an inherited key like "toString" as a role) is a reagent, said out loud, the original kept', async () => {
    const { reaction } = await run([part('substrate', 'c1'), part('toString', 'c3'), part('product', 'c2', { major: true })]);
    expect(reaction.participants.map((p) => p.role)).toEqual(['reactant', 'reagent']);
    expect(reaction.review.reasons.some((r) => r.includes('unrecognised participant role(s) "toString"'))).toBe(true);
    expect(unmappedOf(reaction)).toMatchObject({ 'participants[1].role': 'toString' });
  });
});

describe('references: mapped compounds, hub decisions, missing compounds', () => {
  it('a hub decided as CLASS is referenced as that class; decided as SPECIES as that species (scope follows)', async () => {
    const participants = [part('substrate', 'h1'), part('product', 'c2', { major: true })];
    const asClass = await run(participants);
    expect(asClass.reaction.participants[0]?.ref).toEqual({ kind: 'class', id: 'cls_v6-h1' });
    expect(asClass.reaction.scope).toBe('generic');
    const asSpecies = await run(participants, {}, undefined, new Map<string, HubDecision>([['h1', 'species']]));
    expect(asSpecies.reaction.participants[0]?.ref).toEqual({ kind: 'species', id: 'spc_v6-h1' });
    expect(asSpecies.reaction.scope).toBe('specific');
  });

  it('a dangling ref creates ONE placeholder species per missing ID, shared by every reference; nothing dangles', async () => {
    const { reactions, reaction, all } = await run([part('substrate', 'c99'), part('reagent', 'c99'), part('product', 'c98', { major: true })]);
    const placeholders = reactions.records.species.filter((s) => s.names.canonical.startsWith('Missing legacy compound'));
    expect(placeholders.map((s) => [s.id, s.names.canonical, s.review.lifecycle, s.review.status, s.provenance.legacy?.legacyId])).toEqual([
      ['spc_v6-c99', 'Missing legacy compound c99', 'draft', 'review_required', 'c99'],
      ['spc_v6-c98', 'Missing legacy compound c98', 'draft', 'review_required', 'c98'],
    ]);
    expect(reaction.participants.map((p) => p.ref)).toEqual([{ kind: 'species', id: 'spc_v6-c99' }, { kind: 'species', id: 'spc_v6-c99' }]);
    expect(placeholders[0]?.review.reasons[0]).toContain('referenced by 1 reaction(s) ("r1")');
    const ids = new Set(all.map((r) => r.id as string));
    for (const p of reaction.participants) expect(ids.has(p.ref.id)).toBe(true);
    for (const p of reaction.outcomes[0]?.products ?? []) expect(ids.has(p.ref.id)).toBe(true);
    expect(reaction.review.reasons.some((r) => r.includes('that the file does not have; placeholder species were created'))).toBe(true);
  });

  it('a placeholder is shared across reactions and names each of them', async () => {
    const all = await mapAll({ schemaVersion: 5, compounds: COMPOUNDS, reactions: [{ id: 'r1', participants: [part('substrate', 'zz')] }, { id: 'r2', participants: [part('substrate', 'zz')] }] });
    const placeholders = all.reactions.records.species;
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]?.review.reasons[0]).toContain('referenced by 2 reaction(s) ("r1", "r2")');
    expect(all.reactions.report.createdCounts).toMatchObject({ reaction: 2, species: 1 });
  });
});

describe('label-only participants (§4.6)', () => {
  const reagentsOf = (r: Awaited<ReturnType<typeof run>>): Reagent[] => r.reactions.records.reagent;

  it('tokens are taken out, originalText keeps the label; "aq. KOH" and "alc. KOH" share ONE reagent (review)', async () => {
    const r = await run([part('substrate', 'c1'), label('reagent', 'aq. KOH'), label('reagent', 'alc. KOH'), label('reagent', 'NH3 (excess)'), label('reagent', 'dry ether'), part('product', 'c2', { major: true })]);
    expect(reagentsOf(r).map((x) => x.names.canonical)).toEqual(['KOH', 'NH3', 'ether']);
    expect(r.reaction.participants.slice(1).map((p) => [p.ref.id, p.phase, p.dry, p.quantity, p.originalText])).toEqual([
      [reagentsOf(r)[0]?.id, 'aq', undefined, undefined, 'aq. KOH'],
      [reagentsOf(r)[0]?.id, 'alc', undefined, undefined, 'alc. KOH'],
      [reagentsOf(r)[1]?.id, undefined, undefined, { qualifier: 'excess' }, 'NH3 (excess)'],
      [reagentsOf(r)[2]?.id, undefined, true, undefined, 'dry ether'],
    ]);
    expect(reagentsOf(r)[0]).toMatchObject({ id: expect.stringMatching(/^rgt_v6-l-koh-[0-9a-f]{6}$/), review: { lifecycle: 'published', status: 'review_required' } });
    expect(reagentsOf(r)[0]?.review.reasons[0]).toContain('created from the participant label "aq. KOH" (and 1 other spelling(s))');
  });

  it('a label that names a mapped compound (folded name) refers to it; nothing is created', async () => {
    const r = await run([label('reactant', 'ethanol'), label('reagent', ' WATER '), part('product', 'c2', { major: true })]);
    expect(r.reaction.participants.map((p) => p.ref)).toEqual([{ kind: 'species', id: 'spc_v6-c1' }, { kind: 'species', id: 'spc_v6-c3' }]);
    expect(r.reactions.records.reagent).toEqual([]);
    expect(r.reactions.records.species).toEqual([]);
    expect(r.reaction.participants[0]?.originalText).toBe('ethanol');
  });

  it('roles decide the kind of a created record: reagent-like → reagent, substance → species, product → species (never a reagent)', async () => {
    const r = await run([label('reactant', 'HCl'), label('reagent', 'HCl'), label('catalyst', 'Pd/C'), label('product', 'HCl', { major: true })]);
    // the reactant made a species; the reagent-like label of the same folded text reuses it (one record per folded label)
    expect(r.reactions.records.species.map((s) => s.names.canonical)).toEqual(['HCl']);
    expect(r.reactions.records.reagent.map((x) => x.names.canonical)).toEqual(['Pd/C']);
    expect(r.reaction.participants.map((p) => p.ref.kind)).toEqual(['species', 'species', 'reagent']);
    expect(r.reaction.outcomes[0]?.products[0]?.ref).toEqual({ kind: 'species', id: r.reactions.records.species[0]?.id });
  });

  it('a product label never reuses a reagent created earlier for the same text', async () => {
    const r = await run([label('reagent', 'NaCl'), label('product', 'NaCl', { major: true })]);
    expect(r.reactions.records.reagent.map((x) => x.names.canonical)).toEqual(['NaCl']);
    expect(r.reactions.records.species.map((x) => x.names.canonical)).toEqual(['NaCl']);
    expect(r.reaction.outcomes[0]?.products[0]?.ref.kind).toBe('species');
  });

  it('a label matching several mapped compounds uses the first and says so', async () => {
    const r = await run([label('reactant', 'Ethanol')], {}, [{ id: 'c1', name: 'Ethanol' }, { id: 'c2', name: 'ethanol' }]);
    expect(r.reaction.participants[0]?.ref.id).toBe('spc_v6-c1');
    expect(r.reaction.review.reasons.some((x) => x.includes('matches several mapped records by folded name (spc_v6-c2 besides the one used); the first was used'))).toBe(true);
  });

  it('a label of tokens only keeps itself as the name and no token is taken out (review)', async () => {
    const r = await run([label('reagent', 'dry')]);
    expect(r.reactions.records.reagent.map((x) => x.names.canonical)).toEqual(['dry']);
    expect(r.reaction.participants[0]).toMatchObject({ originalText: 'dry' });
    expect(r.reaction.participants[0]?.dry).toBeUndefined();
    expect(r.reaction.review.reasons.some((x) => x.includes('hold only tokens'))).toBe(true);
  });

  it('a participant with neither ref nor label, or an unusable label, is kept whole in unmapped, never dropped', async () => {
    const r = await run([part('substrate', 'c1'), { ref: '', label: '', role: 'reagent', major: false, note: 'stray', image: '' }, label('reagent', 'x'.repeat(400)), label('reagent', 7 as never)]);
    expect(r.reaction.participants).toHaveLength(1);
    expect(unmappedOf(r.reaction)).toMatchObject({
      'participants[1]': { role: 'reagent', note: 'stray' },
      'participants[2]': { label: 'x'.repeat(400) },
      'participants[3]': { label: 7 },
    });
    expect(r.reaction.review.reasons.filter((x) => x.includes('kept in legacy.unmapped'))).toHaveLength(3);
  });

  it('with a ref, the label is only the participant\'s original wording', async () => {
    const r = await run([part('reagent', 'c3', { label: 'H2O (solvent)' })]);
    expect(r.reaction.participants[0]).toMatchObject({ ref: { kind: 'species', id: 'spc_v6-c3' }, originalText: 'H2O (solvent)' });
    expect(r.reactions.records.reagent).toEqual([]);
  });

  it('whole-label temperature and light are stage parameters (parsedFields), not participants; a workup one goes to the workup stage', async () => {
    const r = await run([part('substrate', 'c1'), label('reagent', '443 K'), label('reagent', 'hv'), part('workup', 'c3'), label('workup', '0-5 °C'), part('product', 'c2', { major: true })]);
    expect(r.reaction.participants.map((p) => p.id)).toEqual(['prt_v6-r1-1', 'prt_v6-r1-4']);
    expect(r.reaction.stages[0]?.parameters).toMatchObject({ temperature: { kind: 'value', value: 443, unit: 'K' }, light: 'hv', parsedFields: ['temperature', 'light'] });
    expect(r.reaction.stages[1]?.parameters).toMatchObject({ temperature: { kind: 'range', min: 0, max: 5, unit: 'C' }, parsedFields: ['temperature'] });
    expect(r.reaction.stages[1]?.participantIds).toEqual(['prt_v6-r1-4']);
    expect(r.reaction.review.reasons.some((x) => x.includes('RXN-015'))).toBe(false); // parsed label parameters are in parsedFields; the review comes from conditions and label parsing
  });

  it('a label temperature next to a different conditions temperature goes to other[] with a reason; the same temperature adds nothing', async () => {
    const differ = await run([part('substrate', 'c1'), label('reagent', '443 K')], { conditions: { temperature: '140°C' } });
    expect(differ.reaction.stages[0]?.parameters.temperature).toEqual({ kind: 'value', value: 140, unit: 'C' });
    expect(differ.reaction.stages[0]?.parameters.other).toEqual(['temperature: 443 K']);
    expect(differ.reaction.review.reasons.some((x) => x.includes('already has a different one'))).toBe(true);
    const same = await run([part('substrate', 'c1'), label('reagent', '140 °C')], { conditions: { temperature: '140°C' } });
    expect(same.reaction.stages[0]?.parameters.other).toEqual([]);
  });
});

describe('scope and lifecycle', () => {
  it('specific when every substance ref is a species; generic when any is a class; mixed → generic + reason (RXN-022)', async () => {
    const specific = await run([part('substrate', 'c1'), part('product', 'c2', { major: true })]);
    expect(specific.reaction.scope).toBe('specific');
    expect(specific.reaction.review.reasons.some((x) => x.includes('mixed scope'))).toBe(false);
    const generic = await run([part('substrate', 'h1'), part('product', 'h1', { major: true })]);
    expect(generic.reaction.scope).toBe('generic');
    expect(generic.reaction.review.reasons.some((x) => x.includes('mixed scope'))).toBe(false);
    const mixed = await run([part('substrate', 'h1'), part('product', 'c2', { major: true })]);
    expect(mixed.reaction.scope).toBe('generic');
    expect(mixed.reaction.review.reasons).toContain('mixed scope: 1 species and 1 class reference(s) in one reaction; imported as generic (RXN-022)');
  });

  it('published when it has a reactant and an outcome with a product, else draft (with the reason)', async () => {
    const complete = await run([part('substrate', 'c1'), part('product', 'c2', { major: true })]);
    expect(complete.reaction.review).toEqual({ lifecycle: 'published', status: 'unreviewed', reasons: [] });
    const noProduct = await run([part('substrate', 'c1')]);
    expect(noProduct.reaction.review).toMatchObject({ lifecycle: 'draft', status: 'review_required' });
    expect(noProduct.reaction.review.reasons).toContain('the reaction has no reactant or no product, so it stays a draft (RXN-001, RXN-002)');
    const noReactant = await run([part('reagent', 'c3'), part('product', 'c2', { major: true })]);
    expect(noReactant.reaction.review.lifecycle).toBe('draft');
  });

  it('status is unreviewed unless a trigger fired', async () => {
    const clean = await run([part('substrate', 'c1'), part('reagent', 'c3'), part('product', 'c2', { major: true })], { name: 'Clean' });
    expect(clean.reaction.review.status).toBe('unreviewed');
    const triggered = await run([part('substrate', 'c1'), part('intermediate', 'c3'), part('product', 'c2', { major: true })]);
    expect(triggered.reaction.review.status).toBe('review_required');
  });
});

describe('IDs, provenance, names, tags, report', () => {
  it('reaction, stage, participant, product and outcome IDs follow §4.2; provenance carries the legacy ID and the clock', async () => {
    const { reaction } = await run([part('substrate', 'c1'), part('product', 'c2', { major: true })], { tags: ['ether synthesis', ''] });
    expect(reaction).toMatchObject({ id: 'rxn_v6-r1', name: 'Test', tags: ['ether synthesis'] });
    expect(reaction.provenance).toMatchObject({ origin: 'legacy_import', createdAt: '2026-09-30T00:00:00.000Z', legacy: { system: 'organic-reaction-navigator-v6', legacyId: 'r1' } });
    expect(reaction.reversibility).toEqual({ kind: 'unknown' });
  });

  it('a repeated reaction ID is never merged; a missing one gets the port\'s placeholder; a nameless one a placeholder name (each said)', async () => {
    const all = await mapAll({ schemaVersion: 5, compounds: COMPOUNDS, reactions: [{ id: 'r1', name: 'A', participants: [] }, { id: 'r1', name: 'B', participants: [] }, { name: '', participants: [] }] });
    const [a, b, c] = all.reactions.records.reaction as [Reaction, Reaction, Reaction];
    expect(a.id).toBe('rxn_v6-r1');
    expect(b.id).toMatch(/^rxn_v6-r1-2-[0-9a-f]{6}$/);
    expect(b.review.reasons[0]).toContain('another reaction has the legacy id "r1"');
    expect(c.id).toBe('rxn_v6-r-missing-3');
    expect(c.review.reasons.some((x) => x.includes('had no id in the legacy file'))).toBe(true);
    expect(all.reactions.refByLegacyReactionId.get('r1')).toEqual({ kind: 'reaction', id: 'rxn_v6-r1' });
  });

  it('a name the schema cannot hold is a numbered placeholder with the original in unmapped', async () => {
    const all = await mapAll({ schemaVersion: 5, compounds: [], reactions: [{ id: 'r1', name: 'x'.repeat(400), participants: [] }] });
    const reaction = all.reactions.records.reaction[0] as Reaction;
    expect(reaction.name).toBe('Unnamed legacy reaction #1');
    expect(unmappedOf(reaction)).toMatchObject({ name: 'x'.repeat(400) });
  });

  it('the report counts what was created, lists every reason as a review item, and is absorbed into a shared builder only on success', async () => {
    const shared = createReportBuilder(5);
    shared.created('class');
    const { reactions, reaction } = await run([part('substrate', 'c1'), label('reagent', 'KOH'), part('product', 'c99', { major: true })]);
    expect(reactions.report.createdCounts).toEqual({ reaction: 1, reagent: 1, species: 1 });
    for (const record of [reaction, ...reactions.records.reagent, ...reactions.records.species]) {
      for (const reason of record.review.reasons) expect(reactions.report.reviewItems, `${record.id}: ${reason}`).toContainEqual({ subject: { kind: record.kind, id: record.id }, reason });
    }
    const withShared = await mapAll(doc([part('substrate', 'c1'), part('product', 'c2', { major: true })]), { report: shared });
    expect(withShared.reactions.report.createdCounts).toEqual({ reaction: 1 });
    expect(shared.build().createdCounts).toEqual({ class: 1, reaction: 1 });
  });

  it('a clock that is not a UTC ISO timestamp is refused as a value and leaves a shared builder untouched', async () => {
    const { createDocumentIds, mapLegacyCompounds, mapLegacyReactions, normalizeLegacyData } = await import('./index');
    const n = normalizeLegacyData(doc([part('substrate', 'c1')]));
    if (!n.ok) throw new Error('port');
    const ids = createDocumentIds(n.data);
    const compounds = await mapLegacyCompounds({ data: n.data, dropped: n.dropped, assignedIds: n.assignedIds, ids }, { now: () => '2026-09-30T00:00:00.000Z' });
    if (!compounds.ok) throw new Error('compounds');
    const shared = createReportBuilder(5);
    const before = JSON.stringify(shared.build());
    const result = await mapLegacyReactions({ data: n.data, assignedIds: n.assignedIds, ids, compounds }, { now: () => 'yesterday', report: shared });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_CLOCK' });
    expect(JSON.stringify(shared.build())).toBe(before);
  });

  it('every mapped record passes strict L1', async () => {
    const r = await run([part('substrate', 'c99'), label('reagent', 'aq. KOH'), label('workup', 'H3O+'), label('reactant', 'X'), part('intermediate', 'c2'), part('product', 'h1', { major: true }), part('byproduct', 'c3')], { conditions: { text: 'heat, dry', heat: true, anhydrous: true } });
    for (const record of r.all) expect(AnyRecordSchema.safeParse(record), record.id).toMatchObject({ success: true });
    expect((r.reactions.records.species as Species[]).length).toBeGreaterThan(0);
  });
});
