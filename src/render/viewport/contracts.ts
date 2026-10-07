/**
 * The viewport's vocabulary (step 5.4b; UI_ARCHITECTURE §6, PERFORMANCE_ARCHITECTURE §6). The transform, the LOD and the visible
 * counts live in a store that is NOT React state: pan and zoom write ONE transform attribute per frame and render nothing.
 */
import type { LodLevel, Viewport } from '@/render/scene';

export type { Viewport };

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const SCALE_MIN = 0.05;
export const SCALE_MAX = 4;
export const ZOOM_STEP = 1.25;
export const FIT_PADDING = 24;
/** Focus never zooms in past this (a single node must not fill the screen). */
export const FOCUS_MAX_SCALE = 1.5;
/** The culling rectangle is the screen grown by this fraction of its size on every side. */
export const OVERSCAN = 0.5;
/** A level boundary is crossed only when the scale is 5% past it (no flicker at a threshold). */
export const LOD_HYSTERESIS = 0.05;
/** The still time before depictions are asked for, and the bound on requests in flight (4: the chem worker takes 16 calls, the rest is for checks; PROGRESS Q7). */
export const DEPICTION_STILL_MS = 250;
export const DEPICTION_MAX_PENDING = 4;

/** What the controller keeps current; readers subscribe to the store, React reads `lod` only. */
export interface ViewportState {
  readonly viewport: Viewport;
  readonly lod: LodLevel;
  /** True when the budget forced the level down (the UI says so; nothing silent). */
  readonly capped: boolean;
  /** Elements inside the culling rectangle. */
  readonly visibleNodes: number;
  readonly visibleEdges: number;
}

export interface ViewportStore {
  readonly get: () => ViewportState;
  readonly set: (next: ViewportState) => void;
  readonly subscribe: (listener: () => void) => () => void;
}
