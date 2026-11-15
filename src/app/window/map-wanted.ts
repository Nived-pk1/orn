/**
 * When the map model starts (step 8.4m, R1). Studio, and a phone whose tab is the map, start it at boot (the map is their first screen).
 * Study starts it when the map is the screen: after the first-screen rule has run (the navigator is mounted for one render before
 * Chapters takes over), and on a phone not while the tab is Chapters or Explore (the mode follows the tab one render later). Pure.
 * The provider keeps a started model, so this only decides the FIRST start.
 */
import { NAVIGATOR_MODE } from './modes';

export function mapWanted(args: { readonly hasData: boolean; readonly editing: boolean; readonly phone: boolean; readonly phoneTab: string; readonly mode: string; readonly settled: boolean }): boolean {
  if (!args.hasData) return false;
  if (args.editing || (args.phone && args.phoneTab === 'map')) return true;
  if (!args.settled || args.mode !== NAVIGATOR_MODE) return false;
  return !args.phone || (args.phoneTab !== 'chapters' && args.phoneTab !== 'explore');
}
