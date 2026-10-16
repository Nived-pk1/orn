/** Pure viewport arithmetic (step 5.4b): clamp, zoom about a point, fit, focus, the world rectangle of the screen. */
import type { Rect, Size, Viewport } from './contracts';
import { LOD_HYSTERESIS } from './contracts';
import { LOD_THRESHOLDS } from '@/render/scene';
import { FIT_PADDING, FOCUS_MAX_SCALE, SCALE_MAX, SCALE_MIN } from './contracts';

export const IDENTITY: Viewport = { x: 0, y: 0, scale: 1 };

/** `min` is the smallest scale allowed (default `SCALE_MIN`; a phone passes `FIT_FLOOR`, so names never vanish). */
export const clampScale = (scale: number, min: number = SCALE_MIN): number => (Number.isFinite(scale) ? Math.min(SCALE_MAX, Math.max(min, scale)) : 1);

/** The part of the world the screen shows, in world units. */
export function worldRect(view: Viewport, size: Size): Rect {
  return { x0: -view.x / view.scale, y0: -view.y / view.scale, x1: (size.width - view.x) / view.scale, y1: (size.height - view.y) / view.scale };
}

export function growRect(rect: Rect, fraction: number): Rect {
  const dx = (rect.x1 - rect.x0) * fraction;
  const dy = (rect.y1 - rect.y0) * fraction;
  return { x0: rect.x0 - dx, y0: rect.y0 - dy, x1: rect.x1 + dx, y1: rect.y1 + dy };
}

/** Zooms by `factor` keeping the screen point (px, py) fixed. */
export function zoomAbout(view: Viewport, factor: number, px: number, py: number): Viewport {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

/** The viewport that shows `box` whole and centred, never above `maxScale`. An empty or degenerate screen answers identity. */
export function fitRect(box: Rect, size: Size, maxScale: number = SCALE_MAX, padding: number = FIT_PADDING): Viewport {
  const availableW = size.width - 2 * padding;
  const availableH = size.height - 2 * padding;
  if (availableW <= 0 || availableH <= 0) return IDENTITY;
  const boxW = Math.max(1, box.x1 - box.x0);
  const boxH = Math.max(1, box.y1 - box.y0);
  const scale = Math.min(maxScale, clampScale(Math.min(availableW / boxW, availableH / boxH)));
  return { scale, x: size.width / 2 - ((box.x0 + box.x1) / 2) * scale, y: size.height / 2 - ((box.y0 + box.y1) / 2) * scale };
}

/** Room above the LOD 1 entry point, so a fitted view is never on the edge of the level (release preview: names on the phone first view). */
const FIT_FLOOR_MARGIN = 0.01;

/**
 * The scale Fit and the first view never go below: the LOD 1 entry point INCLUDING the hysteresis (a view at the bare threshold stays at
 * LOD 0 coming from LOD 0, see `lodWithHysteresis`) plus a small margin, so the names are drawn.
 */
export const FIT_FLOOR = LOD_THRESHOLDS[1] * (1 + LOD_HYSTERESIS) + FIT_FLOOR_MARGIN;

/**
 * The viewport that shows the whole drawing (`Fit`). Step 5.5b (ADR-037): the fitted scale is never below `FIT_FLOOR` (inside LOD 1 for good), so a
 * drawing is never fitted into names nobody can read; a drawing too large for that scale is shown from its top-left corner (inside
 * the padding) and stays pannable.
 */
export function fitScene(bounds: Size, size: Size): Viewport {
  const fitted = fitRect({ x0: 0, y0: 0, x1: bounds.width, y1: bounds.height }, size);
  if (fitted.scale >= FIT_FLOOR) return fitted;
  return { scale: FIT_FLOOR, x: FIT_PADDING, y: FIT_PADDING };
}

export const focusRect = (box: Rect, size: Size): Viewport => fitRect(box, size, FOCUS_MAX_SCALE);

/** The viewport at `scale` that puts the world point `world` at the screen point `screen` (a toggled hub stays where it was). */
export const keepScreenPoint = (scale: number, world: { readonly x: number; readonly y: number }, screen: { readonly x: number; readonly y: number }): Viewport => {
  const s = clampScale(scale);
  return { scale: s, x: screen.x - world.x * s, y: screen.y - world.y * s };
};

/** Where a world point is on the screen under a viewport. */
export const toScreen = (view: Viewport, world: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } => ({ x: world.x * view.scale + view.x, y: world.y * view.scale + view.y });

export const sameViewport = (a: Viewport, b: Viewport): boolean => a.x === b.x && a.y === b.y && a.scale === b.scale;

export const toTransformAttribute = (view: Viewport): string => `translate(${view.x} ${view.y}) scale(${view.scale})`;
