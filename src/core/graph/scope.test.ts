/**
 * Derived exam scope (docs/JEE_ONTOLOGY.md §4): explicit override, mapped coverage (+ topic ancestry),
 * one-hop prerequisite, else unmapped. Precedence official > prerequisite > enrichment > outside.
 */
import { describe, expect, it } from 'vitest';
import { examId, examRelevance, examVersion, examVersionId, prerequisiteOf, reverseOf, topic, topicMapping } from '@/test-support/curriculum-kit';
import { concept, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { createScopeOf } from './scope';

const EXAM = 'jee-main';
const rec = (kind: 'reaction' | 'concept', id: string): { kind: 'reaction' | 'concept'; id: string } => ({ kind, id });

describe('createScopeOf', () => {
  it('unmapped: no mapping and no override', () => {
    const state = stateOf(species('sp-a', 'A'));
    const version = examVersion('v1', EXAM, []);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf({ kind: 'species', id: 'spc_sp-a' })).toBe('unmapped');
    void version;
  });

  it('mapped + included coverage: official', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const t = topic('chap', 'Chapter');
    const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'), 'core');
    const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }]);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('official');
  });

  it('mapped via a topic ancestor: a section with no direct coverage inherits its chapter\'s', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const chapter = topic('chap', 'Chapter');
    const section = topic('sect', 'Section', { kind: 'section', parent: 'chap' });
    const map = topicMapping('m1', 'sect', rec('reaction', 'rxn_r1'));
    const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }]);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, chapter, section, map, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('official');
  });

  it('mapped + partial coverage: still official (partial only adds a marker elsewhere)', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const t = topic('chap', 'Chapter');
    const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'));
    const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'partial' }]);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('official');
  });

  it('mapped, every mapping enrichment role, and covered: enrichment', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const t = topic('chap', 'Chapter');
    const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'), 'enrichment');
    const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }]);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('enrichment');
  });

  it('one core mapping among several: official even if another mapping is enrichment', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const chapA = topic('chap-a', 'A');
    const chapB = topic('chap-b', 'B');
    const mapA = topicMapping('ma', 'chap-a', rec('reaction', 'rxn_r1'), 'enrichment');
    const mapB = topicMapping('mb', 'chap-b', rec('reaction', 'rxn_r1'), 'core');
    const v = examVersion('v1', EXAM, [{ topic: 'chap-a', coverage: 'included' }, { topic: 'chap-b', coverage: 'included' }]);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, chapA, chapB, mapA, mapB, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('official');
  });

  it('mapped but excluded: outside', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const t = topic('chap', 'Chapter');
    const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'));
    const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'excluded' }]);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('outside');
  });

  it('mapped to a topic absent from the version\'s coverage entirely: outside', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const t = topic('chap', 'Chapter');
    const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'));
    const v = examVersion('v1', EXAM, []);
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('outside');
  });

  describe('explicit override (§4.1)', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const t = topic('chap', 'Chapter');
    const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'));
    const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }]); // would derive 'official' unmapped

    it('a version-specific override beats the mapped-coverage result', () => {
      const override = examRelevance('e1', rec('reaction', 'rxn_r1'), EXAM, ['v1'], 'enrichment');
      const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v, override);
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('enrichment');
    });

    it('a version-agnostic override (empty examVersionIds) applies when no version-specific one does', () => {
      const override = examRelevance('e1', rec('reaction', 'rxn_r1'), EXAM, [], 'outside');
      const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v, override);
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('outside');
    });

    it('a version-specific override wins over a version-agnostic one for the same target', () => {
      const specific = examRelevance('e1', rec('reaction', 'rxn_r1'), EXAM, ['v1'], 'official');
      const agnostic = examRelevance('e2', rec('reaction', 'rxn_r1'), EXAM, [], 'outside');
      const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v, specific, agnostic);
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('official');
    });

    it('several applicable overrides resolve by precedence official > prerequisite > enrichment > outside (CUR-004)', () => {
      const first = examRelevance('e1', rec('reaction', 'rxn_r1'), EXAM, ['v1'], 'outside');
      const second = examRelevance('e2', rec('reaction', 'rxn_r1'), EXAM, ['v1'], 'enrichment');
      const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v, first, second);
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('enrichment');
    });

    it('an override for a different exam is ignored', () => {
      const override = examRelevance('e1', rec('reaction', 'rxn_r1'), 'jee-advanced', ['v1'], 'outside');
      const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, t, map, v, override);
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('official');
    });
  });

  describe('prerequisite (§4.3), concepts only, one hop', () => {
    it('an unmapped concept that is a prerequisite (via prerequisiteConceptIds) of an official reaction: prerequisite', () => {
      const c = concept('basic-idea', 'Basic idea', 'general');
      const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }], prerequisites: ['basic-idea'] });
      const t = topic('chap', 'Chapter');
      const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'));
      const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }]);
      const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), c, r1, t, map, v);
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf(rec('concept', 'cpt_basic-idea'))).toBe('prerequisite');
    });

    it('an unmapped concept prerequisite (via a prerequisite_of relationship) of an official reaction: prerequisite', () => {
      const c = concept('basic-idea', 'Basic idea', 'general');
      const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
      const rel = prerequisiteOf('rel1', rec('concept', 'cpt_basic-idea'), rec('reaction', 'rxn_r1'));
      const t = topic('chap', 'Chapter');
      const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'));
      const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }]);
      const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), c, r1, rel, t, map, v);
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf(rec('concept', 'cpt_basic-idea'))).toBe('prerequisite');
    });

    it('a prerequisite of a merely-prerequisite (not official) record does not chain: unmapped', () => {
      const deep = concept('deep-idea', 'Deep idea', 'general');
      const shallow = concept('shallow-idea', 'Shallow idea', 'general');
      const r1 = reaction({
        slug: 'r1', name: 'R1', scope: 'specific',
        participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }],
        prerequisites: ['shallow-idea'],
      });
      const relDeep = prerequisiteOf('rel1', rec('concept', 'cpt_deep-idea'), rec('concept', 'cpt_shallow-idea'));
      const t = topic('chap', 'Chapter');
      const map = topicMapping('m1', 'chap', rec('reaction', 'rxn_r1'));
      const v = examVersion('v1', EXAM, [{ topic: 'chap', coverage: 'included' }]);
      const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), deep, shallow, r1, relDeep, t, map, v);
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf(rec('concept', 'cpt_shallow-idea'))).toBe('prerequisite');
      expect(scopeOf(rec('concept', 'cpt_deep-idea'))).toBe('unmapped');
    });

    it('a species is never given prerequisite scope (concepts only)', () => {
      const state = stateOf(species('sp-a', 'A'));
      const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
      expect(scopeOf({ kind: 'species', id: 'spc_sp-a' })).toBe('unmapped');
    });
  });

  it('is unaffected by an unrelated reverse_of relationship (no crosstalk between graph concerns)', () => {
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const r2 = reaction({ slug: 'r2', name: 'R2', scope: 'specific', participants: [{ ref: sp('sp-b'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-a') }] }] });
    const rel = reverseOf('rel1', rec('reaction', 'rxn_r1'), rec('reaction', 'rxn_r2'));
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), r1, r2, rel);
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('v1'));
    expect(scopeOf(rec('reaction', 'rxn_r1'))).toBe('unmapped');
  });

  it('an examVersionId that does not resolve to a real exam_version: every record is unmapped (still no crash)', () => {
    const state = stateOf(species('sp-a', 'A'));
    const scopeOf = createScopeOf(contextOf(state).indexes, examId(EXAM), examVersionId('missing'));
    expect(scopeOf({ kind: 'species', id: 'spc_sp-a' })).toBe('unmapped');
  });
});
