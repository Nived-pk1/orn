/**
 * The part of elkjs the adapter uses, as structural types: everything here depends on THESE, not on the package, so a fake ELK can
 * stand in for the real one in tests and only `load.ts` imports `elkjs` (dependency-cruiser rule `elk-only-in-adapter`).
 */
export interface ElkPoint {
  readonly x: number;
  readonly y: number;
}

export interface ElkSection {
  readonly startPoint: ElkPoint;
  readonly endPoint: ElkPoint;
  readonly bendPoints?: readonly ElkPoint[];
}

export interface ElkChild {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  layoutOptions?: Record<string, string>;
  /** Only in ELK's answer. */
  sections?: readonly ElkSection[];
}

export interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkChild[];
  edges: ElkEdge[];
}

/** What ELK answers: the same graph with positions (`x`, `y` of each child) and routes (`sections` of each edge). */
export interface ElkLike {
  layout(graph: ElkGraph): Promise<ElkGraph>;
}
