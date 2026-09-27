/**
 * Gate A adversarial rows (docs/TEST_STRATEGY.md §5, Gate column "A"). Most rows are covered close to
 * the code they exercise (named by ID in those tests); this file checks that none is missing and
 * exercises the rows that need a realistic dataset — the demo — rather than a minimal fixture. An ID counts only when it
 * appears in a test title (see gate-matrix.ts).
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { computeDeleteImpact } from '@/core/commands';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { CanonicalState, DatasetDocument, RecordKind, RecordRef } from '@/core/schema';
import { validator } from '@/core/validation';
import { buildDemoDocument } from '@/test-support/demo';
import { must } from '@/test-support/state-fixture';
import { describeGateCompleteness } from './gate-matrix';

const PRESENTATION: readonly RecordKind[] = ['navigator_anchor', 'reaction_scheme', 'view_preset', 'entity_display'];

function stateOf(doc: DatasetDocument): CanonicalState {
  const result = documentToState(doc);
  if (!result.ok) throw new Error('duplicate IDs');
  return result.state;
}
const errorsOf = (state: CanonicalState) =>
  validator.validateAll(state, coreIndexEngine.build(state, 0)).filter((f) => f.severity === 'error');
const ref = (kind: RecordKind, id: string): RecordRef => ({ kind, id });

// P-01…08 and INV-09/15/22 are Gate A criteria (TEST_STRATEGY §6); INV-22 is the Phase 1 part only.
describeGateCompleteness('A', 19, ['P-01', 'P-02', 'P-04', 'P-05', 'P-06', 'P-07', 'P-08', 'INV-09', 'INV-15', 'INV-22']);

describe('Gate A rows on the demo dataset', () => {
  const doc = buildDemoDocument();
  const state = stateOf(doc);
  const indexes = coreIndexEngine.build(state, 0);

  it('ADV-008: outcomes that differ by condition variant carry the variant IDs (413 K / 443 K)', () => {
    const reaction = must(state.records.reaction['rxn_ethanol-conc-h2so4']);
    const variantIds = reaction.conditionVariants.map((v) => v.id);
    expect(reaction.outcomes.map((o) => o.conditionVariantIds)).toEqual(variantIds.map((id) => [id]));
    expect(errorsOf(state)).toEqual([]);
  });

  it('ADV-017: deleting water, used by many reactions, is blocked with the full impact list', () => {
    const users = Object.values(state.records.reaction)
      .filter((r) => r.participants.some((p) => p.ref.id === 'spc_water') || r.outcomes.some((o) => o.products.some((p) => p.ref.id === 'spc_water')))
      .map((r) => r.id);
    expect(users.length).toBeGreaterThanOrEqual(8);
    const impact = computeDeleteImpact(state, indexes, [ref('species', 'spc_water')]);
    const blockers = new Set(impact.blockedBy.map((b) => b.owner.id));
    for (const id of users) expect(blockers.has(id), id).toBe(true);
    expect(impact.blockedBy.every((b) => b.onDelete === 'restrict')).toBe(true);
  });

  it('ADV-018: a reaction in a route is blocked by it; a reaction with a scheme, relationships and mappings cascades them', () => {
    const inRoute = computeDeleteImpact(state, indexes, [ref('reaction', 'rxn_ethanol-to-ethanal-pcc')]);
    expect(inRoute.blockedBy.map((b) => b.owner.id)).toContain('rte_ethanol-to-propan-2-ol');
    const free = computeDeleteImpact(state, indexes, [ref('reaction', 'rxn_methylmgbr-propanone')]);
    expect(free.blockedBy).toEqual([]);
    expect(new Set(free.cascades.map((c) => c.kind))).toEqual(new Set(['reaction_scheme', 'relationship', 'topic_mapping']));
  });

  it('ADV-023: the same substance is a reagent in one reaction and a catalyst in another, both valid', () => {
    const roles = new Set<string>();
    for (const reaction of Object.values(state.records.reaction)) {
      for (const p of reaction.participants) if (p.ref.id === 'rgt_sulfuric-acid') roles.add(p.role);
    }
    expect([...roles].sort()).toEqual(['catalyst', 'reagent']);
    expect(errorsOf(state)).toEqual([]);
  });

  it('ADV-024: aq. KOH and alc. KOH are one reagent in two reactions with different outcomes', () => {
    const aq = must(state.records.reaction['rxn_r-2-bromobutane-aq-koh']);
    const alc = must(state.records.reaction['rxn_r-2-bromobutane-alc-koh']);
    const koh = (r: typeof aq) => must(r.participants.find((p) => p.ref.id === 'rgt_koh'));
    expect(koh(aq).phase).toBe('aq');
    expect(koh(alc).phase).toBe('alc');
    expect(aq.outcomes.map((o) => o.products.map((p) => p.ref.id))).toEqual([['spc_butan-2-ol-s']]);
    expect(alc.outcomes.map((o) => o.products.map((p) => p.ref.id))).toEqual([['spc_but-2-ene'], ['spc_but-1-ene']]);
    expect(Object.keys(state.records.reagent).filter((id) => id.includes('koh'))).toEqual(['rgt_koh']);
  });

  it('ADV-028: deleting every presentation record leaves the chemistry valid and unchanged', () => {
    const stripped: DatasetDocument = { ...doc, records: { ...doc.records, navigator_anchor: [], reaction_scheme: [], view_preset: [], entity_display: [] } };
    const after = stateOf(stripped);
    expect(errorsOf(after)).toEqual([]);
    for (const kind of Object.keys(state.records) as RecordKind[]) {
      if (PRESENTATION.includes(kind)) continue;
      expect(after.records[kind], kind).toEqual(state.records[kind]);
    }
  });
});
