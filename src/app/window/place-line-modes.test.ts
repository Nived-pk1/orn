/** The inspector's "<name> has no place in this view" line is for the map only (step C: it must not show in Starred, where the record IS listed). */
import { describe, expect, it } from 'vitest';
import { CHAPTERS_MODE, EXPLORER_MODES, NAVIGATOR_MODE, STARRED_MODE, noPlaceLineIn } from './modes';

describe('noPlaceLineIn', () => {
  it('is true for Starred, Chapters and every explorer, false for the map', () => {
    expect(noPlaceLineIn(STARRED_MODE)).toBe(true);
    expect(noPlaceLineIn(CHAPTERS_MODE)).toBe(true);
    for (const mode of EXPLORER_MODES) expect(noPlaceLineIn(mode)).toBe(true);
    expect(noPlaceLineIn(NAVIGATOR_MODE)).toBe(false);
  });
});
