/**
 * Syllabus projection (step 2.6): docs/GRAPH_SEMANTICS.md §7. ADV-057 (cross-chapter reaction resolves
 * and lists under both topics).
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import type { CanonicalState, RecordRef } from '../../schema';
import { concept, contextOf, reaction, requestOf, sp, species, stateOf } from '@/test-support/graph-state';
import { examId, examVersionId, topic, topicMapping } from '@/test-support/curriculum-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { checkProjection } from '@/test-support/projection-harness';
import { createScopeOf } from '../scope';
import { syllabusProjection } from '.';
import type { Projection, ProjectionRequest } from '..';

const ref = (r: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: r.kind, id: r.id });

function demoState(): CanonicalState {
  const parsed = documentToState(buildDemoDocument());
  if (!parsed.ok) throw new Error('demo dataset has duplicate IDs');
  return parsed.state;
}

function explore(state: CanonicalState, over: Partial<ProjectionRequest> = {}): Projection {
  return syllabusProjection.build(contextOf(state, 1), requestOf('syllabus', over));
}

describe('ADV-057: a cross-chapter reaction resolves and lists under both topics', () => {
  const state = demoState();

  it('the diazonium → phenol reaction appears under diazonium-chemistry', () => {
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_diazonium-chemistry' })] });
    expect(p.nodes.map((n) => n.id)).toContain('rxn_benzenediazonium-to-phenol');
  });

  it('and independently appears under phenols too — never merged, never picked one', () => {
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_phenols' })] });
    expect(p.nodes.map((n) => n.id)).toContain('rxn_benzenediazonium-to-phenol');
  });

  it('focusing on just one topic does not pull in the other (a mapped record is a dead end)', () => {
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_diazonium-chemistry' })] });
    expect(p.nodes.map((n) => n.id)).not.toContain('top_phenols');
  });

  it('passes the projection harness on the demo dataset', () => {
    expect(checkProjection(syllabusProjection, state, requestOf('syllabus', { focus: [ref({ kind: 'topic', id: 'top_diazonium-chemistry' })] }))).toEqual([]);
  });
});

describe('the topic tree', () => {
  it('focusing on a section climbs to its chapter only — a sibling section is neither an ancestor nor a descendant, so it is left out', () => {
    const chapter = topic('chap', 'Chapter');
    const section = topic('sect', 'Section', { kind: 'section', parent: 'chap' });
    const sibling = topic('sibling-sect', 'Sibling section', { kind: 'section', parent: 'chap' });
    const state = stateOf(chapter, section, sibling);
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_sect' })] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['top_chap', 'top_sect']);
    expect(p.edges.some((e) => e.from === 'top_sect' && e.to === 'top_chap')).toBe(true);
  });

  it('focusing on the chapter descends to every section beneath it', () => {
    const chapter = topic('chap', 'Chapter');
    const section = topic('sect', 'Section', { kind: 'section', parent: 'chap' });
    const sibling = topic('sibling-sect', 'Sibling section', { kind: 'section', parent: 'chap' });
    const state = stateOf(chapter, section, sibling);
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_chap' })] });
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['top_chap', 'top_sect', 'top_sibling-sect'].sort());
    expect(p.edges.some((e) => e.from === 'top_sect' && e.to === 'top_chap')).toBe(true);
    expect(p.edges.some((e) => e.from === 'top_sibling-sect' && e.to === 'top_chap')).toBe(true);
  });

  it('a mapped species shows as a member with a membership edge (no reactionId, it is not a reaction)', () => {
    const chapter = topic('chap', 'Chapter');
    const A = species('sp-a', 'A');
    const map = topicMapping('m1', 'chap', { kind: 'species', id: 'spc_sp-a' });
    const state = stateOf(chapter, A, map);
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_chap' })] });
    expect(p.nodes.map((n) => n.id)).toContain('spc_sp-a');
    const edge = p.edges.find((e) => e.from === 'spc_sp-a');
    expect(edge?.reactionId).toBeUndefined();
  });

  it('a mapped reaction shows up too, recoverable from edge.from (no reactionId field — see ADV-057 collision note)', () => {
    const chapter = topic('chap', 'Chapter');
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const map = topicMapping('m1', 'chap', { kind: 'reaction', id: 'rxn_r1' });
    const state = stateOf(chapter, A, B, r1, map);
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_chap' })] });
    const edge = p.edges.find((e) => e.from === 'rxn_r1');
    expect(edge).toMatchObject({ to: 'top_chap' });
    expect(edge?.reactionId).toBeUndefined();
  });

  it('a reaction mapped to two topics gets two independent membership edges, no INV-26 collision', () => {
    const chapA = topic('chap-a', 'A');
    const chapB = topic('chap-b', 'B');
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] });
    const mapA = topicMapping('ma', 'chap-a', { kind: 'reaction', id: 'rxn_r1' });
    const mapB = topicMapping('mb', 'chap-b', { kind: 'reaction', id: 'rxn_r1' });
    const state = stateOf(chapA, chapB, A, B, r1, mapA, mapB);
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_chap-a' }), ref({ kind: 'topic', id: 'top_chap-b' })] });
    const fromR1 = p.edges.filter((e) => e.from === 'rxn_r1');
    expect(fromR1).toHaveLength(2);
    expect(new Set(fromR1.map((e) => e.id)).size).toBe(2);
    expect(checkProjection(syllabusProjection, state, requestOf('syllabus', { focus: [ref({ kind: 'topic', id: 'top_chap-a' }), ref({ kind: 'topic', id: 'top_chap-b' })] }))).toEqual([]);
  });

  it('with no focus, every root topic is a seed (the whole tree)', () => {
    const chapter = topic('chap', 'Chapter');
    const state = stateOf(chapter);
    const p = explore(state, {});
    expect(p.nodes.map((n) => n.id)).toContain('top_chap');
  });

  it('a record mapped to a topic that is itself covered by no other kind (e.g. a concept) still resolves', () => {
    const chapter = topic('chap', 'Chapter');
    const c = concept('c1', 'Concept', 'general');
    const map = topicMapping('m1', 'chap', { kind: 'concept', id: 'cpt_c1' });
    const state = stateOf(chapter, c, map);
    const p = explore(state, { focus: [ref({ kind: 'topic', id: 'top_chap' })] });
    expect(p.nodes.map((n) => n.id)).toContain('cpt_c1');
  });
});

describe('derived scope badges (reuses ctx.scopeOf via the shared flagsOf)', () => {
  it('an out-of-scope record gets the outside_scope flag, resolved by the real createScopeOf', () => {
    const state = demoState();
    const scopeOf = createScopeOf(contextOf(state).indexes, examId('jee-main'), examVersionId('jee-main-2026'));
    const p = syllabusProjection.build(contextOf(state, 1, scopeOf), requestOf('syllabus', { focus: [ref({ kind: 'topic', id: 'top_rearrangements' })] }));
    const beckmann = p.nodes.find((n) => n.id === 'rxn_cyclohexanone-oxime-beckmann');
    expect(beckmann?.flags).toContain('outside_scope');
  });
});
