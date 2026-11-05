/**
 * Keeping the keyboard focus on screen (step 5.7, item f): when the arrow keys move the focus to a family that is not fully in the
 * window, the drawing moves to centre it at the SAME scale (a command, not a zoom). Pure: the viewport, the window size and the
 * family's box in, a new viewport or undefined (already visible) out.
 */
import type { Viewport } from '@/render/scene';

const MARGIN = 16;

export function viewportToReveal(
  view: Viewport,
  size: { readonly width: number; readonly height: number },
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Viewport | undefined {
  if (size.width <= 0 || size.height <= 0) return undefined;
  const left = box.x * view.scale + view.x;
  const top = box.y * view.scale + view.y;
  const right = left + box.width * view.scale;
  const bottom = top + box.height * view.scale;
  if (left >= MARGIN && top >= MARGIN && right <= size.width - MARGIN && bottom <= size.height - MARGIN) return undefined;
  return {
    scale: view.scale,
    x: size.width / 2 - (box.x + box.width / 2) * view.scale,
    y: size.height / 2 - (box.y + box.height / 2) * view.scale,
  };
}
