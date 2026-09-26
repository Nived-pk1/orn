/**
 * Layout contracts — docs/PERFORMANCE_ARCHITECTURE.md §5, docs/UI_ARCHITECTURE.md §6.
 * Layout runs in the layout worker (ELK), is deterministic for identical input (sorted nodes/edges,
 * fixed seed) and cancellable. A fallback in-house layered layout is used if ELK fails or times out.
 */
export type LayoutAlgorithm = 'layered' | 'radial' | 'stress';
export type LayoutDirection = 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LayoutNodeInput {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** Preferred layer (e.g. hubs in layer 0) and order within the layer, to keep layouts stable. */
  readonly layerHint?: number;
  readonly orderHint?: number;
  readonly pinned?: Point;
}

export interface LayoutEdgeInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly priority?: number;
}

export interface LayoutRequest {
  readonly requestId: string;
  readonly algorithm: LayoutAlgorithm;
  readonly direction: LayoutDirection;
  /** Must be sorted by id; the engine relies on it for determinism. */
  readonly nodes: readonly LayoutNodeInput[];
  readonly edges: readonly LayoutEdgeInput[];
  readonly spacing: { readonly node: number; readonly layer: number; readonly edge: number };
  /** Previous positions, used as ordering hints so expansion does not reshuffle the view. */
  readonly previous?: Readonly<Record<string, Point>>;
  readonly seed: number;
}

export interface LayoutResult {
  readonly requestId: string;
  readonly engine: 'elk' | 'fallback';
  /** Top-left corner of each node box. */
  readonly positions: Readonly<Record<string, Point>>;
  readonly edgeRoutes: Readonly<Record<string, readonly Point[]>>;
  readonly bounds: { readonly width: number; readonly height: number };
  readonly durationMs: number;
  /** hash(algorithm, direction, spacing, seed, sorted node ids + sizes, sorted edge ids). */
  readonly cacheKey: string;
}

export interface LayoutEngine {
  layout(request: LayoutRequest, signal: AbortSignal): Promise<LayoutResult>;
}
