import { describe, expect, it } from 'vitest';
import { FULL_SIZE_MAX_SCALE, fitPicture } from './fit-picture';

describe('fitPicture (Open full size)', () => {
  const screen = { width: 1200, height: 600 };
  it('a large picture shrinks to fit the screen, keeping its shape', () => {
    expect(fitPicture({ width: 2400, height: 1200 }, screen)).toEqual({ width: 1200, height: 600 });
    expect(fitPicture({ width: 1000, height: 2000 }, screen)).toEqual({ width: 300, height: 600 });
  });
  it('a small picture is enlarged to fit, but never past 2x its natural size', () => {
    expect(FULL_SIZE_MAX_SCALE).toBe(2);
    expect(fitPicture({ width: 300, height: 200 }, screen)).toEqual({ width: 600, height: 400 });
    expect(fitPicture({ width: 400, height: 300 }, screen)).toEqual({ width: 800, height: 600 });
    expect(fitPicture({ width: 1100, height: 100 }, screen)).toEqual({ width: 1200, height: 109 });
  });
  it('a picture that is already the right size is left alone', () => {
    expect(fitPicture({ width: 1200, height: 600 }, screen)).toEqual({ width: 1200, height: 600 });
  });
  it('an unknown or empty size or screen gives nothing to draw', () => {
    expect(fitPicture({ width: 0, height: 10 }, screen)).toBeUndefined();
    expect(fitPicture({ width: 10, height: 10 }, { width: 0, height: 0 })).toBeUndefined();
  });
});
