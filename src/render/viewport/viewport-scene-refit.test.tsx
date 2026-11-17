// @vitest-environment jsdom
/**
 * Step 8.4m2 (B1): while the view is the automatic fit, ANY change of the area's size or of the boxes shown fits again, to the NEW size, the NEW
 * insets. The size is read where the fit is made (the ResizeObserver's own measure can come a frame later). A change of the boxes alone does NOT refit on a
 * wide screen (a hover changes the drawn boxes; step 8.4m M1). After a pan or zoom by hand nothing moves.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoNavigatorScene } from '@/test-support/svg-kit';
import { manualFrames } from '@/test-support/viewport-kit';
import type { ViewportController } from './controller';
import { fitBox, toTransformAttribute } from './transform';
import type { Insets, Rect } from './contracts';
import { ViewportScene } from './viewport-scene';

const frames = manualFrames();
const scene = demoNavigatorScene(true);
const INSETS: Insets = { top: 40, right: 20, bottom: 30, left: 10 };
let size = { width: 1000, height: 600 };
const rect = (): DOMRect => ({ x: 0, y: 0, left: 0, top: 0, right: size.width, bottom: size.height, width: size.width, height: size.height, toJSON: () => ({}) });

beforeEach(() => {
  size = { width: 1000, height: 600 };
  vi.stubGlobal('requestAnimationFrame', frames.schedule);
  vi.stubGlobal('cancelAnimationFrame', frames.cancel);
  vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockImplementation(rect);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(first: { box: Rect; epoch: number }) {
  let controller: ViewportController | null = null;
  const onController = (next: ViewportController | null): void => void (controller = next);
  const tree = (box: Rect, epoch: number) => (
    <ViewportScene scene={scene} selectedIds={new Set()} ariaLabel="Test" onController={onController} fitBox={box} fitInsets={INSETS} fitEpoch={epoch} />
  );
  const view = render(tree(first.box, first.epoch));
  const world = view.container.querySelector('[data-world]') as SVGGElement;
  act(() => frames.run());
  return {
    world,
    again: (box: Rect, epoch: number) => {
      view.rerender(tree(box, epoch));
      act(() => frames.run());
    },
    controller: () => controller as unknown as ViewportController,
  };
}

const BOX_A: Rect = { x0: 100, y0: 100, x1: 900, y1: 500 };
const BOX_B: Rect = { x0: 0, y0: 0, x1: 2400, y1: 1500 };

describe('the automatic fit follows the area and the boxes (step 8.4m2, B1)', () => {
  it('a change of the area fits to the size it has NOW, even before the observer has measured it', () => {
    const { world, again } = mount({ box: BOX_A, epoch: 0 });
    expect(world.getAttribute('transform')).toBe(toTransformAttribute(fitBox(BOX_A, { width: 1000, height: 600 }, INSETS)));
    size = { width: 520, height: 600 };
    again(BOX_A, 1);
    expect(world.getAttribute('transform')).toBe(toTransformAttribute(fitBox(BOX_A, { width: 520, height: 600 }, INSETS)));
  });

  it('after a zoom by hand neither a new size nor new boxes move the view', () => {
    const { world, again, controller } = mount({ box: BOX_A, epoch: 0 });
    act(() => controller().zoomIn());
    act(() => frames.run());
    const kept = world.getAttribute('transform');
    size = { width: 520, height: 600 };
    again(BOX_B, 1);
    expect(world.getAttribute('transform')).toBe(kept);
  });
});
