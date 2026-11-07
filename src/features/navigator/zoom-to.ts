/** Moves the map's view to a target in 200 ms (none with reduced motion), step 8.4b, E2c. The person moving the view meanwhile wins: the move stops. */
import type { Viewport } from '@/render/viewport';

export const ZOOM_MOVE_MS = 200;

export interface MovableView {
  readonly current: () => Viewport;
  readonly setViewport: (view: Viewport) => void;
}

export interface MoveDeps {
  readonly reduced: boolean;
  readonly raf: (run: (now: number) => void) => number;
  readonly now: () => number;
}

export function animateView(view: MovableView, target: Viewport, deps: MoveDeps): void {
  if (deps.reduced) {
    view.setViewport(target);
    return;
  }
  const from = view.current();
  const started = deps.now();
  let last = from;
  const step = (now: number): void => {
    const current = view.current();
    if (current.x !== last.x || current.y !== last.y || current.scale !== last.scale) return; // moved by someone else: leave it
    const t = Math.min(1, (now - started) / ZOOM_MOVE_MS);
    const k = t * (2 - t);
    view.setViewport(t >= 1 ? target : { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, scale: from.scale + (target.scale - from.scale) * k });
    last = view.current();
    if (t < 1) deps.raf(step);
  };
  deps.raf(step);
}
