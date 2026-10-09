/**
 * Count chips of the grid layout (step 5.5c). A chip sits at the middle of its line. When it would overlap a box or a chip placed
 * before it, it slides along the line to the first free place of `SLIDES` (fractions of the line's length). None free: the chip stays
 * at the middle and is counted. Edges are taken in id order, so the result does not depend on anything but the request.
 */
import type { LayoutEdgeInput, Point } from '../contracts';
import { overlaps, pointAt, type Rect } from './geometry';

export const SLIDES: readonly number[] = [0.5, 0.4, 0.6, 0.3, 0.7];
/** Air kept between a chip and whatever it must not overlap. */
export const CHIP_MARGIN = 2;

export interface ChipPlacement {
  /** Top-left corner of the label box, by edge id. */
  readonly positions: Readonly<Record<string, Point>>;
  readonly slid: number;
  readonly kept: number;
}

export function placeChips(
  edges: readonly LayoutEdgeInput[],
  routes: ReadonlyMap<string, readonly Point[]>,
  boxes: ReadonlyMap<string, Rect>,
): ChipPlacement {
  const nodes = [...boxes.values()];
  const placed: Rect[] = [];
  const positions: Record<string, Point> = {};
  let slid = 0;
  let kept = 0;
  for (const edge of edges) {
    const route = routes.get(edge.id);
    if (edge.label === undefined || route === undefined) continue;
    const { width, height } = edge.label;
    const around = (at: Point): Rect => ({ x: at.x - width / 2 - CHIP_MARGIN, y: at.y - height / 2 - CHIP_MARGIN, width: width + 2 * CHIP_MARGIN, height: height + 2 * CHIP_MARGIN });
    let chosen: Point | undefined;
    let index = 0;
    for (const fraction of SLIDES) {
      const at = pointAt(route, fraction);
      const area = around(at);
      if (!nodes.some((rect) => overlaps(area, rect)) && !placed.some((rect) => overlaps(area, rect))) {
        chosen = at;
        break;
      }
      index += 1;
    }
    if (chosen === undefined) {
      chosen = pointAt(route, SLIDES[0] as number);
      kept += 1;
    } else if (index > 0) slid += 1;
    placed.push(around(chosen));
    positions[edge.id] = { x: chosen.x - width / 2, y: chosen.y - height / 2 };
  }
  return { positions, slid, kept };
}
