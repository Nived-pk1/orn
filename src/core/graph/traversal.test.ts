import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAVERSAL_LIMITS, type TraversalLimits } from './contracts';
import { graphEdgeId, type EdgeIdentity } from './ids';
import { traverse, type Step, type TraversalDirection } from './traversal';

interface E {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

/** Adjacency over a plain edge list, indexed once. */
function graph(edges: readonly E[]) {
  const out = new Map<string, Step[]>();
  const into = new Map<string, Step[]>();
  const push = (m: Map<string, Step[]>, k: string, step: Step): void => {
    const list = m.get(k);
    if (list) list.push(step);
    else m.set(k, [step]);
  };
  for (const e of edges) {
    push(out, e.from, { edgeId: e.id, to: e.to });
    push(into, e.to, { edgeId: e.id, to: e.from });
  }
  return (node: string, direction: TraversalDirection): Step[] => (direction === 'out' ? out : into).get(node) ?? [];
}

const limits = (over: Partial<TraversalLimits> = {}): TraversalLimits => ({ ...DEFAULT_TRAVERSAL_LIMITS, ...over });
const chain = (n: number): E[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, from: `n${i}`, to: `n${i + 1}` }));

describe('bounded traversal', () => {
  it('ADV-011: a chain of depth 60 stops at depth 12 with a truncation notice and no recursion', () => {
    const r = traverse({ seeds: ['n0'], direction: 'out', neighbours: graph(chain(60)), limits: limits() });
    expect(r.nodes).toHaveLength(13);
    expect(r.nodes[12]).toMatchObject({ id: 'n12', depth: 12, hidden: { outgoing: 1, incoming: 0 } });
    expect(r.edges).toHaveLength(12);
    expect(r.truncation).toEqual({ reason: 'max_depth', hiddenNodeEstimate: 1 });
  });

  it('INV-22: a 50,000-deep chain is bounded by maxDepth and does not overflow the stack', () => {
    const r = traverse({ seeds: ['n0'], direction: 'out', neighbours: graph(chain(50_000)), limits: limits({ maxDepth: 50_000, maxNodes: 60_000, maxEdges: 60_000 }) });
    expect(r.nodes).toHaveLength(50_001);
    expect(r.truncation).toBeNull();
  });

  it('ADV-050: A → B → C → A terminates, visits each node once, keeps all three edges, no truncation', () => {
    const edges: E[] = [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'bc', from: 'B', to: 'C' },
      { id: 'ca', from: 'C', to: 'A' },
    ];
    const r = traverse({ seeds: ['A'], direction: 'out', neighbours: graph(edges), limits: limits() });
    expect(r.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C']);
    expect(r.edges.map((e) => e.id).sort()).toEqual(['ab', 'bc', 'ca']);
    expect(r.truncation).toBeNull();
  });

  it('ADV-050: a cycle closing at the depth limit still yields the closing edge', () => {
    const edges: E[] = [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'ba', from: 'B', to: 'A' },
    ];
    const r = traverse({ seeds: ['A'], direction: 'out', neighbours: graph(edges), limits: limits({ maxDepth: 1 }) });
    expect(r.edges.map((e) => e.id)).toEqual(['ab', 'ba']);
    expect(r.truncation).toBeNull();
  });

  it('keeps parallel edges and self-loops (INV-26) without revisiting', () => {
    const edges: E[] = [
      { id: 'r1', from: 'A', to: 'B' },
      { id: 'r2', from: 'A', to: 'B' },
      { id: 'loop', from: 'B', to: 'B' },
    ];
    const r = traverse({ seeds: ['A'], direction: 'out', neighbours: graph(edges), limits: limits() });
    expect(r.nodes).toHaveLength(2);
    expect(r.edges.map((e) => e.id)).toEqual(['r1', 'r2', 'loop']);
  });

  it('expands both directions once each and reports an edge only once', () => {
    const edges: E[] = [
      { id: 'ab', from: 'A', to: 'B' },
      { id: 'ca', from: 'C', to: 'A' },
    ];
    const r = traverse({ seeds: ['A'], direction: 'both', neighbours: graph(edges), limits: limits() });
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C']);
    expect(r.edges).toHaveLength(2);
    expect(r.edges.find((e) => e.id === 'ca')).toMatchObject({ from: 'C', to: 'A', direction: 'in' });
  });

  it('maxNodes: stops admitting, reports hidden neighbours per node and a truncation', () => {
    const edges: E[] = ['B', 'C', 'D', 'E'].map((t) => ({ id: `e${t}`, from: 'A', to: t }));
    const r = traverse({ seeds: ['A'], direction: 'out', neighbours: graph(edges), limits: limits({ maxNodes: 3 }) });
    expect(r.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C']);
    expect(r.nodes[0]?.hidden).toEqual({ outgoing: 2, incoming: 0 });
    expect(r.truncation).toEqual({ reason: 'max_nodes', hiddenNodeEstimate: 2 });
  });

  it('maxEdges: caps edges and reports max_edges', () => {
    const edges: E[] = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, from: 'A', to: 'B' }));
    const r = traverse({ seeds: ['A'], direction: 'out', neighbours: graph(edges), limits: limits({ maxEdges: 4 }) });
    expect(r.edges).toHaveLength(4);
    expect(r.truncation?.reason).toBe('max_edges');
  });

  it('time budget uses the injected clock', () => {
    let t = 0;
    const r = traverse({
      seeds: ['n0'],
      direction: 'out',
      neighbours: graph(chain(100)),
      limits: limits({ timeBudgetMs: 5 }),
      now: () => (t += 2),
    });
    expect(r.truncation?.reason).toBe('time_budget');
    expect(r.nodes.length).toBeLessThan(101);
    expect(r.nodes.length).toBeGreaterThan(1);
  });

  it('honours an AbortSignal', () => {
    const controller = new AbortController();
    controller.abort();
    const r = traverse({ seeds: ['n0'], direction: 'out', neighbours: graph(chain(5)), limits: limits({ signal: controller.signal }) });
    expect(r.truncation?.reason).toBe('aborted');
    expect(r.edges).toHaveLength(0);
  });

  it('is deterministic regardless of the order edges are listed', () => {
    const edges: E[] = [
      { id: 'x', from: 'A', to: 'C' },
      { id: 'y', from: 'A', to: 'B' },
      { id: 'z', from: 'B', to: 'C' },
    ];
    const run = (list: E[]) => JSON.stringify(traverse({ seeds: ['A'], direction: 'out', neighbours: graph(list), limits: limits() }));
    expect(run(edges)).toBe(run([...edges].reverse()));
  });

  it('dedupes repeated seeds and handles none', () => {
    expect(traverse({ seeds: ['A', 'A'], direction: 'out', neighbours: () => [], limits: limits() }).nodes).toHaveLength(1);
    expect(traverse({ seeds: [], direction: 'out', neighbours: () => [], limits: limits() })).toEqual({ nodes: [], edges: [], truncation: null });
  });

  it('INV-22: random cyclic graphs terminate within every limit, and an untruncated result is closed under reachability', () => {
    const arb = fc.record({
      edges: fc.array(fc.tuple(fc.nat(9), fc.nat(9)), { maxLength: 60 }),
      maxDepth: fc.integer({ min: 0, max: 6 }),
      maxNodes: fc.integer({ min: 1, max: 12 }),
      maxEdges: fc.integer({ min: 0, max: 30 }),
    });
    fc.assert(
      fc.property(arb, ({ edges, maxDepth, maxNodes, maxEdges }) => {
        const list = edges.map(([f, t], i): E => ({ id: `e${i}`, from: `n${f}`, to: `n${t}` }));
        const r = traverse({ seeds: ['n0'], direction: 'both', neighbours: graph(list), limits: limits({ maxDepth, maxNodes, maxEdges }) });
        expect(r.nodes.length).toBeLessThanOrEqual(maxNodes);
        expect(r.edges.length).toBeLessThanOrEqual(maxEdges);
        expect(new Set(r.nodes.map((n) => n.id)).size).toBe(r.nodes.length);
        expect(new Set(r.edges.map((e) => e.id)).size).toBe(r.edges.length);
        for (const n of r.nodes) expect(n.depth).toBeLessThanOrEqual(maxDepth);
        const ids = new Set(r.nodes.map((n) => n.id));
        for (const e of r.edges) expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
        if (r.truncation === null) {
          const touching = list.filter((e) => ids.has(e.from) || ids.has(e.to));
          expect(r.edges).toHaveLength(touching.length);
        }
      }),
      { seed: 22, numRuns: 200 },
    );
  });
});

describe('graph edge IDs', () => {
  const base = { view: 'reaction_explorer', from: 'spc_a', to: 'rxn_1', semantic: 'consumes', participantId: 'prt_1' };
  /** Branded IDs are plain strings at runtime; the cast keeps fixtures readable. */
  const id = (over: Record<string, unknown> = {}): string => graphEdgeId({ ...base, ...over } as unknown as EdgeIdentity);

  it('are deterministic', () => {
    expect(id()).toBe(id({}));
    expect(id()).toMatch(/^edg_[0-9a-f]{16}$/);
  });

  it('INV-26: differ per participant, outcome, product, view and relationship even with the same endpoints', () => {
    const none = { participantId: undefined };
    const ids = [
      id(),
      id({ participantId: 'prt_2' }),
      id({ view: 'navigator' }),
      id({ semantic: 'produces' }),
      id({ ...none, outcomeId: 'out_1', productId: 'prd_1' }),
      id({ ...none, outcomeId: 'out_1', productId: 'prd_2' }),
      id({ ...none, relationshipId: 'rel_1' }),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
