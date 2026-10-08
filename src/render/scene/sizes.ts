/**
 * Node boxes (step 5.3, note E6): the size of each node from an injected text measurer, on a 4 px grid, so cache keys are
 * stable and the builders stay pure. The measurer is called only here. A measurer that answers NaN, a negative or an infinite
 * number counts as zero (the box keeps its minimum); a long text is capped at the box's maximum width (the renderer clips it;
 * the full text stays in the Scene label and the aria label).
 */
import type { Projection } from '@/core/graph/contracts';
import { STRUCTURE_AREA, STRUCTURE_GAP, type NodeSize, type NodeSizes, type ScenePorts, type TextMeasurer, type TextStyle } from './contracts';
import { contentOf, type BoxKind } from './node-content';

export const GRID = 4;

interface BoxSpec {
  readonly label: TextStyle;
  readonly sublabel: TextStyle;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly padX: number;
  readonly padY: number;
  readonly gap: number;
}

const MONO = (size: number): TextStyle => ({ size, weight: 'regular', mono: true });
const SANS = (size: number, weight: TextStyle['weight'] = 'regular'): TextStyle => ({ size, weight, mono: false });

export const BOXES: Readonly<Record<BoxKind, BoxSpec>> = {
  hub: { label: SANS(14, 'strong'), sublabel: MONO(12), minWidth: 120, maxWidth: 240, padX: 16, padY: 10, gap: 2 },
  species: { label: SANS(13), sublabel: MONO(12), minWidth: 96, maxWidth: 220, padX: 12, padY: 8, gap: 2 },
  reagent: { label: SANS(12), sublabel: MONO(11), minWidth: 72, maxWidth: 180, padX: 10, padY: 6, gap: 2 },
  member: { label: SANS(12), sublabel: MONO(11), minWidth: 80, maxWidth: 200, padX: 10, padY: 6, gap: 2 },
  overflow: { label: SANS(12), sublabel: SANS(11), minWidth: 72, maxWidth: 160, padX: 10, padY: 6, gap: 2 },
  unclassified: { label: SANS(14, 'strong'), sublabel: SANS(12), minWidth: 120, maxWidth: 200, padX: 16, padY: 10, gap: 2 },
};

export const roundUpToGrid = (value: number): number => Math.ceil(value / GRID) * GRID;
const safe = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

/** The box sizes of every node of `projection`. */
export function nodeSizes(projection: Projection, ports: ScenePorts, measure: TextMeasurer): NodeSizes {
  const sizes = new Map<string, NodeSize>();
  for (const node of projection.nodes) {
    const content = contentOf(node, ports);
    const spec = BOXES[content.box];
    const label = measure(content.label, spec.label);
    const sublabel = content.sublabel === undefined ? undefined : measure(content.sublabel, spec.sublabel);
    const text = Math.max(safe(label.width), sublabel === undefined ? 0 : safe(sublabel.width));
    // A node with a depiction key has a structure area above its name line, at every LOD; the formula line gives way to it.
    const structure = content.depictionKey !== undefined;
    const minWidth = structure ? Math.max(spec.minWidth, STRUCTURE_AREA.width + 2 * spec.padX) : spec.minWidth;
    const width = Math.min(spec.maxWidth, Math.max(minWidth, text + 2 * spec.padX));
    const height = structure
      ? STRUCTURE_AREA.height + STRUCTURE_GAP + safe(label.height) + 2 * spec.padY
      : safe(label.height) + (sublabel === undefined ? 0 : spec.gap + safe(sublabel.height)) + 2 * spec.padY;
    sizes.set(node.id, { width: roundUpToGrid(width), height: roundUpToGrid(height) });
  }
  return sizes;
}
