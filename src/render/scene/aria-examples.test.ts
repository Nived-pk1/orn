/** The overview's counts in words say how many examples are folded (7.3a C3): "2 reactions (+ 1 example)". Written first (seen red). */
import { describe, expect, it } from 'vitest';
import type { GraphNode } from '@/core/graph/contracts';
import { edgeAria, nodeAria } from './aria';
import type { NodeContent } from './node-content';
import type { DrawnPath } from './paths';

const path = (total: number, examples?: number): DrawnPath => ({ id: 'p', from: 'a', to: 'b', loop: false, edges: [{}, {}] as never, total, bundled: true, ...(examples === undefined ? {} : { examples }) });

describe('edgeAria', () => {
  it('says the folded examples after the reactions', () => {
    expect(edgeAria(path(2, 1), 'transforms_to', 'Alcohols', 'Aldehydes', 2)).toBe('Alcohols to Aldehydes, 2 reactions (+ 1 example)');
    expect(edgeAria(path(2, 3), 'transforms_to', 'Alcohols', 'Aldehydes', 2)).toBe('Alcohols to Aldehydes, 2 reactions (+ 3 examples)');
  });
  it('is unchanged without examples', () => {
    expect(edgeAria(path(2), 'transforms_to', 'Alcohols', 'Aldehydes', 2)).toBe('Alcohols to Aldehydes, 2 reactions');
  });
});

describe('nodeAria', () => {
  const node = (examples: object): GraphNode => ({ role: 'hub', flags: [], hidden: { outgoing: 0, incoming: 0 }, reactionCounts: { out: 2, in: 1, loops: 0, outAll: 2, inAll: 1, ...examples } }) as unknown as GraphNode;
  const content = { name: 'Alcohols', glyph: 'class_hub' } as unknown as NodeContent;
  it('adds the examples to the count they belong to', () => {
    expect(nodeAria(node({ outExamples: 1 }), content, undefined)).toBe('Alcohols, class hub, 2 reactions (+ 1 example) out, 1 reaction in');
  });
  it('is unchanged without examples', () => {
    expect(nodeAria(node({}), content, undefined)).toBe('Alcohols, class hub, 2 reactions out, 1 reaction in');
  });
});
