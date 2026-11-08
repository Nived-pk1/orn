/**
 * Marks grow with the map, within limits (step 8.4c, B; before: 8.4b drew every mark at one fixed screen size). A mark's size on the screen is its
 * size in map units times the zoom, clamped between a floor (what 8.4b guaranteed) and a ceiling (so a big map does not get clumsy marks).
 * The stylesheet states the same clamps in CSS (`cssClamp`), since the zoom is the CSS variable `--map-k` there; a test keeps the two alike.
 * Pure; no DOM.
 */
export interface Limit {
  /** Size in map units (px at zoom 1). */
  readonly base: number;
  readonly min: number;
  readonly max: number;
  readonly unit: 'px' | '';
}

export const MARK_LIMITS = {
  /** A line: 2 to 4 px. */
  stroke: { base: 2, min: 2, max: 4, unit: 'px' },
  /** A heavy line (a chain): 3 to 5 px. */
  heavy: { base: 3, min: 3, max: 5, unit: 'px' },
  /** The factor of an arrowhead (10 px at least, 16 at most). */
  head: { base: 1, min: 1, max: 1.6, unit: '' },
  /** The gap between the stroke edges of the two lines of a two-way pair: 8.5 to 16 px (the floor is 8 px and half a pixel of slack for drawing and measuring), 12 px per unit of zoom in between. */
  pairGap: { base: 12, min: 8.5, max: 16, unit: 'px' },
  /** The factor of a count chip and of reagent chips: 20 to 26.7 px across, text 12 to 16 px. */
  chip: { base: 1, min: 1, max: 4 / 3, unit: '' },
} as const satisfies Record<string, Limit>;

const clamp = (low: number, value: number, high: number): number => Math.min(high, Math.max(low, value));
const valid = (zoom: number): number => (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
const sized = (limit: Limit, zoom: number): number => clamp(limit.min, limit.base * valid(zoom), limit.max);

/** The stroke width on the screen, px (a light line is drawn like a normal one here; the stylesheet draws it thinner). */
export const strokePx = (weight: 'normal' | 'heavy' | 'light', zoom: number): number => sized(weight === 'heavy' ? MARK_LIMITS.heavy : MARK_LIMITS.stroke, zoom);

/** The factor an arrowhead is drawn at (10 px x factor). */
export const headFactor = (zoom: number): number => sized(MARK_LIMITS.head, zoom);
/** The factor a chip is drawn at (20 px x factor; text 12 px x factor). */
export const chipFactor = (zoom: number): number => sized(MARK_LIMITS.chip, zoom);

/** The hit area of a line: 16 px (28 for a finger) at least, wider as the line grows. */
export const hitPx = (zoom: number, touch: boolean): number => strokePx('normal', zoom) + (touch ? 26 : 14);

/** The gap between the stroke EDGES of the two lines of a two-way pair, screen px: 8 at least, 16 at most, growing with the zoom. */
export const pairGapPx = (zoom: number): number => sized(MARK_LIMITS.pairGap, zoom);

/**
 * The distance between the CENTRES of the two lines of a pair, in map units, so that the edges are `pairGapPx` apart on the screen. `stroke` is the
 * mean stroke of the two lines on the screen (default: a normal line).
 */
export const pairSeparationMap = (zoom: number, stroke: number = strokePx('normal', zoom)): number => Math.min(PAIR_SEPARATION_CAP, (pairGapPx(zoom) + stroke) / valid(zoom));

/**
 * The most the two lines of a pair are moved apart, in map units: the layout's `PORT_GAP` (a test keeps them equal). More would push the ends of
 * a pair into the slots of its neighbours on the same box side. Below a zoom of about 0.6 the stroke edges are therefore less than 8 px apart: the
 * limit is the room on the box side, and it is reported, not hidden.
 */
export const PAIR_SEPARATION_CAP = 20;

/** The CSS expression for a limit, as the stylesheet writes it (`var(--map-k)` is the zoom). */
export function cssClamp(limit: Limit): string {
  const u = limit.unit;
  const num = (n: number): string => `${Number(n.toFixed(4))}${u}`;
  return `clamp(${num(limit.min)}, ${limit.base === 1 && u === '' ? 'var(--map-k, 1)' : `calc(var(--map-k, 1) * ${num(limit.base)})`}, ${num(limit.max)})`;
}
