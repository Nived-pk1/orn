/** When the map model starts (step 8.4m, R1): Studio and a phone on its map tab at boot as before; Study only once the map is the screen. */
import { describe, expect, it } from 'vitest';
import { CHAPTERS_MODE, NAVIGATOR_MODE } from './modes';
import { mapWanted } from './map-wanted';

const base = { hasData: true, editing: false, phone: false, phoneTab: 'families', mode: NAVIGATOR_MODE, settled: true } as const;

describe('mapWanted', () => {
  it('never without data', () => {
    expect(mapWanted({ ...base, hasData: false, editing: true })).toBe(false);
  });
  it('Studio: at boot, whatever the mode', () => {
    expect(mapWanted({ ...base, editing: true, settled: false, mode: CHAPTERS_MODE })).toBe(true);
  });
  it('Study desktop: not before the first screen is decided (the map is mounted for one render before Chapters takes over)', () => {
    expect(mapWanted({ ...base, settled: false })).toBe(false);
    expect(mapWanted({ ...base, mode: CHAPTERS_MODE })).toBe(false);
    expect(mapWanted(base)).toBe(true);
  });
  it('a phone whose tab is the map: at boot', () => {
    expect(mapWanted({ ...base, phone: true, phoneTab: 'map', settled: false })).toBe(true);
  });
  it('a phone on Chapters or Explore: no, even in the render before the mode follows the tab', () => {
    expect(mapWanted({ ...base, phone: true, phoneTab: 'chapters' })).toBe(false);
    expect(mapWanted({ ...base, phone: true, phoneTab: 'explore' })).toBe(false);
  });
  it('a phone on Families (it reads the map model): yes once decided', () => {
    expect(mapWanted({ ...base, phone: true, phoneTab: 'families' })).toBe(true);
    expect(mapWanted({ ...base, phone: true, phoneTab: 'families', settled: false })).toBe(false);
  });
});
