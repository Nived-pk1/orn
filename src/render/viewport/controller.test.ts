import { describe, expect, it } from 'vitest';
import { RENDER_BUDGET } from '@/render/scene';
import { manualFrames, SCREEN, syntheticScene } from '@/test-support/viewport-kit';
import { createViewportController } from './controller';
import { createViewportStore } from './store';

function setup(nodes = 50, edges = 80, extent = 3000) {
  const frames = manualFrames();
  const store = createViewportStore();
  const writes: string[] = [];
  const candidates: { keys: readonly string[]; lod: number }[] = [];
  const adopted: unknown[] = [];
  const controller = createViewportController({
    store,
    write: (t) => void writes.push(t),
    schedule: frames.schedule,
    cancel: frames.cancel,
    onCommand: (v) => void adopted.push(v),
    onFrame: (keys, lod) => void candidates.push({ keys, lod }),
  });
  controller.setScene(syntheticScene(nodes, edges, 2, extent));
  controller.setSize(SCREEN);
  return { frames, store, writes, controller, candidates, adopted };
}

describe('viewport controller', () => {
  it('writes one transform per frame however many gestures arrive', () => {
    const { frames, writes, controller } = setup();
    frames.run();
    const before = writes.length;
    for (let i = 0; i < 200; i++) controller.gesture({ x: i, y: i, scale: 1 });
    expect(frames.pending()).toBe(true);
    frames.run();
    expect(writes.length - before).toBe(1);
    expect(writes.at(-1)).toBe('translate(199 199) scale(1)');
    frames.run();
    expect(writes.length - before).toBe(1);
  });

  it('writes nothing when a frame finds the viewport unchanged', () => {
    const { frames, writes, controller } = setup();
    frames.run();
    controller.setSize({ width: 1300, height: 800 });
    frames.run();
    expect(writes).toHaveLength(1);
    expect(controller.stats()).toEqual({ writes: 1, frames: 2 });
  });

  it('zooms in and out about the centre, within the scale limits, and tells d3 about each command', () => {
    const { frames, controller, adopted } = setup();
    controller.zoomIn();
    expect(controller.current().scale).toBeCloseTo(1.25);
    controller.zoomOut();
    controller.zoomOut();
    expect(controller.current().scale).toBeCloseTo(0.8);
    for (let i = 0; i < 60; i++) controller.zoomIn();
    expect(controller.current().scale).toBe(4);
    expect(adopted).toHaveLength(63);
    frames.run();
  });

  it('fits, and focuses on a selection; unknown ids move nothing and say so', () => {
    const { frames, controller, store } = setup();
    controller.fit();
    frames.run();
    const fitted = controller.current();
    expect(fitted.scale).toBeLessThan(1);
    expect(controller.focus(['no-such-node'])).toBe(false);
    expect(controller.current()).toEqual(fitted);
    expect(controller.focus(['n3', 'n4'])).toBe(true);
    frames.run();
    expect(store.get().viewport).toEqual(controller.current());
    expect(controller.current().scale).toBeGreaterThan(fitted.scale);
  });

  it('puts the LOD in the store and offers depictions only at LOD 3', () => {
    const { frames, store, controller, candidates } = setup(900, 1500, 8000);
    controller.gesture({ x: 0, y: 0, scale: 0.05 });
    frames.run();
    expect(store.get().lod).toBe(0);
    expect(candidates.at(-1)).toEqual({ keys: [], lod: 0 });
    controller.gesture({ x: 0, y: 0, scale: 2 });
    frames.run();
    expect(store.get().visibleNodes).toBeLessThan(RENDER_BUDGET.maxVisibleNodes);
    expect(store.get()).toMatchObject({ lod: 3, capped: false });
    expect(candidates.at(-1)?.keys.length).toBeGreaterThan(0);
  });

  it('caps the level at 1 over the budget, says so, and offers no depictions there', () => {
    const { frames, store, controller, candidates } = setup(900, 1500, 3000);
    controller.gesture({ x: 0, y: 0, scale: 1 });
    controller.setSize({ width: 6000, height: 6000 });
    frames.run();
    expect(store.get().visibleNodes).toBeGreaterThan(RENDER_BUDGET.maxVisibleNodes);
    expect(store.get()).toMatchObject({ lod: 1, capped: true });
    expect(candidates.at(-1)).toEqual({ keys: [], lod: 1 });
  });

  it('stops after dispose and cancels the frame it queued', () => {
    const { frames, controller, writes } = setup();
    controller.dispose();
    expect(frames.pending()).toBe(false);
    controller.gesture({ x: 5, y: 5, scale: 1 });
    frames.run();
    expect(writes).toHaveLength(0);
  });
});
