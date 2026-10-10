/**
 * The overview's notices, as words (step 5.5d; UI_ARCHITECTURE §12; INV-22 UI part, ADV-014 UI part): what a truncated drawing cut and
 * how to see it, and what an empty overview means and what to do. Pure functions of data; the components only show them.
 */
import type { Truncation } from '@/core/graph';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const REASON_WORDS: Readonly<Record<Truncation['reason'], string>> = {
  max_nodes: 'the drawing holds only so many boxes',
  max_edges: 'the drawing holds only so many arrows',
  max_depth: 'the drawing reaches only so far from its start',
  time_budget: 'drawing it all would take too long',
  aborted: 'the work was stopped before it finished',
};

/** What was cut, with how many of each, in words (pairs of families, arrows, boxes). `null`: nothing was cut. */
export function cutOf(truncation: Truncation | null): string | null {
  if (truncation === null) return null;
  const parts: string[] = [];
  if (truncation.hiddenPairs !== undefined && truncation.hiddenPairs > 0) parts.push(plural(truncation.hiddenPairs, 'pair of families', 'pairs of families'));
  if (truncation.hiddenEdges !== undefined && truncation.hiddenEdges > 0) parts.push(plural(truncation.hiddenEdges, 'arrow', 'arrows'));
  if (truncation.hiddenNodeEstimate > 0) parts.push(`about ${plural(truncation.hiddenNodeEstimate, 'box', 'boxes')}`);
  if (parts.length === 0) return 'some of the graph';
  return parts.length === 1 ? (parts[0] as string) : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] as string}`;
}

export interface TruncationNotice {
  /** What was cut and why. */
  readonly cut: string;
  /** How to see more. */
  readonly more: string;
}

/** The notice of a truncated drawing; `null` when the drawing is whole (a truncated view always says so: INV-22). */
export function truncationNoticeOf(truncation: Truncation | null): TruncationNotice | null {
  const cut = cutOf(truncation);
  if (cut === null || truncation === null) return null;
  return {
    cut: `This map is not complete: ${cut} ${cut.includes(' and ') || /^\d+ \w+s\b/.test(cut) ? 'are' : 'is'} not drawn, because ${REASON_WORDS[truncation.reason]}.`,
    more: 'Open a family page to see everything: its full list of reactions is there, nothing is left out.',
  };
}

export interface Emptiness {
  readonly kind: 'empty_dataset' | 'no_anchors';
  readonly title: string;
  readonly body: string;
}

/**
 * What an overview with nothing to show means, in words and with what to do. `reactions`: how many reactions the dataset holds;
 * `families`: how many family boxes (anchored hubs) the map draws. `null`: the map has something to show.
 */
export function emptinessOf(reactions: number, families: number): Emptiness | null {
  if (reactions === 0) {
    return {
      kind: 'empty_dataset',
      title: 'This dataset has no reactions yet.',
      body: 'The map shows how families of compounds turn into one another, so it has nothing to draw. Open the File menu to load the demo or to import a file with reactions.',
    };
  }
  if (families === 0) {
    return {
      kind: 'no_anchors',
      title: 'No family is set up on the map.',
      body: 'The map is arranged from the navigator anchors of the dataset (one for each family), and this dataset has none, so every reaction is listed under Unclassified. Import a file that has them, or open Unclassified to read the reactions.',
    };
  }
  return null;
}
