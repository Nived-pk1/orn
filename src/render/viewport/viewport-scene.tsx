/**
 * The interactive drawing (step 5.4b): `SceneSvg` plus the viewport. The component renders when its props change and when the LOD
 * level changes; pan and zoom render nothing (the controller writes one transform attribute per frame, outside React). The depiction
 * source the layers see never starts a fetch itself: the queue does, for visible species only, after the view has been still.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { LodLevel, Scene } from '@/render/scene';
import { SceneSvg } from '@/render/svg';
import type { DepictionSource, LayerName, SceneHit } from '@/render/svg';
import { VIEWPORT_SETTLE_MS, type Viewport } from './contracts';
import { createViewportController } from './controller';
import type { ViewportController } from './controller';
import { createDepictionQueue } from './depiction-queue';
import { createViewportStore } from './store';
import { bindZoom } from './zoom-binding';
import type { ZoomBinding } from './zoom-binding';

export interface ViewportSceneProps {
  readonly scene: Scene;
  readonly selectedIds: ReadonlySet<string>;
  readonly focusedId?: string;
  readonly depictions?: DepictionSource;
  readonly ariaLabel: string;
  /** Receives the commands (zoom in / out, fit, focus) once the viewport exists; null when it goes away. Keep it stable. */
  readonly onController?: (controller: ViewportController | null) => void;
  readonly onLayerCommit?: (layer: LayerName) => void;
  /** Shown at the first layout instead of fitting the drawing (a saved view). Read once, when the drawing first has a size. */
  readonly initialViewport?: Viewport;
  /** Called with the viewport once it has been still for `VIEWPORT_SETTLE_MS` (never per frame), and when the drawing goes away with a move pending. Keep it stable. */
  readonly onSettled?: (view: Viewport) => void;
  /** The delegated click and double click on the drawing (see `SceneSvgProps`). Keep them stable. */
  readonly onSceneClick?: (hit: SceneHit | null) => void;
  readonly onSceneDoubleClick?: (hit: SceneHit | null) => void;
}

/** What the layers get: the same statuses, but `request` does nothing (the queue decides what is asked for). */
const passive = (source: DepictionSource): DepictionSource => ({ request: () => undefined, snapshot: source.snapshot, subscribe: source.subscribe });

export function ViewportScene(props: ViewportSceneProps) {
  const { scene, depictions, onController, onSettled } = props;
  const initialRef = useRef(props.initialViewport);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const store = useMemo(() => createViewportStore(), []);
  const controllerRef = useRef<ViewportController | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    const svg = svgRef.current;
    const world = worldRef.current;
    if (svg === null || world === null) return undefined;
    const bound: { binding?: ZoomBinding } = {};
    const queue =
      depictions === undefined
        ? undefined
        : createDepictionQueue({ source: depictions, setTimer: (callback, ms) => window.setTimeout(callback, ms), clearTimer: (handle) => window.clearTimeout(handle as number) });
    const controller = createViewportController({
      store,
      write: (transform) => world.setAttribute('transform', transform),
      schedule: (callback) => window.requestAnimationFrame(callback),
      cancel: (handle) => window.cancelAnimationFrame(handle as number),
      onCommand: (view) => bound.binding?.adopt(view),
      onFrame: (candidates, lod) => queue?.update(candidates, lod),
    });
    bound.binding = bindZoom(svg, controller.gesture);
    controllerRef.current = controller;
    controller.setScene(sceneRef.current);
    let fitted = false;
    const measure = (): void => {
      const box = svg.getBoundingClientRect();
      controller.setSize({ width: box.width, height: box.height });
      if (!fitted && box.width > 0 && box.height > 0) {
        fitted = true;
        if (initialRef.current === undefined) controller.fit();
        else controller.setViewport(initialRef.current);
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(svg);
    onController?.(controller);
    // The viewport is reported once it has been still; the store's first frames (fit, restore) count as moves like any other.
    let lastView = store.get().viewport;
    let still: number | undefined;
    let moved = false;
    const settle = (): void => {
      still = undefined;
      if (!moved) return;
      moved = false;
      onSettled?.(store.get().viewport);
    };
    const off = onSettled === undefined ? undefined : store.subscribe(() => {
      const view = store.get().viewport;
      if (view.x === lastView.x && view.y === lastView.y && view.scale === lastView.scale) return;
      lastView = view;
      moved = true;
      if (still !== undefined) window.clearTimeout(still);
      still = window.setTimeout(settle, VIEWPORT_SETTLE_MS);
    });
    return () => {
      off?.();
      if (still !== undefined) window.clearTimeout(still);
      settle();
      onController?.(null);
      observer?.disconnect();
      bound.binding?.destroy();
      queue?.dispose();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [store, depictions, onController, onSettled]);

  useEffect(() => {
    controllerRef.current?.setScene(scene);
  }, [scene]);

  const lod = useSyncExternalStore<LodLevel>(store.subscribe, () => store.get().lod, () => 0);
  const layerSource = useMemo(() => (depictions === undefined ? undefined : passive(depictions)), [depictions]);
  return (
    <SceneSvg
      scene={scene}
      lod={lod}
      selectedIds={props.selectedIds}
      focusedId={props.focusedId}
      depictions={layerSource}
      ariaLabel={props.ariaLabel}
      svgRef={svgRef}
      worldRef={worldRef}
      interactive
      {...(props.onSceneClick === undefined ? {} : { onSceneClick: props.onSceneClick })}
      {...(props.onSceneDoubleClick === undefined ? {} : { onSceneDoubleClick: props.onSceneDoubleClick })}
      {...(props.onLayerCommit === undefined ? {} : { onLayerCommit: props.onLayerCommit })}
    />
  );
}
