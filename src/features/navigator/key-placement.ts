/**
 * Where the in-map key sits (step 8.3b, A3): in the map's bottom-left corner, or the bottom-right when the left would cover a box. Pure over
 * the boxes' screen rectangles (relative to the map area), the key's size and the area's size.
 */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type KeyCorner = 'bottom-left' | 'bottom-right';

const INSET = 8;

const covers = (a: ScreenRect, b: ScreenRect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function keyPlacement(boxes: readonly ScreenRect[], key: { readonly width: number; readonly height: number }, area: { readonly width: number; readonly height: number }): KeyCorner {
  const y = area.height - key.height - INSET;
  const left: ScreenRect = { x: INSET, y, width: key.width, height: key.height };
  const right: ScreenRect = { x: area.width - key.width - INSET, y, width: key.width, height: key.height };
  const underLeft = boxes.filter((box) => covers(left, box)).length;
  if (underLeft === 0) return 'bottom-left';
  const underRight = boxes.filter((box) => covers(right, box)).length;
  return underRight < underLeft ? 'bottom-right' : 'bottom-left';
}
