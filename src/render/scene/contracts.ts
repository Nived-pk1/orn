/**
 * Scene model — renderer-agnostic description of what to draw — docs/UI_ARCHITECTURE.md §6.
 * Projection + layout + display settings → Scene (pure, memoised) → SVG renderer / SVG export.
 * The same Scene feeds on-screen rendering and export, guaranteeing parity.
 */
import type { EdgeSemantic, GraphEdge, Truncation } from '@/core/graph/contracts';
import type { RecordRef } from '@/core/schema';
import type { Point } from '@/layout/contracts';

/** 0 overview (glyphs only) · 1 labels · 2 labels + badges + condition text · 3 full (structures). */
export type LodLevel = 0 | 1 | 2 | 3;

/** Zoom scale at which each level starts. Tuned in Phase 9 against the render budget. */
export const LOD_THRESHOLDS: Readonly<Record<Exclude<LodLevel, 0>, number>> = { 1: 0.35, 2: 0.6, 3: 0.9 };

/** Above this many visible elements the renderer forces LOD ≤ 1 (v6 "simplify mode", automatic). */
export const RENDER_BUDGET = { maxVisibleNodes: 400, maxVisibleEdges: 800 } as const;

export interface TextRun {
  readonly text: string;
  readonly script?: 'sub' | 'sup';
  readonly emphasis?: 'strong' | 'em';
}
export type FormattedText = readonly TextRun[];

export type NodeGlyph =
  | 'class_hub'
  | 'species'
  | 'reagent'
  | 'reaction'
  | 'concept'
  | 'named_reaction'
  | 'mechanism'
  | 'topic'
  | 'overflow'
  | 'unclassified';

export interface SceneBadge {
  readonly kind: 'caveat' | 'mechanism' | 'review' | 'warning' | 'error' | 'outside_scope' | 'hidden_neighbours';
  readonly count?: number;
}

export interface SceneNode {
  readonly id: string;
  readonly glyph: NodeGlyph;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: FormattedText;
  readonly sublabel?: FormattedText;
  /** Key into the depiction cache (structure drawing), when the node shows a structure. */
  readonly depictionKey?: string;
  readonly badges: readonly SceneBadge[];
  readonly emphasis: 'normal' | 'anchor' | 'target';
  /** Selection and the focus ring are drawn by the overlay from UI state, not stored here (step 5.3, decision Q5). */
  readonly state: { readonly dimmed: boolean; readonly onPath: boolean };
  readonly minLod: LodLevel;
  /** Accessible name, e.g. "Ethanol, species, 3 reactions out, 1 hidden". */
  readonly ariaLabel: string;
}

export interface SceneEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly points: readonly Point[];
  readonly semantic: EdgeSemantic;
  readonly stroke: 'solid' | 'dashed' | 'dotted';
  readonly weight: 'heavy' | 'normal' | 'light';
  readonly arrowHead: 'filled' | 'open' | 'none';
  /** Where the arrow text and the count are drawn: the midpoint of the route (a self-loop: its far side). */
  readonly labelAt: Point;
  readonly above?: FormattedText;
  readonly below?: FormattedText;
  /** A bundle's TOTAL arrows (not only the drawn ones). A self-loop is an edge with `from === to`. */
  readonly bundleSize?: number;
  readonly minLod: LodLevel;
  readonly ariaLabel: string;
}

export interface Scene {
  /** The store revision of the projection this was built from; informational (memos key on object identity). */
  readonly revision: number;
  readonly projectionKey: string;
  readonly layoutKey: string;
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  readonly bounds: { readonly width: number; readonly height: number };
  /** Copied from the projection: what it cut, said out loud. */
  readonly truncation: Truncation | null;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** What a text is set in; the measurer maps (runs, style) to a size. `mono` is for formulas. */
export interface TextStyle {
  readonly size: number;
  readonly weight: 'regular' | 'strong';
  readonly mono: boolean;
}

/** Injected (note E6): real text metrics once the bundled fonts are ready; a deterministic fake in tests. */
export type TextMeasurer = (runs: FormattedText, style: TextStyle) => { readonly width: number; readonly height: number };

export interface NodeSize {
  readonly width: number;
  readonly height: number;
}

/** Box size of every node of a projection, by node ID (widths and heights on a 4 px grid). */
export type NodeSizes = ReadonlyMap<string, NodeSize>;

/** What the builders may ask the outside world (step 5.3, decision Q5 e). Nothing here returns a record. */
export interface ScenePorts {
  /** Display name and formula of a record, as plain text (never markup). Undefined: the record is gone. */
  readonly describe: (ref: RecordRef) => { readonly name: string; readonly formula?: string } | undefined;
  /** Key into the depiction cache: a hash of (format, value, depiction options). Undefined: nothing to draw. */
  readonly depictionKeyOf: (ref: RecordRef) => string | undefined;
  /** The text over and under one arrow, in the mini-markup (core/text). Undefined: none. */
  readonly arrowTextOf: (edge: GraphEdge) => { readonly above?: string; readonly below?: string } | undefined;
}
