// @vitest-environment jsdom
/**
 * The interactive drawing (step 5.4b): zero React renders and zero layer commits during pan and zoom (a Profiler and the layer
 * counters), one transform write per frame, commands move the world group, a level change renders once, depictions go through the queue.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerName } from '@/render/svg';
import { demoNavigatorScene } from '@/test-support/svg-kit';
import { stubSource } from '@/test-support/svg-kit';
import { manualFrames, syntheticScene } from '@/test-support/viewport-kit';
import type { ViewportController } from './controller';
import { ViewportScene } from './viewport-scene';

const frames = manualFrames();

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', frames.schedule);
  vi.stubGlobal('cancelAnimationFrame', frames.cancel);
  vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}) });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const scene = demoNavigatorScene(true);

function mount(extra: Partial<Parameters<typeof ViewportScene>[0]> = {}) {
  let controller: ViewportController | null = null;
  const commits: LayerName[] = [];
  let renders = 0;
  const onController = (next: ViewportController | null): void => {
    controller = next;
  };
  const onLayerCommit = (layer: LayerName): void => void commits.push(layer);
  const tree = (node: ReactNode): ReactNode => (
    <Profiler id="vp" onRender={() => void (renders += 1)}>
      {node}
    </Profiler>
  );
  const view = render(tree(<ViewportScene scene={scene} selectedIds={new Set()} ariaLabel="Test" onController={onController} onLayerCommit={onLayerCommit} {...extra} />));
  const world = view.container.querySelector('[data-world]') as SVGGElement;
  const svg = view.container.querySelector('svg') as SVGSVGElement;
  act(() => frames.run());
  return { view, world, svg, commits, renders: () => renders, controller: () => controller as unknown as ViewportController };
}

describe('the saved view and the delegated clicks (step 5.5a)', () => {
  it('shows a saved viewport instead of fitting the scene', () => {
    const { world } = mount({ initialViewport: { x: 12, y: 34, scale: 0.5 } });
    expect(world.getAttribute('transform')).toBe('translate(12 34) scale(0.5)');
  });

  it('reports the viewport once the view has been still, never per frame', () => {
    vi.useFakeTimers();
    try {
      const settled: { x: number; y: number; scale: number }[] = [];
      const { svg, controller } = mount({ onSettled: (view) => void settled.push(view) });
      vi.advanceTimersByTime(1000);
      settled.length = 0;
      for (let frame = 0; frame < 6; frame++) {
        for (let i = 0; i < 5; i++) fireEvent.wheel(svg, { deltaY: -1, clientX: 300 + i, clientY: 200 });
        act(() => frames.run());
        vi.advanceTimersByTime(100);
      }
      expect(settled).toHaveLength(0);
      vi.advanceTimersByTime(400);
      expect(settled).toHaveLength(1);
      expect(settled[0]).toEqual(controller().current());
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a move that is still pending when the drawing goes away', () => {
    vi.useFakeTimers();
    try {
      const settled: unknown[] = [];
      const { view, controller } = mount({ onSettled: (v) => void settled.push(v) });
      vi.advanceTimersByTime(1000);
      settled.length = 0;
      act(() => controller().zoomIn());
      act(() => void vi.advanceTimersByTime(50));
      view.unmount();
      expect(settled).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a click on a node or arrow to the one listener on the svg, and null for empty canvas', () => {
    const hits: unknown[] = [];
    const { svg } = mount({ onSceneClick: (hit) => void hits.push(hit) });
    const node = svg.querySelector('[data-node-id]') as Element;
    const edge = svg.querySelector('[data-edge-id] path') as Element;
    fireEvent.click(node.querySelector('rect') ?? node);
    fireEvent.click(edge);
    fireEvent.click(svg);
    expect(hits).toEqual([
      { kind: 'node', id: node.getAttribute('data-node-id') },
      { kind: 'edge', id: (edge.closest('[data-edge-id]') as Element).getAttribute('data-edge-id') },
      null,
    ]);
  });
});

describe('ViewportScene', () => {
  it('fits the scene on mount: one transform on the world group, a level in the store', () => {
    const { world, svg } = mount();
    expect(world.getAttribute('transform')).toMatch(/^translate\(.+\) scale\(.+\)$/);
    expect(svg.getAttribute('data-lod')).toMatch(/^[0-3]$/);
    expect(svg.hasAttribute('style')).toBe(false);
  });

  it('renders nothing during pan and zoom: no React commit, no layer commit, one transform write per frame', () => {
    const { world, svg, commits, renders, controller } = mount();
    const lod = svg.getAttribute('data-lod');
    const setAttribute = vi.spyOn(world, 'setAttribute');
    const baseRenders = renders();
    const baseCommits = commits.length;
    const before = world.getAttribute('transform');
    for (let frame = 0; frame < 5; frame++) {
      for (let i = 0; i < 20; i++) fireEvent.wheel(svg, { deltaY: i % 2 === 0 ? -1 : 1, clientX: 300 + i, clientY: 200 });
      act(() => frames.run());
    }
    expect(world.getAttribute('transform')).not.toBe(before);
    expect(setAttribute.mock.calls.filter(([name]) => name === 'transform').length).toBeLessThanOrEqual(5);
    expect(svg.getAttribute('data-lod')).toBe(lod);
    expect(renders()).toBe(baseRenders);
    expect(commits).toHaveLength(baseCommits);
    act(() => controller().zoomIn());
    act(() => frames.run());
    act(() => controller().zoomOut());
    act(() => frames.run());
    expect(renders()).toBe(baseRenders);
    expect(commits).toHaveLength(baseCommits);
  });

  it('moves the world group by commands: zoom in, fit, focus on a node', () => {
    const { world, controller } = mount();
    const fitted = world.getAttribute('transform');
    act(() => controller().zoomIn());
    act(() => frames.run());
    expect(world.getAttribute('transform')).not.toBe(fitted);
    act(() => controller().fit());
    act(() => frames.run());
    expect(world.getAttribute('transform')).toBe(fitted);
    const first = scene.nodes[0]?.id as string;
    act(() => void controller().focus([first]));
    act(() => frames.run());
    expect(world.getAttribute('transform')).not.toBe(fitted);
  });

  it('renders once when the level changes, and the layers follow the level', () => {
    const { svg, renders, controller } = mount();
    const before = renders();
    const lod = svg.getAttribute('data-lod');
    for (let i = 0; i < 12 && svg.getAttribute('data-lod') === lod; i++) {
      act(() => controller().zoomIn());
      act(() => frames.run());
    }
    expect(svg.getAttribute('data-lod')).not.toBe(lod);
    expect(renders()).toBeGreaterThan(before);
  });

  it('does not let the layers start depiction fetches: the queue asks, after stillness, for visible species at LOD 3 only', () => {
    vi.useFakeTimers();
    try {
      const stub = stubSource();
      // A real source is loading right after a request; the queue's bound counts what is loading.
      const source = { ...stub, request: (key: string) => (stub.request(key), stub.set(key, { state: 'loading' })) };
      const dense = syntheticScene(30, 20, 4, 1000);
      const { controller } = mount({ scene: dense, depictions: source });
      act(() => controller().focus(['n1']));
      act(() => frames.run());
      expect(stub.requested).toEqual([]);
      act(() => void vi.advanceTimersByTime(300));
      expect(stub.requested.length).toBe(4);
      expect(stub.requested.length).toBeLessThanOrEqual(4);
      expect(new Set(stub.requested).size).toBe(stub.requested.length);
    } finally {
      vi.useRealTimers();
    }
  });
});
