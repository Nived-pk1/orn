/**
 * Phase 1 halves of adversarial rows whose graph half belongs to Phase 2 (docs/TEST_STRATEGY.md §5):
 * ADV-051 (validation + reverse references), ADV-057 (no finding, both chapters through topic ancestry),
 * ADV-058 (normaliser + folded-names index). ADV-055 is named on the INV-16 test in invariants-gate-a.test.ts.
 * All run on the demo dataset.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { fold } from '@/core/text';
import { validator } from '@/core/validation';
import { buildDemoDocument } from '@/test-support/demo';
import { edit } from '@/test-support/rule-harness';
import { must } from '@/test-support/state-fixture';

const demo = (() => {
  const result = documentToState(buildDemoDocument());
  if (!result.ok) throw new Error('duplicate IDs');
  return result.state;
})();
const findingsOf = (state: CanonicalState) => validator.validateAll(state, coreIndexEngine.build(state, 0));
const ref = (kind: RecordRef['kind'], id: string): RecordRef => ({ kind, id });

describe('ADV-051 the same compound twice in one reaction', () => {
  const RXN = 'rxn_ethanol-to-ethanal-pcc';
  const ETHANOL = 'spc_ethanol';
  const pathsTo = (state: CanonicalState, id: string) =>
    coreIndexEngine
      .build(state, 0)
      .referrersOf(id)
      .filter((r) => r.owner.id === RXN)
      .map((r) => r.path);

  it('(a) a reactant that is also a product: RXN-017 warning, no ERROR, one reverse reference per occurrence', () => {
    const loop = edit(demo, 'reaction', RXN, (r) => { must(must(r.outcomes[0]).products[0]).ref = ref('species', ETHANOL) as never; });
    const own = findingsOf(loop).filter((f) => f.subject.id === RXN);
    expect(own.filter((f) => f.ruleId === 'RXN-017')).toMatchObject([{ severity: 'warning', path: 'outcomes[0].products[0].ref' }]);
    expect(findingsOf(loop).filter((f) => f.severity === 'error')).toEqual([]);
    expect(pathsTo(loop, ETHANOL)).toEqual(['outcomes[0].products[0].ref', 'participants[0].ref']);
  });

  it('(b) twice as reactant: no ERROR, two participations with distinct IDs, one reverse reference per participation', () => {
    const twice = edit(demo, 'reaction', RXN, (r) => {
      const first = must(r.participants[0]);
      r.participants.push({ ...first, id: 'prt_ethanol-to-ethanal-pcc-4', isPrimarySubstrate: false } as never);
      must(r.stages[0]).participantIds.push('prt_ethanol-to-ethanal-pcc-4' as never);
    });
    const reaction = must(twice.records.reaction[RXN]);
    const reactants = reaction.participants.filter((p) => p.ref.id === ETHANOL && p.role === 'reactant');
    expect(reactants).toHaveLength(2);
    expect(new Set(reactants.map((p) => p.id)).size).toBe(2);
    expect(findingsOf(twice).filter((f) => f.severity === 'error')).toEqual([]);
    expect(pathsTo(twice, ETHANOL)).toEqual(['participants[0].ref', 'participants[3].ref']);
  });
});

describe('ADV-057 a cross-chapter reaction (two topic mappings)', () => {
  const RXN = 'rxn_benzenediazonium-to-phenol';
  const indexes = coreIndexEngine.build(demo, 0);
  const mappings = indexes
    .referrersOf(RXN)
    .filter((r) => r.owner.kind === 'topic_mapping')
    .map((r) => must(demo.records.topic_mapping[r.owner.id]));

  it('raises no finding on the reaction or its mappings', () => {
    const subjects = new Set([RXN, ...mappings.map((m) => m.id)]);
    const mine = findingsOf(demo).filter((f) => subjects.has(f.subject.id) && (f.severity === 'error' || f.severity === 'warning'));
    expect(mine).toEqual([]);
  });

  it('resolves under both chapters through topic ancestry', () => {
    expect(mappings).toHaveLength(2);
    const chapters = mappings.map((m) => {
      const chain = [m.topicId, ...indexes.ancestorsOf('topic', m.topicId)];
      return must(chain.find((id) => must(demo.records.topic[id]).topicKind === 'chapter'));
    });
    expect(chapters.sort()).toEqual(['top_alcohols-phenols-ethers', 'top_amines-diazonium']);
  });
});

describe('ADV-058 multiple aliases for one entity (Unicode α, subscripts)', () => {
  const indexes = coreIndexEngine.build(demo, 0);
  const LACTIC = 'spc_lactic-acid';
  const record = must(demo.records.species[LACTIC]);
  const names = [record.names.canonical, ...(record.names.aliases ?? [])];

  it('every name and alias folds to a non-empty form and resolves to the one record', () => {
    expect(names).toContain('α-Hydroxypropanoic acid');
    expect(names).toContain('C₃H₆O₃');
    for (const name of names) {
      expect(fold(name), name).not.toBe('');
      expect(indexes.byFoldedName('species', fold(name)), name).toEqual([ref('species', LACTIC)]);
    }
  });

  it('Greek letters and subscripts fold to their ASCII forms, so either spelling finds the record', () => {
    expect(fold('α-Hydroxypropanoic acid')).toBe(fold('alpha-hydroxypropanoic acid'));
    expect(fold('C₃H₆O₃')).toBe(fold('C3H6O3'));
    expect(indexes.byFoldedName('species', fold('alpha-hydroxypropanoic acid'))).toEqual([ref('species', LACTIC)]);
    expect(indexes.byFoldedName('species', fold('C3H6O3'))).toEqual([ref('species', LACTIC)]);
  });

  it("the entity's own aliases never trigger SPC-001", () => {
    expect(findingsOf(demo).filter((f) => f.ruleId === 'SPC-001' && f.subject.id === LACTIC)).toEqual([]);
  });
});
