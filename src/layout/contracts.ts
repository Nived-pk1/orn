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

/** Requests over these are refused as a value (step 4.4): ELK and the fallback are bounded, and the render budget is 400 / 800. */
export const MAX_LAYOUT_NODES = 2_000;
export const MAX_LAYOUT_EDGES = 4_000;
/**
 * Stress is all-pairs (100 nodes took about 4 s on elkjs 0.12.0, over the 2 s limit): the service lays out a stress request with
 * more nodes than this with ELK layered instead and says so in `notes` (step 4.4 review, decision 3).
 */
export const MAX_STRESS_NODES = 40;

export interface LayoutRequest {
  readonly requestId: string;
  readonly algorithm: LayoutAlgorithm;
  readonly direction: LayoutDirection;
  /**
   * Both lists must be sorted ascending by id (plain `<` on the strings), without duplicate ids; the engines rely on it for
   * determinism and a request that is not sorted is refused (`BAD_REQUEST`), never sorted for the caller. At most
   * `MAX_LAYOUT_NODES` / `MAX_LAYOUT_EDGES`.
   */
  readonly nodes: readonly LayoutNodeInput[];
  readonly edges: readonly LayoutEdgeInput[];
  readonly spacing: { readonly node: number; readonly layer: number; readonly edge: number };
  /** Previous positions, used as ordering hints so expansion does not reshuffle the view. */
  readonly previous?: Readonly<Record<string, Point>>;
  readonly seed: number;
}

/** Why the in-house layout answered instead of ELK (Phase 4 contract decisions Q7). */
export type FallbackReason = 'timeout' | 'elk_error' | 'engine_unavailable';

export interface LayoutResult {
  readonly requestId: string;
  readonly engine: 'elk' | 'fallback';
  /** Set exactly when `engine` is `'fallback'`. */
  readonly fallbackReason?: FallbackReason;
  /**
   * What the engine could not do with this request, said out loud (step 4.4, never silent): a hint it ignored (layerHint,
   * orderHint, pinned, previous, priority, direction), non-tree edges routed straight, a virtual root used. Sorted; empty when
   * the whole request was honoured.
   */
  readonly notes: readonly string[];
  /** Top-left corner of each node box. */
  readonly positions: Readonly<Record<string, Point>>;
  readonly edgeRoutes: Readonly<Record<string, readonly Point[]>>;
  readonly bounds: { readonly width: number; readonly height: number };
  readonly durationMs: number;
  /**
   * hash of everything that changes the answer: algorithm, direction, spacing, seed, the nodes (id, size, hints, pin), the edges
   * (id, endpoints, priority) and `previous`. `requestId` is not part of it. (Step 4.4 amendment: the original list, ids and
   * sizes only, would let two requests with different edges or hints share a cached layout.)
   */
  readonly cacheKey: string;
}

export interface LayoutEngine {
  layout(request: LayoutRequest, signal: AbortSignal): Promise<LayoutResult>;
}
