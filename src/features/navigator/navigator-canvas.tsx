/**
 * The navigator overview on screen (step 5.5a, calmed in 5.5b; ADR-037): a toolbar (Zoom in, Zoom out, Fit, Open family, and Open for a
 * selected arrow) over the interactive drawing. It renders what the model says: the Scene; a plain error with its code; a skeleton only
 * when there is no Scene yet and 300 ms have passed. The pointer state machine (step 5.7) classifies presses on the drawing: a click selects
 * the node or edge under it (empty canvas clears) and, once its 300 ms window has passed, shows it in the inspector; a double click on a
 * family opens its page; a long press or right click opens the context menu. The keyboard map and the menu are `use-canvas-input.ts`.
 * The overview does not expand hubs. A List toggle (step 5.7) shows the same projection as two accessible tables instead of the map;
 * the choice is saved in `uiState`.
 * The legend of the family groups (step 5.5c) sits under the toolbar. The layer commit count is written to a data attribute by hand (no React state) so a test can prove pan and zoom render nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { LayerName, SceneHit } from '@/render/svg';
import { ViewportScene, type ViewportController, type Viewport } from '@/render/viewport';
import type { Scene } from '@/render/scene';
import { Banner, Button, ContextMenu, Skeleton } from '@/ui/primitives';
import { depictionBindingOf } from './depictions';
import { ListView } from './list-view';
import { keyOf, legendOf } from './legend';
import { useCanvasInput } from './use-canvas-input';
import { outsideNoteOf } from './scope-lens';
import { useNavigator, useNavigatorState } from './navigator-context';
import { NavigatorLegend } from './navigator-legend';
import { NavigatorSelection } from './navigator-selection';
import { emptinessOf, truncationNoticeOf } from './notices';
import { UnanchoredPanel } from './unanchored-panel';
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

export function NavigatorCanvas(props: { readonly returnTo?: string }) {
  const { ports, announcer } = useNavigator();
  const announce = announcer.say;
  const state = useNavigatorState();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  const mode = useStore(ports.ui.overview, (s) => s.mode);
  const listing = mode === 'list';
  const [controller, setController] = useState<ViewportController | null>(null);
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);
  const [unanchoredOpen, setUnanchoredOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const commits = useRef(0);
  // Written imperatively: a layer that commits bumps a data attribute, React state is not involved.
  // The count of each layer is written too (data-commits-nodes, ...): the evidence for the keyboard focus decision (step 5.7).
  const perLayer = useRef<Partial<Record<LayerName, number>>>({});
  const onLayerCommit = useCallback((layer: LayerName): void => {
    commits.current += 1;
    perLayer.current[layer] = (perLayer.current[layer] ?? 0) + 1;
    root.current?.setAttribute('data-layer-commits', String(commits.current));
    root.current?.setAttribute(`data-commits-${layer}`, String(perLayer.current[layer]));
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
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const input = useCanvasInput({ ui: ports.ui, scene, isHub, controller, svg, announce, ...(props.returnTo === undefined ? {} : { returnTo: props.returnTo }) });
  // Back from a family page the focus returns to the overview: the drawing (on the family just left), or the list's tab stop.
  const returning = useRef(props.returnTo !== undefined);
  useEffect(() => {
    if (!returning.current) return;
    const target = listing ? root.current?.querySelector<HTMLElement>('[data-view="list"] [role="row"][tabindex="0"]') : svg;
    if (target === null || target === undefined) return;
    returning.current = false;
    target.focus({ preventScroll: true });
  });
  const onSceneHover = useCallback((hit: SceneHit | null): void => setHoveredId(hit === null ? undefined : hit.id), []);
  // The zoom level is said once the view has been still (never per wheel frame), and not for the first view (a fit or a restore).
  const said = useRef<number | undefined>(initialViewport === undefined ? undefined : Math.round(initialViewport.scale * 100));
  const onSettled = useCallback(
    (view: Viewport, automatic: boolean): void => {
      ports.ui.viewports.getState().setViewport(VIEW, view);
      const percent = Math.round(view.scale * 100);
      // an automatic fit (the first one, or the re-fit when the drawing's size settles) is not something the person did
      if (!automatic && said.current !== undefined && said.current !== percent) announce(`Zoom ${percent} percent`);
      said.current = percent;
    },
    [ports, announce],
  );

  const selectedHub = selected !== null && selected.kind === 'node' && isHub(selected.id) ? selected.id : undefined;
  const openReason = openFamilyReason(selected, selectedHub !== undefined);
  // An arrow opens its source family at the target's group (reactions of the source, the group "To <target>").
  const selectedArrow = selected !== null && selected.kind === 'edge' && scene !== null ? scene.edges.find((edge) => edge.id === selected.id) : undefined;
  const arrowOpens = selectedArrow !== undefined && isHub(selectedArrow.from) && isHub(selectedArrow.to) ? selectedArrow : undefined;
  const activeExam = useStore(ports.ui.exam, (s) => s.active);
  const outsideNote = useMemo(() => (scene === null || !scene.nodes.some((node) => node.state.dimmed) ? undefined : outsideNoteOf(ports.store.getState(), activeExam)), [scene, ports, activeExam]);
  const legend = useMemo(() => legendOf(scene), [scene]);
  const legendKeys = useMemo(() => keyOf(scene), [scene]);
  const nothing = scene === null ? { unavailable: NOTHING_DRAWN } : {};
  const cut = truncationNoticeOf(scene?.truncation ?? null);
  const families = scene === null ? 0 : scene.nodes.filter((node) => node.box === 'hub').length;
  const empty = scene === null ? null : emptinessOf(state.reactions, families);
  const unanchored = state.unanchored;
  const unanchoredReason = scene === null ? NOTHING_DRAWN : unanchored.length === 0 ? 'every reaction is in a family' : undefined;
  // The palette's commands (step 5.8) run on the map while it is mounted; each says why it cannot run.
  const noScene = scene === null;
  useEffect(
    () =>
      ports.ui.viewCommands.getState().register({
        zoomIn: () => controller?.zoomIn(),
        zoomOut: () => controller?.zoomOut(),
        fit: () => controller?.fit(),
        openUnanchored: () => setUnanchoredOpen(true),
        ...(unanchoredReason === undefined ? {} : { unanchoredReason }),
        ...(listing ? { zoomReason: 'the List view has no zoom' } : noScene ? { zoomReason: NOTHING_DRAWN } : {}),
      }),
    [ports, controller, unanchoredReason, listing, noScene],
  );
  return (
    <div className={styles.canvas} ref={root} data-layer-commits="0" data-layout-engine={state.layout ?? undefined}>
      <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
        <Button
          aria-pressed={listing}
          onClick={() => {
            ports.ui.overview.getState().setMode(listing ? 'map' : 'list');
            announce(listing ? 'Showing the map' : 'Showing the list of families and arrows');
          }}
        >
          List
        </Button>
        <Button onClick={() => controller?.zoomIn()} {...(listing ? { unavailable: 'the List view has no zoom' } : nothing)}>
          Zoom in
        </Button>
        <Button onClick={() => controller?.zoomOut()} {...(listing ? { unavailable: 'the List view has no zoom' } : nothing)}>
          Zoom out
        </Button>
        <Button onClick={() => controller?.fit()} {...(listing ? { unavailable: 'the List view has no zoom' } : nothing)}>
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
        <Button onClick={() => setUnanchoredOpen((open) => !open)} aria-expanded={unanchoredOpen && unanchoredReason === undefined} {...(unanchoredReason === undefined ? {} : { unavailable: unanchoredReason })}>
          Unanchored reactions ({unanchored.length})
        </Button>
        <NavigatorSelection />
      </div>
      {cut === null ? null : (
        <Banner kind="warning">
          {cut.cut} {cut.more}
        </Banner>
      )}
      {empty === null ? null : (
        <Banner kind="info">
          <strong>{empty.title}</strong> {empty.body}
        </Banner>
      )}
      {unanchoredOpen && unanchored.length > 0 ? <UnanchoredPanel ids={unanchored} onClose={() => setUnanchoredOpen(false)} /> : null}
      {listing ? null : <NavigatorLegend items={legend} keys={legendKeys} {...(outsideNote === undefined ? {} : { outsideNote })} />}
      <div className={styles.drawing} aria-busy={state.working}>
        {state.error !== null ? (
          <div className={styles.error} role="alert">
            <p>The navigator could not be drawn ({state.error.code}).</p>
            <p>{state.error.message}</p>
          </div>
        ) : scene === null ? (
          state.skeleton ? <Skeleton label="Loading the navigator" /> : null
        ) : listing ? (
          <ListView scene={scene} ui={ports.ui} isHub={isHub} />
        ) : (
          <ViewportScene
            scene={scene}
            selectedIds={selectedIds}
            {...(hoveredId === undefined ? {} : { hoveredId })}
            ariaLabel={`Navigator: ${hubs} ${hubs === 1 ? 'hub' : 'hubs'}, ${scene.edges.length} ${scene.edges.length === 1 ? 'arrow' : 'arrows'}`}
            onController={setController}
            {...(depictions === undefined ? {} : { depictions })}
            onLayerCommit={onLayerCommit}
            pointer={input.pointer}
            pointerTimers={ports.timers}
            keyboard={input.keyboard}
            onSvg={setSvg}
            {...(input.ringId === undefined ? {} : { focusedId: input.ringId })}
            onSceneHover={onSceneHover}
            onSettled={onSettled}
            {...(initialViewport === undefined ? {} : { initialViewport })}
          />
        )}
      </div>
      <ContextMenu
        at={input.menu?.at ?? null}
        label={input.menu?.menu.label ?? 'Canvas'}
        items={(input.menu?.menu.entries ?? []).map((entry) => ({
          id: entry.id,
          label: entry.label,
          onSelect: () => input.run(entry.action),
          ...(entry.unavailable === undefined ? {} : { unavailable: entry.unavailable }),
        }))}
        onClose={input.closeMenu}
        onCloseFocus={input.closeMenuFocus}
      />
    </div>
  );
}
