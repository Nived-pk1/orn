/**
 * Label sizes (step 5.5a, item a): the room the layout reserves for what is written on an arrow. A single edge with arrow text:
 * its lines (above, then below) measured by the injected measurer at the arrow-text size, plus a small margin. A bundle: its
 * count badge plus the same margin. An edge without text and without a count gets none. Pure; the measurer is called only here.
 * The numbers are shared with the SVG renderer (it draws the text in the box this reserves).
 */
import type { Projection } from '@/core/graph/contracts';
import type { FormattedText, ScenePorts, TextMeasurer, TextStyle } from './contracts';
import { partsToRuns } from './formatted-text';
import { drawnPaths, type DrawnPath } from './paths';
import { roundUpToGrid } from './sizes';

export interface LabelSize {
  readonly width: number;
  readonly height: number;
}
/** Label size of every drawn path that has one, by path id (loops included: the scene needs them for its bounds). */
export type LabelSizes = ReadonlyMap<string, LabelSize>;

export const ARROW_TEXT_SIZE = 11;
export const ARROW_LINE_HEIGHT = ARROW_TEXT_SIZE * 1.3;
export const BADGE_SIZE = 14;
/** Margin added around the measured text: the paper-coloured outline (item f) and a little air. */
export const LABEL_MARGIN = { x: 10, y: 6 } as const;

export const countWidth = (count: number): number => BADGE_SIZE + Math.max(0, String(count).length - 1) * 6;

const STYLE: TextStyle = { size: ARROW_TEXT_SIZE, weight: 'regular', mono: false };
const safe = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

/** The lines of one single edge's arrow text, as runs: the above line, then the below line, empty ones left out. */
export function arrowLines(above: FormattedText | undefined, below: FormattedText | undefined): readonly FormattedText[] {
  return [above, below].filter((line): line is FormattedText => line !== undefined && line.length > 0);
}

export function linesOfPath(path: DrawnPath, ports: ScenePorts): readonly FormattedText[] {
  const edge = path.edges[0] as DrawnPath['edges'][number];
  if (path.bundled || edge.semantic === 'membership' || edge.semantic === 'overflow') return [];
  const text = ports.arrowTextOf(edge);
  return text === undefined ? [] : arrowLines(partsToRuns(text.above), partsToRuns(text.below));
}

export function labelSizes(projection: Projection, ports: ScenePorts, measure: TextMeasurer): LabelSizes {
  const sizes = new Map<string, LabelSize>();
  for (const path of drawnPaths(projection)) {
    const edge = path.edges[0] as DrawnPath['edges'][number];
    if (edge.semantic === 'membership' || edge.semantic === 'overflow') continue;
    let width: number;
    let height: number;
    if (path.bundled) {
      width = countWidth(path.total);
      height = BADGE_SIZE;
    } else {
      const lines = linesOfPath(path, ports);
      if (lines.length === 0) continue;
      width = Math.max(...lines.map((line) => safe(measure(line, STYLE).width)));
      height = lines.length * ARROW_LINE_HEIGHT;
    }
    sizes.set(path.id, { width: roundUpToGrid(width + LABEL_MARGIN.x), height: roundUpToGrid(height + LABEL_MARGIN.y) });
  }
  return sizes;
}
