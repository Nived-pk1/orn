import { describe, expect, it } from 'vitest';
import { LOD_THRESHOLDS } from '@/render/scene';
import { FIT_PADDING, SCALE_MAX, SCALE_MIN } from './contracts';
import { clampScale, fitRect, fitScene, focusRect, IDENTITY, toTransformAttribute, worldRect, zoomAbout, keepScreenPoint, toScreen } from './transform';

const size = { width: 1000, height: 600 };

describe('viewport arithmetic', () => {
  it('clamps the scale and survives garbage', () => {
    expect(clampScale(100)).toBe(SCALE_MAX);
    expect(clampScale(0)).toBe(SCALE_MIN);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it('zooms about a screen point and keeps it fixed', () => {
    const next = zoomAbout({ x: 40, y: 10, scale: 1 }, 2, 300, 200);
    expect((300 - next.x) / next.scale).toBeCloseTo(260);
    expect((200 - next.y) / next.scale).toBeCloseTo(190);
  });

  it('fits the scene whole and centred', () => {
    const rect = worldRect(fitScene({ width: 2000, height: 1000 }, size), size);
    expect(rect.x0).toBeLessThanOrEqual(0);
    expect(rect.x1).toBeGreaterThanOrEqual(2000);
    expect(rect.y0).toBeLessThanOrEqual(0);
    expect(rect.y1).toBeGreaterThanOrEqual(1000);
  });

  it('fits a drawing too large for the LOD 1 threshold at that threshold, from its top-left corner (ADR-037)', () => {
    const huge = fitScene({ width: 10_000, height: 8_000 }, size);
    expect(huge.scale).toBe(LOD_THRESHOLDS[1]);
    expect(huge).toEqual({ scale: LOD_THRESHOLDS[1], x: FIT_PADDING, y: FIT_PADDING });
    // The top-left of the drawing is on screen and the rest is reachable by panning.
    expect(worldRect(huge, size).x0).toBeLessThan(0);
    expect(worldRect(huge, size).x1).toBeLessThan(10_000);
  });

  it('a drawing that fits above the threshold is fitted whole and centred as before', () => {
    const view = fitScene({ width: 800, height: 400 }, size);
    expect(view.scale).toBeGreaterThanOrEqual(LOD_THRESHOLDS[1]);
    expect(worldRect(view, size).x1).toBeGreaterThanOrEqual(800);
  });

  it('never zooms a small box past the cap, and focus stops at 1.5', () => {
    const box = { x0: 100, y0: 100, x1: 140, y1: 120 };
    expect(fitRect(box, size).scale).toBe(SCALE_MAX);
    const view = focusRect(box, size);
    expect(view.scale).toBe(1.5);
    expect(view.x + 120 * view.scale).toBeCloseTo(size.width / 2);
  });

  it('answers identity for a screen too small for the padding and writes a transform attribute', () => {
    expect(fitRect({ x0: 0, y0: 0, x1: 10, y1: 10 }, { width: 10, height: 10 })).toEqual(IDENTITY);
    expect(toTransformAttribute({ x: 1, y: 2, scale: 3 })).toBe('translate(1 2) scale(3)');
  });
});

describe('keeping a world point on the screen (step 5.5a: a toggled hub stays where it was)', () => {
  it('puts the world point at the screen point at the given scale, and toScreen is its inverse', () => {
    const world = { x: 300, y: 120 };
    const screen = { x: 410, y: 222 };
    const view = keepScreenPoint(0.8, world, screen);
    expect(view.scale).toBe(0.8);
    expect(toScreen(view, world)).toEqual(screen);
  });

  it('clamps the scale like every other command', () => {
    expect(keepScreenPoint(100, { x: 0, y: 0 }, { x: 5, y: 5 }).scale).toBe(SCALE_MAX);
  });
});
