/** Node sizes and buildLayoutRequest (step 5.3): sorted, seeded, loops left out, one edge per drawn path, caps as values, checkRequest-clean. */
import { describe, expect, it } from 'vitest';
import { checkRequest } from '@/layout';
import { MAX_LAYOUT_EDGES, MAX_LAYOUT_NODES } from '@/layout/contracts';
import { bundle, edge, fakeMeasurer, node, nobodyPorts, projectionOf } from '@/test-support/scene-kit';
import { buildLayoutRequest, DEFAULT_SPACING, directionOfView, isArranged, LAYOUT_SEED, nodeSizes, roundUpToGrid, BOXES, GRID, type NodeSizes } from '.';

const sizesFor = (ids: readonly string[]): NodeSizes => new Map(ids.map((id) => [id, { width: 100, height: 40 }]));

describe('nodeSizes', () => {
  const projection = projectionOf({
    nodes: [
      node('cls_a'),
      node('spc_m', { kind: 'species', record: { kind: 'species', id: 'spc_m' }, role: 'member' }),
      node('spc_s', { kind: 'species', record: { kind: 'species', id: 'spc_s' }, role: 'focus' }),
      node('rgt_r', { kind: 'reagent', record: { kind: 'reagent', id: 'rgt_r' }, role: 'focus' }),
      node('virtual:overflow:cls_a', { kind: 'virtual', record: undefined, role: 'overflow', hidden: { outgoing: 4, incoming: 0 }, hiddenMembers: 3 }),
      node('virtual:unclassified', { kind: 'virtual', record: undefined, role: 'unclassified' }),
    ],
  });
  const sizes = nodeSizes(projection, nobodyPorts, fakeMeasurer);

  it('gives every node a box on the 4 px grid, no smaller than its box kind', () => {
    expect([...sizes.keys()].sort()).toEqual(projection.nodes.map((n) => n.id).sort());
    for (const { width, height } of sizes.values()) {
      expect(width % GRID).toBe(0);
      expect(height % GRID).toBe(0);
    }
    const kinds = { cls_a: 'hub', spc_m: 'member', spc_s: 'species', rgt_r: 'reagent', 'virtual:overflow:cls_a': 'overflow', 'virtual:unclassified': 'unclassified' } as const;
    for (const [id, kind] of Object.entries(kinds)) expect(sizes.get(id)?.width).toBeGreaterThanOrEqual(BOXES[kind].minWidth);
  });

  it('rounds up to the grid', () => {
    expect([0, 1, 4, 5, 97, 100].map(roundUpToGrid)).toEqual([0, 4, 4, 8, 100, 100]);
  });

  it('is deterministic and widens with the text, up to the maximum', () => {
    const named = (name: string) => nodeSizes(projectionOf({ nodes: [node('cls_a')] }), { ...nobodyPorts, describe: () => ({ name, formula: 'CnH2n+2' }) }, fakeMeasurer).get('cls_a');
    expect(named('Alkanes')).toEqual(named('Alkanes'));
    expect(named('A much longer hub name')?.width ?? 0).toBeGreaterThanOrEqual(named('Alkanes')?.width ?? 0);
    expect(named('x'.repeat(5_000))?.width).toBe(BOXES.hub.maxWidth);
  });

  it('a sublabel makes the box taller', () => {
    const at = (formula?: string) => nodeSizes(projectionOf({ nodes: [node('cls_a')] }), { ...nobodyPorts, describe: () => ({ name: 'N', ...(formula === undefined ? {} : { formula }) }) }, fakeMeasurer).get('cls_a')?.height ?? 0;
    expect(at('R–OH')).toBeGreaterThan(at());
  });

  it('survives a measurer that answers nonsense', () => {
    for (const bad of [Number.NaN, -5, Infinity, 0]) {
      const odd = nodeSizes(projectionOf({ nodes: [node('cls_a')] }), nobodyPorts, () => ({ width: bad, height: bad })).get('cls_a');
      expect(odd?.width).toBe(BOXES.hub.minWidth);
      expect(Number.isFinite(odd?.height)).toBe(true);
      expect(odd?.height ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('buildLayoutRequest', () => {
  const nodes = [node('cls_b'), node('cls_a'), node('cls_c')];
  const edges = [edge('e3', 'cls_a', 'cls_b'), edge('e1', 'cls_a', 'cls_b', { selectivity: 'minor' }), edge('e2', 'cls_b', 'cls_c'), edge('e9', 'cls_c', 'cls_c')];
  const projection = projectionOf({ nodes, edges, bundles: [bundle('bnd_ab', 'cls_a', 'cls_b', ['e1', 'e3'], 5), bundle('bnd_cc', 'cls_c', 'cls_c', ['e9'], 3)] });
  const built = buildLayoutRequest(projection, sizesFor(['cls_a', 'cls_b', 'cls_c']));

  it('has one node per projection node, one edge per drawn path, loops left out, both sorted by id', () => {
    if (!built.ok) throw new Error('refused');
    expect(built.request.nodes.map((n) => n.id)).toEqual(['cls_a', 'cls_b', 'cls_c']);
    expect(built.request.edges).toEqual([
      { id: 'bnd_ab', from: 'cls_a', to: 'cls_b' },
      { id: 'e2', from: 'cls_b', to: 'cls_c' },
    ]);
  });

  it('is seeded, laid out left to right, and passes the layout worker\'s own request check', () => {
    if (!built.ok) throw new Error('refused');
    expect(built.request.seed).toBe(LAYOUT_SEED);
    expect(built.request.direction).toBe('RIGHT');
    expect(built.request.algorithm).toBe('layered');
    expect(built.request.spacing).toEqual(DEFAULT_SPACING);
    expect(checkRequest(built.request)).toBeUndefined();
  });

  it('is the same for the same inputs, and its default requestId comes from the projection key', () => {
    expect(buildLayoutRequest(projection, sizesFor(['cls_a', 'cls_b', 'cls_c']))).toEqual(built);
    if (!built.ok) throw new Error('refused');
    expect(built.request.requestId).toBe(`layout:${projection.key}`);
  });

  it('takes the direction of the view, or the caller\'s', () => {
    expect(directionOfView('navigator')).toBe('RIGHT');
    expect(directionOfView('precursor_explorer')).toBe('LEFT');
    const precursor = buildLayoutRequest({ ...projection, view: 'precursor_explorer' }, sizesFor(['cls_a', 'cls_b', 'cls_c']));
    expect(precursor.ok && precursor.request.direction).toBe('LEFT');
    const down = buildLayoutRequest(projection, sizesFor(['cls_a', 'cls_b', 'cls_c']), { direction: 'DOWN', algorithm: 'radial', requestId: 'r1' });
    expect(down.ok && [down.request.direction, down.request.algorithm, down.request.requestId]).toEqual(['DOWN', 'radial', 'r1']);
  });

  it('passes the previous positions of the nodes still present, as hints', () => {
    const previous = { cls_a: { x: 1, y: 2 }, cls_gone: { x: 9, y: 9 } };
    const result = buildLayoutRequest(projection, sizesFor(['cls_a', 'cls_b', 'cls_c']), { previous });
    if (!result.ok) throw new Error('refused');
    expect(result.request.previous).toEqual({ cls_a: { x: 1, y: 2 } });
    expect(checkRequest(result.request)).toBeUndefined();
    expect(built.ok && built.request.previous).toBeUndefined();
  });

  it('answers a missing size and a duplicate id as values', () => {
    expect(buildLayoutRequest(projection, sizesFor(['cls_a', 'cls_b']))).toMatchObject({ ok: false, code: 'MISSING_SIZE' });
    const twice = projectionOf({ nodes: [node('cls_a'), node('cls_a')] });
    expect(buildLayoutRequest(twice, sizesFor(['cls_a']))).toMatchObject({ ok: false, code: 'DUPLICATE_ID' });
  });

  it('answers the 2,000 / 4,000 caps as a value, and accepts the caps themselves', () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => node(`n${String(i).padStart(5, '0')}`));
    const ids = (list: ReturnType<typeof many>) => list.map((n) => n.id);
    const atCap = many(MAX_LAYOUT_NODES);
    expect(buildLayoutRequest(projectionOf({ nodes: atCap }), sizesFor(ids(atCap))).ok).toBe(true);
    const over = many(MAX_LAYOUT_NODES + 1);
    expect(buildLayoutRequest(projectionOf({ nodes: over }), sizesFor(ids(over)))).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    const two = [node('a'), node('b')];
    const pathsAt = (count: number) => Array.from({ length: count }, (_, i) => edge(`e${String(i).padStart(5, '0')}`, 'a', 'b'));
    expect(buildLayoutRequest(projectionOf({ nodes: two, edges: pathsAt(MAX_LAYOUT_EDGES) }), sizesFor(['a', 'b'])).ok).toBe(true);
    expect(buildLayoutRequest(projectionOf({ nodes: two, edges: pathsAt(MAX_LAYOUT_EDGES + 1) }), sizesFor(['a', 'b']))).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    // Loops do not count against the cap: they are not sent.
    const loops = Array.from({ length: MAX_LAYOUT_EDGES + 5 }, (_, i) => edge(`l${String(i).padStart(5, '0')}`, 'a', 'a'));
    expect(buildLayoutRequest(projectionOf({ nodes: two, edges: loops }), sizesFor(['a', 'b'])).ok).toBe(true);
  });
});

describe('the arranged overview (step 5.5c): grid when every anchored hub has a cell', () => {
  const cell = (column: number, row: number) => ({ arrangement: { cell: { column, row } } });
  const arranged = () =>
    projectionOf({
      nodes: [node('cls_a', cell(0, 0)), node('cls_b', cell(1, 0)), node('virtual:unclassified', { kind: 'virtual', record: undefined, role: 'unclassified' })],
      edges: [edge('e1', 'cls_a', 'cls_b')],
    });
  const sizes = sizesFor(['cls_a', 'cls_b', 'virtual:unclassified']);

  it('is arranged: the grid algorithm, the cells in the request, none for the Unclassified hub, no previous positions', () => {
    const result = buildLayoutRequest(arranged(), sizes, { previous: { cls_a: { x: 1, y: 2 } } });
    if (!result.ok) throw new Error(result.message);
    expect(result.request.algorithm).toBe('grid');
    expect(result.request.nodes.map((n) => [n.id, n.cell])).toEqual([['cls_a', { column: 0, row: 0 }], ['cls_b', { column: 1, row: 0 }], ['virtual:unclassified', undefined]]);
    expect(result.request.previous).toBeUndefined();
    expect(checkRequest(result.request)).toBeUndefined();
  });

  it('one anchored hub without a cell means the layered layout, as before, and no cell is sent', () => {
    const projection = projectionOf({ nodes: [node('cls_a', cell(0, 0)), node('cls_b'), node('cls_c', { arrangement: { tone: 'blue' } })], edges: [] });
    const result = buildLayoutRequest(projection, sizesFor(['cls_a', 'cls_b', 'cls_c']), { previous: { cls_a: { x: 1, y: 2 } } });
    if (!result.ok) throw new Error(result.message);
    expect(result.request.algorithm).toBe('layered');
    expect(result.request.nodes.every((n) => n.cell === undefined)).toBe(true);
    expect(result.request.previous).toEqual({ cls_a: { x: 1, y: 2 } });
    expect(isArranged(projection)).toBe(false);
  });

  it('a member or an overflow node, other views, and a projection with no anchored hub are not arranged', () => {
    expect(isArranged(projectionOf({ nodes: [node('cls_a', cell(0, 0)), node('spc_m', { kind: 'species', record: { kind: 'species', id: 'spc_m' }, role: 'member' })] }))).toBe(false);
    expect(isArranged({ ...arranged(), view: 'reagent_explorer' })).toBe(false);
    expect(isArranged(projectionOf({ nodes: [node('virtual:unclassified', { kind: 'virtual', record: undefined, role: 'unclassified' })] }))).toBe(false);
    expect(isArranged(arranged())).toBe(true);
  });

  it('an explicit algorithm is honoured', () => {
    const result = buildLayoutRequest(arranged(), sizes, { algorithm: 'layered' });
    if (!result.ok) throw new Error(result.message);
    expect(result.request.algorithm).toBe('layered');
    expect(result.request.nodes.every((n) => n.cell === undefined)).toBe(true);
  });
});
