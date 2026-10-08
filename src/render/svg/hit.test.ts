// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hitOf } from './hit';

const NS = 'http://www.w3.org/2000/svg';
const el = (parent: Element, name: string, attrs: Record<string, string> = {}): Element => {
  const child = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, value);
  parent.appendChild(child);
  return child;
};

function drawing(): SVGSVGElement {
  const root = document.createElementNS(NS, 'svg');
  const node = el(root, 'g', { 'data-node-id': 'n1' });
  el(node, 'rect', { id: 'box' });
  const edge = el(root, 'g', { 'data-edge-id': 'e1' });
  el(edge, 'path', { id: 'line' });
  el(edge, 'path', { id: 'hit' });
  el(root, 'text', { id: 'free' });
  return root;
}

describe('hitOf', () => {
  const root = drawing();
  it('finds the node or edge group around the event target', () => {
    expect(hitOf(root.querySelector('#box'))).toEqual({ kind: 'node', id: 'n1' });
    expect(hitOf(root.querySelector('[data-node-id]'))).toEqual({ kind: 'node', id: 'n1' });
    expect(hitOf(root.querySelector('#line'))).toEqual({ kind: 'edge', id: 'e1' });
    expect(hitOf(root.querySelector('#hit'))).toEqual({ kind: 'edge', id: 'e1' });
  });
  it('answers null for empty canvas, the root and a non-element', () => {
    expect(hitOf(root)).toBeNull();
    expect(hitOf(root.querySelector('#free'))).toBeNull();
    expect(hitOf(null)).toBeNull();
    expect(hitOf(window)).toBeNull();
  });
});
