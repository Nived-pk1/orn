/**
 * Label sizes (step 5.5a, item a) and where the Scene puts the text: the room the layout reserves is the measured arrow text of a
 * single edge (both lines when it has a below line) or the count badge of a bundle, plus a margin; the Scene's `labelAt` is the centre of
 * the label box the layout placed, else the middle of the route (the fallback, degraded); a self-loop's label and route are inside
 * the bounds.
 */
import { describe, expect, it } from 'vitest';
import type { ArrowText } from '@/core/graph/arrow-text';
import type { LayoutResult } from '@/layout/contracts';
import { bundle, edge, fakeMeasurer, node, nobodyPorts, pipe, projectionOf } from '@/test-support/scene-kit';
import { ARROW_LINE_HEIGHT, ARROW_TEXT_SIZE, buildLayoutRequest, buildScene, CHIP_HEIGHT, chipWidth, labelSizes, LABEL_MARGIN, nodeSizes, roundUpToGrid, type ScenePorts } from '.';

const hubs = [node('cls_a'), node('cls_b'), node('cls_c')];
const member = node('spc_m', { kind: 'species', record: { kind: 'species', id: 'spc_m' }, role: 'member' });
const text = (above: string[], below: string[] = []): ArrowText => ({ above: above.map((t) => ({ text: t, kind: 'name' as const })), below: below.map((t) => ({ text: t, kind: 'name' as const })) });
const withText = (byEdge: Record<string, ArrowText>): ScenePorts => ({ ...nobodyPorts, arrowTextOf: (e) => byEdge[e.id] });
const widthOf = (s: string): number => fakeMeasurer([{ text: s }], { size: ARROW_TEXT_SIZE, weight: 'regular', mono: false }).width;

describe('labelSizes', () => {
  it('a single edge: the widest line plus the margin, a line height per line, on the grid', () => {
    const ports = withText({ e1: text(['NaOH, water'], ['heat']), e2: text(['PCC']) });
    const sizes = labelSizes(projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b'), edge('e2', 'cls_b', 'cls_c')] }), ports, fakeMeasurer);
    expect(sizes.get('e1')).toEqual({ width: roundUpToGrid(widthOf('NaOH, water') + LABEL_MARGIN.x), height: roundUpToGrid(2 * ARROW_LINE_HEIGHT + LABEL_MARGIN.y) });
    expect(sizes.get('e2')).toEqual({ width: roundUpToGrid(widthOf('PCC') + LABEL_MARGIN.x), height: roundUpToGrid(ARROW_LINE_HEIGHT + LABEL_MARGIN.y) });
    // both lines count: the two-line label is taller than the one-line label.
    expect((sizes.get('e1')?.height ?? 0)).toBeGreaterThan(sizes.get('e2')?.height ?? 0);
  });

  it('a bundle: its count badge plus the margin, whatever the LOD (the size does not depend on it)', () => {
    const projection = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b'), edge('e2', 'cls_a', 'cls_b')], bundles: [bundle('bnd_ab', 'cls_a', 'cls_b', ['e1', 'e2'], 752)] });
    const sizes = labelSizes(projection, nobodyPorts, fakeMeasurer);
    expect(sizes.get('bnd_ab')).toEqual({ width: roundUpToGrid(chipWidth(752) + LABEL_MARGIN.x), height: roundUpToGrid(CHIP_HEIGHT) });
    expect(chipWidth(752)).toBeGreaterThan(chipWidth(7));
  });

  it('an edge with no text, a membership edge and an overflow edge ask for no room', () => {
    const projection = projectionOf({
      nodes: [...hubs, member],
      edges: [edge('e1', 'cls_a', 'cls_b'), edge('e2', 'cls_a', 'spc_m', { semantic: 'membership', selectivity: undefined }), edge('e3', 'cls_a', 'cls_c', { semantic: 'overflow', selectivity: undefined })],
    });
    expect([...labelSizes(projection, withText({ e2: text(['x']), e3: text(['y']) }), fakeMeasurer).keys()]).toEqual([]);
  });

  it('a measurer that answers nonsense gives the margin only (never NaN)', () => {
    const projection = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b')] });
    const sizes = labelSizes(projection, withText({ e1: text(['x']) }), () => ({ width: Number.NaN, height: -3 }));
    expect(sizes.get('e1')?.width).toBe(roundUpToGrid(LABEL_MARGIN.x));
  });

  it('is part of the request: the layout edge carries exactly the label size of its path', () => {
    const projection = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b'), edge('e2', 'cls_b', 'cls_c')] });
    const ports = withText({ e1: text(['NaOH']) });
    const labels = labelSizes(projection, ports, fakeMeasurer);
    const built = buildLayoutRequest(projection, nodeSizes(projection, ports, fakeMeasurer), { labelSizes: labels });
    expect(built.ok && built.request.edges.map((e) => e.label)).toEqual([labels.get('e1'), undefined]);
    const without = buildLayoutRequest(projection, nodeSizes(projection, ports, fakeMeasurer));
    expect(without.ok && without.request.edges.every((e) => e.label === undefined)).toBe(true);
  });
});

describe('where the Scene puts the text', () => {
  const projection = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_b')] });
  const ports = withText({ e1: text(['NaOH'], ['heat']) });

  it('the fallback places no label: the text sits on the middle of the route', () => {
    const { scene } = pipe(projection, ports);
    const e = scene.edges[0];
    const pts = e?.points ?? [];
    expect(e?.labelAt.x).toBeCloseTo(((pts[0]?.x ?? 0) + (pts[pts.length - 1]?.x ?? 0)) / 2, 5);
  });

  it('a label the layout placed: labelAt is the centre of its box, and the box is inside the bounds', () => {
    const { sizes, labels, layout } = pipe(projection, ports);
    const size = labels.get('e1') as { width: number; height: number };
    const placed: LayoutResult = { ...layout, labelPositions: { e1: { x: 200, y: 300 } }, bounds: { width: 10, height: 10 } };
    const built = buildScene(projection, placed, { sizes, labelSizes: labels }, ports);
    if (!built.ok) throw new Error(built.message);
    expect(built.scene.edges[0]?.labelAt).toEqual({ x: 200 + size.width / 2, y: 300 + size.height / 2 });
    expect(built.scene.bounds.width).toBeGreaterThanOrEqual(200 + size.width);
    expect(built.scene.bounds.height).toBeGreaterThanOrEqual(300 + size.height);
  });

  it('a self-loop: the label sits right of the loop and the route and the label are inside the bounds', () => {
    const loops = projectionOf({ nodes: hubs, edges: [edge('e1', 'cls_a', 'cls_a'), edge('e2', 'cls_a', 'cls_a')], bundles: [bundle('bnd_aa', 'cls_a', 'cls_a', ['e1', 'e2'], 123456)] });
    const { scene, labels } = pipe(loops, nobodyPorts);
    const loop = scene.edges.find((e) => e.id === 'bnd_aa');
    const size = labels.get('bnd_aa') as { width: number; height: number };
    const farthest = Math.max(...(loop?.points ?? []).map((p) => p.x));
    expect((loop?.labelAt.x ?? 0) - size.width / 2).toBeGreaterThanOrEqual(farthest);
    expect((loop?.labelAt.x ?? 0) + size.width / 2).toBeLessThanOrEqual(scene.bounds.width);
    expect((loop?.labelAt.y ?? 0) + size.height / 2).toBeLessThanOrEqual(scene.bounds.height);
    expect((loop?.labelAt.y ?? 0) - size.height / 2).toBeGreaterThanOrEqual(0);
    for (const p of loop?.points ?? []) expect(p.y).toBeGreaterThanOrEqual(0);
  });

  it('a tall label at the top of the scene stays at or below y = 0', () => {
    const tall = withText({ e1: text(['a'], ['b']) });
    const loop = projectionOf({ nodes: [node('cls_a')], edges: [edge('e1', 'cls_a', 'cls_a')] });
    const { scene, labels } = pipe(loop, tall);
    const size = labels.get('e1') as { width: number; height: number };
    expect((scene.edges[0]?.labelAt.y ?? 0) - size.height / 2).toBeGreaterThanOrEqual(0);
  });
});
