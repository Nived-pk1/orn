/**
 * The one line the map says about its view (step 8.4m, M3; moved out of navigator-canvas.tsx): the quiet hint, the busy chapter, or the
 * count of a selected family's links ("16 reactions to 9 families"). Pure. The reactions are counted as DISTINCT reactions over the
 * family's lines to other families, read from the roll-up's pair table (a reaction with products in two families is one reaction).
 */
import { QUIET_LINE, busyLine, hoverBusyLine, linksLine, listedLine } from './map-lines';
import type { MapView } from './map-view';

export interface MapHintLine {
  readonly text: string | undefined;
  readonly kind: 'quiet' | 'busy' | 'links' | undefined;
}

interface PairLike {
  readonly from: string;
  readonly to: string;
  readonly candidates: readonly { readonly reactionId: string }[];
}

const NONE: MapHintLine = { text: undefined, kind: undefined };

export function mapHintOf(view: MapView | null, pairs: () => readonly PairLike[]): MapHintLine {
  if (view === null) return NONE;
  if (view.quiet) return { text: QUIET_LINE, kind: 'quiet' };
  if (view.links !== undefined) {
    const wanted = new Set(view.links.lines.map((line) => `${line.from}>${line.to}`));
    const reactions = new Set<string>();
    for (const pair of pairs()) if (wanted.has(`${pair.from}>${pair.to}`)) for (const candidate of pair.candidates) reactions.add(candidate.reactionId);
    // lines drawn: the plain count; not drawn (more than the map shows at once): the panel has the list, and the line says so
    return { text: linksLine(reactions.size, view.links.families, view.busy > 0), kind: view.busy > 0 ? 'busy' : 'links' };
  }
  // the selected bucket: the panel lists its arrows ("Arrows of this selection"); a hover promises no panel; a chapter says its own line
  if (view.busy > 0) return { text: view.busyListed ? listedLine(view.busy) : view.busySelection ? hoverBusyLine(view.busy) : busyLine(view.busy), kind: 'busy' };
  return NONE;
}
