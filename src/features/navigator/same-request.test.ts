import { describe, expect, it } from 'vitest';
import type { LayoutRequest } from '@/layout/contracts';
import { sameRequest } from './same-request';

const second = { id: 'b', width: 8, height: 8 };
const base: LayoutRequest = {
  requestId: 'a',
  algorithm: 'layered',
  direction: 'RIGHT',
  nodes: [{ id: 'a', width: 8, height: 8 }, second],
  edges: [{ id: 'e', from: 'a', to: 'b' }],
  spacing: { node: 1, layer: 2, edge: 3 },
  seed: 1,
};

describe('sameRequest', () => {
  it('ignores requestId and previous', () => {
    expect(sameRequest(base, { ...base, requestId: 'z', previous: { a: { x: 1, y: 1 } } })).toBe(true);
  });
  it('sees a size, an edge, a direction, a spacing and a seed', () => {
    expect(sameRequest(base, { ...base, nodes: [{ id: 'a', width: 12, height: 8 }, second] })).toBe(false);
    expect(sameRequest(base, { ...base, edges: [{ id: 'e', from: 'b', to: 'a' }] })).toBe(false);
    expect(sameRequest(base, { ...base, edges: [] })).toBe(false);
    expect(sameRequest(base, { ...base, direction: 'LEFT' })).toBe(false);
    expect(sameRequest(base, { ...base, spacing: { node: 1, layer: 2, edge: 4 } })).toBe(false);
    expect(sameRequest(base, { ...base, seed: 2 })).toBe(false);
  });
  it('sees a hint', () => {
    expect(sameRequest(base, { ...base, nodes: [{ id: 'a', width: 8, height: 8, layerHint: 1 }, second] })).toBe(false);
  });
});
