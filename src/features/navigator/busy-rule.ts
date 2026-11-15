/** The ONE busy rule of the map (step 8.4b, C): a view that would draw more than this many arrows draws none (it outlines the families and lists the arrows in the panel). */
export const BUSY_ARROWS = 15;

/**
 * A SELECTED family is different (step 8.4m, M3): its lines are one per neighbour family and direction, so there are at most
 * 2 x (boxes - 1) of them; up to this many are drawn (the other families fade). Only above it does the old rule apply. A hover keeps BUSY_ARROWS.
 */
export const BUSY_SELECTED_LINES = 30;

/** `selected`: the lines are those of the family that is selected (the locked focus), not of a hover preview or a chapter. */
export const isBusy = (arrows: number, selected = false): boolean => arrows > (selected ? BUSY_SELECTED_LINES : BUSY_ARROWS);
