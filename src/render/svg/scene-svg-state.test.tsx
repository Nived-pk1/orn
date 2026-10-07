// @vitest-environment jsdom
/**
 * Selection, focus and depictions of the SVG renderer (step 5.4a): the overlay draws selection and focus and nothing else does (render
 * counters), a depiction is only ever an `<image href>`, and the name shows while it loads, times out or is unavailable.
 */
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Scene, SceneNode } from '@/render/scene';
import { createDepictionManager, type DepictionAnswer } from '@/render/svg';
import { demoNavigatorScene, draw, stubSource } from '@/test-support/svg-kit';

afterEach(cleanup);

const all = (root: Element, selector: string): Element[] => [...root.querySelectorAll(selector)];
const scene = demoNavigatorScene(true, true);
const withKeys = scene.nodes.filter((n) => n.depictionKey !== undefined);
const target = withKeys[0] as SceneNode;
const labelOf = (root: Element, id: string): string => (root.querySelector(`[data-label-of="${id}"]`)?.textContent ?? '').trim();

describe('selection and focus: drawn by the overlay only', () => {
  const [a, b] = scene.nodes as [SceneNode, SceneNode];
  const e = scene.edges[0] as Scene['edges'][number];

  it('draws a solid outline around each selected node, along each selected edge, and a dashed ring on the focused one', () => {
    const { container } = draw(scene, { selectedIds: new Set([a.id, e.id]), focusedId: b.id });
    const selected = all(container, '[data-overlay="selected"]');
    expect(selected.map((el) => el.getAttribute('data-overlay-id'))).toEqual([a.id, e.id]);
    const box = selected[0] as Element;
    expect(Number(box.getAttribute('x'))).toBeLessThan(a.x);
    expect(Number(box.getAttribute('width'))).toBeGreaterThan(a.width);
    expect(selected[1]?.tagName.toLowerCase()).toBe('path');
    const ring = all(container, '[data-overlay="focus"]');
    expect(ring.map((el) => el.getAttribute('data-overlay-id'))).toEqual([b.id]);
    expect(ring[0]?.getAttribute('class')).toContain('focus');
    expect(selected[0]?.getAttribute('class')).toContain('selected');
  });

  it('nothing outside the overlay layer says anything about selection or focus', () => {
    const { container } = draw(scene, { selectedIds: new Set([a.id]), focusedId: a.id });
    expect(all(container, '[data-overlay]').every((el) => el.closest('[data-layer="overlay"]') !== null)).toBe(true);
    for (const layer of ['edges', 'nodes', 'labels', 'badges']) expect(container.querySelector(`[data-layer="${layer}"] [data-overlay], [data-layer="${layer}"] [aria-selected], [data-layer="${layer}"] [aria-current]`)).toBeNull();
  });

  it('draws nothing for an id that is not in the Scene, or not drawn at this LOD', () => {
    const member = scene.nodes.find((n) => n.minLod === 1) as SceneNode;
    const { container } = draw(scene, { lod: 0, selectedIds: new Set(['no_such_id', member.id]), focusedId: member.id });
    expect(all(container, '[data-overlay]')).toHaveLength(0);
  });

  it('the overlay does not take pointer events (hit testing is on the nodes and edges)', () => {
    const { container } = draw(scene, { selectedIds: new Set([a.id]) });
    expect((container.querySelector('[data-layer="overlay"]') as Element).getAttribute('pointer-events')).toBe('none');
  });
});

describe('render counters: a selection or focus change re-renders the overlay and nothing else', () => {
  it('the first render commits every layer once', () => {
    const view = draw(scene);
    expect(view.drain().sort()).toEqual(['badges', 'edges', 'labels', 'nodes', 'overlay']);
  });

  it('a change of the selected ids commits the overlay only', () => {
    const view = draw(scene);
    view.drain();
    view.rerender({ selectedIds: new Set([scene.nodes[0]?.id as string]) });
    expect(view.drain()).toEqual(['overlay']);
    view.rerender({ selectedIds: new Set([scene.nodes[1]?.id as string, scene.edges[0]?.id as string]) });
    expect(view.drain()).toEqual(['overlay']);
  });

  it('a change of the focused id commits the overlay only', () => {
    const view = draw(scene);
    view.drain();
    view.rerender({ focusedId: scene.nodes[2]?.id as string });
    expect(view.drain()).toEqual(['overlay']);
    view.rerender({ focusedId: undefined });
    expect(view.drain()).toEqual(['overlay']);
  });

  it('a render with the same props commits no layer at all', () => {
    const view = draw(scene);
    view.drain();
    view.rerender({});
    expect(view.drain()).toEqual([]);
  });

  it('a change of the LOD or of the Scene commits the layers that depend on it', () => {
    const view = draw(scene, { lod: 2 });
    view.drain();
    view.rerender({ lod: 3 });
    expect(view.drain().sort()).toEqual(['badges', 'edges', 'labels', 'nodes', 'overlay']);
    view.rerender({ scene: { ...scene } });
    expect(view.drain().sort()).toEqual(['badges', 'edges', 'labels', 'nodes', 'overlay']);
  });
});

describe('depictions (SECURITY §2: only ever an image)', () => {
  it('the demo scene has species with depiction keys', () => {
    expect(withKeys.length).toBeGreaterThan(0);
  });

  it('a ready depiction at LOD 3 is one <image href> in the node and the name gives way to it', () => {
    const source = stubSource({ [target.depictionKey as string]: { state: 'ready', url: 'blob:test/1' } });
    const { container } = draw(scene, { lod: 3, depictions: source });
    const images = all(container, 'image');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('href')).toBe('blob:test/1');
    expect(images[0]?.closest('[data-node-id]')?.getAttribute('data-node-id')).toBe(target.id);
    expect([...(images[0] as Element).attributes].map((attr) => attr.name).sort()).toEqual(['class', 'height', 'href', 'preserveAspectRatio', 'width', 'x', 'y']);
    expect(images[0]?.children).toHaveLength(0);
    expect(container.querySelector(`[data-label-of="${target.id}"]`)).toBeNull();
    expect(all(container, 'svg')).toHaveLength(1);
    // The accessible name and the title still say what it is.
    expect(container.querySelector(`[data-node-id="${target.id}"]`)?.getAttribute('aria-label')).toBe(target.ariaLabel);
  });

  it('asks for the depictions of the nodes it draws at LOD 3, and for none at a lower LOD', () => {
    const at3 = stubSource();
    draw(scene, { lod: 3, depictions: at3 });
    expect([...new Set(at3.requested)].sort()).toEqual(withKeys.map((n) => n.depictionKey as string).sort());
    cleanup();
    for (const lod of [0, 1, 2] as const) {
      const source = stubSource({ [target.depictionKey as string]: { state: 'ready', url: 'blob:test/1' } });
      const { container } = draw(scene, { lod, depictions: source });
      expect(source.requested).toEqual([]);
      expect(all(container, 'image')).toHaveLength(0);
      cleanup();
    }
  });

  it('while loading, idle or unavailable the node shows its name and formula, and nothing says "error"', () => {
    for (const status of [{ state: 'idle' }, { state: 'loading' }, { state: 'unavailable', reason: 'timeout' }] as const) {
      const source = stubSource({ [target.depictionKey as string]: status });
      const { container } = draw(scene, { lod: 3, depictions: source });
      expect(all(container, 'image')).toHaveLength(0);
      expect(labelOf(container, target.id)).toContain(target.label.map((run) => run.text).join(''));
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.textContent?.toLowerCase()).not.toContain('error');
      cleanup();
    }
  });

  it('swaps in the image when the status changes, re-rendering that node only', () => {
    const source = stubSource({ [target.depictionKey as string]: { state: 'loading' } });
    const view = draw(scene, { lod: 3, depictions: source });
    view.drain();
    act(() => source.set(target.depictionKey as string, { state: 'ready', url: 'blob:test/9' }));
    expect(all(view.container, 'image')).toHaveLength(1);
    expect(view.container.querySelector(`[data-label-of="${target.id}"]`)).toBeNull();
    // A status change of one node is not a layer commit of the whole drawing.
    expect(view.drain()).toEqual([]);
  });

  it('with the real manager: loading, then a timeout shows the name; a hostile SVG text never reaches the DOM', async () => {
    const timers: (() => void)[] = [];
    const urls: string[] = [];
    const answers = new Map<string, (answer: DepictionAnswer) => void>();
    const manager = createDepictionManager({
      fetchSvg: (key) => new Promise<DepictionAnswer>((resolve) => answers.set(key, resolve)),
      createUrl: (svg) => {
        urls.push(svg);
        return 'blob:test/real';
      },
      revokeUrl: () => undefined,
      setTimer: (callback) => timers.push(callback),
      clearTimer: () => undefined,
    });
    const first = withKeys[0] as SceneNode;
    const second = withKeys[1] as SceneNode;
    const { container } = draw(scene, { lod: 3, depictions: manager });
    expect(all(container, 'image')).toHaveLength(0);
    expect(labelOf(container, first.id)).not.toBe('');
    // The first key never answers: its timer fires.
    await act(async () => {
      timers[0]?.();
    });
    expect(all(container, 'image')).toHaveLength(0);
    expect(labelOf(container, first.id)).not.toBe('');
    // The second answers with hostile SVG text: only an image URL comes out.
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div onclick="x()"></div></foreignObject></svg>';
    await act(async () => {
      answers.get(second.depictionKey as string)?.({ ok: true, svg: hostile });
    });
    expect(urls).toEqual([hostile]);
    const images = all(container, 'image');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('href')).toBe('blob:test/real');
    for (const tag of ['script', 'foreignObject', 'div']) expect(container.querySelector(tag), tag).toBeNull();
    expect(all(container, 'svg')).toHaveLength(1);
    manager.dispose();
  });
});
