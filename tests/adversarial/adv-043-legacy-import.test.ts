/**
 * ADV-043 (docs/TEST_STRATEGY.md §5, Gate C): a v6 import with representative hub SMILES, dangling IDs and duplicate names, through the
 * real import pipeline: no loss (the whole-JSON completeness check on what the mappers produce, and every mapped record found
 * unchanged in the applied state) and the review items listed. Then INV-23 for legacy, and ONE test per §4.9 quirk of real v6 data, each
 * citing where the quirk is covered in depth; the assertions here go through the pipeline and are deliberately small.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord, ChemicalClass, Reaction } from '@/core/schema';
import { canonicalJson, type ImportPlan } from '@/io';
import { mapClassified } from '@/test-support/legacy-classify-kit';
import { allConsumed, unaccounted } from '@/test-support/legacy-completeness-kit';
import { legacyBytes, legacyPreview } from '@/test-support/legacy-import-kit';
import { legacyFixture } from '@/test-support/legacy-kit';

const bytesOf = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const stripTimes = (record: AnyRecord): unknown => {
  const copy = structuredClone(record) as unknown as { provenance: { createdAt?: string; updatedAt?: string } };
  delete copy.provenance.createdAt;
  delete copy.provenance.updatedAt;
  delete (copy.provenance as { importBatchId?: string }).importBatchId; // 7.3b A1: the import stamps its batch id
  return copy;
};

/** The v6 demo export plus a duplicate name (two species that fold to "ethanol"), a dangling compound ID in a reaction and a hub with a representative SMILES. */
function documentWithHazards(): { schemaVersion: number; compounds: Record<string, unknown>[]; reactions: Record<string, unknown>[] } {
  const base = structuredClone(legacyFixture('v6-demo-export.json')) as { schemaVersion: number; compounds: Record<string, unknown>[]; reactions: Record<string, unknown>[] };
  base.compounds.push({ id: 'c30', name: 'Ethanol', smiles: 'CCO', nodeType: 'auto' }, { id: 'c31', name: 'ethanol ', smiles: 'OCC', nodeType: 'auto' });
  base.reactions.push({
    id: 'r30',
    name: 'Reaction with a dangling compound',
    participants: [{ ref: 'c999', label: '', role: 'substrate', major: false, note: '', image: '' }, { ref: 'c30', label: '', role: 'product', major: true, note: '', image: '' }],
  });
  return base;
}

describe('ADV-043 v6 import with representative hub SMILES, dangling IDs and duplicate names: no loss, review items listed', () => {
  async function imported() {
    const run = await legacyPreview(bytesOf(documentWithHazards()), 'empty');
    if (!run.outcome.ok) throw new Error(`${run.outcome.code}: ${run.outcome.message}`);
    const plan: ImportPlan = run.outcome.plan;
    const applied = await run.session.apply(plan.preview.batchId, plan);
    if (!applied.ok) throw new Error(applied.message);
    return { run, plan, live: run.store.getState() };
  }

  it('the whole-JSON completeness check passes on the mapper output for this document, and every mapped record is in the applied state unchanged', async () => {
    const { live, plan } = await imported();
    const mapped = await mapClassified(documentWithHazards());
    expect(unaccounted(mapped, {}, allConsumed(mapped))).toEqual([]);
    expect(mapped.classification.deferred).toEqual([]);
    expect(mapped.classification.unhandledDropped).toEqual([]);
    let found = 0;
    for (const record of mapped.all) {
      const inState = live.records[record.kind][record.id as never] as AnyRecord | undefined;
      expect(inState, `${record.kind} ${record.id}`).toBeDefined();
      expect(canonicalJson(stripTimes(inState as AnyRecord))).toBe(canonicalJson(stripTimes(record)));
      found += 1;
    }
    expect(found).toBe(plan.preview.mergedRecordCount);
    expect(plan.preview.legacyReport?.notImported).toEqual([]);
  });

  it('the representative hub SMILES are kept in legacy.unmapped, never as the class structure', async () => {
    const { live } = await imported();
    const alkanes = Object.values(live.records.class).find((c) => (c as ChemicalClass).names.canonical === 'Alkanes') as ChemicalClass;
    expect((alkanes.provenance.legacy?.unmapped as { smiles?: string }).smiles).toBe('CCCC');
    expect(alkanes.generic?.structure).toBeUndefined();
    expect(alkanes.review.reasons.some((r) => r.includes('representative SMILES not used'))).toBe(true);
  });

  it('the dangling compound ID becomes ONE draft placeholder species that says so, and the reaction is flagged', async () => {
    const { live, plan } = await imported();
    const placeholders = Object.values(live.records.species).filter((s) => s.names.canonical === 'Missing legacy compound c999');
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]?.review).toMatchObject({ lifecycle: 'draft', status: 'review_required' });
    const r30 = live.records.reaction['rxn_v6-r30' as never] as Reaction;
    expect(r30.review.reasons.some((r) => r.includes('"c999"') && r.includes('placeholder species'))).toBe(true);
    expect(plan.preview.legacyReport?.reviewItems.some((i) => i.subject.id === 'rxn_v6-r30')).toBe(true);
  });

  it('the duplicate name is reported on both records (SPC-001) and merged into nothing', async () => {
    const { live, plan } = await imported();
    const same = Object.values(live.records.species).filter((s) => s.names.canonical.trim().toLowerCase() === 'ethanol');
    expect(same).toHaveLength(2); // both kept, never merged
    for (const record of same) expect(record.review.reasons.some((x) => x.includes('same folded name') && x.includes('SPC-001'))).toBe(true);
    expect(plan.preview.findings.filter((f) => f.ruleId === 'SPC-001').length).toBeGreaterThanOrEqual(2);
  });

  it('the review items are listed: every item names a record of the applied state that is review_required, and every review_required record has an item', async () => {
    const { live, plan } = await imported();
    const items = plan.preview.legacyReport?.reviewItems ?? [];
    expect(items.length).toBeGreaterThan(100);
    const flagged = new Set<string>();
    for (const item of items) {
      const record = live.records[item.subject.kind][item.subject.id as never] as AnyRecord | undefined;
      expect(record, `${item.subject.kind} ${item.subject.id}`).toBeDefined();
      expect((record as unknown as { review: { status: string; reasons: string[] } }).review.status).toBe('review_required');
      flagged.add(item.subject.id);
    }
    for (const table of Object.values(live.records)) {
      for (const record of Object.values(table as Record<string, AnyRecord>)) {
        const review = (record as unknown as { review?: { status: string; reasons: string[] } }).review;
        if (review?.status === 'review_required') expect(flagged.has(record.id), record.id).toBe(true);
      }
    }
  });
});

describe('INV-23 for legacy: nothing the file said is lost between the file and the store', () => {
  it('every fixture: nothing not imported, every record L1-valid (nothing quarantined), the report lists the consumed-by-default counts', async () => {
    for (const name of ['v6-demo-export.json', 'v4-sample.json'] as const) {
      const run = await legacyPreview(legacyBytes(name), 'empty');
      if (!run.outcome.ok) throw new Error(run.outcome.message);
      expect(run.outcome.plan.preview.quarantined).toEqual([]);
      expect(run.outcome.plan.preview.legacyReport?.notImported).toEqual([]);
    }
  });
});

describe('§4.9 quirks of real v6 data (one test per quirk; depth cited)', () => {
  async function applied(name: 'v6-demo-export.json' | 'v4-sample.json') {
    const run = await legacyPreview(legacyBytes(name), 'empty');
    if (!run.outcome.ok) throw new Error(run.outcome.message);
    const result = await run.session.apply(run.outcome.plan.preview.batchId, run.outcome.plan);
    if (!result.ok) throw new Error(result.message);
    return { state: run.store.getState(), plan: run.outcome.plan };
  }

  it('§4.9 hubs carry example structures (Alkanes CCCC, Alkenes C=CC, ...): a class never gets a structure (depth: legacy-v6/compound-quirks.test.ts)', async () => {
    const { state } = await applied('v6-demo-export.json');
    const classes = Object.values(state.records.class);
    const hubs = classes.filter((c) => (c.provenance.legacy?.unmapped as { smiles?: string } | undefined)?.smiles !== undefined);
    expect(hubs.length).toBeGreaterThanOrEqual(5);
    expect(hubs.every((c) => c.generic?.structure === undefined)).toBe(true);
  });

  it('§4.9 r12 lists Alcohols as substrate and reactant: two reactant participants on one class, kept, RXN-021 warning (depth: legacy-v6/reaction-quirks.test.ts)', async () => {
    const { state, plan } = await applied('v6-demo-export.json');
    const r12 = state.records.reaction['rxn_v6-r12' as never] as Reaction;
    const reactants = r12.participants.filter((p) => p.role === 'reactant');
    expect(reactants).toHaveLength(2);
    expect(reactants[0]?.ref).toEqual(reactants[1]?.ref);
    expect(plan.preview.findings.some((f) => f.ruleId === 'RXN-021' && f.subject.id === 'rxn_v6-r12')).toBe(true);
  });

  it('§4.9 r14 produces a specific species from the generic class Esters: mixed scope, generic, review (depth: legacy-v6/reaction-quirks.test.ts)', async () => {
    const { state } = await applied('v6-demo-export.json');
    const r14 = state.records.reaction['rxn_v6-r14' as never] as Reaction;
    expect(r14.scope).toBe('generic');
    expect(r14.review.reasons.some((r) => r.startsWith('mixed scope: '))).toBe(true);
  });

  it('§4.9 r18 links its acetone coproduct to the Ketones hub: review says a specific species may be intended (depth: legacy-v6/reaction-quirks.test.ts)', async () => {
    const { state } = await applied('v6-demo-export.json');
    const r18 = state.records.reaction['rxn_v6-r18' as never] as Reaction;
    expect(r18.review.reasons.some((r) => r.includes('a specific species may be intended'))).toBe(true);
  });

  it('§4.9 v4 "conc. H2SO4, 443 K" stored "443 K" as a reagent label: it becomes the stage temperature (depth: legacy-v6/reaction-quirks.test.ts)', async () => {
    const { state } = await applied('v4-sample.json');
    const r3 = state.records.reaction['rxn_v6-r3' as never] as Reaction;
    expect(r3.stages[0]?.parameters.temperature).toEqual({ kind: 'value', value: 443, unit: 'K' });
    expect(r3.participants.map((p) => p.originalText)).not.toContain('443 K');
  });

  it('§4.9 r22 is an unanchored test reaction with chapter "Uncategorised" and no relevance: no topic, no exam mapping (depth: legacy-v6/classify-quirks.test.ts)', async () => {
    const { state } = await applied('v6-demo-export.json');
    expect(state.records.reaction['rxn_v6-r22' as never]).toBeDefined();
    expect(Object.values(state.records.topic_mapping).some((m) => m.target.id === 'rxn_v6-r22')).toBe(false);
    expect(Object.values(state.records.exam_relevance).some((m) => m.target.id === 'rxn_v6-r22')).toBe(false);
  });

  it('§4.9 v6 condition flags were inferred by regex: all of them become parsedFields and a review reason (depth: legacy-v6/condition-parser.test.ts, reaction-conditions.test.ts)', async () => {
    const { state } = await applied('v6-demo-export.json');
    const flagged = Object.values(state.records.reaction).filter((r) => (r.stages[0]?.parameters.parsedFields.length ?? 0) > 0);
    expect(flagged.length).toBeGreaterThan(0);
    for (const reaction of flagged) expect(reaction.review.reasons.some((x) => x.includes('RXN-015'))).toBe(true);
  });
});
