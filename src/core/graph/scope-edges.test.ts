/** Exam scope edges (docs/JEE_ONTOLOGY.md section 4): (a) enrichment judged on covered mappings only; (b) an outside concept that is a prerequisite of an official record is a prerequisite. */
import { describe, expect, it } from 'vitest';
import { examId, examVersion, examVersionId, topic, topicMapping } from '@/test-support/curriculum-kit';
import { concept, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { createScopeOf } from '@/core/graph/scope';

const EXAM = 'jee-main';
const rec = (kind: 'reaction' | 'concept', id: string): { kind: 'reaction' | 'concept'; id: string } => ({ kind, id });
const r1 = (extra: object = {}) => reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }], ...extra });

describe('derived scope edges', () => {
  it('(a) covered only through an enrichment mapping, core only in a topic this version does not cover: enrichment', () => {
    const covered = topic('chap-a', 'A');
    const notCovered = topic('chap-b', 'B');
    const mapA = topicMapping('ma', 'chap-a', rec('reaction', 'rxn_r1'), 'enrichment');
    const mapB = topicMapping('mb', 'chap-b', rec('reaction', 'rxn_r1'), 'core');
    const v = examVersion('v1', EXAM, [{ topic: 'chap-a', coverage: 'included' }]);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1(), covered, notCovered, mapA, mapB, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('enrichment');
  });

  it('(b) a concept mapped to an excluded topic that is a prerequisite of an official reaction: prerequisite', () => {
    const c = concept('c1', 'C1', 'general');
    const chap = topic('chap', 'Chapter');
    const other = topic('other', 'Other');
    const mapR = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'), 'core');
    const mapC = topicMapping('m2', 'other', rec('concept', 'cpt_c1'), 'core');
    const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }, { topic: 'other', coverage: 'excluded' }]);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1({ prerequisites: ['c1'] }), c, chap, other, mapR, mapC, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('official');
    expect(scopeOf(rec('concept', 'cpt_c1'))).toBe('prerequisite');
  });
});
