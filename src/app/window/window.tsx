/**
 * The window (steps 5.1d, 5.2): the shell frame of UI_ARCHITECTURE §2 filled with what exists. Status line -> status bar; banners and
 * the start-up report -> the banner region; the first-run screen and the record counts -> the canvas; the import summary is a Dialog
 * and its result a Toast (import-panel.tsx); the inspector shows the record in focus (step 5.6a). Composition only: the frame is
 * `src/ui/shell` and knows nothing of `AppStatus`; chemistry never lives here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Inspector, placeOf, type InspectorHost } from "@/features/inspector";
import { Palette } from "@/features/search";
import {
  NavigatorView,
  NavigatorProvider,
  NavigatorStatus,
  useFamilyPageOpen,
  useNavigator,
} from "@/features/navigator";
import {
  RECORD_KINDS,
  type CanonicalState,
  type RecordKind,
} from "@/core/schema";
import { useStoreSelector, useSubscribable } from "@/ui/hooks";
import { ErrorBoundary, ToastProvider } from "@/ui/primitives";
import { Shell, type InspectorPane, type ShellProps } from "@/ui/shell";
import { INSPECTOR_MAX, INSPECTOR_MIN, usePanels } from "@/ui/state";
import { useApp } from "./context";
import { DatasetActions, ReplaceDialog } from "./dataset-actions";
import { examOptions } from "./exam-scope";
import { buildCommands, type CommandDeps } from "./palette-commands";
import { createSearchPorts } from "./search-port";
import { FirstRun } from "./first-run";
import { ImportPanel } from "./import-panel";
import { MODES, NAVIGATOR_MODE } from "./modes";
import { PanelsStatus } from "./panels-status";
import { BootLines, Banners, StatusLine } from "./status-parts";
import { TopBar } from "./top-bar";
import styles from "./window.module.css";
import { useImportFlow, type ImportFlow } from "./use-import-flow";

const countsOf = (
  state: CanonicalState,
): Readonly<Record<RecordKind, number>> =>
  Object.fromEntries(
    RECORD_KINDS.map((kind) => [kind, Object.keys(state.records[kind]).length]),
  ) as Record<RecordKind, number>;

const totalOf = (counts: Readonly<Record<RecordKind, number>>): number =>
  RECORD_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

function RecordCounts(props: {
  readonly counts: Readonly<Record<RecordKind, number>>;
}) {
  const present = RECORD_KINDS.filter((kind) => props.counts[kind] > 0);
  if (present.length === 0) return <p>The dataset is empty.</p>;
  return (
    <ul aria-label="Record counts">
      {present.map((kind) => (
        <li key={kind}>
          {kind.replaceAll("_", " ")}: {props.counts[kind]}
        </li>
      ))}
    </ul>
  );
}

function DatasetView(props: {
  readonly counts: Readonly<Record<RecordKind, number>>;
  readonly empty: boolean;
  readonly flow: ImportFlow;
  readonly onAskReplace: () => void;
}) {
  return (
    <section aria-label="Dataset">
      <h2>Dataset</h2>
      <RecordCounts counts={props.counts} />
      <DatasetActions flow={props.flow} onAskReplace={props.onAskReplace} />
      {props.empty ? (
        <p>
          Started empty. Nothing can be added in this version; authoring comes
          later.
        </p>
      ) : null}
    </section>
  );
}

function Canvas(props: {
  readonly mode: string;
  readonly counts: Readonly<Record<RecordKind, number>>;
  readonly flow: ImportFlow;
  readonly onAskReplace: () => void;
}) {
  const { panels } = useApp();
  const { flow } = props;
  const startedEmpty = usePanels(panels, (s) => s.startEmptyDismissed);
  const onStartEmpty = useCallback(
    () => panels.getState().dismissStartEmpty(),
    [panels],
  );
  const empty = totalOf(props.counts) === 0;
  const showsNavigator = !empty && props.mode === NAVIGATOR_MODE;
  // The import flow outlives the first-run screen: its dialog, banner and toast show after the data has arrived.
  return (
    <div className={showsNavigator ? styles.canvasFull : styles.canvas}>
      {empty && !startedEmpty ? (
        <FirstRun flow={flow} onStartEmpty={onStartEmpty} />
      ) : showsNavigator ? (
        <NavigatorView />
      ) : (
        <DatasetView counts={props.counts} empty={empty} flow={flow} onAskReplace={props.onAskReplace} />
      )}
      <ImportPanel flow={flow} />
    </div>
  );
}

/** The inspector with what only the window knows: the arrows on the canvas, whether the navigator is shown, how to open the pane. */
function InspectorPanel(props: {
  readonly navigatorShown: boolean;
  readonly openPane: () => void;
}) {
  const { inspector } = useApp();
  const { model } = useNavigator();
  const { navigatorShown, openPane } = props;
  const host = useMemo<InspectorHost>(
    () => ({
      openPane,
      navigatorShown,
      edgeEnds: (edgeId) => {
        const edge = model.getState().scene?.edges.find((e) => e.id === edgeId);
        return edge === undefined ? undefined : { from: edge.from, to: edge.to };
      },
    }),
    [model, navigatorShown, openPane],
  );
  return <Inspector ports={inspector} host={host} />;
}

/** The shell; its title gives up the h1 while the family page (which has its own) is on the canvas. */
function TitledShell(props: ShellProps & { readonly familyVisible: boolean }) {
  const { familyVisible, ...shell } = props;
  const familyOpen = useFamilyPageOpen();
  return <Shell {...shell} titleHeading={!(familyVisible && familyOpen)} />;
}

export function Window() {
  const { panels, services, navigator, inspector: inspectorPorts } = useApp();
  const flow = useImportFlow();
  const status = useSubscribable(services.status);
  const [asking, setAsking] = useState(false);
  const [searching, setSearching] = useState(false);
  const counts = useStoreSelector(services.store, countsOf);
  const width = usePanels(panels, (s) => s.inspectorWidth);
  const open = usePanels(panels, (s) => s.inspectorOpen);
  const [mode, setMode] = useState(NAVIGATOR_MODE);
  const [openRequest, setOpenRequest] = useState(0);
  // A pick on the canvas shows the record: the wide pane opens (its state is saved); the drawer or sheet is asked through the shell.
  const openPane = useCallback(() => {
    panels.getState().setInspectorOpen(true);
    setOpenRequest((n) => n + 1);
  }, [panels]);
  const hasData = totalOf(counts) > 0;
  // The palette's commands read the window as it is when the list is asked for (a ref, so the palette's port never changes).
  const commandDeps = useRef<CommandDeps | null>(null);
  commandDeps.current = {
    mode,
    setMode,
    hasData,
    writerMode: status.mode,
    writerReason: status.reason,
    busy: flow.busy,
    askReplace: () => setAsking(true),
    undoImport: flow.undoImport,
    ui: navigator.ui,
    exams: examOptions(services.store.getState()),
  };
  const searchPorts = useMemo(
    () =>
      createSearchPorts({
        search: services.search.search,
        store: services.store,
        indexes: navigator.indexes,
        l4: inspectorPorts.l4,
        navigator,
        commands: () => (commandDeps.current === null ? [] : buildCommands({ ...commandDeps.current, exams: examOptions(services.store.getState()) })),
        show(ref, title) {
          setMode(NAVIGATOR_MODE);
          inspectorPorts.ui.inspector.getState().open(ref);
          openPane();
          // a family is focused on the map, a reaction opens its family page at its card; anything else has its places in the inspector
          placeOf(ref, title, navigator.indexes.current(), { selection: navigator.ui.selection, family: navigator.ui.family }, true).actions[0]?.run();
        },
      }),
    [services, navigator, inspectorPorts, openPane],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearching(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const pane = useMemo<InspectorPane>(
    () => ({
      width,
      open,
      min: INSPECTOR_MIN,
      max: INSPECTOR_MAX,
      onWidth: (next) => panels.getState().setInspectorWidth(next),
      onOpen: (next) => panels.getState().setInspectorOpen(next),
    }),
    [width, open, panels],
  );
  return (
    <ToastProvider>
      <NavigatorProvider ports={navigator} active={totalOf(counts) > 0}>
        <TitledShell
          familyVisible={mode === NAVIGATOR_MODE && totalOf(counts) > 0}
          title="Organic Reaction Navigator"
          topBar={<TopBar onSearch={() => setSearching(true)} />}
          modes={MODES}
          activeMode={mode}
          onModeChange={setMode}
          banners={
            <ErrorBoundary label="The notices panel">
              <Banners />
              <BootLines />
            </ErrorBoundary>
          }
          canvas={
            <ErrorBoundary label="The dataset panel">
              <Canvas mode={mode} counts={counts} flow={flow} onAskReplace={() => setAsking(true)} />
            </ErrorBoundary>
          }
          inspectorTitle="Inspector"
          inspector={
            <ErrorBoundary label="The inspector">
              <InspectorPanel
                navigatorShown={mode === NAVIGATOR_MODE && totalOf(counts) > 0}
                openPane={openPane}
              />
            </ErrorBoundary>
          }
          pane={pane}
          openRequest={openRequest}
          statusBar={
            <ErrorBoundary label="The status panel">
              <StatusLine />
              <PanelsStatus />
              <NavigatorStatus />
            </ErrorBoundary>
          }
        />
        <ReplaceDialog open={asking} onClose={() => setAsking(false)} flow={flow} />
        <Palette ports={searchPorts} open={searching} onClose={() => setSearching(false)} />
      </NavigatorProvider>
    </ToastProvider>
  );
}
