/** The ONE busy rule of the map (step 8.4b, C): a view that would draw more than this many arrows draws none (it outlines the families and lists the arrows in the panel). */
export const BUSY_ARROWS = 15;

export const isBusy = (arrows: number): boolean => arrows > BUSY_ARROWS;
