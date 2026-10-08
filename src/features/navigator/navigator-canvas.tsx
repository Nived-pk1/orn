/**
 * The navigator on screen (step 5.5a): a toolbar of primitives (Zoom in, Zoom out, Fit) over the interactive drawing. It renders
 * what the model says: the Scene; a plain error with its code; a skeleton only when there is no Scene yet and 300 ms have passed.
 * The layer commit count is written to a data attribute by hand (no React state) so a test can prove pan and zoom render nothing.
 */
import { useCallback, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { LayerName } from '@/render/svg';
import { ViewportScene, type ViewportController } from '@/render/viewport';
import { Button, Skeleton } from '@/ui/primitives';
import { useNavigator, useNavigatorState } from './navigator-context';
import styles from './navigator.module.css';

const NO_IDS: ReadonlySet<string> = new Set();

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
  const selectedIds = selected === null ? NO_IDS : new Set([selected.id]);
  const { scene } = state;
  const hubs = scene === null ? 0 : scene.nodes.filter((node) => node.box === 'hub' || node.box === 'unclassified').length;
  return (
    <div className={styles.canvas} ref={root} data-layer-commits="0">
      <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
        <Button onClick={() => controller?.zoomIn()} {...(scene === null ? { unavailable: 'there is nothing drawn yet' } : {})}>
          Zoom in
        </Button>
        <Button onClick={() => controller?.zoomOut()} {...(scene === null ? { unavailable: 'there is nothing drawn yet' } : {})}>
          Zoom out
        </Button>
        <Button onClick={() => controller?.fit()} {...(scene === null ? { unavailable: 'there is nothing drawn yet' } : {})}>
          Fit
        </Button>
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
            onLayerCommit={onLayerCommit}
          />
        )}
      </div>
    </div>
  );
}
