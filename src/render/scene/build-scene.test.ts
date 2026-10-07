/**
 * buildScene (step 5.3) on hand-made projections: the GRAPH_SEMANTICS §4 styling table, bundles (ADV-002, ADV-007), the self-loop
 * glyph (ADV-005), arrow text (ADV-027 scene part), badges, emphasis, aria labels, hostile names (ADV-033 scene part), stale layouts.
 */
import { describe, expect, it } from 'vitest';
import type { GraphEdge } from '@/core/graph/contracts';
import type { LayoutResult } from '@/layout/contracts';
import { bundle, edge, fakeMeasurer, node, nobodyPorts, pipe, projectionOf } from '@/test-support/scene-kit';
import { buildScene, midpoint, nodeSizes, type Scene, type ScenePorts } from '.';

const names: Readonly<Record<string, { name: string; formula?: string }>> = {
  cls_a: { name: 'Alkenes', formula: 'CnH2n' },
  cls_b: { name: 'Alcohols', formula: 'R–OH' },
  cls_c: { name: 'Haloalkanes' },
};
const ports: ScenePorts = { ...nobodyPorts, describe: (ref) => names[ref.id] };
const hubs = [node('cls_a'), node('cls_b'), node('cls_c')];
const edgeOf = (scene: Scene, id: string) => scene.edges.find((e) => e.id === id);

describe('edge styling (GRAPH_SEMANTICS §4)', () => {
  const selectivities = ['exclusive', 'major', 'minor', 'trace', 'mixture_component', 'unspecified'] as const;
  const expected = {
    exclusive: ['solid', 'heavy'],
    major: ['solid', 'heavy'],
    minor: ['dashed', 'normal'],
    trace: ['dotted', 'light'],
    mixture_component: ['solid', 'normal'],
    unspecified: ['solid', 'normal'],
  } as const;

  it.each(selectivities)('a stated %s edge', (selectivity) => {
    const { scene } = pipe(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b', { selectivity })] }), ports);
    const drawn = edgeOf(scene, 'e1');
    expect([drawn?.stroke, drawn?.weight]).toEqual(expected[selectivity]);
    expect(drawn?.arrowHead).toBe('filled');
    expect(drawn?.semantic).toBe('transforms_to');
  });

  it.each(selectivities)('an inferred %s edge is dotted and keeps the weight of its selectivity', (selectivity) => {
    const { scene } = pipe(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b', { selectivity, inferred: true })] }), ports);
    expect([edgeOf(scene, 'e1')?.stroke, edgeOf(scene, 'e1')?.weight]).toEqual(['dotted', expected[selectivity][1]]);
  });

  it('an edge without a selectivity is drawn as unspecified', () => {
    const { selectivity: _drop, ...bare } = edge('e1', 'cls_a', 'cls_b');
    const { scene } = pipe(projectionOf({ nodes: hubs, edges: [bare as GraphEdge] }), ports);
    expect([edgeOf(scene, 'e1')?.stroke, edgeOf(scene, 'e1')?.weight]).toEqual(['solid', 'normal']);
  });

  it('relationship and mechanism edges have an open arrowhead', () => {
    const { scene } = pipe(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b', { semantic: 'relationship' }), edge('e2', 'cls_b', 'cls_c', { semantic: 'uses_mechanism' })] }), ports);
    expect([edgeOf(scene, 'e1')?.arrowHead, edgeOf(scene, 'e2')?.arrowHead]).toEqual(['open', 'open']);
  });
});

describe('bundles (ADV-002, ADV-007)', () => {
  const two = (a: Partial<GraphEdge>, b: Partial<GraphEdge>, total = 2) =>
    pipe(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b', a), edge('e2', 'cls_a', 'cls_b', b)], bundles: [bundle('bnd_ab', 'cls_a', 'cls_b', ['e1', 'e2'], total)] }), ports).scene;

  it('two reactions between the same hubs are one scene edge with the count, the edges never merged', () => {
    const scene = two({}, { selectivity: 'minor' });
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]).toMatchObject({ id: 'bnd_ab', from: 'cls_a', to: 'cls_b', bundleSize: 2 });
    expect(scene.edges[0]?.above).toBeUndefined();
    expect(scene.edges[0]?.below).toBeUndefined();
  });

  it('bundleSize is the TOTAL, not the number of edges drawn', () => {
    const scene = two({}, {}, 752);
    expect(scene.edges[0]?.bundleSize).toBe(752);
    expect(scene.edges[0]?.ariaLabel).toContain('752 reactions, 2 drawn');
  });

  it('is dotted only when every drawn edge is inferred', () => {
    expect(two({ inferred: true }, { inferred: true }).edges[0]?.stroke).toBe('dotted');
    expect(two({ inferred: true }, { inferred: false }).edges[0]?.stroke).toBe('solid');
    expect(two({ inferred: false }, { inferred: false }).edges[0]?.stroke).toBe('solid');
  });

  it('takes the weight of its best-ranked edge: a major beats a minor, a minor beats a trace', () => {
    expect(two({ selectivity: 'minor', inferred: true }, { selectivity: 'major', inferred: true }).edges[0]?.weight).toBe('heavy');
    expect(two({ selectivity: 'trace', inferred: true }, { selectivity: 'minor', inferred: true }).edges[0]?.weight).toBe('normal');
    expect(two({ selectivity: 'trace', inferred: true }, { selectivity: 'trace', inferred: true }).edges[0]?.weight).toBe('light');
  });

  it('a major and a minor between the same hubs are told apart (ADV-007: distinct styles per outcome)', () => {
    const { scene } = pipe(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b'), edge('e2', 'cls_a', 'cls_c', { selectivity: 'minor' })] }), ports);
    expect([edgeOf(scene, 'e1')?.stroke, edgeOf(scene, 'e1')?.weight]).not.toEqual([edgeOf(scene, 'e2')?.stroke, edgeOf(scene, 'e2')?.weight]);
  });
});

describe('self-loops (ADV-005, decision Q4)', () => {
  const projection = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_a'), edge('e2', 'cls_a', 'cls_a', { selectivity: 'minor' }), edge('e3', 'cls_a', 'cls_b')], bundles: [bundle('bnd_aa', 'cls_a', 'cls_a', ['e1', 'e2'], 9)] });
  const { scene, request, layout } = pipe(projection, ports);

  it('are drawn by the builder beside their node, with their count, and are not in the layout', () => {
    expect(request.edges.map((e) => e.id)).toEqual(['e3']);
    expect(Object.keys(layout.edgeRoutes)).toEqual(['e3']);
    const loop = edgeOf(scene, 'bnd_aa');
    const owner = scene.nodes.find((n) => n.id === 'cls_a');
    expect(loop).toMatchObject({ from: 'cls_a', to: 'cls_a', bundleSize: 9 });
    expect(loop?.points.length).toBeGreaterThanOrEqual(3);
    for (const p of loop?.points ?? []) {
      expect(p.x).toBeGreaterThanOrEqual((owner?.x ?? 0) + (owner?.width ?? 0));
      expect(p.y).toBeGreaterThanOrEqual(owner?.y ?? 0);
      expect(p.y).toBeLessThanOrEqual((owner?.y ?? 0) + (owner?.height ?? 0));
    }
    expect(loop?.arrowHead).toBe('filled');
  });

  it('grow the bounds so the loop is inside the scene', () => {
    const loop = edgeOf(scene, 'bnd_aa');
    expect(scene.bounds.width).toBeGreaterThanOrEqual(Math.max(...(loop?.points ?? []).map((p) => p.x)));
  });

  it('a single loop edge is a scene edge with from === to and no bundle size', () => {
    const single = pipe(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_b', 'cls_b')] }), ports).scene;
    expect(single.edges).toHaveLength(1);
    expect(single.edges[0]).toMatchObject({ from: 'cls_b', to: 'cls_b' });
    expect(single.edges[0]?.bundleSize).toBeUndefined();
    expect(single.edges[0]?.ariaLabel).toBe('Alcohols back to itself, 1 reaction');
  });

  it('say so in the aria label of the node', () => {
    expect(scene.nodes.find((n) => n.id === 'cls_a')?.ariaLabel).toContain('9 reactions from and back to itself');
  });
});

describe('arrow text (ADV-027 scene part)', () => {
  it('a single edge carries the text above and below as runs; a bundle carries only its count', () => {
    const withText: ScenePorts = { ...ports, arrowTextOf: (e) => (e.id === 'e1' ? { above: 'PCC, **dry**', below: 'water, CH2Cl2' } : undefined) };
    const { scene } = pipe(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b'), edge('e2', 'cls_b', 'cls_c'), edge('e3', 'cls_b', 'cls_c')], bundles: [bundle('bnd_bc', 'cls_b', 'cls_c', ['e2', 'e3'])] }), withText);
    expect(edgeOf(scene, 'e1')?.above).toEqual([{ text: 'PCC, ' }, { text: 'dry', emphasis: 'strong' }]);
    expect(edgeOf(scene, 'e1')?.below).toEqual([{ text: 'water, CH2Cl2' }]);
    expect(edgeOf(scene, 'bnd_bc')?.above).toBeUndefined();
    expect(scene.nodes.map((n) => n.id)).toEqual(['cls_a', 'cls_b', 'cls_c']);
  });

  it('hostile arrow text stays text', () => {
    const hostile = '<script>alert(1)</script>';
    const withText: ScenePorts = { ...ports, arrowTextOf: () => ({ above: hostile }) };
    const { scene } = pipe(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b')] }), withText);
    expect(scene.edges[0]?.above?.map((r) => r.text).join('')).toBe(hostile);
  });
});

describe('nodes', () => {
  const projection = projectionOf({
    nodes: [
      node('cls_a', { flags: ['has_caveat', 'review_required', 'outside_scope', 'no_structure'], hidden: { outgoing: 2, incoming: 1 } }),
      node('spc_m', { kind: 'species', record: { kind: 'species', id: 'spc_m' }, role: 'member', depth: 1 }),
      node('spc_f', { kind: 'species', record: { kind: 'species', id: 'spc_f' }, role: 'focus', depth: 0 }),
      node('virtual:overflow:cls_a', { kind: 'virtual', record: undefined, role: 'overflow', hidden: { outgoing: 7, incoming: 2 }, hiddenMembers: 5 }),
      node('virtual:unclassified', { kind: 'virtual', record: undefined, role: 'unclassified' }),
    ],
    edges: [edge('e1', 'cls_a', 'virtual:unclassified'), edge('e2', 'cls_a', 'spc_m', { semantic: 'membership', selectivity: undefined, inferred: true }), edge('e3', 'cls_a', 'virtual:overflow:cls_a', { semantic: 'overflow', selectivity: undefined })],
  });
  const withKeys: ScenePorts = { ...ports, describe: (ref) => (ref.id === 'spc_m' ? { name: 'Ethanol', formula: 'C2H6O' } : names[ref.id]), depictionKeyOf: (ref) => `key:${ref.id}` };
  const { scene } = pipe(projection, withKeys);
  const at = (id: string) => scene.nodes.find((n) => n.id === id);

  it('has a glyph, a box, a label and a sublabel per node kind', () => {
    expect(at('cls_a')).toMatchObject({ glyph: 'class_hub', label: [{ text: 'Alkenes' }], emphasis: 'anchor', minLod: 0 });
    expect(at('cls_a')?.sublabel?.map((r) => r.text).join('')).toBe('CnH2n');
    expect(at('spc_m')).toMatchObject({ glyph: 'species', emphasis: 'normal', minLod: 1, depictionKey: 'key:spc_m' });
    expect(at('spc_m')?.sublabel).toEqual([{ text: 'C' }, { text: '2', script: 'sub' }, { text: 'H' }, { text: '6', script: 'sub' }, { text: 'O' }]);
    expect(at('spc_f')).toMatchObject({ glyph: 'species', emphasis: 'target' });
    expect(at('virtual:unclassified')).toMatchObject({ glyph: 'unclassified', label: [{ text: 'Unclassified' }], minLod: 0 });
    expect(at('virtual:overflow:cls_a')).toMatchObject({ glyph: 'overflow', label: [{ text: '+5 more' }], sublabel: [{ text: '9 arrows' }], minLod: 1 });
    expect(at('cls_a')?.depictionKey).toBeUndefined();
  });

  it('badges come from the flags and the hidden neighbours; dimmed comes from outside_scope; onPath is off', () => {
    expect(at('cls_a')?.badges).toEqual([{ kind: 'caveat' }, { kind: 'review' }, { kind: 'outside_scope' }, { kind: 'hidden_neighbours', count: 3 }]);
    expect(at('cls_a')?.state).toEqual({ dimmed: true, onPath: false });
    expect(at('spc_m')?.state).toEqual({ dimmed: false, onPath: false });
    expect(at('spc_m')).not.toHaveProperty('state.selected');
    expect(at('spc_m')).not.toHaveProperty('state.focused');
  });

  it('structural edges have their own light style and appear from the label level on', () => {
    expect(edgeOf(scene, 'e2')).toMatchObject({ semantic: 'membership', stroke: 'solid', weight: 'light', arrowHead: 'none', minLod: 1 });
    expect(edgeOf(scene, 'e3')).toMatchObject({ semantic: 'overflow', stroke: 'dashed', weight: 'light', arrowHead: 'none', minLod: 1 });
    expect(edgeOf(scene, 'e1')?.minLod).toBe(0);
  });

  it('every node and every edge has an aria label that says counts in words', () => {
    expect(at('cls_a')?.ariaLabel).toBe('Alkenes, class hub, 1 reaction out, 3 hidden neighbours, has a caveat, review required, outside the exam scope, no structure');
    expect(at('spc_m')?.ariaLabel).toBe('Ethanol, species, member of a hub');
    expect(at('virtual:overflow:cls_a')?.ariaLabel).toBe('+5 more, hidden members, 9 arrows');
    expect(at('virtual:unclassified')?.ariaLabel).toContain('Unclassified');
    expect(edgeOf(scene, 'e1')?.ariaLabel).toBe('Alkenes to Unclassified, 1 reaction');
    expect(edgeOf(scene, 'e2')?.ariaLabel).toBe('Ethanol is a member of Alkenes');
    expect([...scene.nodes, ...scene.edges].every((x) => x.ariaLabel.length > 0)).toBe(true);
  });
});

describe('a hostile name stays text, character for character (ADV-033 scene part)', () => {
  const hostile = '<img src=x onerror=alert(1)> **b** [[spc_x]] javascript:alert(1) &amp; ‮\u0000';
  const { scene } = pipe(projectionOf({ nodes: [node('cls_a')], edges: [edge('e1', 'cls_a', 'cls_a')] }), { ...ports, describe: () => ({ name: hostile, formula: hostile }) });

  it('is one text run in the label, and in the aria label', () => {
    expect(scene.nodes[0]?.label).toEqual([{ text: hostile }]);
    expect(scene.nodes[0]?.sublabel?.map((r) => r.text).join('')).toBe(hostile);
    expect(scene.nodes[0]?.ariaLabel.startsWith(`${hostile}, class hub`)).toBe(true);
    expect(scene.edges[0]?.ariaLabel).toBe(`${hostile} back to itself, 1 reaction`);
  });
});

describe('the Scene header', () => {
  const projection = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b')], truncation: { reason: 'max_edges', hiddenNodeEstimate: 3, hiddenPairs: 2, hiddenEdges: 5 } });
  const { scene, layout } = pipe(projection, ports);

  it('copies the truncation and the keys, and holds the layout bounds', () => {
    expect(scene.truncation).toEqual({ reason: 'max_edges', hiddenNodeEstimate: 3, hiddenPairs: 2, hiddenEdges: 5 });
    expect(scene.revision).toBe(7);
    expect(scene.projectionKey).toBe('key');
    expect(scene.layoutKey).toBe(layout.cacheKey);
    expect(scene.bounds.width).toBeGreaterThanOrEqual(layout.bounds.width);
    expect(pipe(projectionOf({ nodes: hubs }), ports).scene.truncation).toBeNull();
  });

  it('puts the label at the middle of the route', () => {
    const drawn = scene.edges[0];
    const middle = midpoint(drawn?.points ?? []);
    expect(drawn?.labelAt).toEqual(middle);
    expect(midpoint([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toEqual({ x: 10, y: 0 });
    expect(midpoint([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4 });
    expect(midpoint([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual({ x: 1, y: 1 });
  });

  it('does not copy the layout notes, the engine or the fallback reason', () => {
    const keys = Object.keys(scene);
    for (const forbidden of ['notes', 'engine', 'fallbackReason', 'durationMs', 'unanchoredReactionIds']) expect(keys).not.toContain(forbidden);
  });
});

describe('a layout that does not answer the projection is refused as a value', () => {
  const projection = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b')] });
  const piped = pipe(projection, ports);

  it('missing positions and missing routes', () => {
    const { cls_b: _gone, ...positions } = piped.layout.positions;
    const noPosition: LayoutResult = { ...piped.layout, positions };
    expect(buildScene(projection, noPosition, { sizes: piped.sizes }, ports)).toMatchObject({ ok: false, code: 'LAYOUT_MISMATCH', missing: ['cls_b'] });
    const noRoute: LayoutResult = { ...piped.layout, edgeRoutes: {} };
    expect(buildScene(projection, noRoute, { sizes: piped.sizes }, ports)).toMatchObject({ ok: false, code: 'LAYOUT_MISMATCH', missing: ['e1'] });
    const emptyRoute: LayoutResult = { ...piped.layout, edgeRoutes: { e1: [] } };
    expect(buildScene(projection, emptyRoute, { sizes: piped.sizes }, ports)).toMatchObject({ ok: false, code: 'LAYOUT_MISMATCH' });
  });

  it('a missing size', () => {
    const sizes = nodeSizes(projectionOf({ nodes: [node('cls_a')] }), ports, fakeMeasurer);
    expect(buildScene(projection, piped.layout, { sizes }, ports)).toMatchObject({ ok: false, code: 'MISSING_SIZE', missing: ['cls_b', 'cls_c'] });
  });
});

describe('determinism', () => {
  it('the same inputs give the same Scene', () => {
    const projection = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b'), edge('e2', 'cls_c', 'cls_c')] });
    expect(pipe(projection, ports).scene).toEqual(pipe(projection, ports).scene);
  });

  it('keeps the projection order of nodes and sorts edges by id', () => {
    const projection = projectionOf({ nodes: hubs, edges: [edge('e2', 'cls_a', 'cls_b'), edge('e1', 'cls_b', 'cls_c'), edge('e3', 'cls_a', 'cls_a')] });
    const { scene } = pipe(projection, ports);
    expect(scene.nodes.map((n) => n.id)).toEqual(['cls_a', 'cls_b', 'cls_c']);
    expect(scene.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });
});
