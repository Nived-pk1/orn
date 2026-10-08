/**
 * The navigator on screen (step 5.5a): a toolbar (Zoom in, Zoom out, Fit, Expand, Collapse) over the interactive drawing. It renders
 * what the model says: the Scene; a plain error with its code; a skeleton only when there is no Scene yet and 300 ms have passed.
 * ONE delegated click listener lives on the drawing's svg: a click selects the node or edge under it, empty canvas clears; a double click
 * on a hub expands or collapses it. After a toggle the viewport is shifted so the hub stays at the same screen point (no refit).
 * The layer commit count is written to a data attribute by hand (no React state) so a test can prove pan and zoom render nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { LayerName, SceneHit } from '@/render/svg';
import { keepScreenPoint, toScreen, ViewportScene, type ViewportController, type Viewport } from '@/render/viewport';
import type { Scene, SceneNode } from '@/render/scene';
import { Button, Skeleton } from '@/ui/primitives';
import { depictionBindingOf } from './depictions';
import { useNavigator, useNavigatorState } from './navigator-context';
import { NavigatorSelection } from './navigator-selection';
import styles from './navigator.module.css';

const NO_IDS: ReadonlySet<string> = new Set();
const VIEW = 'navigator';
const NOTHING_DRAWN = 'there is nothing drawn yet';

const centreOf = (node: SceneNode): { readonly x: number; readonly y: number } => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 });

/** Why Expand or Collapse cannot act now, or undefined when it can. */
export function toggleReason(action: 'expand' | 'collapse', selectedHub: string | undefined, expanded: boolean, selected: boolean): string | undefined {
  if (!selected) return 'select a hub first';
  if (selectedHub === undefined) return 'the selection is not a hub';
  if (action === 'expand' && expanded) return 'this hub is already expanded';
  if (action === 'collapse' && !expanded) return 'this hub is not expanded';
  return undefined;
}

export function NavigatorCanvas() {
  const { ports } = useNavigator();
  const state = useNavigatorState();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  const expandedIds = useStore(ports.ui.expansion, (s) => s.expansion.expanded);
  const [controller, setController] = useState<ViewportController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const commits = useRef(0);
  const anchor = useRef<{ readonly id: string; readonly screen: { readonly x: number; readonly y: number } } | null>(null);
  // Written imperatively: a layer that commits bumps a data attribute, React state is not involved.
  const onLayerCommit = useCallback((_layer: LayerName): void => {
    commits.current += 1;
    root.current?.setAttribute('data-layer-commits', String(commits.current));
  }, []);
  const { scene } = state;
  const sceneRef = useRef<Scene | null>(scene);
  sceneRef.current = scene;
  const controllerRef = useRef<ViewportController | null>(null);
  controllerRef.current = controller;
  const selectedIds = useMemo(() => (selected === null ? NO_IDS : new Set([selected.id])), [selected]);
  const initialViewport = useMemo<Viewport | undefined>(() => ports.ui.viewports.getState().views[VIEW], [ports]);
  const depictions = useMemo(() => depictionBindingOf(ports)?.manager, [ports]);
  const hubs = scene === null ? 0 : scene.nodes.filter((node) => node.box === 'hub' || node.box === 'unclassified').length;
  const isHub = useCallback((id: string): boolean => state.hubIds.includes(id), [state.hubIds]);

  const toggle = useCallback(
    (id: string): void => {
      const current = sceneRef.current;
      const node = current?.nodes.find((n) => n.id === id);
      const view = controllerRef.current?.current();
      anchor.current = node === undefined || view === undefined ? null : { id, screen: toScreen(view, centreOf(node)) };
      ports.ui.expansion.getState().toggle(id);
    },
    [ports],
  );

  // The toggled hub stays at the same screen point: shift the viewport once the new Scene is in (no refit).
  useEffect(() => {
    const pending = anchor.current;
    if (pending === null || scene === null || controller === null) return;
    const node = scene.nodes.find((n) => n.id === pending.id);
    anchor.current = null;
    if (node !== undefined) controller.setViewport(keepScreenPoint(controller.current().scale, centreOf(node), pending.screen));
  }, [scene, controller]);

  const onSceneClick = useCallback((hit: SceneHit | null): void => ports.ui.selection.getState().select(hit), [ports]);
  const onSceneDoubleClick = useCallback(
    (hit: SceneHit | null): void => {
      if (hit !== null && hit.kind === 'node' && isHub(hit.id)) toggle(hit.id);
    },
    [isHub, toggle],
  );
  const onSettled = useCallback((view: Viewport): void => ports.ui.viewports.getState().setViewport(VIEW, view), [ports]);

  const selectedHub = selected !== null && selected.kind === 'node' && isHub(selected.id) ? selected.id : undefined;
  const isExpanded = selectedHub !== undefined && expandedIds.some((entry) => entry.nodeId === selectedHub);
  const expandReason = toggleReason('expand', selectedHub, isExpanded, selected !== null);
  const collapseReason = toggleReason('collapse', selectedHub, isExpanded, selected !== null);
  const nothing = scene === null ? { unavailable: NOTHING_DRAWN } : {};
  return (
    <div className={styles.canvas} ref={root} data-layer-commits="0">
      <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
        <Button onClick={() => controller?.zoomIn()} {...nothing}>
          Zoom in
        </Button>
        <Button onClick={() => controller?.zoomOut()} {...nothing}>
          Zoom out
        </Button>
        <Button onClick={() => controller?.fit()} {...nothing}>
          Fit
        </Button>
        <Button onClick={() => selectedHub !== undefined && toggle(selectedHub)} {...(scene === null ? nothing : expandReason === undefined ? {} : { unavailable: expandReason })}>
          Expand
        </Button>
        <Button onClick={() => selectedHub !== undefined && toggle(selectedHub)} {...(scene === null ? nothing : collapseReason === undefined ? {} : { unavailable: collapseReason })}>
          Collapse
        </Button>
        <NavigatorSelection />
      </div>
      <div className={styles.drawing} aria-busy={state.working}>
        {state.error !== null ? (
          <div className={styles.error} role="alert">
            <p>The navigator could not be drawn ({state.error.code}).</p>
            <p>{state.error.message}</p>
          </div>
        ) : scene === null ? (
          state.skeleton ? <Skeleton label="Loading the navigator" /> : null
        ) : (
          <ViewportScene
            scene={scene}
            selectedIds={selectedIds}
            ariaLabel={`Navigator: ${hubs} ${hubs === 1 ? 'hub' : 'hubs'}, ${scene.edges.length} ${scene.edges.length === 1 ? 'arrow' : 'arrows'}`}
            onController={setController}
            {...(depictions === undefined ? {} : { depictions })}
            onLayerCommit={onLayerCommit}
            onSceneClick={onSceneClick}
            onSceneDoubleClick={onSceneDoubleClick}
            onSettled={onSettled}
            {...(initialViewport === undefined ? {} : { initialViewport })}
          />
        )}
      </div>
    </div>
  );
}
