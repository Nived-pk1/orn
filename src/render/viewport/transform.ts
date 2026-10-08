/** Pure viewport arithmetic (step 5.4b): clamp, zoom about a point, fit, focus, the world rectangle of the screen. */
import type { Rect, Size, Viewport } from './contracts';
import { FIT_PADDING, FOCUS_MAX_SCALE, SCALE_MAX, SCALE_MIN } from './contracts';

export const IDENTITY: Viewport = { x: 0, y: 0, scale: 1 };

export const clampScale = (scale: number): number => (Number.isFinite(scale) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale)) : 1);

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

export const fitScene = (bounds: Size, size: Size): Viewport => fitRect({ x0: 0, y0: 0, x1: bounds.width, y1: bounds.height }, size);

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
