/**
 * Geometry of the drawing (step 5.4a): what is a number, not a colour. Colours, fonts and the look of text live in the CSS Module
 * and the tokens; the dash pattern and the width of an edge are here, as attributes, because they CARRY MEANING (line style and
 * weight, never colour alone; UI_ARCHITECTURE §3) and a test can read them from the DOM.
 */
import type { LodLevel, SceneBadge, SceneEdge, SceneNode } from '@/render/scene';
import { ARROW_LINE_HEIGHT, ARROW_TEXT_SIZE, BADGE_SIZE, BOXES, STRUCTURE_AREA } from '@/render/scene';

// The arrow-text and badge sizes belong to the Scene (the layout reserves room for them); the renderer draws in that room.
export { ARROW_LINE_HEIGHT, ARROW_TEXT_SIZE, BADGE_SIZE };

/** Dash pattern by stroke. Solid has none. Patterns differ in length so they differ at any width. */
export const STROKE_DASH: Readonly<Record<SceneEdge['stroke'], string | undefined>> = { solid: undefined, dashed: '8 5', dotted: '1.5 4.5' };
/** Width by weight (user units): heavy 3, normal 1.5, light 1. */
/** The invisible hit path of an edge is this wide (px, world units), wider than any stroke; step 5.7 settles sizes against UI_ARCHITECTURE §11. */
export const EDGE_HIT_WIDTH = 12;
export const WEIGHT_WIDTH: Readonly<Record<SceneEdge['weight'], number>> = { heavy: 3, normal: 1.5, light: 1 };

/** Dash patterns of the boxes that stand for something that is not a record: the Unclassified hub and "+N more". */
export const BOX_DASH = { unclassified: '2 3', overflow: '6 4' } as const;
export const ARROW_SIZE = 10;
export const HUB_RULE_WIDTH = 4;
export const BADGE_GAP = 3;
export const SELECTION_PAD = 3;
export const FOCUS_PAD = 6;

/** The path data of a polyline. Numbers are written as numbers (never a string from the data). */
export function pathData(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');
}

export const round = (value: number): number => Math.round(value * 100) / 100;

/** An element is drawn only at or above its `minLod` (LOD is an input: UI_ARCHITECTURE §6). */
export const visibleAt = (element: { readonly minLod: LodLevel }, lod: LodLevel): boolean => element.minLod <= lod;

/** The structure area of a node that has a depiction key, inside its box: centred, below the top padding (step 5.5a part 2, item j). */
export function structureArea(node: SceneNode): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: (node.width - STRUCTURE_AREA.width) / 2, y: BOXES[node.box].padY, width: STRUCTURE_AREA.width, height: STRUCTURE_AREA.height };
}

export interface TextSlots {
  readonly x: number;
  readonly labelY: number;
  readonly sublabelY: number;
  readonly labelSize: number;
  readonly sublabelSize: number;
  /** A node with a structure area: its formula is centred in the area (drawn only while no structure is) and `x` is the name's. */
  readonly sublabelCentreX?: number;
}

/** Where the text of a node starts, from its box: left padding, and the baselines of the label and the sublabel. */
export function textSlots(node: SceneNode): TextSlots {
  const spec = BOXES[node.box];
  const labelSize = spec.label.size;
  const sublabelSize = spec.sublabel.size;
  const labelHeight = labelSize * 1.3;
  const inset = node.box === 'hub' ? HUB_RULE_WIDTH : 0;
  if (node.depictionKey !== undefined) {
    // The name sits on the bottom line, the same at every LOD; the formula takes the middle of the structure area.
    const area = structureArea(node);
    return {
      x: spec.padX,
      labelY: node.height - spec.padY - labelHeight + labelSize * 0.9,
      sublabelY: area.y + area.height / 2 + sublabelSize * 0.35,
      sublabelCentreX: node.width / 2,
      labelSize,
      sublabelSize,
    };
  }
  return {
    x: spec.padX + inset,
    labelY: spec.padY + labelSize * 0.9,
    sublabelY: spec.padY + labelHeight + spec.gap + sublabelSize * 0.9,
    labelSize,
    sublabelSize,
  };
}

/** Badge marks: a SHAPE and a short mark per kind, so no badge is told apart by colour only. */
export const BADGE_MARK: Readonly<Record<SceneBadge['kind'], { readonly shape: 'circle' | 'square' | 'diamond' | 'triangle' | 'pill'; readonly mark: string; readonly title: string }>> = {
  caveat: { shape: 'circle', mark: '!', title: 'Caveat' },
  mechanism: { shape: 'diamond', mark: 'M', title: 'Mechanism' },
  review: { shape: 'square', mark: 'R', title: 'Review required' },
  warning: { shape: 'triangle', mark: '!', title: 'Warning' },
  error: { shape: 'square', mark: '×', title: 'Error' },
  outside_scope: { shape: 'circle', mark: '–', title: 'Outside the exam scope' },
  hidden_neighbours: { shape: 'pill', mark: '+', title: 'Hidden neighbours' },
};
