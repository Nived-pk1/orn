/**
 * Step 3.11a: the §4.9 quirks of real v6 data that concern the reactions handled here (r12, r14, r18, "443 K"), on the real
 * fixtures in both hub decisions; strict L1 for every mapped record of both fixtures, the quirk workbook and a hostile document; and
 * the compound + reaction records of a document together have no L1-L3 ERROR. Expected values are typed here.
 */
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import { AnyRecordSchema, type AnyRecord, type Reaction } from '@/core/schema';
import { validator } from '@/core/validation';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';
import { mapAll, stateOf, type MappedAll } from '@/test-support/legacy-reaction-kit';
import type { HubDecision } from './compound-map';

const reactionOf = (all: MappedAll, id: string): Reaction => all.reactions.records.reaction.find((r) => r.id === id) as Reaction;
const findings = (all: MappedAll) => {
  const state = stateOf(all.all);
  return validator.validateAll(state, coreIndexEngine.build(state, 1));
};
const rulesOf = (list: ReturnType<typeof findings>, severity: string): string[] => list.filter((f) => f.severity === severity).map((f) => f.ruleId).sort();

const demo = (decisions?: ReadonlyMap<string, HubDecision>) => mapAll(legacyFixture('v6-demo-export.json'), {}, decisions);

describe('§4.9 r12: Alcohols as both substrate and reactant', () => {
  it('two reactant participants on the one Alcohols class, kept and not merged; review and the RXN-021 warning say so', async () => {
    const all = await demo();
    const r12 = reactionOf(all, 'rxn_v6-r12');
    const reactants = r12.participants.filter((p) => p.role === 'reactant');
    expect(reactants.map((p) => [p.id, p.ref, p.isPrimarySubstrate])).toEqual([
      ['prt_v6-r12-1', { kind: 'class', id: 'cls_v6-c6' }, true],
      ['prt_v6-r12-2', { kind: 'class', id: 'cls_v6-c6' }, undefined],
    ]);
    expect(r12.review.reasons).toContain('the same substance appears more than once with the same role (class:cls_v6-c6; RXN-021); kept, not merged');
    expect(findings(all).filter((f) => f.ruleId === 'RXN-021').map((f) => [f.severity, f.subject.id])).toEqual([['warning', 'rxn_v6-r12']]);
  });

  it('with the hub decided as a species the two participants point at that species (same finding)', async () => {
    const all = await demo(new Map<string, HubDecision>([['c6', 'species']]));
    expect(reactionOf(all, 'rxn_v6-r12').participants.filter((p) => p.role === 'reactant').map((p) => p.ref)).toEqual([{ kind: 'species', id: 'spc_v6-c6' }, { kind: 'species', id: 'spc_v6-c6' }]);
    expect(findings(all).filter((f) => f.ruleId === 'RXN-021')).toHaveLength(1);
  });
});

describe('§4.9 r14: ester hydrolysis produces the species palmitic acid from the class Esters', () => {
  it('mixed scope → generic + review (RXN-022)', async () => {
    const all = await demo();
    const r14 = reactionOf(all, 'rxn_v6-r14');
    expect(r14.participants[0]?.ref).toEqual({ kind: 'class', id: 'cls_v6-c12' });
    expect(r14.outcomes[0]?.products.map((p) => [p.role, p.ref])).toContainEqual(['main', { kind: 'species', id: 'spc_v6-c16' }]);
    expect(r14.scope).toBe('generic');
    expect(r14.review.status).toBe('review_required');
    expect(r14.review.reasons.some((x) => x.startsWith('mixed scope: ') && x.endsWith('imported as generic (RXN-022)'))).toBe(true);
    expect(findings(all).filter((f) => f.ruleId === 'RXN-022')).toEqual([]); // generic with class refs is what the rule wants
  });

  it('with Esters (c12) decided as a species the reaction is specific and has no mixed-scope reason', async () => {
    const all = await demo(new Map<string, HubDecision>([['c12', 'species'], ['c6', 'species']]));
    const r14 = reactionOf(all, 'rxn_v6-r14');
    expect(r14.participants[0]?.ref).toEqual({ kind: 'species', id: 'spc_v6-c12' });
    expect(r14.scope).toBe('specific');
    expect(r14.review.reasons.some((x) => x.startsWith('mixed scope'))).toBe(false);
  });
});

describe('§4.9 r18: the cumene process links its acetone coproduct to the Ketones hub', () => {
  it('the coproduct points at the Ketones class; the review says a specific species may be intended, and it is a coproduct to decide', async () => {
    const all = await demo();
    const r18 = reactionOf(all, 'rxn_v6-r18');
    const products = r18.outcomes[0]?.products ?? [];
    expect(products.map((p) => [p.id, p.role, p.ref])).toEqual([
      ['pdt_v6-r18-4', 'main', { kind: 'class', id: 'cls_v6-c7' }],
      ['pdt_v6-r18-5', 'coproduct', { kind: 'class', id: 'cls_v6-c10' }],
    ]);
    expect(all.compounds.records.class.find((c) => c.id === 'cls_v6-c10')?.names.canonical).toBe('Ketones');
    expect(r18.review.reasons).toContain('coproduct/byproduct "c10" points at a class; a specific species may be intended');
    expect(r18.review.reasons.some((x) => x.includes('coproduct or minor isomer?'))).toBe(true);
  });

  it('with the hub decided as a species there is no class-pointing coproduct', async () => {
    const all = await demo(new Map<string, HubDecision>([['c10', 'species']]));
    const r18 = reactionOf(all, 'rxn_v6-r18');
    expect(r18.outcomes[0]?.products[1]?.ref).toEqual({ kind: 'species', id: 'spc_v6-c10' });
    expect(r18.review.reasons.some((x) => x.includes('points at a class'))).toBe(false);
  });
});

describe('§4.9: v4 "conc. H2SO4, 443 K" made v6 store "443 K" as a reagent label', () => {
  it('the label parser moves it to the stage temperature; conc. H2SO4 keeps its strength', async () => {
    const all = await mapAll(legacyFixture('v4-sample.json'));
    const r3 = reactionOf(all, 'rxn_v6-r3');
    expect(r3.stages[0]?.parameters.temperature).toEqual({ kind: 'value', value: 443, unit: 'K' });
    expect(r3.stages[0]?.parameters.parsedFields).toContain('temperature');
    expect(r3.participants.map((p) => p.originalText)).not.toContain('443 K');
    const acid = r3.participants.find((p) => p.originalText === 'conc. H2SO4');
    expect(acid).toMatchObject({ strength: 'concentrated' });
    expect(all.reactions.records.reagent.find((x) => x.id === acid?.ref.id)?.names.canonical).toBe('H2SO4');
  });

  it('the same in the quirk workbook: every temperature-like label of the v4 reagent string is a stage parameter', async () => {
    const all = await mapAll(legacyTestFixture('quirks.json'));
    const r6 = reactionOf(all, 'rxn_v6-r6');
    expect(r6.participants.map((p) => p.originalText)).not.toContain('443 K');
    expect(JSON.stringify(r6.stages[0]?.parameters)).toContain('443');
  });
});

const hostile = {
  schemaVersion: 5,
  compounds: [
    { id: 'c1', name: 'A', image: 7 },
    { id: 'c1', name: 'A again' },
    { id: 'c2', name: 'B', nodeType: 'major' },
  ],
  reactions: [
    { id: 'r1', name: 5, participants: [{ ref: 'c1', role: 'substrate', note: 'bad\u0001', image: {} }, { ref: 99, role: 'product', major: true }, { ref: { a: 1 }, label: ['x'], role: 'reagent' }, { label: 'dry\u0000', role: 'reagent' }], conditions: { text: 'x'.repeat(3_000), temperature: [1], heat: 'yes', zz: { y: null } }, tags: 'a,b', image: 5, customThing: [1, { b: null }], jee: 5 },
    { id: 'r1', name: 'Repeated', participants: Array.from({ length: 70 }, (_, i) => ({ ref: `m${i}`, label: '', role: i % 3 === 0 ? 'product' : i % 3 === 1 ? 'intermediate' : 'reactant', major: false, note: '', image: '' })), conditions: {} },
    { name: 'no id', participants: [{ ref: 'c2', role: 'workup', major: 'yes' }, { ref: '', label: 'hν', role: 'workup' }, { ref: '', label: '443 K', role: 'workup', note: 'n' }, { ref: 'c2', role: 'constructor' }] },
    { id: 'r4', participants: 'not a list', conditions: 'hot' },
  ],
};

describe('strict L1 and the merged L1-L3 result', () => {
  const inputs: [string, () => unknown][] = [
    ['v6-demo-export.json', () => legacyFixture('v6-demo-export.json')],
    ['v4-sample.json', () => legacyFixture('v4-sample.json')],
    ['the quirk workbook', () => legacyTestFixture('quirks.json')],
    ['a hostile document', () => hostile],
  ];

  it.each(inputs)('%s: every mapped record passes strict L1 (both hub decisions)', async (_name, load) => {
    for (const decision of ['class', 'species'] as const) {
      const hubs = new Map<string, HubDecision>();
      for (const c of ((load() as { compounds: { id: string; nodeType?: string }[] }).compounds ?? [])) if (c.nodeType === 'major') hubs.set(c.id, decision);
      const all = await mapAll(load(), {}, hubs);
      for (const record of all.all) expect(AnyRecordSchema.safeParse(record).success, `${decision}: ${record.id}`).toBe(true);
      expect(all.reactions.records.reaction.length).toBeGreaterThan(0);
    }
  });

  it.each(inputs)('%s: compounds and reactions together have no L1-L3 ERROR', async (_name, load) => {
    const all = await mapAll(load());
    expect(findings(all).filter((f) => f.severity === 'error').map((f) => `${f.ruleId} ${f.subject.id}: ${f.message}`)).toEqual([]);
  });

  it('the warnings and reviews of the two fixtures (recorded in PROGRESS.md) are exactly these', async () => {
    const demoAll = await mapAll(legacyFixture('v6-demo-export.json'));
    const sampleAll = await mapAll(legacyFixture('v4-sample.json'));
    const d = findings(demoAll);
    const s = findings(sampleAll);
    expect(rulesOf(d, 'warning')).toEqual(['RXN-021']);
    expect(rulesOf(s, 'warning')).toEqual(['SPC-001', 'SPC-001']);
    expect(rulesOf(d, 'info').filter((r) => r !== 'RXN-016' && r !== 'SPC-004')).toEqual([]);
    expect(rulesOf(s, 'info').filter((r) => r !== 'RXN-016' && r !== 'SPC-004')).toEqual(['RVW-002']); // a published reaction refers to a draft placeholder
  });

  it('the hostile document is total: kept-whole values, gaps in the nested IDs, no throw', async () => {
    const all = await mapAll(hostile);
    const [a, b, c, d] = all.reactions.records.reaction as [Reaction, Reaction, Reaction, Reaction];
    expect(a.name).toBe('Unnamed legacy reaction #1');
    expect(b.id).toMatch(/^rxn_v6-r1-2-/);
    expect(b.participants.length + b.outcomes.flatMap((o) => o.products).length + b.intermediates.length).toBeLessThanOrEqual(70);
    expect(c.id).toBe('rxn_v6-r-missing-3');
    expect(d.participants).toEqual([]);
    // the port reads a non-list `participants` as a v4 reaction (no reagent string: nothing to convert), so the mapper sees an empty list
    expect(d.review.lifecycle).toBe('draft');
    expect(a.provenance.legacy?.unmapped).toMatchObject({ customThing: [1, { b: null }], name: 5 });
  });

  it('is deterministic and never reads the clock or Math.random', async () => {
    const realNow = Date.now;
    const realRandom = Math.random;
    let touched = 0;
    Date.now = () => ((touched += 1), realNow());
    Math.random = () => ((touched += 1), realRandom());
    try {
      const a = await mapAll(structuredClone(hostile));
      const b = await mapAll(structuredClone(hostile));
      expect(touched).toBe(0);
      const text = (x: MappedAll): string => JSON.stringify([x.reactions.records, x.reactions.updatedAssets, x.reactions.deferred, x.reactions.report, [...x.reactions.consumed]]);
      expect(text(a)).toBe(text(b));
      expect(a.all.map((r: AnyRecord) => r.id)).toEqual(b.all.map((r: AnyRecord) => r.id));
    } finally {
      Date.now = realNow;
      Math.random = realRandom;
    }
  });
});
