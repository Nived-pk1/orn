// @vitest-environment jsdom
/**
 * The map's focus marks on the renderer (step 8.2a, ADR-044): the colour of an arrow's group, a head at each end of a pair with a chip near
 * each, boxes shown faded but still clickable, a small caption under a box, and the box under the pointer. Absent marks: the drawing is unchanged.
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

  it('a pair has a head at the start too, and the other direction\'s chip near it', () => {
    const { container } = draw(scene, { lod: 2, marks: marks({ edges: new Map([[arrow.id, { role: 'pair', startHead: true, extraChip: { at: { x: 11, y: 22 }, size: 7 } }]]) }) });
    expect(edgePath(container).getAttribute('marker-start')).toMatch(/\)$/);
    expect(edgePath(container).getAttribute('marker-end')).toMatch(/\)$/);
    const extra = container.querySelector(`[data-count-extra-of="${arrow.id}"]`) as Element;
    expect(extra.querySelector('text')?.textContent).toBe('7');
    expect(extra.closest('[aria-hidden="true"]')).not.toBeNull(); // the pair's one spoken name is on the line itself
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

  it('a caption is written under its box from LOD 1 on, as text', () => {
    const shown = draw(scene, { lod: 1, marks: marks({ captions: new Map([[hub.id, '4 within the family']]) }) });
    expect(shown.container.querySelector(`[data-caption-of="${hub.id}"]`)?.textContent).toBe('4 within the family');
    cleanup();
    expect(draw(scene, { lod: 0, marks: marks({ captions: new Map([[hub.id, '4 within the family']]) }) }).container.querySelector('[data-caption-of]')).toBeNull();
  });

  it('without marks nothing is faded, captioned or marked', () => {
    const { container } = draw(scene, { lod: 2 });
    expect(container.querySelector('[data-faded], [data-caption-of], [data-role], [data-count-extra-of]')).toBeNull();
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
