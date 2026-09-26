/**
 * Scene model — renderer-agnostic description of what to draw — docs/UI_ARCHITECTURE.md §6.
 * Projection + layout + display settings → Scene (pure, memoised) → SVG renderer / SVG export.
 * The same Scene feeds on-screen rendering and export, guaranteeing parity.
 */
import type { EdgeSemantic } from '@/core/graph/contracts';
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
  readonly state: { readonly selected: boolean; readonly focused: boolean; readonly dimmed: boolean; readonly onPath: boolean };
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
  readonly above?: FormattedText;
  readonly below?: FormattedText;
  readonly bundleSize?: number;
  readonly minLod: LodLevel;
  readonly ariaLabel: string;
}

export interface Scene {
  readonly revision: number;
  readonly projectionKey: string;
  readonly layoutKey: string;
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  readonly bounds: { readonly width: number; readonly height: number };
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}
