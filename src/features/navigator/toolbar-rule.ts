/**
 * The map toolbar's one-row rule (step 8.3b, A1; ADR-044 addendum). The row is one line: the zoom buttons, the chapter select, Find, From A to B,
 * Open family, Key and More. When it is too narrow, From A to B goes into More first, then Open family. Pure: the width comes from the toolbar's
 * own measured size, so the rule needs no window size.
 */

/** The map width at which the floating bar keeps From A to B: chapter select (260), Find (36), From A to B (110), More (72), gaps, padding (step 8.4e: the bar floats, so this is the map's width, and only `chain` is used). */
export const TOOLBAR_FULL_WIDTH = 620;
/** What the row gains when the button moves into More (its width and one gap). */
export const TOOLBAR_MOVE_SAVES = { chain: 128, open: 128 } as const;

export type MovedButton = 'chain' | 'open';

export function movedToMore(width: number): readonly MovedButton[] {
  const room = Number.isFinite(width) ? width : 0;
  if (room >= TOOLBAR_FULL_WIDTH) return [];
  if (room >= TOOLBAR_FULL_WIDTH - TOOLBAR_MOVE_SAVES.chain) return ['chain'];
  return ['chain', 'open'];
}
