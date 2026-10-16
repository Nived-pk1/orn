/**
 * The viewport controller (step 5.4b): DOM-free and deterministic. Gestures and commands set a PENDING viewport; at most one animation
 * frame is scheduled, and in it the controller writes ONE transform (through the injected `write`), culls, picks the LOD and updates the
 * store. Nothing here touches React, the DOM or a clock: `schedule`/`cancel` (requestAnimationFrame) and `write` are injected.
 */
import type { Scene } from '@/render/scene';
import type { Size, Viewport, ViewportStore } from './contracts';
import { ZOOM_STEP } from './contracts';
import { depictionCandidates, visibleIn } from './cull';
import { buildGridIndex, nodeBoxes } from './grid-index';
import type { GridIndex } from './grid-index';
import { resolveLod } from './lod';
import { clampScale, fitScene, focusRect, IDENTITY, sameViewport, toTransformAttribute, zoomAbout } from './transform';

export interface ControllerDeps {
  readonly store: ViewportStore;
  /** Writes the world group's transform attribute (the only DOM write; once per frame). */
  readonly write: (transform: string) => void;
  readonly schedule: (callback: () => void) => unknown;
  readonly cancel: (handle: unknown) => void;
  /** Told, synchronously, when a COMMAND (not a gesture) moved the viewport, so d3-zoom can adopt it. */
  readonly onCommand?: (view: Viewport) => void;
  /** Called in each frame with the depiction candidates (empty below LOD 3). */
  readonly onFrame?: (candidates: readonly string[], lod: number) => void;
  /** The smallest scale a gesture or a command may reach (default `SCALE_MIN`; the phone's is the name floor). */
  readonly minScale?: number;
}

export interface ViewportController {
  readonly setScene: (scene: Scene) => void;
  readonly setSize: (size: Size) => void;
  /** A gesture's viewport (d3-zoom): clamped, applied in the next frame. */
  readonly gesture: (view: Viewport) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
  /** Sets the viewport (a command, like zoom in): restoring a saved view, or keeping a toggled hub where it was. */
  readonly setViewport: (view: Viewport) => void;
  /** Centres and zooms on the nodes with these ids; false when none of them is in the scene (nothing moves). */
  readonly focus: (ids: Iterable<string>) => boolean;
  readonly current: () => Viewport;
  /** Frames run and transforms written since creation (the bound the tests check). */
  readonly stats: () => { readonly writes: number; readonly frames: number };
  readonly dispose: () => void;
}

const EMPTY_SCENE: Scene = { revision: 0, projectionKey: '', layoutKey: '', nodes: [], edges: [], bounds: { width: 0, height: 0 }, truncation: null };

export function createViewportController(deps: ControllerDeps): ViewportController {
  let scene: Scene = EMPTY_SCENE;
  let index: GridIndex = buildGridIndex(scene);
  let size: Size = { width: 0, height: 0 };
  let view: Viewport = IDENTITY;
  let handle: unknown;
  let queued = false;
  let disposed = false;
  let writes = 0;
  let frames = 0;
  let lastWritten: Viewport | undefined;

  const frame = (): void => {
    queued = false;
    if (disposed) return;
    frames += 1;
    if (lastWritten === undefined || !sameViewport(lastWritten, view)) {
      deps.write(toTransformAttribute(view));
      lastWritten = view;
      writes += 1;
    }
    const seen = visibleIn(index, view, size);
    const { lod, capped } = resolveLod(view.scale, deps.store.get().lod, seen.nodes.length, seen.edges.length);
    deps.store.set({ viewport: view, lod, capped, visibleNodes: seen.nodes.length, visibleEdges: seen.edges.length });
    deps.onFrame?.(lod >= 3 ? depictionCandidates(scene, index, view, size) : [], lod);
  };

  const request = (): void => {
    if (queued || disposed) return;
    queued = true;
    handle = deps.schedule(frame);
  };

  const command = (next: Viewport): void => {
    view = { x: next.x, y: next.y, scale: clampScale(next.scale, deps.minScale) };
    deps.onCommand?.(view);
    request();
  };

  return {
    setScene(next) {
      scene = next;
      index = buildGridIndex(next);
      request();
    },
    setSize(next) {
      size = next;
      request();
    },
    gesture(next) {
      view = { x: next.x, y: next.y, scale: clampScale(next.scale, deps.minScale) };
      request();
    },
    zoomIn: () => command(zoomAbout(view, ZOOM_STEP, size.width / 2, size.height / 2)),
    zoomOut: () => command(zoomAbout(view, 1 / ZOOM_STEP, size.width / 2, size.height / 2)),
    fit: () => command(fitScene(scene.bounds, size)),
    setViewport: (next) => command(next),
    focus(ids) {
      const wanted = new Set(ids);
      const boxes = nodeBoxes(scene).filter((_, at) => wanted.has((scene.nodes[at] as { id: string }).id));
      if (boxes.length === 0) return false;
      const box = boxes.reduce((all, one) => ({ x0: Math.min(all.x0, one.x0), y0: Math.min(all.y0, one.y0), x1: Math.max(all.x1, one.x1), y1: Math.max(all.y1, one.y1) }));
      command(focusRect(box, size));
      return true;
    },
    current: () => view,
    stats: () => ({ writes, frames }),
    dispose() {
      disposed = true;
      if (queued) deps.cancel(handle);
      queued = false;
    },
  };
}
