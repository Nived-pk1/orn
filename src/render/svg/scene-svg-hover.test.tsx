// @vitest-environment jsdom
/**
 * A hovered or selected arrow (step 5.5d, item b): heavier, in the accent, with its two families outlined, drawn by the overlay layer
 * only (render counters prove the node and edge layers do not commit), and the delegated hover listener on the root svg.
 */
import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@/render/scene';
import type { SceneHit } from '@/render/svg';
import { demoNavigatorScene, draw } from '@/test-support/svg-kit';

afterEach(cleanup);

const all = (root: Element, selector: string): Element[] => [...root.querySelectorAll(selector)];
const scene = demoNavigatorScene(false);
const arrow = scene.edges.find((e) => e.from !== e.to && e.arrowHead === 'filled') as Scene['edges'][number];

describe('the emphasised arrow', () => {
  it('a hovered arrow is an accent path with an accent head and its two families outlined', () => {
    const { container } = draw(scene, { lod: 2, hoveredId: arrow.id });
    const hover = all(container, '[data-overlay="hover"]');
    expect(hover).toHaveLength(1);
    expect(hover[0]?.getAttribute('data-overlay-id')).toBe(arrow.id);
    expect(hover[0]?.getAttribute('class')).toContain('hoverEdge');
    expect(hover[0]?.getAttribute('marker-end')).toMatch(/arrow-accent\)$/);
    expect(all(container, '[data-overlay="end"]').map((el) => el.getAttribute('data-overlay-id')).sort()).toEqual([arrow.from, arrow.to].sort());
    // the arrow itself is untouched in the edges layer
    expect(container.querySelector(`[data-layer="edges"] [data-edge-id="${arrow.id}"] path`)?.getAttribute('class')).not.toContain('hoverEdge');
  });

  it('a selected arrow looks the same, and an arrow that is both is drawn once', () => {
    const selected = draw(scene, { lod: 2, selectedIds: new Set([arrow.id]) });
    expect(all(selected.container, '[data-overlay="selected"]')).toHaveLength(1);
    expect(all(selected.container, '[data-overlay="end"]')).toHaveLength(2);
    cleanup();
    const both = draw(scene, { lod: 2, selectedIds: new Set([arrow.id]), hoveredId: arrow.id });
    expect(all(both.container, '[data-overlay="hover"]')).toHaveLength(0);
    expect(all(both.container, '[data-overlay="selected"]')).toHaveLength(1);
    expect(all(both.container, '[data-overlay="end"]')).toHaveLength(2);
  });

  it('draws nothing for a hovered id that is not an arrow of the Scene', () => {
    const { container } = draw(scene, { lod: 2, hoveredId: 'no_such_id' });
    expect(all(container, '[data-overlay]')).toHaveLength(0);
  });

  it('a change of the hovered arrow commits the overlay layer only', () => {
    const view = draw(scene, { lod: 2 });
    view.drain();
    view.rerender({ hoveredId: arrow.id });
    expect(view.drain()).toEqual(['overlay']);
    view.rerender({ hoveredId: undefined });
    expect(view.drain()).toEqual(['overlay']);
  });
});

describe('the hover listener', () => {
  const hitPath = (container: Element): Element => container.querySelector(`[data-edge-id="${arrow.id}"] [data-hit]`) as Element;

  it('reports the arrow under the pointer once, and null when the pointer leaves', () => {
    const onSceneHover = vi.fn<(hit: SceneHit | null) => void>();
    const { container, svg } = draw(scene, { lod: 2, onSceneHover });
    fireEvent.pointerMove(hitPath(container), { buttons: 0 });
    fireEvent.pointerMove(hitPath(container), { buttons: 0 });
    expect(onSceneHover.mock.calls).toEqual([[{ kind: 'edge', id: arrow.id }]]);
    fireEvent.pointerLeave(svg);
    expect(onSceneHover.mock.calls[1]).toEqual([null]);
  });

  it('is not reported over a node, and not while a button is held (a drag is a pan)', () => {
    const onSceneHover = vi.fn<(hit: SceneHit | null) => void>();
    const { container } = draw(scene, { lod: 2, onSceneHover });
    fireEvent.pointerMove(hitPath(container), { buttons: 1 });
    expect(onSceneHover).not.toHaveBeenCalled();
    fireEvent.pointerMove(hitPath(container), { buttons: 0 });
    fireEvent.pointerMove(container.querySelector('[data-node-id]') as Element, { buttons: 0 });
    expect(onSceneHover.mock.calls).toEqual([[{ kind: 'edge', id: arrow.id }], [null]]);
  });
});

describe('count chips and loops', () => {
  const lod = 1;
  it('shows the count of a bundle (the TOTAL) as a chip from LOD 1 on (it was LOD 2)', () => {
    const bundled = { ...scene, edges: scene.edges.map((e) => (e.id === arrow.id ? { ...e, bundleSize: 752 } : e)) };
    expect(draw(bundled, { lod: 0 }).container.querySelector(`[data-count-of="${arrow.id}"]`)).toBeNull();
    cleanup();
    const chip = draw(bundled, { lod: 1 }).container.querySelector(`[data-count-of="${arrow.id}"]`) as Element;
    expect(chip.querySelector('text')?.textContent).toBe('752');
    expect(chip.getAttribute('aria-label')).toBe('752 reactions');
  });

  it('a chip is a 20 px high pill named "N reactions", with 12 px text', () => {
    const chips = scene.edges.filter((e) => e.bundleSize !== undefined);
    expect(chips.length).toBeGreaterThan(0);
    const { container } = draw(scene, { lod });
    for (const edge of chips) {
      const chip = container.querySelector(`[data-count-of="${edge.id}"]`) as Element;
      const name = `${edge.bundleSize} ${edge.bundleSize === 1 ? 'reaction' : 'reactions'}`;
      expect(chip.getAttribute('aria-label')).toBe(name);
      expect(chip.querySelector('title')?.textContent).toBe(name);
      expect(chip.getAttribute('data-chip-height')).toBe('20');
      expect(chip.querySelector('rect')?.getAttribute('class')).toContain('chipPill');
    }
  });

  it('a self-loop ends in a visible arrowhead and says what it means in words', () => {
    const loops = scene.edges.filter((e) => e.from === e.to);
    expect(loops.length).toBeGreaterThan(0);
    for (const loop of loops) {
      expect(loop.arrowHead).toBe('filled');
      expect(loop.ariaLabel).toMatch(/reactions? that stays? within /);
      expect(loop.bundleSize).toBeDefined();
    }
  });
});
