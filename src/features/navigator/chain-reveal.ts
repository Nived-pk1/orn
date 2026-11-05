/**
 * The phone's "From A to B" sheet covers the bottom of the map (step 8.2b-fix, E2): the geometry that puts the chain above it. Its own chunk
 * (the hook `use-chain-reveal` loads it when a chain is chosen on a phone), so the first load does not carry it.
 */
import type { Viewport } from '@/render/scene';
import { viewportToReveal } from './reveal';

const MARGIN = 16;
type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/**
 * The phone's chain sheet covers the bottom `sheet` px of the map (step 8.2b-fix, E2): the chain's boxes must sit in the part above it. A pan at the
 * SAME scale when they fit there; only when they are too big for it, a zoom out just enough (never in). Undefined: they are in view already, or
 * there is nothing to show or no room.
 */
export function viewportAboveSheet(view: Viewport, size: { readonly width: number; readonly height: number }, sheet: number, boxes: readonly Box[]): Viewport | undefined {
  const height = size.height - sheet;
  if (boxes.length === 0 || size.width <= 0 || height <= 2 * MARGIN) return undefined;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  const union: Box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const room = { width: size.width - 2 * MARGIN, height: height - 2 * MARGIN };
  const scale = Math.min(view.scale, room.width / union.width, room.height / union.height);
  const shown = viewportToReveal({ ...view, scale }, { width: size.width, height }, union);
  if (scale === view.scale) return shown;
  return shown ?? { scale, x: view.x, y: view.y };
}
