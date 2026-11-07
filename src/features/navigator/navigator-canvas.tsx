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
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { LayerName, SceneHit } from '@/render/svg';
import { ViewportScene, type ViewportController, type Viewport } from '@/render/viewport';
import type { Scene } from '@/render/scene';
import { useLayoutMode } from '@/ui/hooks';
import { useStudyChrome } from '@/ui/study-chrome';
import { Banner, ContextMenu, Skeleton } from '@/ui/primitives';
import { FIT_FLOOR } from '@/render/viewport';
import { buildChapterIndex } from '@/core/chapters/build-index';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph';
import { viewportToReveal } from './reveal';
import { useChainReveal } from './use-chain-reveal';
import { useMapCompounds } from './compounds-context';
import { depictionBindingOf } from './depictions';
import { ListView } from './list-view';
import { keyOf, legendOf } from './legend';
import { useMapBulk, useNoMulti } from './bulk-context';
import { useCanvasInput } from './use-canvas-input';
import { outsideNoteOf } from './scope-lens';
import type { withChips as WithChipsFn } from './map-chips';
import type { createPairFacts as CreatePairFactsFn } from './pair-facts';
import { useNavigator, useNavigatorState } from './navigator-context';
import { NavigatorSelection } from './navigator-selection';
import { emptinessOf, truncationNoticeOf } from './notices';
import { UnanchoredPanel } from './unanchored-panel';
import { boxesRect } from './map-geometry';
import { useMapView } from './use-map-view';
import styles from './navigator.module.css';
import controls from './map-controls.module.css';
import room from './map-room.module.css';

// Studio only (the legend's link): a lazy chunk, never loaded in Study (nothing there mounts it)
// "From A to B" (step 8.2b): a lazy chunk, loaded when the panel is first opened
// the phone's controls row is its own chunk (the desktop never needs it); its placeholder is as high as the row
const PhoneMapBar = /* @__PURE__ */ lazy(() => import('./phone-bar').then((m) => ({ default: m.PhoneMapBar })));
const PhoneMapControls = /* @__PURE__ */ lazy(() => import('./phone-map-controls').then((m) => ({ default: m.PhoneMapControls })));
// step 8.3b (Part 0.1): the desktop toolbar and the overlays inside the map are lazy chunks, loaded right after the first paint
const MapToolbar = /* @__PURE__ */ lazy(() => import('./map-toolbar').then((m) => ({ default: m.MapToolbar })));
const MapCorner = /* @__PURE__ */ lazy(() => import('./map-corner').then((m) => ({ default: m.MapCorner })));
type WithChips = typeof WithChipsFn;
type CreatePairFacts = typeof CreatePairFactsFn;
const noFacts = (): undefined => undefined;
const KeyPopover = /* @__PURE__ */ lazy(() => import('./key-popover').then((m) => ({ default: m.KeyPopover })));
const ChainPanel = /* @__PURE__ */ lazy(() => import('./chain-panel').then((m) => ({ default: m.ChainPanelInScope })));
const QUIET_LINE = 'Tap or click a family to see what it makes and what it is made from.';
const busyLine = (n: number): string => `This chapter has ${n} arrows. Tap or click a family to see its part.`;
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
  const phone = useLayoutMode() === 'phone';
  const announce = announcer.say;
  const state = useNavigatorState();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  const mode = useStore(ports.ui.overview, (s) => s.mode);
  const listing = mode === 'list' && !phone; // the phone's list of families is its Families tab
  const [controller, setController] = useState<ViewportController | null>(null);
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);
  const [unanchoredOpen, setUnanchoredOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [settled, setSettled] = useState<Viewport | undefined>(undefined);
  const chrome = useStudyChrome();
  // Studio's "See those compounds" selects the bucket: the inspector lists them (one view, step 8.2b-fix, S3)
  const seeCompounds = (): void => {
    ports.ui.selection.getState().select({ kind: 'node', id: UNCLASSIFIED_HUB_ID });
    ports.ui.selection.getState().reveal();
  };
  const compounds = useMapCompounds();
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
  const picked = useStore(ports.ui.selection, (s) => s.multi);
  const selectedIds = useMemo(() => (picked.length > 0 ? new Set(picked.map((one) => one.id)) : selected === null ? NO_IDS : new Set([selected.id])), [selected, picked]);
  const initialViewport = useMemo<Viewport | undefined>(() => ports.ui.viewports.getState().views[VIEW], [ports]);
  const depictions = useMemo(() => depictionBindingOf(ports)?.manager, [ports]);
  const isHub = useCallback((id: string): boolean => state.hubIds.includes(id), [state.hubIds]);
  // step 8.2a (ADR-044): the map draws a focus, not every arrow; the chapter choice and the focus are the map store's
  const chapters = useMemo(() => (scene === null ? [] : buildChapterIndex(ports.store.getState()).chapters.map((chapter) => ({ id: chapter.id, title: chapter.title }))), [scene, ports]);
  const chapterIds = useMemo(() => chapters.map((chapter) => chapter.id), [chapters]);
  // the reagent words on arrow chips come from their own chunk, loaded right after the first paint (the first view draws no arrow)
  const [factsMaker, setFactsMaker] = useState<CreatePairFacts | null>(null);
  const [chips, setChips] = useState<WithChips | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void Promise.all([import('./pair-facts'), import('./map-chips')]).then(([facts, chipModule]) => {
      if (!live) return;
      setFactsMaker(() => facts.createPairFacts);
      setChips(() => chipModule.withChips);
    });
    return () => {
      live = false;
    };
  }, []);
  const facts = useMemo(() => (factsMaker === null ? undefined : factsMaker(ports)), [factsMaker, ports]);
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [chain, setChain] = useState<readonly { readonly from: string; readonly to: string }[] | undefined>(undefined);
  const map = useMapView({ ui: ports.ui, timers: ports.timers, scene, isHub, selected, chapters: chapterIds, announce, facts, chips, chain });
  const familyList = useMemo(() => (scene === null ? [] : scene.nodes.filter((node) => node.box === 'hub').map((node) => ({ id: node.id, name: node.label.map((run) => run.text).join(''), tone: node.tone }))), [scene]);
  const toggleChain = useCallback((): void => ports.ui.map.getState().setChainOpen(!ports.ui.map.getState().chainOpen), [ports]);
  const closeChain = useCallback((): void => ports.ui.map.getState().setChainOpen(false), [ports]);
  const pairs = useCallback(() => ports.indexes.current().navigatorRollup().pairs(), [ports]);
  // a step opens its arrow's reactions exactly as selecting the arrow does
  const openStep = useCallback(
    (from: string, to: string): void => {
      const edge = sceneRef.current?.edges.find((one) => one.from === from && one.to === to);
      if (edge === undefined) return;
      ports.ui.selection.getState().select({ kind: 'edge', id: edge.id });
      ports.ui.selection.getState().reveal();
    },
    [ports],
  );
  // Find a family: focus it as a click would and pan (no zoom change) so it is in view
  const findFamily = useCallback(
    (id: string): void => {
      ports.ui.selection.getState().select({ kind: 'node', id });
      ports.ui.map.getState().setFocus(id);
      const node = sceneRef.current?.nodes.find((one) => one.id === id);
      const area = svg?.getBoundingClientRect();
      const view = controllerRef.current === null || node === undefined || area === undefined ? undefined : viewportToReveal(controllerRef.current.current(), { width: area.width, height: area.height }, node);
      if (view !== undefined) controllerRef.current?.setViewport(view);
    },
    [ports, svg],
  );
  const { view } = map;
  useChainReveal({ phone, chain: map.chainOpen ? chain : undefined, svg, root, scene, controller });
  const drawn = view === null ? scene : view.scene;
  // step 8.2b (B1): on a wide screen Fit and the first view fill the area with the visible boxes; the phone keeps its zoom
  const fitBox = useMemo(() => (phone || drawn === null ? undefined : boxesRect(drawn.nodes)), [phone, drawn]);
  const fitKey = phone ? undefined : `${state.chapterId ?? ''}|${map.showUnclassified}`;
  const hubs = drawn === null ? 0 : drawn.nodes.filter((node) => node.box === 'hub' || node.box === 'unclassified').length;
  const setChapter = useCallback((id: string | null): void => ports.ui.map.getState().setChapter(id), [ports]);
  const toggleUnclassified = useCallback((): void => ports.ui.map.getState().setShowUnclassified(!ports.ui.map.getState().showUnclassified), [ports]);
  const openFamily = useCallback((hubId: string): void => ports.ui.family.getState().openFamily(hubId), [ports]);
  // Studio's window provides the multi-selection shell; Study's provides none and the map has no multi-selection (step 6.8b, Y1)
  const useMulti = useMapBulk()?.useMulti ?? useNoMulti;
  const multi = useMulti({ scene: drawn ?? scene, svg, controller, isHub, announce });
  const selectBar = phone ? multi?.actions(true) : null;
  const input = useCanvasInput({ ui: ports.ui, scene: map.view?.navigation ?? scene, isHub, controller, svg, announce, multi, ...(props.returnTo === undefined ? {} : { returnTo: props.returnTo }) });
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
      setSettled(view);
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
  const legendKeys = useMemo(() => keyOf(view), [view]);
  // step 8.3b (A3, A4, B2.2): the key, the hint and the selection sit INSIDE the map (MapCorner)
  const clearSelection = useCallback((): void => ports.ui.selection.getState().select(null), [ports]);
  const hint = view === null ? undefined : view.quiet ? QUIET_LINE : view.busy > 0 ? busyLine(view.busy) : undefined;
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
    <div className={styles.canvas} ref={root} data-map-room="" data-layer-commits="0" data-layout-engine={state.layout ?? undefined}>
      {phone ? null : (
        <Suspense fallback={<div className={room.row} aria-hidden="true" style={{ height: 40 }} />}>
        <MapToolbar
          listing={listing}
          noScene={scene === null}
          onToggleList={() => {
            ports.ui.overview.getState().setMode(listing ? 'map' : 'list');
            announce(listing ? 'Showing the map' : 'Showing the list of families and arrows');
          }}
          onZoomIn={() => controller?.zoomIn()}
          onZoomOut={() => controller?.zoomOut()}
          onFit={() => controller?.fit()}
          chapters={chapters}
          chapterId={map.chapterId}
          onChapter={setChapter}
          families={familyList}
          onFind={findFamily}
          chainOpen={map.chainOpen}
          onToggleChain={toggleChain}
          openReason={openReason}
          onOpenFamily={() => selectedHub !== undefined && openFamily(selectedHub)}
          {...(selectedArrow === undefined ? {} : { arrowOpen: { onOpen: () => arrowOpens !== undefined && ports.ui.family.getState().openFamily(arrowOpens.from, { section: 'reactions_of', hubId: arrowOpens.to }), ...(arrowOpens === undefined ? { unavailable: 'the arrow does not run between two families' } : {}) } })}
          {...(chrome.unanchored ? { unanchored: { count: unanchored.length, expanded: unanchoredOpen && unanchoredReason === undefined, reason: unanchoredReason, onToggle: () => setUnanchoredOpen((open) => !open) } } : {})}
          keyOpen={keyOpen}
          onToggleKey={() => setKeyOpen((open) => !open)}
          keyPopover={
            <Suspense fallback={null}>
              <KeyPopover items={legend} keys={legendKeys} onClose={() => setKeyOpen(false)} {...(compounds === undefined ? {} : { onSeeCompounds: () => seeCompounds() })} onToggleUnclassified={toggleUnclassified} {...(outsideNote === undefined ? {} : { outsideNote })} />
            </Suspense>
          }
          extra={multi?.actions(false)}
        />
        </Suspense>
      )}
      {phone ? null : <NavigatorSelection {...(multi !== null && multi.items.length > 0 ? { multiLine: multi.line } : {})} />}
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
      {phone && scene !== null && !listing ? (
        <Suspense fallback={<div className={styles.phoneBar}><span className={controls.iconButton} aria-hidden="true" /></div>}>
          <PhoneMapBar chapters={chapters} chapterId={map.chapterId} onChapter={setChapter} families={familyList} onFind={findFamily} chainOpen={map.chainOpen} onToggleChain={toggleChain} />
        </Suspense>
      ) : null}
      {/* the line keeps its height when it has nothing to say, so a click that focuses a family does not move the map under the pointer (a double click's second press would miss) */}
      {phone && view !== null && !listing ? (
        <div className={styles.lineRow}>
          <p className={styles.quiet} {...(view.quiet ? { 'data-map-quiet': '' } : view.busy > 0 ? { 'data-map-busy': '' } : { 'aria-hidden': 'true' })}>
            {view.quiet ? QUIET_LINE : view.busy > 0 ? busyLine(view.busy) : ' '}
          </p>
        </div>
      ) : null}
      <div className={styles.mapRow}>
      <div className={styles.drawing} aria-busy={state.working}>
        {phone && scene !== null && !listing ? (
          <Suspense fallback={null}>
            <PhoneMapControls controller={controller} items={legend} keys={legendKeys} onToggleUnclassified={toggleUnclassified} {...(compounds === undefined ? {} : { onSeeCompounds: () => seeCompounds() })} {...(outsideNote === undefined ? {} : { outsideNote })} {...(multi === null ? {} : { extra: multi.selectToggle })} {...(selectBar == null ? {} : { barShown: true })} />
          </Suspense>
        ) : null}
        {phone ? selectBar : null}
        {phone || listing || scene === null ? null : (
          <Suspense fallback={null}>
            <MapCorner scene={scene} drawn={drawn ?? scene} selected={selected} multi={multi !== null && multi.items.length > 0} settled={settled} svg={svg} onClear={clearSelection} hint={hint} hintKind={view === null ? undefined : view.quiet ? 'quiet' : 'busy'} keys={legendKeys} />
          </Suspense>
        )}
        {multi?.marquee == null ? null : <div className={styles.marquee} aria-hidden="true" style={{ left: multi.marquee.left, top: multi.marquee.top, width: multi.marquee.width, height: multi.marquee.height }} />}
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
            scene={drawn ?? scene}
            {...(view === null ? {} : { marks: view.marks })}
            {...(phone ? {} : { onNodeHover: map.onNodeHover })}
            selectedIds={selectedIds}
            {...(hoveredId === undefined ? {} : { hoveredId })}
            ariaLabel={`Navigator: ${hubs} ${hubs === 1 ? 'hub' : 'hubs'}, ${(drawn ?? scene).edges.length} ${(drawn ?? scene).edges.length === 1 ? 'arrow' : 'arrows'}`}
            onController={setController}
            {...(phone ? { minScale: FIT_FLOOR } : {})}
            {...(fitBox === undefined ? {} : { fitBox })}
            {...(fitKey === undefined ? {} : { fitKey })}
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
      {map.chainOpen && scene !== null && !listing ? (
        <Suspense fallback={null}>
          <ChainPanel families={familyList} pairs={pairs} facts={facts ?? noFacts} onChain={setChain} onOpenStep={openStep} onClose={closeChain} ports={ports} {...(phone ? { phone: true } : {})} />
        </Suspense>
      ) : null}
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
