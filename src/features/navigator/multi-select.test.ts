/**
 * The model of the map's multi-selection (step 6.8b, R2): which family boxes a marquee covers (a box counts only when it lies wholly
 * inside), the selection line in words ("3 families and 2 arrows selected (14 reactions)"), and the reactions of the selection - the
 * roll-up's reactions of each family and of each arrow, once each. Pure; the screen rectangle is turned into the drawing's by the viewport.
 */
import { describe, expect, it } from 'vitest';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { marqueeFamilies, reactionsOfSelection, selectionLine, worldRect } from './multi-select';

const node = (id: string, x: number, y: number, box: SceneNode['box'] = 'hub'): SceneNode => ({ id, box, x, y, width: 100, height: 40 }) as unknown as SceneNode;
const edge = (id: string, from: string, to: string): SceneEdge => ({ id, from, to }) as unknown as SceneEdge;
const scene = (nodes: SceneNode[], edges: SceneEdge[] = []): Scene => ({ nodes, edges }) as unknown as Scene;

describe('worldRect', () => {
  it('turns two client points into the drawing rectangle through the element origin and the viewport, whichever corner came first', () => {
    // viewport: translate (50, 20), scale 2; the element sits at (10, 10) on the screen
    const rect = worldRect({ x: 410, y: 130 }, { x: 110, y: 50 }, { left: 10, top: 10 }, { x: 50, y: 20, scale: 2 });
    expect(rect).toEqual({ x0: 25, y0: 10, x1: 175, y1: 50 });
  });
});

describe('marqueeFamilies', () => {
  const s = scene([node('a', 0, 0), node('b', 200, 0), node('c', 0, 200), node('u', 200, 200, 'unclassified'), node('sp', 100, 100, 'species')]);
  it('selects the family boxes that lie wholly inside the rectangle, in scene order', () => {
    expect(marqueeFamilies(s, { x0: -10, y0: -10, x1: 320, y1: 60 })).toEqual(['a', 'b']);
  });
  it('a box that only touches the rectangle is not inside', () => {
    expect(marqueeFamilies(s, { x0: 50, y0: 0, x1: 320, y1: 60 })).toEqual(['b']);
  });
  it('the Unclassified box is a family; boxes of other kinds are not', () => {
    expect(marqueeFamilies(s, { x0: -10, y0: -10, x1: 400, y1: 400 })).toEqual(['a', 'b', 'c', 'u']);
  });
  it('an empty rectangle selects nothing', () => {
    expect(marqueeFamilies(s, { x0: 500, y0: 500, x1: 510, y1: 510 })).toEqual([]);
  });
});

describe('selectionLine', () => {
  it('says families, arrows and reactions in words', () => {
    expect(selectionLine({ families: 3, arrows: 2, reactions: 14 })).toBe('3 families and 2 arrows selected (14 reactions)');
    expect(selectionLine({ families: 1, arrows: 0, reactions: 1 })).toBe('1 family selected (1 reaction)');
    expect(selectionLine({ families: 0, arrows: 1, reactions: 0 })).toBe('1 arrow selected (0 reactions)');
    expect(selectionLine({ families: 2, arrows: 0, reactions: 5 })).toBe('2 families selected (5 reactions)');
  });
});

describe('reactionsOfSelection', () => {
  const s = scene([node('a', 0, 0), node('b', 200, 0)], [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]);
  const from = (hub: string): readonly { reactionId: string; toHub: string }[] =>
    hub === 'a' ? [{ reactionId: 'r1', toHub: 'b' }, { reactionId: 'r2', toHub: 'b' }, { reactionId: 'r3', toHub: 'a' }] : hub === 'b' ? [{ reactionId: 'r4', toHub: 'a' }] : [];

  it('a family contributes the reactions OF it; an arrow the reactions from its source to its target; each reaction once', () => {
    const items = [{ kind: 'node', id: 'a' }, { kind: 'edge', id: 'e1' }, { kind: 'edge', id: 'e2' }] as const;
    expect(reactionsOfSelection(items, s, from)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(reactionsOfSelection([{ kind: 'edge', id: 'e1' }], s, from)).toEqual(['r1', 'r2']);
    expect(reactionsOfSelection([{ kind: 'node', id: 'b' }], s, from)).toEqual(['r4']);
  });
  it('an item that is not drawn now contributes nothing', () => {
    expect(reactionsOfSelection([{ kind: 'node', id: 'gone' }, { kind: 'edge', id: 'e9' }], s, from)).toEqual([]);
  });
});
