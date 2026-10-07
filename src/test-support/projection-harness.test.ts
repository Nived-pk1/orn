/** The harness must catch what it claims to catch: each rule is exercised by a deliberately broken projection. */
import { describe, expect, it } from 'vitest';
import { graphEdgeId, type GraphEdge, type Projection, type ProjectionContext, type ProjectionDefinition } from '@/core/graph';
import { anchorOn, chemClass, cl, contextOf, reaction, requestOf, sp, species, stateOf } from './graph-state';
import { checkDeterminism, checkInv26, checkProjection, checkStructure } from './projection-harness';

const state = stateOf(
  chemClass('hub-a', 'A', 'compound_class'),
  anchorOn({ kind: 'class', id: cl('hub-a').id }, 'hub-a'),
  species('sp-a', 'A'),
  species('sp-b', 'B'),
  reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }, { ref: sp('sp-b') }] }] }),
);
const request = requestOf('navigator');

type Branded = { readonly [K in 'reactionId' | 'outcomeId' | 'productId' | 'participantId']?: string };

/** An edge for reaction r1 with a valid ID; IDs are plain strings here and branded once. */
const edge = (over: Branded & { from?: string; to?: string }): GraphEdge => {
  const parts = { from: 'cls_hub-a', to: 'cls_hub-a', reactionId: 'rxn_r1', outcomeId: 'out_r1-1', participantId: 'prt_r1-1', ...over } as never as Pick<GraphEdge, 'from' | 'to' | 'reactionId' | 'outcomeId' | 'productId' | 'participantId'>;
  return { ...parts, semantic: 'transforms_to', conditionVariantIds: [], inferred: false, layoutDirection: 'forward', id: graphEdgeId({ ...parts, semantic: 'transforms_to', view: 'navigator' }) };
};

function broken(mutate: (p: Projection, ctx: ProjectionContext) => Projection): ProjectionDefinition {
  return {
    view: 'navigator',
    description: 'broken',
    build(ctx, req) {
      const p: Projection = { view: 'navigator', revision: ctx.indexes.revision, key: 'prj_k', nodes: [{ id: 'cls_hub-a', kind: 'class', role: 'anchor', depth: 0, hidden: { outgoing: 0, incoming: 0 }, flags: [] }], edges: [], bundles: [], unanchoredReactionIds: [], truncation: null };
      void req;
      return mutate(p, ctx);
    },
  };
}

const rules = (vs: readonly { rule: string }[]): string[] => [...new Set(vs.map((v) => v.rule))].sort();
const run = (def: ProjectionDefinition) => checkProjection(def, state, request);

describe('projection harness', () => {
  it('passes a correct projection', () => {
    const good = broken((p) => ({ ...p, edges: [edge({ productId: 'pdt_r1-1-1' }), edge({ productId: 'pdt_r1-1-2' })].sort((a, b) => (a.id < b.id ? -1 : 1)) }));
    expect(run(good)).toEqual([]);
  });

  it('INV-26: flags two edges standing for one production (merged/duplicated by endpoints)', () => {
    const twice = broken((p) => ({ ...p, edges: [edge({ productId: 'pdt_r1-1-1' }), edge({ productId: 'pdt_r1-1-1', to: 'cls_other' })] }));
    expect(checkInv26(twice.build(contextOf(state), request), state).map((v) => v.detail).join()).toMatch(/both stand for/);
  });

  it('INV-26: flags an edge that stands for no real participation or production', () => {
    const ghost = broken((p) => ({ ...p, edges: [edge({ productId: 'pdt_r1-9-9' })] }));
    expect(checkInv26(ghost.build(contextOf(state), request), state).map((v) => v.detail).join()).toMatch(/not a product/);
    const wrongParticipant = broken((p) => ({ ...p, edges: [edge({ productId: 'pdt_r1-1-1', participantId: 'prt_r1-7' })] }));
    expect(checkInv26(wrongParticipant.build(contextOf(state), request), state).map((v) => v.detail).join()).toMatch(/not a participant/);
  });

  it('INV-26: flags an edge ID that is not the hash of its identity', () => {
    const forged = broken((p) => ({ ...p, edges: [{ ...edge({ productId: 'pdt_r1-1-1' }), id: 'edg_forged' }] }));
    expect(checkInv26(forged.build(contextOf(state), request), state).map((v) => v.detail).join()).toMatch(/not the hash/);
  });

  it('structure: unsorted nodes/edges, dangling endpoints, unknown bundle edges, limits, unanchored', () => {
    const many = requestOf('navigator', { limits: { ...request.limits, maxNodes: 1, maxEdges: 1 } });
    const p: Projection = {
      view: 'navigator', revision: 9, key: 'nope',
      nodes: [{ id: 'b', kind: 'virtual', role: 'anchor', depth: 0, hidden: { outgoing: 0, incoming: 0 }, flags: [] }, { id: 'a', kind: 'virtual', role: 'anchor', depth: 0, hidden: { outgoing: 0, incoming: 0 }, flags: [] }],
      edges: [edge({ productId: 'pdt_r1-1-2' }), edge({ productId: 'pdt_r1-1-1', to: 'gone' })].sort((x, y) => (x.id < y.id ? 1 : -1)),
      bundles: [{ id: 'bnd', from: 'a', to: 'b', edgeIds: ['missing'], total: 1 }],
      unanchoredReactionIds: ['rxn_r1', 'rxn_nope'] as never,
      truncation: null,
    };
    expect(rules(checkStructure(p, many, state, 1))).toEqual(['INV-22-edges', 'INV-22-nodes', 'bundle-edges', 'edge-endpoints', 'edges-sorted', 'key', 'nodes-sorted', 'revision', 'unanchored-real', 'unanchored-sorted'].sort());
  });

  it('P-10: flags output that changes between builds, and output that depends on record insertion order', () => {
    let calls = 0;
    const flaky = broken((p) => ({ ...p, key: `prj_${(calls += 1)}` }));
    expect(rules(checkDeterminism(flaky, state, request))).toEqual(['P-10']);
    const orderDependent: ProjectionDefinition = {
      view: 'navigator',
      description: 'order',
      build: (ctx) => ({ view: 'navigator', revision: 1, key: 'prj_o', nodes: [], edges: [], bundles: [], unanchoredReactionIds: Object.keys(ctx.state.records.species) as never, truncation: null }),
    };
    const detail = checkDeterminism(orderDependent, state, request).map((v) => v.detail);
    expect(detail).toEqual(['building from reordered records and fresh indexes differs']);
  });
});
