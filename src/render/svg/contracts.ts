/**
 * The SVG renderer's inputs (step 5.4a; UI_ARCHITECTURE §6): a Scene, the LOD, selection and focus as props, and an optional
 * depiction source. No data access, no services, no chemistry: the renderer draws what the Scene says.
 */
import type { FocusEvent, KeyboardEvent, Ref } from 'react';
import type { LodLevel, Scene } from '@/render/scene';

export const LAYER_NAMES = ['edges', 'nodes', 'labels', 'badges', 'overlay'] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

/** What a depiction is right now. `idle`: nothing asked for it yet (or it was dropped from the cache); drawn like `loading`. */
export type DepictionStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  /** `width` and `height`: the size of the drawing when the answer said it (a fixed-scale drawing; equation step, part 5). */
  | { readonly state: 'ready'; readonly url: string; readonly width?: number; readonly height?: number }
  | { readonly state: 'unavailable'; readonly reason: string };

/** What the layers need of a depiction manager (`createDepictionManager`); a test passes a stub. */
export interface DepictionSource {
  /** Asks for a depiction (idempotent: starts the fetch once, and marks the key most recently used). */
  readonly request: (key: string) => void;
  /** The current status; the same object until the status changes (useSyncExternalStore). */
  /** Drops a request that is still loading (it left the viewport; step 5.4b). Optional: a stub need not have it. */
  readonly cancel?: (key: string) => void;
  readonly snapshot: (key: string) => DepictionStatus;
  readonly subscribe: (key: string, listener: () => void) => () => void;
}

/** The node or edge under a pointer event. */
export interface SceneHit {
  readonly kind: 'node' | 'edge';
  readonly id: string;
}

export interface SceneSvgProps {
  readonly scene: Scene;
  readonly lod: LodLevel;
  /** Node IDs and edge IDs drawn as selected. Drawn by the overlay only. */
  readonly selectedIds: ReadonlySet<string>;
  /** The arrow under the pointer (step 5.5d, item b), drawn like a selected arrow by the overlay only. */
  readonly hoveredId?: string;
  /** The node or edge that has the keyboard focus (the ring is drawn by the overlay only). */
  readonly focusedId?: string;
  readonly depictions?: DepictionSource;
  /** The accessible name of the whole drawing, e.g. "Navigator: 14 hubs, 31 arrows". */
  readonly ariaLabel: string;
  /** The ONE world group that step 5.4b transforms (d3-zoom writes to it imperatively); nothing here moves it. */
  readonly worldRef?: Ref<SVGGElement>;
  /** The root `<svg>` (step 5.4b binds gestures to it). */
  readonly svgRef?: Ref<SVGSVGElement>;
  /** True when gestures move the drawing (step 5.4b): the browser must not scroll or zoom the page on them. */
  readonly interactive?: boolean;
  /**
   * ONE delegated click listener on the root `<svg>` (no handler per node): the hit under a click, or null for empty canvas. A click that
   * ended a drag never arrives (d3-zoom suppresses it). Keep it stable.
   */
  readonly onSceneClick?: (hit: SceneHit | null) => void;
  /**
   * The arrow (edge hit) under the pointer, or null: called when the arrow changes (not on every move), never while a button is held
   * (a drag is a pan). Keep it stable.
   */
  readonly onSceneHover?: (hit: SceneHit | null) => void;
  /** The same for a double click. */
  readonly onSceneDoubleClick?: (hit: SceneHit | null) => void;
  /**
   * Keyboard focus (step 5.7, item e). The drawing is ONE tab stop and keeps the DOM focus; the family that has "the focus" is named
   * by `aria-activedescendant` on the drawing (its group's id), so moving it renders no node, edge, label or badge layer (the ring is
   * the overlay's, from `focusedId`). `activeId` is a node id of the Scene, or undefined for none.
   */
  readonly keyboard?: {
    readonly activeId: string | undefined;
    readonly onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => void;
    readonly onFocus: (event: FocusEvent<SVGSVGElement>) => void;
    readonly onBlur: (event: FocusEvent<SVGSVGElement>) => void;
  };
  /** Called after a layer commits (not when a memoised layer is skipped): the render counters of the tests. Keep it stable. */
  readonly onLayerCommit?: (layer: LayerName) => void;
}
