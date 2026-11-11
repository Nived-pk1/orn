// @vitest-environment jsdom
/**
 * The map's focus marks on the renderer (step 8.2a, ADR-044): the colour of an arrow's group, boxes shown faded but still clickable, a small caption under a box, and the box under the pointer. Absent marks: the drawing is unchanged.
 */
import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@/render/scene';
import type { MapMarks } from '@/render/svg';
import { demoNavigatorScene, draw } from '@/test-support/svg-kit';

afterEach(cleanup);

const scene = demoNavigatorScene(false);
const arrow = scene.edges.find((e) => e.from !== e.to && e.arrowHead === 'filled') as Scene['edges'][number];
const hub = scene.nodes.find((n) => n.box === 'hub') as Scene['nodes'][number];
const marks = (over: Partial<MapMarks> = {}): MapMarks => ({ edges: new Map(), faded: new Set(), captions: new Map(), ...over });
const edgePath = (container: Element): Element => container.querySelector(`[data-layer="edges"] [data-edge-id="${arrow.id}"] path:not([data-hit])`) as Element;

describe('an arrow with a mark', () => {
  it('carries its role and the group colour as data the stylesheet reads', () => {
    const { container } = draw(scene, { lod: 2, marks: marks({ edges: new Map([[arrow.id, { role: 'makes', tone: 'green' }]]) }) });
    const group = container.querySelector(`[data-edge-id="${arrow.id}"]`) as Element;
    expect(group.getAttribute('data-role')).toBe('makes');
    expect(edgePath(container).getAttribute('data-tone')).toBe('green');
  });

  it('a made-from arrow has no tone (ink) and keeps its own dash', () => {
    const dashed = { ...scene, edges: scene.edges.map((e) => (e.id === arrow.id ? { ...e, stroke: 'dashed' as const } : e)) };
    const { container } = draw(dashed, { lod: 2, marks: marks({ edges: new Map([[arrow.id, { role: 'madeFrom' }]]) }) });
    expect(edgePath(container).hasAttribute('data-tone')).toBe(false);
    expect(edgePath(container).getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('a line of a two-way pair has one head (at its end only), a hit area of its own, and a chip that is a button for ITS direction (step 8.4c, C)', () => {
    const bundled = { ...scene, edges: scene.edges.map((e) => (e.id === arrow.id ? { ...e, bundleSize: 3 } : e)) };
    const { container } = draw(bundled, { lod: 2, marks: marks({ edges: new Map([[arrow.id, { role: 'makes', paired: true }]]) }), });
    expect(edgePath(container).getAttribute('marker-start')).toBeNull();
    expect(edgePath(container).getAttribute('marker-end')).toMatch(/\)$/);
    const hits = container.querySelectorAll(`[data-edge-id="${arrow.id}"] path[data-hit]`);
    expect(hits).toHaveLength(1); // not two halves
    expect(hits[0]?.getAttribute('stroke-width')).toBe('16');
    const chip = container.querySelector(`[data-count-of="${arrow.id}"]`) as Element;
    expect(chip.getAttribute('role')).toBe('button');
    expect(chip.getAttribute('data-hit-edge')).toBe(arrow.id);
    expect(container.querySelector('[data-count-extra-of]')).toBeNull();
  });

  it('a one-way arrow keeps one plain hit path and a chip that is not a button', () => {
    const bundled = { ...scene, edges: scene.edges.map((e) => (e.id === arrow.id ? { ...e, bundleSize: 3 } : e)) };
    const { container } = draw(bundled, { lod: 2, marks: marks({ edges: new Map([[arrow.id, { role: 'makes' }]]) }) });
    expect(container.querySelector(`[data-count-of="${arrow.id}"]`)?.getAttribute('role')).toBe('img');
  });
});

describe('a chip with words in the card typography (step 8.3, A3)', () => {
  it('draws the runs as tspans: the formula digits are subscripts, the text is the same characters', () => {
    const runs = [{ text: 'H' }, { text: '2', script: 'sub' as const }, { text: 'SO' }, { text: '4', script: 'sub' as const }];
    const { container } = draw(scene, { lod: 2, marks: marks({ edges: new Map([[arrow.id, { role: 'makes', chip: { text: 'H2SO4', name: 'H2SO4', runs } }]]) }) });
    const chip = container.querySelector(`[data-count-of="${arrow.id}"]`) as Element;
    expect(chip.querySelector('text')?.textContent).toBe('H2SO4');
    expect(chip.querySelectorAll('tspan').length).toBe(4);
    expect(chip.querySelectorAll('tspan[dy]').length).toBeGreaterThan(0);
    expect(chip.getAttribute('aria-label')).toBe('H2SO4');
  });
});

describe('boxes and captions', () => {
  it('a faded box is marked and stays a hit target', () => {
    const { container } = draw(scene, { lod: 2, marks: marks({ faded: new Set([hub.id]) }) });
    const group = container.querySelector(`[data-node-id="${hub.id}"]`) as Element;
    expect(group.getAttribute('data-faded')).toBe('true');
    expect(group.getAttribute('class')).toContain('faded');
    expect(group.getAttribute('aria-label')).toBe(hub.ariaLabel);
  });

  it('the mark inside a box is written inside it from LOD 1 on, as text', () => {
    const shown = draw(scene, { lod: 1, marks: marks({ captions: new Map([[hub.id, '4 within the family']]) }) });
    expect(shown.container.querySelector(`[data-loops-of="${hub.id}"]`)?.textContent).toBe('4 within the family');
    cleanup();
    expect(draw(scene, { lod: 0, marks: marks({ captions: new Map([[hub.id, '4 within the family']]) }) }).container.querySelector('[data-loops-of]')).toBeNull();
  });

  it('without marks nothing is faded, captioned or marked', () => {
    const { container } = draw(scene, { lod: 2 });
    expect(container.querySelector('[data-faded], [data-loops-of], [data-role]')).toBeNull();
  });
});

describe('the box under the pointer', () => {
  it('is reported once when it changes, and null when the pointer leaves or a button is held', () => {
    const onNodeHover = vi.fn<(id: string | null) => void>();
    const { container, svg } = draw(scene, { lod: 2, onNodeHover });
    const node = container.querySelector(`[data-node-id="${hub.id}"]`) as Element;
    fireEvent.pointerMove(node, { buttons: 0 });
    fireEvent.pointerMove(node, { buttons: 0 });
    expect(onNodeHover.mock.calls).toEqual([[hub.id]]);
    fireEvent.pointerMove(node, { buttons: 1 });
    fireEvent.pointerMove(node, { buttons: 0 });
    fireEvent.pointerLeave(svg);
    expect(onNodeHover.mock.calls.map((c) => c[0])).toEqual([hub.id, null, hub.id, null]);
  });
});
