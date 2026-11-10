/**
 * What "Zoom to selection" fills the map with (step 8.4b, E2b): the FOCUS SET (what is selected plus the far ends of its drawn arrows, the families of a
 * chain, the outlined families of a busy selection). Pure: sizes and rectangles in, a rectangle out.
 */
import { FIT_BOTTOM_PADDING, FIT_PADDING, FIT_TOP_PADDING, fitBox, type Insets, type Rect, type Size } from '@/render/viewport';

export interface ZoomChoice {
  readonly focus: Rect | undefined;
  readonly size: Size;
  /** The box title's size in map units. */
  readonly titleSize: number;
  readonly minTitlePx: number;
  /** The selected box: when even the focus set cannot keep titles at `minTitlePx`, the view uses that size, centres on the focus set and moves just enough to show this box fully (far ends may lie off the edge). */
  readonly selected?: Rect | undefined;
  /** The free areas the floating controls leave (measured; step 8.4e, A3). Absent: the constant bands. */
  readonly insets?: Insets | undefined;
}

/** The rectangle "Zoom to selection" fills the map with: the focus set, or (when its titles would be under the minimum) the minimum-title-size window, centred on the focus set and moved to show the selected box. */
export function zoomTargetRect(choice: ZoomChoice): Rect | undefined {
  const { focus } = choice;
  if (focus === undefined) return undefined;
  if (choice.titleSize * fitBox(focus, choice.size, choice.insets).scale >= choice.minTitlePx || choice.selected === undefined) return focus;
  const s = choice.minTitlePx / choice.titleSize;
  const { insets } = choice;
  const halfW = (choice.size.width - (insets === undefined ? 2 * FIT_PADDING : insets.left + insets.right)) / (2 * s);
  const halfH = (choice.size.height - (insets === undefined ? FIT_TOP_PADDING + FIT_BOTTOM_PADDING : insets.top + insets.bottom)) / (2 * s);
  // the window (it already keeps the fit padding, so the selected box inside it has its 24 px margin) is centred on the focus set, then moved just
  // enough that the SELECTED box is fully inside; a box larger than the window is centred instead
  const place = (lo: number, hi: number, half: number, from: number, to: number): [number, number] => {
    const centre = (lo + hi) / 2;
    if (to - from > 2 * half) return [(from + to) / 2 - half, (from + to) / 2 + half];
    const start = Math.min(Math.max(centre - half, to - 2 * half), from);
    return [start, start + 2 * half];
  };
  const [x0, x1] = place(focus.x0, focus.x1, halfW, choice.selected.x0, choice.selected.x1);
  const [y0, y1] = place(focus.y0, focus.y1, halfH, choice.selected.y0, choice.selected.y1);
  return { x0, y0, x1, y1 };
}

interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The smallest rectangle holding the selected boxes, the ends of the drawn arrows that touch them, and the outlined families; undefined when no selected box is known. */
export function focusSetOf(
  nodes: readonly Box[],
  set: { readonly ids: readonly string[]; readonly arrows: readonly { readonly from: string; readonly to: string }[]; readonly outlined: readonly string[] },
): Rect | undefined {
  const known = new Map(nodes.map((node) => [node.id, node]));
  const wanted = new Set(set.ids.filter((id) => known.has(id)));
  if (wanted.size === 0) return undefined;
  for (const arrow of set.arrows) {
    wanted.add(arrow.from);
    wanted.add(arrow.to);
  }
  for (const id of set.outlined) wanted.add(id);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of wanted) {
    const box = known.get(id);
    if (box === undefined) continue;
    x0 = Math.min(x0, box.x);
    y0 = Math.min(y0, box.y);
    x1 = Math.max(x1, box.x + box.width);
    y1 = Math.max(y1, box.y + box.height);
  }
  return { x0, y0, x1, y1 };
}
