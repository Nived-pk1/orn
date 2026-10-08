/**
 * The self-loop glyph (decision Q4; ADV-005): the layout never sees a loop, so the builder draws it beside its node, on the
 * node's far side in reading direction (the right side; the scene's bounds grow to hold it). A loop is a small closed path
 * that leaves and re-enters the node box, with its label (the count) at the far end.
 */
import type { Point } from '@/layout/contracts';

export const LOOP_REACH = 28;

export interface LoopGeometry {
  readonly points: readonly Point[];
  readonly labelAt: Point;
}

/** Air between the far side of the loop and its label. */
const LOOP_LABEL_GAP = 2;

/** `box` is the node's top-left corner and size. The path goes out at 30% of the height and back in at 70%. */
export function loopGeometry(box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, label?: { readonly width: number; readonly height: number }): LoopGeometry {
  const right = box.x + box.width;
  const top = box.y + box.height * 0.3;
  const bottom = box.y + box.height * 0.7;
  const far = right + LOOP_REACH;
  return {
    points: [
      { x: right, y: top },
      { x: far, y: top },
      { x: far, y: bottom },
      { x: right, y: bottom },
    ],
    // With a label box (its width and height) the label sits to the right of the loop and stays at or below y = 0 (inside the bounds).
    labelAt: label === undefined ? { x: far, y: box.y + box.height / 2 } : { x: far + LOOP_LABEL_GAP + label.width / 2, y: Math.max(label.height / 2, box.y + box.height / 2) },
  };
}
