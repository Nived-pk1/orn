/** `bundleEdges` (docs/GRAPH_SEMANTICS.md §11, ADV-002): parallel edges bundle by (from, to); never merged. */
import { describe, expect, it } from 'vitest';
import type { GraphEdge } from './contracts';
import { bundleEdges } from './kit';

const edge = (over: Partial<GraphEdge> & Pick<GraphEdge, 'id' | 'from' | 'to'>): GraphEdge => ({
  semantic: 'consumes',
  conditionVariantIds: [],
  inferred: false,
  layoutDirection: 'forward',
  ...over,
});

describe('bundleEdges', () => {
  it('a single edge between a pair gets no bundle', () => {
    expect(bundleEdges([edge({ id: 'edg_1', from: 'a', to: 'b' })])).toEqual([]);
  });

  it('two parallel edges bundle into one, sorted edge IDs, edges themselves untouched', () => {
    const e1 = edge({ id: 'edg_2', from: 'a', to: 'b' });
    const e2 = edge({ id: 'edg_1', from: 'a', to: 'b' });
    const bundles = bundleEdges([e1, e2]);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatchObject({ from: 'a', to: 'b', edgeIds: ['edg_1', 'edg_2'] });
    expect(bundles[0]?.id.startsWith('bnd_')).toBe(true);
  });

  it('edges in the opposite direction (b→a) never bundle with a→b', () => {
    const bundles = bundleEdges([edge({ id: 'edg_1', from: 'a', to: 'b' }), edge({ id: 'edg_2', from: 'b', to: 'a' })]);
    expect(bundles).toEqual([]);
  });

  it('is deterministic regardless of input order (P-10)', () => {
    const edges = [edge({ id: 'edg_3', from: 'a', to: 'b' }), edge({ id: 'edg_1', from: 'a', to: 'b' }), edge({ id: 'edg_2', from: 'a', to: 'b' })];
    const forward = bundleEdges(edges);
    const reversed = bundleEdges([...edges].reverse());
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
    expect(forward[0]?.edgeIds).toEqual(['edg_1', 'edg_2', 'edg_3']);
  });

  it('groups several independent pairs each into their own bundle, sorted by bundle ID', () => {
    const bundles = bundleEdges([
      edge({ id: 'edg_1', from: 'a', to: 'b' }),
      edge({ id: 'edg_2', from: 'a', to: 'b' }),
      edge({ id: 'edg_3', from: 'c', to: 'd' }),
      edge({ id: 'edg_4', from: 'c', to: 'd' }),
    ]);
    expect(bundles).toHaveLength(2);
    expect(new Set(bundles.map((b) => b.id)).size).toBe(2);
    expect([...bundles.map((b) => b.id)]).toEqual([...bundles.map((b) => b.id)].sort());
  });
});
