/**
 * The navigator overview on screen (step 5.5a, calmed in 5.5b; ADR-037): a toolbar (Zoom in, Zoom out, Fit, Open family, and Open for a
 * selected arrow) over the interactive drawing. It renders what the model says: the Scene; a plain error with its code; a skeleton only
 * when there is no Scene yet and 300 ms have passed. ONE delegated click listener lives on the drawing's svg: a click selects the node
 * or edge under it, empty canvas clears; a double click on a family opens its page. The overview does not expand hubs.
 * The layer commit count is written to a data attribute by hand (no React state) so a test can prove pan and zoom render nothing.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { LayerName, SceneHit } from '@/render/svg';
import { ViewportScene, type ViewportController, type Viewport } from '@/render/viewport';
import type { Scene } from '@/render/scene';
import { Button, Skeleton } from '@/ui/primitives';
import { depictionBindingOf } from './depictions';
import { useNavigator, useNavigatorState } from './navigator-context';
import { NavigatorSelection } from './navigator-selection';
import styles from './navigator.module.css';

const NO_IDS: ReadonlySet<string> = new Set();
const VIEW = 'navigator';
const NOTHING_DRAWN = 'there is nothing drawn yet';

/** Why Open family cannot act now, or undefined when it can. */
export function openFamilyReason(selected: { readonly kind: 'node' | 'edge' } | null, isFamily: boolean): string | undefined {
  if (selected === null) return 'select a family first';
  if (selected.kind === 'edge') return 'an arrow is selected: use Open, or select a family';
  if (!isFamily) return 'the selection is not a family';
  return undefined;
}

export function NavigatorCanvas() {
  const { ports } = useNavigator();
  const state = useNavigatorState();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  const [controller, setController] = useState<ViewportController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const commits = useRef(0);
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
  const openFamily = useCallback((hubId: string): void => ports.ui.family.getState().openFamily(hubId), [ports]);

  const onSceneClick = useCallback((hit: SceneHit | null): void => ports.ui.selection.getState().select(hit), [ports]);
  const onSceneDoubleClick = useCallback(
    (hit: SceneHit | null): void => {
      if (hit !== null && hit.kind === 'node' && isHub(hit.id)) openFamily(hit.id);
    },
    [isHub, openFamily],
  );
  const onSettled = useCallback((view: Viewport): void => ports.ui.viewports.getState().setViewport(VIEW, view), [ports]);

  const selectedHub = selected !== null && selected.kind === 'node' && isHub(selected.id) ? selected.id : undefined;
  const openReason = openFamilyReason(selected, selectedHub !== undefined);
  // An arrow opens its source family at the target's group (reactions of the source, the group "To <target>").
  const selectedArrow = selected !== null && selected.kind === 'edge' && scene !== null ? scene.edges.find((edge) => edge.id === selected.id) : undefined;
  const arrowOpens = selectedArrow !== undefined && isHub(selectedArrow.from) && isHub(selectedArrow.to) ? selectedArrow : undefined;
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
        <Button onClick={() => selectedHub !== undefined && openFamily(selectedHub)} {...(scene === null ? nothing : openReason === undefined ? {} : { unavailable: openReason })}>
          Open family
        </Button>
        {selectedArrow === undefined ? null : (
          <Button
            onClick={() => arrowOpens !== undefined && ports.ui.family.getState().openFamily(arrowOpens.from, { section: 'reactions_of', hubId: arrowOpens.to })}
            {...(arrowOpens === undefined ? { unavailable: 'the arrow does not run between two families' } : {})}
          >
            Open
          </Button>
        )}
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
