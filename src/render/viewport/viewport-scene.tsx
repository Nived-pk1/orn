/**
 * The interactive drawing (step 5.4b): `SceneSvg` plus the viewport. The component renders when its props change and when the LOD
 * level changes; pan and zoom render nothing (the controller writes one transform attribute per frame, outside React). The depiction
 * source the layers see never starts a fetch itself: the queue does, for visible species only, after the view has been still.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { LodLevel, Scene } from '@/render/scene';
import { SceneSvg } from '@/render/svg';
import type { DepictionSource, LayerName, MapMarks, SceneHit, SceneSvgProps } from '@/render/svg';
import { VIEWPORT_SETTLE_MS, type Insets, type Rect, type Viewport } from './contracts';
import { createViewportController } from './controller';
import type { ViewportController } from './controller';
import { createDepictionQueue } from './depiction-queue';
import { bindPointer } from './pointer-binding';
import type { PointerHandlers, PointerTimers } from './pointer-binding';
import { createViewportStore } from './store';
import { bindZoom } from './zoom-binding';
import type { ZoomBinding } from './zoom-binding';

export interface ViewportSceneProps {
  readonly scene: Scene;
  readonly selectedIds: ReadonlySet<string>;
  readonly focusedId?: string;
  readonly hoveredId?: string;
  readonly depictions?: DepictionSource;
  readonly ariaLabel: string;
  /** Receives the commands (zoom in / out, fit, focus) once the viewport exists; null when it goes away. Keep it stable. */
  readonly onController?: (controller: ViewportController | null) => void;
  readonly onLayerCommit?: (layer: LayerName) => void;
  /** Shown at the first layout instead of fitting the drawing (a saved view). Read once, when the drawing first has a size. */
  readonly initialViewport?: Viewport;
  /** Called with the viewport once it has been still for `VIEWPORT_SETTLE_MS` (never per frame), and when the drawing goes away with a move pending; `automatic` is true while the view is still the one the automatic fit made. Keep it stable. */
  /** Step 8.4b (A): the zoom, reported once it has been still for 150 ms (chips are placed in screen pixels at it). Keep it stable. */
  readonly onZoomSettled?: (scale: number) => void;
  readonly onSettled?: (view: Viewport, automatic: boolean) => void;
  /** The smallest zoom a gesture or a command reaches (the phone's name floor). Default: the global minimum. */
  readonly minScale?: number;
  /** The delegated click and double click on the drawing (see `SceneSvgProps`). Keep them stable. */
  readonly onSceneClick?: (hit: SceneHit | null) => void;
  readonly onSceneDoubleClick?: (hit: SceneHit | null) => void;
  /** The arrow under the pointer (see `SceneSvgProps.onSceneHover`). Keep it stable. */
  readonly onSceneHover?: (hit: SceneHit | null) => void;
  /** The map's focus marks and the box under the pointer (step 8.2a; see `SceneSvgProps`). Keep them stable. */
  readonly marks?: MapMarks;
  readonly onNodeHover?: (id: string | null) => void;
  /** A chip button chosen with the keyboard (step 8.4b, B). Keep it stable. */
  readonly onChip?: SceneSvgProps['onChip'];
  /**
   * The pointer state machine's outcomes (step 5.7): click, double click, confirmed click, context menu. When given, they replace
   * the delegated `onSceneClick` / `onSceneDoubleClick` (the machine decides what a press was). Read at the time of each event, so
   * the handlers may change between renders without rebinding.
   */
  readonly pointer?: PointerHandlers;
  /** The clock of the machine's 500 ms and 300 ms (the app's injected timers; `window` by default). */
  readonly pointerTimers?: PointerTimers;
  /** Receives the root `<svg>` once it exists, and null when it goes away (focus, menu placement). Keep it stable. */
  readonly onSvg?: (svg: SVGSVGElement | null) => void;
  /** Keyboard focus on the drawing (see `SceneSvgProps.keyboard`). */
  readonly keyboard?: SceneSvgProps['keyboard'];
  /** Step 8.2b: the world rectangle Fit and the first view fill the area with (the visible boxes). Absent: the whole drawing (the phone). */
  readonly fitBox?: Rect;
  /** Changes when the drawing is a different one to look at (another chapter, Unclassified shown): the view is fitted again. Absent: never. */
  readonly fitKey?: string;
  /** Step 8.4e (A3): the free areas the floating controls leave, measured. A change fits again while the view is still the automatic one. */
  readonly fitInsets?: Insets;
  /** The fit window drives Fit by its SIZE (the phone, step 8.4e C4): a change of that size fits again while the view is the automatic one. */
  readonly fitBoxRefits?: boolean;
}

/** What the layers get: the same statuses, but `request` does nothing (the queue decides what is asked for). */
const passive = (source: DepictionSource): DepictionSource => ({ request: () => undefined, snapshot: source.snapshot, subscribe: source.subscribe });

/** How many automatic fits are remembered (a drawing's size settles in a few steps; bounded). */
const MAX_AUTO_VIEWS = 8;
const ZOOM_SETTLE_MS = 150;

const sameView = (a: Viewport, b: Viewport): boolean => a.x === b.x && a.y === b.y && a.scale === b.scale;

export function ViewportScene(props: ViewportSceneProps) {
  const { scene, depictions, onController, onSettled } = props;
  const initialRef = useRef(props.initialViewport);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const store = useMemo(() => createViewportStore(), []);
  const controllerRef = useRef<ViewportController | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const pointerRef = useRef(props.pointer);
  pointerRef.current = props.pointer;
  const hasPointer = props.pointer !== undefined;
  const fitBoxRef = useRef(props.fitBox);
  fitBoxRef.current = props.fitBox;
  const refit = useRef<(() => void) | undefined>(undefined);
  const refitIfAuto = useRef<(() => void) | undefined>(undefined);
  const insetsRef = useRef(props.fitInsets);
  insetsRef.current = props.fitInsets;
  const keyRef = useRef(props.fitKey);
  const { pointerTimers, onSvg, minScale, onZoomSettled } = props;

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
      write: (transform) => {
        world.setAttribute('transform', transform);
        // the zoom as a CSS variable: the marks people read or click are sized in screen pixels by it (step 8.4b, A)
        const scale = /scale\(([^)]+)\)/.exec(transform)?.[1];
        if (scale !== undefined) svg.style.setProperty('--map-k', scale);
      },
      schedule: (callback) => window.requestAnimationFrame(callback),
      cancel: (handle) => window.cancelAnimationFrame(handle as number),
      onCommand: (view) => bound.binding?.adopt(view),
      onFrame: (candidates, lod) => queue?.update(candidates, lod),
      ...(minScale === undefined ? {} : { minScale }),
    });
    bound.binding = bindZoom(svg, controller.gesture, minScale, () => pointerRef.current?.onToggle !== undefined);
    controllerRef.current = controller;
    controller.setScene(sceneRef.current);
    let fitted = false;
    // The view the automatic fit made. While the view is still exactly that (nobody panned, zoomed or fitted since), a change of the
    // drawing's size fits again: the first size can be a transient one (the toolbar and legend above it settle after the drawing's
    // first layout), and a view fitted to it would leave families outside the visible area (found in step 5.10a, WebKit).
    let autoView: Viewport | undefined;
    // Every view an automatic fit made (the newest ones). The controller is ahead of the store: a fit is commanded at once but drawn, and so
    // stored, on the next frame, so a report of the stored view (above all the one flushed when the drawing goes away) can be of an earlier
    // automatic fit than `autoView`; it is still automatic (found in the WebKit canvas-keyboard flake: the family page replacing the map
    // announced "Zoom 61 percent" over "Opened the family page").
    const autoViews: Viewport[] = [];
    const markAutomatic = (): void => {
      autoView = controller.current();
      autoViews.push(autoView);
      if (autoViews.length > MAX_AUTO_VIEWS) autoViews.shift();
    };
    const sync = (): void => {
      controller.setInsets(insetsRef.current);
      controller.setFitBox(fitBoxRef.current);
    };
    const fitNow = (): void => {
      sync();
      controller.fit();
      markAutomatic();
    };
    sync();
    refit.current = fitNow;
    refitIfAuto.current = () => (autoView !== undefined && sameView(controller.current(), autoView) ? fitNow() : sync());
    const measure = (): void => {
      const box = svg.getBoundingClientRect();
      controller.setSize({ width: box.width, height: box.height });
      if (box.width <= 0 || box.height <= 0) return;
      if (!fitted) {
        fitted = true;
        if (initialRef.current === undefined) {
          controller.fit();
          markAutomatic();
        } else controller.setViewport(initialRef.current);
      } else if (autoView !== undefined) {
        if (sameView(controller.current(), autoView)) {
          controller.fit();
          markAutomatic();
        }
      }
    };
    measure();
    // measured on the next frame, never inside the observer's own callback: a change made there is reported by WebKit as an uncaught
    // "ResizeObserver loop completed with undelivered notifications" (step 8.3, A2)
    let measureFrame = 0;
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      window.cancelAnimationFrame(measureFrame);
      measureFrame = window.requestAnimationFrame(measure);
    });
    observer?.observe(svg);
    // the Fit command of the toolbar fits the WHOLE map (not the focus set) and counts as an automatic view again (step 8.4b, E2)
    onController?.({ ...controller, fit: fitNow });
    // The viewport is reported once it has been still; the store's first frames (fit, restore) count as moves like any other.
    let lastView = store.get().viewport;
    let still: number | undefined;
    let moved = false;
    const settle = (): void => {
      still = undefined;
      if (!moved) return;
      moved = false;
      const view = store.get().viewport;
      onSettled?.(view, autoViews.some((auto) => sameView(view, auto)));
    };
    let zoomStill: number | undefined;
    let lastScale = store.get().viewport.scale;
    const offZoom = onZoomSettled === undefined ? undefined : store.subscribe(() => {
      const scale = store.get().viewport.scale;
      if (scale === lastScale) return;
      lastScale = scale;
      if (zoomStill !== undefined) window.clearTimeout(zoomStill);
      zoomStill = window.setTimeout(() => onZoomSettled(scale), ZOOM_SETTLE_MS);
    });
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
      offZoom?.();
      if (zoomStill !== undefined) window.clearTimeout(zoomStill);
      if (still !== undefined) window.clearTimeout(still);
      settle();
      onController?.(null);
      refit.current = undefined;
      refitIfAuto.current = undefined;
      observer?.disconnect();
      window.cancelAnimationFrame(measureFrame);
      bound.binding?.destroy();
      queue?.dispose();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [store, depictions, onController, onSettled, onZoomSettled, minScale]);

  useEffect(() => {
    controllerRef.current?.setScene(scene);
    controllerRef.current?.setFitBox(fitBoxRef.current);
  }, [scene]);

  const { fitKey } = props;
  const insetKey = `${Object.values(props.fitInsets ?? {})}`;
  const boxKey = props.fitBoxRefits === true && props.fitBox !== undefined ? `${(props.fitBox.x1 - props.fitBox.x0) | 0},${(props.fitBox.y1 - props.fitBox.y0) | 0}` : '';
  useEffect(() => refitIfAuto.current?.(), [insetKey, boxKey]);
  useEffect(() => {
    if (keyRef.current === fitKey) return;
    keyRef.current = fitKey;
    refit.current?.();
  }, [fitKey]);

  useEffect(() => {
    onSvg?.(svgRef.current);
    return () => onSvg?.(null);
  }, [onSvg]);

  // The pointer machine: one set of delegated listeners for the life of the drawing; the handlers are read when an event happens.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null || !hasPointer) return undefined;
    return bindPointer(
      svg,
      {
        onClick: (hit) => pointerRef.current?.onClick?.(hit),
        onDoubleClick: (hit) => pointerRef.current?.onDoubleClick?.(hit),
        onConfirm: (hit) => pointerRef.current?.onConfirm?.(hit),
        onContextMenu: (hit, point) => pointerRef.current?.onContextMenu?.(hit, point),
        onToggle: (hit) => pointerRef.current?.onToggle?.(hit),
        onMarquee: (rect, done) => pointerRef.current?.onMarquee?.(rect, done),
        onMarqueeCancel: () => pointerRef.current?.onMarqueeCancel?.(),
        multi: () => pointerRef.current?.onToggle !== undefined,
      },
      pointerTimers,
    );
  }, [hasPointer, pointerTimers]);

  const lod = useSyncExternalStore<LodLevel>(store.subscribe, () => store.get().lod, () => 0);
  const layerSource = useMemo(() => (depictions === undefined ? undefined : passive(depictions)), [depictions]);
  return (
    <SceneSvg
      scene={scene}
      lod={lod}
      selectedIds={props.selectedIds}
      focusedId={props.focusedId}
      hoveredId={props.hoveredId}
      depictions={layerSource}
      ariaLabel={props.ariaLabel}
      svgRef={svgRef}
      worldRef={worldRef}
      interactive
      {...(props.keyboard === undefined ? {} : { keyboard: props.keyboard })}
      {...(props.onSceneClick === undefined ? {} : { onSceneClick: props.onSceneClick })}
      {...(props.onSceneHover === undefined ? {} : { onSceneHover: props.onSceneHover })}
      {...(props.marks === undefined ? {} : { marks: props.marks })}
      {...(props.onNodeHover === undefined ? {} : { onNodeHover: props.onNodeHover })}
      {...(props.onChip === undefined ? {} : { onChip: props.onChip })}
      {...(props.onSceneDoubleClick === undefined ? {} : { onSceneDoubleClick: props.onSceneDoubleClick })}
      {...(props.onLayerCommit === undefined ? {} : { onLayerCommit: props.onLayerCommit })}
    />
  );
}
