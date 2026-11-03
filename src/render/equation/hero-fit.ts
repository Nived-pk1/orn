/**
 * How the hero equation of the inspector fits its box (step 8.1, review decision 0 and 1). Pure arithmetic on measured numbers: no
 * chemistry, no DOM. The hero NEVER wraps: one row (reactants, arrow with its words, products), scaled down to the width when the drawings
 * stay at least MIN_DRAWING_PX tall; otherwise the vertical layout the phone card uses. In the sheet's peek it is one row at most
 * PEEK_MAX_HEIGHT high, scaled to fit, and when it cannot be read that way (more than two reactants or two products, or drawings under
 * PEEK_MIN_DRAWING_PX after scaling) the one-line text equation is shown instead.
 */
export const MIN_DRAWING_PX = 80;
/** With no drawing (formulas only) the row may shrink to this fraction of its size. */
export const MIN_FORMULA_SCALE = 0.6;
export const PEEK_MAX_HEIGHT = 120;
export const PEEK_MIN_DRAWING_PX = 40;

export interface HeroMeasure {
  /** The width the hero may use. */
  readonly available: number;
  /** The natural width and height of the one-row equation at scale 1. */
  readonly width: number;
  readonly height: number;
  /** The tallest structure drawing in the row at scale 1 (0: no drawing). */
  readonly drawingHeight: number;
}
export type HeroFit = { readonly mode: 'row'; readonly scale: number } | { readonly mode: 'stacked' } | { readonly mode: 'text' };

export function fitHero(measure: HeroMeasure, peek?: { readonly peek: true; readonly reactants: number; readonly products: number }): HeroFit {
  const { available, width, height, drawingHeight } = measure;
  if (width <= 0 || height <= 0 || available <= 0) return { mode: 'row', scale: 1 };
  if (peek !== undefined) {
    if (peek.reactants > 2 || peek.products > 2) return { mode: 'text' };
    const scale = Math.min(1, available / width, PEEK_MAX_HEIGHT / height);
    return drawingHeight * scale < (drawingHeight === 0 ? 0 : PEEK_MIN_DRAWING_PX) ? { mode: 'text' } : { mode: 'row', scale };
  }
  const scale = Math.min(1, available / width);
  if (scale >= 1) return { mode: 'row', scale: 1 };
  const legible = drawingHeight === 0 ? scale >= MIN_FORMULA_SCALE : drawingHeight * scale >= MIN_DRAWING_PX;
  return legible ? { mode: 'row', scale } : { mode: 'stacked' };
}
