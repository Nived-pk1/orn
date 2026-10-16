import { describe, expect, it } from 'vitest';
import { manualFrames, SCREEN, syntheticScene } from '@/test-support/viewport-kit';
import { createViewportController } from './controller';
import { createViewportStore } from './store';
import { clampScale, FIT_FLOOR } from './transform';

/** The phone's pinch cannot go below the name floor (ADR-039): the controller takes a minimum scale. */
function setup(minScale?: number) {
  const frames = manualFrames();
  const controller = createViewportController({
    store: createViewportStore(),
    write: () => undefined,
    schedule: frames.schedule,
    cancel: frames.cancel,
    ...(minScale === undefined ? {} : { minScale }),
  });
  controller.setScene(syntheticScene(50, 80, 2, 3000));
  controller.setSize(SCREEN);
  return controller;
}

describe('the minimum scale', () => {
  it('clampScale takes a minimum and defaults to the global one', () => {
    expect(clampScale(0.01)).toBe(0.05);
    expect(clampScale(0.01, FIT_FLOOR)).toBe(FIT_FLOOR);
    expect(clampScale(2, FIT_FLOOR)).toBe(2);
  });

  it('a pinch (a gesture) below the floor is held at the floor', () => {
    const controller = setup(FIT_FLOOR);
    controller.gesture({ x: 0, y: 0, scale: 0.1 });
    expect(controller.current().scale).toBe(FIT_FLOOR);
  });

  it('zooming out step by step stops at the floor', () => {
    const controller = setup(FIT_FLOOR);
    for (let i = 0; i < 40; i += 1) controller.zoomOut();
    expect(controller.current().scale).toBe(FIT_FLOOR);
  });

  it('without a minimum the old limit stays (the desktop is unchanged)', () => {
    const controller = setup();
    controller.gesture({ x: 0, y: 0, scale: 0.1 });
    expect(controller.current().scale).toBe(0.1);
    for (let i = 0; i < 40; i += 1) controller.zoomOut();
    expect(controller.current().scale).toBe(0.05);
  });
});
