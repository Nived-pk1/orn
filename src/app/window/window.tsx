/**
 * The window (steps 5.1d, 5.2): the shell frame of UI_ARCHITECTURE §2 filled with what exists. Status line -> status bar; banners and
 * the start-up report -> the banner region; the first-run screen and the record counts -> the canvas; the import summary is a Dialog
 * and its result a Toast (import-panel.tsx); the inspector shows an empty state until step 5.6. Composition only: the frame is
 * `src/ui/shell` and knows nothing of `AppStatus`; chemistry never lives here.
 */
import { useCallback, useMemo, useState } from "react";
import {
  NavigatorView,
  NavigatorProvider,
  NavigatorStatus,
} from "@/features/navigator";
import {
  RECORD_KINDS,
  type CanonicalState,
  type RecordKind,
} from "@/core/schema";
import { useStoreSelector } from "@/ui/hooks";
import { ErrorBoundary, ToastProvider } from "@/ui/primitives";
import { Shell, type InspectorPane } from "@/ui/shell";
import { INSPECTOR_MAX, INSPECTOR_MIN, usePanels } from "@/ui/state";
import { useApp } from "./context";
import { FirstRun } from "./first-run";
import { ImportPanel } from "./import-panel";
import { MODES, NAVIGATOR_MODE } from "./modes";
import { PanelsStatus } from "./panels-status";
import { BootLines, Banners, StatusLine } from "./status-parts";
import { TopBar } from "./top-bar";
import styles from "./window.module.css";
import { useImportFlow } from "./use-import-flow";

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
}) {
  return (
    <section aria-label="Dataset">
      <h2>Dataset</h2>
      <RecordCounts counts={props.counts} />
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
}) {
  const { panels } = useApp();
  const flow = useImportFlow();
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
        <DatasetView counts={props.counts} empty={empty} />
      )}
      <ImportPanel flow={flow} />
    </div>
  );
}

function InspectorEmpty() {
  return (
    <section aria-label="Inspector empty state">
      <p>
        What you select in the navigator will be described here. The inspector
        arrives in step 5.6a and search in step 5.8.
      </p>
      <p>
        The record counts of the dataset are under Dataset in the mode list on
        the left.
      </p>
    </section>
  );
}

export function Window() {
  const { panels, services, navigator } = useApp();
  const counts = useStoreSelector(services.store, countsOf);
  const width = usePanels(panels, (s) => s.inspectorWidth);
  const open = usePanels(panels, (s) => s.inspectorOpen);
  const [mode, setMode] = useState(NAVIGATOR_MODE);
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
        <Shell
          title="Organic Reaction Navigator"
          topBar={<TopBar />}
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
              <Canvas mode={mode} counts={counts} />
            </ErrorBoundary>
          }
          inspectorTitle="Inspector"
          inspector={<InspectorEmpty />}
          pane={pane}
          statusBar={
            <ErrorBoundary label="The status panel">
              <StatusLine />
              <PanelsStatus />
              <NavigatorStatus />
            </ErrorBoundary>
          }
        />
      </NavigatorProvider>
    </ToastProvider>
  );
}
