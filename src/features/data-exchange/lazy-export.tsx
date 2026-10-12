/**
 * The export screen is its own chunk (step 5.9b; the initial load stays small). It is loaded when the first export opens. A load that
 * fails is a value shown in words with a Retry button, never a blank window; a screen that throws is caught by the error boundary.
 */
import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Button, Dialog, ErrorBoundary, Skeleton } from '@/ui/primitives';
import type { ExportModel } from './export-model';
import type { ExportScreen as ExportScreenType } from './export-screen';

type Screen = typeof ExportScreenType;
export type ExportScreenLoad = { readonly ok: true; readonly ExportScreen: Screen } | { readonly ok: false; readonly message: string };

let loaded: Screen | undefined;
let pending: Promise<ExportScreenLoad> | undefined;

/** Loads the chunk once; a failure is not remembered, so Retry asks again. */
export function loadExportScreen(): Promise<ExportScreenLoad> {
  if (loaded !== undefined) return Promise.resolve({ ok: true, ExportScreen: loaded });
  pending ??= import('./export-screen').then(
    (module): ExportScreenLoad => {
      loaded = module.ExportScreen;
      return { ok: true, ExportScreen: module.ExportScreen };
    },
    (error: unknown): ExportScreenLoad => ({
      ok: false,
      message: `The export screen could not be loaded (${error instanceof Error ? error.message : String(error)}). Check the connection and press Retry; if it keeps failing, reload the page. Nothing was changed.`,
    }),
  );
  return pending.then((answer) => {
    if (!answer.ok) pending = undefined;
    return answer;
  });
}

function Loader(props: { readonly model: ExportModel; readonly open: boolean }) {
  const [answer, setAnswer] = useState<ExportScreenLoad | undefined>(loaded === undefined ? undefined : { ok: true, ExportScreen: loaded });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (answer?.ok === true) return;
    let live = true;
    void loadExportScreen().then((next) => {
      if (live) setAnswer(next);
    });
    return () => {
      live = false;
    };
  }, [attempt, answer?.ok]);
  const retry = useCallback(() => {
    setAnswer(undefined);
    setAttempt((n) => n + 1);
  }, []);
  if (answer?.ok === true) return <answer.ExportScreen model={props.model} />;
  return (
    <Dialog open={props.open} onClose={props.model.close} title="Export your data" footer={answer === undefined ? undefined : <Button onClick={retry}>Retry</Button>}>
      {answer === undefined ? <Skeleton label="Loading the export screen" lines={3} /> : <p role="alert">{answer.message}</p>}
    </Dialog>
  );
}

/** Mounts the lazy screen when an export is open (or has been); before the first one nothing is loaded. */
export function LazyExportScreen(props: { readonly model: ExportModel }) {
  const open = useStore(props.model.store, (state) => state.phase !== 'closed');
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);
  if (!open && !everOpened) return null;
  return (
    <ErrorBoundary label="The export screen">
      <Loader model={props.model} open={open} />
    </ErrorBoundary>
  );
}
