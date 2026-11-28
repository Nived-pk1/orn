/**
 * The window (steps 5.1d, 5.2): the shell frame of UI_ARCHITECTURE §2 filled with what exists. Status line -> status bar; banners and
 * the start-up report -> the banner region; the first-run screen and the record counts -> the canvas; the import summary is a Dialog
 * and its result a Toast (import-panel.tsx); the inspector shows the record in focus (step 5.6a). Composition only: the frame is
 * `src/ui/shell` and knows nothing of `AppStatus`; chemistry never lives here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  NavigatorProvider,
  PhoneTabs,
  NavigatorStatus,
  useFamilyPageOpen,
} from "@/features/navigator";
import {
  RECORD_KINDS,
  type CanonicalState,
  type RecordKind,
} from "@/core/schema";
import { useLayoutMode, useStoreSelector, useSubscribable } from "@/ui/hooks";
import { ErrorBoundary, ToastProvider, ToastRegion, useToastShowing } from "@/ui/primitives";
import { Shell, type InspectorPane, type ShellProps } from "@/ui/shell";
import { INSPECTOR_MAX, INSPECTOR_MIN, usePanels, type ExplorerFilter } from "@/ui/state";
import { useApp } from "./context";
import { LazyPalette, prefetchPalette } from "./lazy-palette";
import { LazyExamFirstRun } from "./lazy-exam-first-run";
import { ReplaceDialog, undoUnavailableReason } from "./dataset-actions";
import { examOptionsByExam } from "./exam-choice";
import type { CommandDeps } from "./palette-commands";
import { loadedCommands, prefetchCommands } from "./lazy-commands";
import { createSearchPorts } from "./search-port";
import { openChapter } from "./chapters-entry";
import { useFirstScreen, hasChapterTopic } from "./first-screen";
import { useWarmCanvas } from "./use-warm-canvas";
import { mapWanted } from "./map-wanted";
import { CHAPTERS_MODE, modesFor, noPlaceLineIn, modeOfExplorer, NAVIGATOR_MODE, SETTINGS_MODE, STARRED_MODE } from "./modes";
import { usePhoneTabMode } from "./phone-tab-mode";
import { studyChrome, StudyChromeProvider, useStudyChrome } from '@/ui/study-chrome';
import { useHasOwnData } from './own-data-hooks';
import { EDITION } from '@/app/edition';
import { openPrecursors } from "./precursors-entry";
import { openReagent } from "./reagents-entry";
import { usePageEntries } from "./use-page-entries";
import type { RecordRef } from "@/core/schema";
import { filterFor, openReactions } from "./reactions-entry";
import { Canvas, totalOf } from "./canvas";
import { StructuresContext } from "@/ui/structures";
import { LazyNotFound } from "./lazy-not-found";
import { showRecord } from "./show-record";
import { AddressGate } from "./address-gate";
import type { LostAddress } from "./use-address";
import { useTitleFocus } from "./use-title-focus";

import { PanelsStatus } from "./panels-status";
import { StatusLine } from "./status-parts";
import { LazyNoticeBand } from "./lazy-notice-band";
import { EDITING, editionMarker } from "@/app/edition";
import { useEditors } from "./editors-access";
import { EditorsProvider } from "./editors";
import { MapBulkProvider } from "./map-bulk-host";
import { editorCommandDeps } from "./editor-commands";
import { DatasetProvider, datasetWordsOf, useDatasetInfo } from "./dataset-info";
import { StudyUpdateProvider } from "./study-update";
import { HistoryKeys } from "./history-keys";
import { MyRecordsHost, useMineCommandDeps } from "./my-records-host";
import { bindingFor } from "./key-map";
import { InspectorPanel } from "./inspector-panel";
import { PhoneAlert, PhoneBar, PhoneNotices, PhoneStatusDialog } from "./phone-parts";
import { TopBar } from "./top-bar";
import { useFrame } from "./use-frame";
import { screenCrumb } from "./frame-title";
import { AboutDialog, AboutOpenContext } from "./about-preview";
import { ExportOpenContext } from "./export-context";
import { useExportActions } from "./use-export-actions";
import { useImportActions } from "./use-import-actions";

const countsOf = (
  state: CanonicalState,
): Readonly<Record<RecordKind, number>> =>
  Object.fromEntries(
    RECORD_KINDS.map((kind) => [kind, Object.keys(state.records[kind]).length]),
  ) as Record<RecordKind, number>;

/** The shell; its title gives up the h1 while the family page (which has its own) is on the canvas. */
function TitledShell(props: ShellProps & { readonly familyVisible: boolean }) {
  const { familyVisible, ...shell } = props;
  const familyOpen = useFamilyPageOpen();
  const fullMap = useStore(useApp().navigator.ui.map, (s) => s.fullMap);
  return <Shell {...shell} titleHeading={!(familyVisible && familyOpen)} fullMap={fullMap} />;
}

/** The window: the toast provider and the editors' entry points (ADR-040) around the content. */
export function Window() {
  const layout = useLayoutMode();
  const ownData = useHasOwnData();
  const chrome = useMemo(() => studyChrome(EDITION, { ownData }), [ownData]);
  // a phone toast sits above the tab bar; while a sheet is open it folds into the notices row instead (step 8.4a, Part C)
  const [sheetOpen, setSheetOpen] = useState(false);
  // the A-to-B panel is a sheet too: a toast never floats over it
  const chainOpen = useStore(useApp().navigator.ui.map, (s) => s.chainOpen);
  return (
    <StudyChromeProvider value={chrome}>
    <ToastProvider folded={layout === 'phone' && (sheetOpen || chainOpen)} docked={layout !== 'phone'}>
      <DatasetProvider>
      {EDITING ? (
        <EditorsProvider>
          <MapBulkProvider>
            <WindowContent onSheetOpen={setSheetOpen} />
          </MapBulkProvider>
        </EditorsProvider>
      ) : (
        <WindowContent onSheetOpen={setSheetOpen} />
      )}
      </DatasetProvider>
    </ToastProvider>
    </StudyChromeProvider>
  );
}

function WindowContent(props: { readonly onSheetOpen: (open: boolean) => void }) {
  const toastShowing = useToastShowing();
  const { onSheetOpen } = props;
  const app = useApp();
  const { panels, services, navigator, inspector: inspectorPorts } = app;
  const chrome = useStudyChrome();
  const editors = useEditors();
  const { actions: imports, element: importElement } = useImportActions();
  const { actions: exports, element: exportElement } = useExportActions();
  const status = useSubscribable(services.status);
  const datasetInfo = useDatasetInfo();
  const [asking, setAsking] = useState(false);
  const [searching, setSearching] = useState(false);
  // the palette opens once its commands are loaded (the idle prefetch makes that immediate)
  const mineCommandDeps = useMineCommandDeps();
  const openSearch = useCallback(() => void (loadedCommands() !== undefined ? setSearching(true) : prefetchCommands().then(() => setSearching(true))), []);
  // the palette is a lazy chunk: fetch it once the first view is drawn and the browser is idle, so the first Ctrl/Cmd+K opens at once
  useEffect(() => {
    const idle = (window as { requestIdleCallback?: (run: () => void) => number }).requestIdleCallback;
    const handle = idle === undefined ? window.setTimeout(() => void prefetchPalette().then(prefetchCommands), 200) : idle(() => void prefetchPalette().then(prefetchCommands));
    return () => {
      if (idle === undefined) window.clearTimeout(handle);
      else (window as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
    };
  }, []);
  const [about, setAbout] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const counts = useStoreSelector(services.store, countsOf);
  const width = usePanels(panels, (s) => s.inspectorWidth);
  const open = usePanels(panels, (s) => s.inspectorOpen);
  const railHidden = usePanels(panels, (s) => s.railHidden);
  const setRailHidden = useCallback((hidden: boolean) => panels.getState().setRailHidden(hidden), [panels]);
  const [mode, setMode] = useState(NAVIGATOR_MODE);
  const railModes = modesFor(chrome);
  const crumb = useFrame(mode, railModes);
  // the phone's Explore tab IS the Reactions mode (step 7.1b E1); the other tabs are the Navigator
  const layoutMode = useLayoutMode();
  const phoneTab = useStore(navigator.ui.overview, (s) => s.phoneTab);
  const lastExplorer = useStore(navigator.ui.explorer, (s) => s.last);
  useWarmCanvas(layoutMode === 'phone', phoneTab);
  const onPhoneTab = usePhoneTabMode({ phone: layoutMode === 'phone', phoneTab, explorerMode: () => modeOfExplorer(lastExplorer), setMode });
  const chapterTopics = useStoreSelector(services.store, hasChapterTopic);
  const [openRequest, setOpenRequest] = useState(0);
  const [closeRequest, setCloseRequest] = useState(0);
  // A pick on the canvas shows the record: the wide pane opens (its state is saved); the drawer or sheet is asked through the shell.
  const openPane = useCallback(() => {
    panels.getState().setInspectorOpen(true);
    setOpenRequest((n) => n + 1);
  }, [panels]);
  const closePane = useCallback(() => setCloseRequest((n) => n + 1), []);
  // an entry point opens Reactions filtered (the palette's Alt+Enter, the inspector's buttons)
  const onReactions = useCallback((filter: Partial<ExplorerFilter>) => openReactions(navigator.ui, setMode, filter), [navigator]);
  const onChapter = useCallback((chapterId: string) => openChapter(navigator.ui, setMode, chapterId), [navigator]);
  const onReagent = useCallback((reagentId: string) => openReagent(navigator.ui, setMode, reagentId), [navigator]);
  const onShowInReactions = useCallback((reagentId: string) => onReactions({ substanceIds: [reagentId], usedAs: 'any' }), [onReactions]);
  const { onNamed, onMechanism, onShowNamedInReactions, onSyllabus } = usePageEntries(navigator.ui, setMode, onReactions);
  // the badge on a reaction card opens the named reaction's page (7.4 D): the navigator's ports carry the way
  const navigatorPorts = useMemo(() => ({ ...navigator, openNamedReaction: onNamed }), [navigator, onNamed]);
  const onPrecursors = useCallback((ref: RecordRef) => openPrecursors(navigator.ui, setMode, ref), [navigator]);
  const hasData = totalOf(counts) > 0;
  const settled = useFirstScreen({ hasData, chapterTopics, phone: layoutMode === 'phone', overview: navigator.ui.overview, setMode });
  const pageOpeners = useMemo(() => ({ chapters: onChapter, reagents: onReagent, named: onNamed, mechanisms: onMechanism }), [onChapter, onReagent, onNamed, onMechanism]);
  const [lostAt, setLost] = useState<LostAddress>(null);
  const lost = lostAt !== null && lostAt.mode === mode ? lostAt.what : null;
  const [failed, setFailed] = useState(false), screen = screenCrumb({ failed, lost }); // an error or not-found screen lights no rail item
  const changeMode = useCallback((next: string) => {
    setLost(null);
    setMode(next);
  }, []);
  const titleRequest = useTitleFocus({ panels, status, hasData, busy: imports.busy });
  // The palette's commands read the window as it is when the list is asked for (a ref, so the palette's port never changes).
  const commandDeps = useRef<CommandDeps | null>(null);
  commandDeps.current = {
    mode,
    setMode,
    hasData,
    writerMode: status.mode, writerReason: status.reason,
    importReason: imports.reason,
    askReplace: () => setAsking(true),
    replaceTitle: datasetWordsOf(datasetInfo).replaceTitle,
    undoImport: imports.undoImport, undoneReason: imports.undoneReason,
    pickFile: imports.pick,
    openExport: exports.open,
    ...(EDITING ? editorCommandDeps(editors, services.store.getState(), inspectorPorts.ui.inspector.getState()) : {}),
    state: services.store.getState,
    openPlacement: (id) => {
      inspectorPorts.ui.inspector.getState().open({ kind: 'topic_mapping', id });
      openPane();
    },
    structures: { mode: () => panels.getState().structureMode, set: (mode) => panels.getState().setStructureMode(mode) },
    ui: navigator.ui,
    exams: examOptionsByExam(services.store.getState(), { allowDraft: EDITING }),
    views: railModes,
  };
  const searchPorts = useMemo(
    () =>
      createSearchPorts({
        search: services.search.search,
        store: services.store,
        syncStatus: () => services.searchSync?.()?.status(),
        indexes: navigator.indexes,
        l4: inspectorPorts.l4,
        navigator,
        showReactions(ref) {
          const filter = filterFor(ref);
          if (filter !== undefined) onReactions(filter);
        },
        showReagent: (ref) => onReagent(ref.id),
        showNamed: (ref) => onNamed(ref.id),
        showMechanism: (ref) => onMechanism(ref.id),
        commands: () => {
          const build = loadedCommands();
          return build === undefined || commandDeps.current === null ? [] : build({ ...commandDeps.current, ...mineCommandDeps(), exams: examOptionsByExam(services.store.getState(), { allowDraft: EDITING }) });
        },
        recent: () => app.mine?.records()?.recent() ?? [], show: (ref, title) => showRecord(app, setMode, openPane, ref, title),
      }),
    [mineCommandDeps, app, services, navigator, inspectorPorts, openPane, onReactions, onReagent, onNamed, onMechanism],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (bindingFor('palette').match(event)) {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openSearch]);
  const file = { reason: imports.reason, undoReason: undoUnavailableReason(status.mode, status.reason) ?? imports.undoneReason ?? imports.reason, onImport: imports.pick, onUndo: imports.undoImport, onExport: exports.open, onAbout: () => setAbout(true) };
  const exam = { exam: navigator.ui.exam, store: services.store, hasData, log: navigator.log };
  const openStatus = () => setStatusOpen(true);
  const pane = useMemo<InspectorPane>(
    () => ({
      width,
      // Settings has no record to show: the pane closes there and comes back (as the reader left it) with the next view (step 8.4g, G10)
      open: open && mode !== SETTINGS_MODE,
      min: INSPECTOR_MIN,
      max: INSPECTOR_MAX,
      onWidth: (next) => panels.getState().setInspectorWidth(next),
      onOpen: (next) => panels.getState().setInspectorOpen(next),
    }),
    [width, open, mode, panels],
  );
  return (
    <StudyUpdateProvider load={imports.loadDemo} hasData={hasData}>
      {EDITING ? <HistoryKeys history={services.store} /> : null}
      <MyRecordsHost studio={EDITING} exam={exam.exam} hasData={hasData} />
      <ExportOpenContext.Provider value={exports.open}>
      <AboutOpenContext.Provider value={() => setAbout(true)}>
      <NavigatorProvider ports={navigatorPorts} active={hasData} shown={mapWanted({ hasData, editing: EDITING, phone: layoutMode === 'phone', phoneTab, mode, settled })}>
        <TitledShell
          familyVisible={mode === NAVIGATOR_MODE && totalOf(counts) > 0}
          title="Organic Reaction Navigator"
          marker={editionMarker()}
          topBar={
            <TopBar
              {...(EDITING ? { history: services.store } : {})}
              file={file}
              exam={exam}
            />
          }
          phone={{
            bar: <PhoneBar onSettings={() => setMode(SETTINGS_MODE)} onSearch={openSearch} structures={navigator.structures} file={file} exam={exam} counts={counts} onStatus={openStatus} {...(EDITING ? { history: services.store } : {})} />,
            notices: <PhoneNotices />,
            alert: <PhoneAlert onStatus={openStatus} />,
            tabs: <PhoneTabs onStarred={() => changeMode(STARRED_MODE)} starred={mode === STARRED_MODE} onTab={onPhoneTab} />,
          }}
          modes={railModes}
          crumb={screen ?? crumb}
          commandBox={{ onOpen: openSearch }}
          activeMode={screen === undefined ? mode : ''}
          onModeChange={changeMode}
          toasts={<ToastRegion />}
          toastShowing={toastShowing}
          onSheetHeight={(height) => onSheetOpen(height !== 'closed')}
          railCollapsed={railHidden}
          onRailCollapsed={setRailHidden}
          banners={
            <ErrorBoundary label="The notices panel">
              <LazyNoticeBand />
            </ErrorBoundary>
          }
          canvas={
            <ErrorBoundary label="The dataset panel" resetKey={mode} onFailChange={setFailed} {...(EDITING ? { backUp: exports.open } : {})}>
              <StructuresContext.Provider value={navigator.structures ?? null}>
              {lost === null ? <Canvas mode={mode} exam={exam} counts={counts} imports={imports} exports={exports} onAskReplace={() => setAsking(true)} onReactions={onReactions} onShowInReactions={onShowInReactions} onShowNamedInReactions={onShowNamedInReactions} onSyllabus={onSyllabus} onNamed={onNamed} onMechanism={onMechanism} onChapter={onChapter} onOpenRecord={(ref, title) => showRecord(app, setMode, openPane, ref, title)} openPane={openPane} /> : <LazyNotFound what={lost} onChapters={() => changeMode(CHAPTERS_MODE)} />}
              </StructuresContext.Provider>
            </ErrorBoundary>
          }
          inspectorTitle="Inspector"
          inspector={
            <ErrorBoundary label="The inspector">
              <InspectorPanel
                navigatorShown={mode === NAVIGATOR_MODE && totalOf(counts) > 0}
                explorerShown={noPlaceLineIn(mode)}
                openPane={openPane}
                closePane={closePane}
                onReactions={onReactions}
                onPrecursors={onPrecursors}
                onChapter={onChapter}
                onReagent={onReagent}
                onNamed={onNamed}
                onMechanism={onMechanism}
              />
            </ErrorBoundary>
          }
          pane={pane}
          openRequest={openRequest}
          closeRequest={closeRequest}
          focusTitleRequest={titleRequest}
          {...(chrome.statusBar === 'none'
            ? {}
            : {
                statusBar: (
                  <ErrorBoundary label="The status panel">
                    <StatusLine />
                    {chrome.statusBar === 'full' ? <PanelsStatus /> : null}
                    {chrome.statusBar === 'full' ? <NavigatorStatus /> : null}
                  </ErrorBoundary>
                ),
              })}
        />
        <ReplaceDialog open={asking} onClose={() => setAsking(false)} imports={imports} />
        {importElement}
        {exportElement}
        <PhoneStatusDialog open={statusOpen} onClose={() => setStatusOpen(false)} />
        <AboutDialog open={about} onClose={() => setAbout(false)} />
        <AddressGate mode={mode} setMode={setMode} ready={hasData && settled} views={railModes} open={pageOpeners} openPane={openPane} lost={lostAt} setLost={setLost} />

        <LazyPalette ports={searchPorts} open={searching} onClose={() => setSearching(false)} />
        {EDITING ? null : <LazyExamFirstRun binding={exam} />}
      </NavigatorProvider>
      </AboutOpenContext.Provider>
      </ExportOpenContext.Provider>
    </StudyUpdateProvider>
  );
}
