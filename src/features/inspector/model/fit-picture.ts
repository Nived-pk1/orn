/**
 * "Open full size" geometry (step 6.5b follow-up G1): the picture is fitted into the screen's free area, keeping its shape, enlarged at most
 * `FULL_SIZE_MAX_SCALE` times its natural size (a small sketch must become readable, never blurry), shrunk when it does not fit. The inspector's
 * own figure is never enlarged: that rule is CSS and stays.
 */
export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

export const FULL_SIZE_MAX_SCALE = 2;

export function fitPicture(natural: PixelSize, area: PixelSize): PixelSize | undefined {
  if (!(natural.width > 0 && natural.height > 0 && area.width > 0 && area.height > 0)) return undefined;
  const scale = Math.min(area.width / natural.width, area.height / natural.height, FULL_SIZE_MAX_SCALE);
  return { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) };
}
