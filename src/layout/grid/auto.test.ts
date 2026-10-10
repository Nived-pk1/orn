import { describe, expect, it } from 'vitest';
import type { LayoutNodeInput, LayoutRequest, Point } from '../contracts';
import { checkRequest } from '../validate';
import { layoutCacheKey } from '../cache-key';
import { autoNodesOf, layeredRequestOf, snapToCells } from './auto';

const auto = (id: string): LayoutNodeInput => ({ id, width: 100, height: 40, autoCell: true });
const authored = (id: string, column: number, row: number): LayoutNodeInput => ({ id, width: 100, height: 40, cell: { column, row } });
const plain = (id: string): LayoutNodeInput => ({ id, width: 100, height: 40 });
const req = (nodes: LayoutNodeInput[], edges: LayoutRequest['edges'] = []): LayoutRequest => ({
  requestId: 'r', algorithm: 'grid', direction: 'RIGHT', nodes: [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1)), edges, spacing: { node: 24, layer: 96, edge: 12 }, seed: 1,
});
const cellsOf = (r: LayoutRequest) => Object.fromEntries(r.nodes.map((n) => [n.id, n.cell === undefined ? null : `${n.cell.column},${n.cell.row}`]));

describe('snapping the layered drawing to cells', () => {
  const layered: Record<string, Point> = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 200, y: 100 }, d: { x: 400, y: 50 } };

  it('column = layer, row = rank inside the layer', () => {
    const out = snapToCells(req([auto('a'), auto('b'), auto('c'), auto('d')]), layered);
    expect(cellsOf(out.request)).toEqual({ a: '0,0', b: '1,0', c: '1,1', d: '2,0' });
    expect(out.assigned).toBe(4);
    expect(out.moved).toBe(0);
    expect(out.request.nodes.some((n) => n.autoCell !== undefined)).toBe(false);
  });

  it('layers of different widths are still one layer when their x ranges overlap', () => {
    const wide = { ...auto('b'), width: 160 };
    const out = snapToCells(req([auto('a'), wide, auto('c')]), { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 230, y: 90 } });
    expect(cellsOf(out.request)).toEqual({ a: '0,0', b: '1,0', c: '1,1' });
  });

  it('is deterministic whatever the order the layered answer was written in', () => {
    const r = req([auto('a'), auto('b'), auto('c'), auto('d')]);
    const reversed = Object.fromEntries(Object.entries(layered).reverse());
    expect(snapToCells(r, reversed)).toEqual(snapToCells(r, layered));
    expect(layoutCacheKey(snapToCells(r, layered).request)).toBe(layoutCacheKey(snapToCells(r, reversed).request));
  });

  it('an authored cell is kept, and an automatic cell that is taken moves to the next free row', () => {
    const r = req([authored('x', 1, 0), authored('y', 1, 1), auto('a'), auto('b'), auto('c'), auto('d')]);
    const out = snapToCells(r, layered);
    expect(out.request.nodes.find((n) => n.id === 'x')?.cell).toEqual({ column: 1, row: 0 });
    expect(cellsOf(out.request)).toMatchObject({ a: '0,0', b: '1,2', c: '1,3', d: '2,0' });
    expect(out.moved).toBe(2);
    const seen = new Set(out.request.nodes.map((n) => `${n.cell?.column},${n.cell?.row}`));
    expect(seen.size).toBe(r.nodes.length);
  });

  it('the Unclassified hub (no cell, no autoCell) is left alone, to go below the grid', () => {
    const r = req([auto('a'), auto('b'), plain('unclassified')]);
    const out = snapToCells(r, { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } });
    expect(out.request.nodes.find((n) => n.id === 'unclassified')?.cell).toBeUndefined();
    expect(autoNodesOf(r).map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('the layered request has only the automatic hubs, their edges, no labels and no cells', () => {
    const r = req([auto('a'), auto('b'), authored('x', 0, 0), plain('u')], [
      { id: 'e1', from: 'a', to: 'b', label: { width: 20, height: 20 } },
      { id: 'e2', from: 'a', to: 'x' },
    ]);
    const sub = layeredRequestOf(r);
    expect(sub.algorithm).toBe('layered');
    expect(sub.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(sub.edges).toEqual([{ id: 'e1', from: 'a', to: 'b' }]);
    expect(checkRequest(sub)).toBeUndefined();
  });

  it('autoCell takes part in the cache key and is checked', () => {
    expect(layoutCacheKey(req([auto('a')]))).not.toBe(layoutCacheKey(req([plain('a')])));
    expect(checkRequest(req([{ ...plain('a'), autoCell: false as unknown as true }]))?.code).toBe('BAD_REQUEST');
  });
});
