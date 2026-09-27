/**
 * Mechanisms projection (step 2.6): docs/GRAPH_SEMANTICS.md §7. ADV-055 (outcomes link to different
 * variants and resolve) and "demo mechanisms shown as review-required".
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import type { Mechanism, Reaction, RecordRef } from '../../schema';
import { ident, meta } from '@/test-support/demo/kit';
import { contextOf, reaction, requestOf, sp, species, stateOf } from '@/test-support/graph-state';
import { buildDemoDocument } from '@/test-support/demo';
import { checkProjection } from '@/test-support/projection-harness';
import { mechanismsProjection } from '.';
import type { Projection, ProjectionRequest } from '..';

const ref = (r: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: r.kind, id: r.id });

function explore(state: ReturnType<typeof demoState>, over: Partial<ProjectionRequest> = {}): Projection {
  return mechanismsProjection.build(contextOf(state, 1), requestOf('mechanisms', over));
}

function demoState() {
  const parsed = documentToState(buildDemoDocument());
  if (!parsed.ok) throw new Error('demo dataset has duplicate IDs');
  return parsed.state;
}

describe('ADV-055 / demo mechanisms shown as review-required', () => {
  const state = demoState();

  it('the aldol mechanism is a review-required node', () => {
    const p = explore(state, { focus: [ref({ kind: 'mechanism', id: 'mec_aldol-ethanal' })] });
    const mechanismNode = p.nodes.find((n) => n.id === 'mec_aldol-ethanal');
    expect(mechanismNode?.flags).toContain('review_required');
  });

  it('the demo aldol reaction gives one edge per link: reaction-level plus one per outcome, resolving to different variants', () => {
    const p = explore(state, { focus: [ref({ kind: 'mechanism', id: 'mec_aldol-ethanal' })] });
    const edges = p.edges.filter((e) => e.from === 'rxn_ethanal-aldol');
    expect(edges).toHaveLength(3);
    expect(edges.filter((e) => e.outcomeId === undefined)).toHaveLength(1);
    const outcomeEdges = edges.filter((e) => e.outcomeId !== undefined);
    expect(outcomeEdges).toHaveLength(2);
    const reactionRecord = contextOf(state).indexes.get('rxn_ethanal-aldol') as Reaction;
    const variants = outcomeEdges.map((e) => reactionRecord.outcomes.find((o) => o.id === e.outcomeId)?.mechanism?.variantId);
    expect(new Set(variants).size).toBe(2);
    expect(variants.every((v) => v !== undefined)).toBe(true);
  });

  it('the three links to the same reaction/mechanism pair bundle together', () => {
    const p = explore(state, { focus: [ref({ kind: 'mechanism', id: 'mec_aldol-ethanal' })] });
    const bundle = p.bundles.find((b) => b.from === 'rxn_ethanal-aldol' && b.to === 'mec_aldol-ethanal');
    expect(bundle?.edgeIds).toHaveLength(3);
  });

  it('passes the projection harness on the demo dataset', () => {
    expect(checkProjection(mechanismsProjection, state, requestOf('mechanisms', { focus: [ref({ kind: 'mechanism', id: 'mec_aldol-ethanal' })] }))).toEqual([]);
  });
});

describe('basics with a minimal fixture', () => {
  it('a reaction is a dead end: its own participants/products never appear', () => {
    const mechanism: Mechanism = { id: ident<Mechanism['id']>('mec', 'sn2'), kind: 'mechanism', name: 'SN2', aliases: [], mechanismClasses: [], variants: [], conceptIds: [], ...meta() };
    const A = species('sp-a', 'A');
    const B = species('sp-b', 'B');
    const r1 = reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }], mechanism: { id: 'sn2' } }] });
    const state = stateOf(mechanism, A, B, r1);
    const p = mechanismsProjection.build(contextOf(state, 1), requestOf('mechanisms', { focus: [ref({ kind: 'mechanism', id: 'mec_sn2' })] }));
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['mec_sn2', 'rxn_r1']);
    expect(p.nodes.map((n) => n.id)).not.toContain('spc_sp-a');
    expect(p.edges[0]).toMatchObject({ from: 'rxn_r1', to: 'mec_sn2', outcomeId: 'out_r1-1' });
  });

  it('a reaction seed (not a mechanism) is dropped, not a phantom node', () => {
    const state = stateOf();
    const p = mechanismsProjection.build(contextOf(state, 1), requestOf('mechanisms', { focus: [{ kind: 'reaction', id: 'rxn_missing' }] }));
    expect(p.nodes).toEqual([]);
  });
});
