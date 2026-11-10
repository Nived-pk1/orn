/** The rule behind the free areas (step 8.4e, A3): pure, so it is tested without a browser. Rectangles are relative to the map area. */
import type { Insets } from '@/render/viewport';
import { FIT_PADDING } from '@/render/viewport';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Area {
  readonly width: number;
  readonly height: number;
}

/** The gap kept between a control and the boxes. */
export const CONTROL_GAP = 8;
/** The smallest room on the top and bottom when no control needs more (the sides keep FIT_PADDING). */
const MIN_VERTICAL = 16;
/** More controls than this are not tried both ways (2^n choices): each keeps the edge its shape suggests. */
const MAX_CHOICES = 8;

type Side = 'top' | 'right' | 'bottom' | 'left';

/** How much room a control takes from one side of the area. */
function cost(c: Box, side: Side, area: Area): number {
  switch (side) {
    case 'top':
      return Math.ceil(c.y + c.h + CONTROL_GAP);
    case 'bottom':
      return Math.ceil(area.height - c.y + CONTROL_GAP);
    case 'left':
      return Math.ceil(c.x + c.w + CONTROL_GAP);
    case 'right':
      return Math.ceil(area.width - c.x + CONTROL_GAP);
  }
}

const verticalOf = (c: Box, area: Area): Side => (c.y + c.h / 2 < area.height / 2 ? 'top' : 'bottom');
const horizontalOf = (c: Box, area: Area): Side => (c.x + c.w / 2 < area.width / 2 ? 'left' : 'right');
/** By shape: a wide control is a bar (top or bottom), a tall one a stack (left or right). */
const shapeSide = (c: Box, area: Area): Side => (c.w >= c.h ? verticalOf(c, area) : horizontalOf(c, area));

function insetsFor(taken: readonly (readonly [Box, Side])[], area: Area): Insets {
  const room = { top: MIN_VERTICAL, right: FIT_PADDING, bottom: MIN_VERTICAL, left: FIT_PADDING };
  for (const [control, side] of taken) room[side] = Math.max(room[side], cost(control, side, area));
  return room;
}

/** The zoom at which `content` fits what the insets leave (at least 0: no room at all is the worst). */
function fitScale(insets: Insets, area: Area, content: Area): number {
  const w = area.width - insets.left - insets.right;
  const h = area.height - insets.top - insets.bottom;
  return w <= 0 || h <= 0 ? 0 : Math.min(w / Math.max(1, content.width), h / Math.max(1, content.height));
}

/**
 * The room Fit leaves on each side. Without `content` (the size of what Fit shows, in map units) each control takes the edge its shape
 * suggests. With it, a control that sits in a corner may take either of its two edges: the choice that lets the content fit LARGEST wins
 * (a map limited by its width gives the zoom stack the bottom, one limited by its height gives it the right side), ties going to the
 * smaller total. Any choice keeps every control clear of the content, so the rule of A3 holds either way.
 */
export function insetsOf(controls: readonly Box[], area: Area, content?: Area): Insets {
  const shown = controls.filter((c) => c.w > 0 && c.h > 0);
  const shaped = shown.map((c): readonly [Box, Side] => [c, shapeSide(c, area)]);
  if (content === undefined || shown.length > MAX_CHOICES) return insetsFor(shaped, area);
  let best = insetsFor(shaped, area);
  let bestScale = fitScale(best, area, content);
  const total = (i: Insets): number => i.top + i.right + i.bottom + i.left;
  for (let mask = 0; mask < 1 << shown.length; mask += 1) {
    const taken = shown.map((c, at): readonly [Box, Side] => [c, (mask >> at) & 1 ? horizontalOf(c, area) : verticalOf(c, area)]);
    const insets = insetsFor(taken, area);
    const scale = fitScale(insets, area, content);
    if (scale > bestScale + 1e-9 || (Math.abs(scale - bestScale) <= 1e-9 && total(insets) < total(best))) {
      best = insets;
      bestScale = scale;
    }
  }
  return best;
}
