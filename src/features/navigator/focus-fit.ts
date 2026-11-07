/**
 * What "Zoom to selection" fills the map with (step 8.4b, E2b): the FOCUS SET (what is selected plus the far ends of its drawn arrows, the families of a
 * chain, the outlined families of a busy selection). Pure: sizes and rectangles in, a rectangle out.
 */
import { FIT_BOTTOM_PADDING, FIT_PADDING, FIT_TOP_PADDING, fitBox, type Rect, type Size } from '@/render/viewport';

export interface ZoomChoice {
  readonly focus: Rect | undefined;
  readonly size: Size;
  /** The box title's size in map units. */
  readonly titleSize: number;
  readonly minTitlePx: number;
  /** The selected box alone: when even the focus set cannot keep titles at `minTitlePx`, the view centres on it at exactly that size (the far ends may lie off the edge). */
  readonly selected?: Rect | undefined;
}

/** The rectangle "Zoom to selection" fills the map with: the focus set, or (when its titles would be under the minimum) the selected box at the minimum title size. */
export function zoomTargetRect(choice: ZoomChoice): Rect | undefined {
  const { focus } = choice;
  if (focus === undefined) return undefined;
  if (choice.titleSize * fitBox(focus, choice.size).scale >= choice.minTitlePx || choice.selected === undefined) return focus;
  const s = choice.minTitlePx / choice.titleSize;
  const cx = (choice.selected.x0 + choice.selected.x1) / 2;
  const cy = (choice.selected.y0 + choice.selected.y1) / 2;
  const halfW = (choice.size.width - 2 * FIT_PADDING) / (2 * s);
  const halfH = (choice.size.height - FIT_TOP_PADDING - FIT_BOTTOM_PADDING) / (2 * s);
  return { x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH };
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
